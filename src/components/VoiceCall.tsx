import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PhoneOff, Mic, Camera, CameraOff, SwitchCamera } from 'lucide-react'
import { streamChat, type ChatMessage, type ContentPart } from '../lib/groq'
import { getModel, type ModelTier } from '../lib/models'
import { buildSystemPrompt } from '../lib/prompt'
import { hapticPattern, resolveVoice, getVoicePrefs } from '../hooks/useSpeech'
import {
  nativeVoiceAvailable,
  ensureSpeechPermission,
  nativeListenOnce,
  nativeStopListening,
  nativeSpeak,
  nativeStopSpeaking,
} from '../lib/nativeVoice'
import { saveChat, type StoredMessage } from '../lib/db'
import { useStore } from '../store'
import { SpeechQueue, puterSynthesize, splitSentences, cleanForSpeech } from '../lib/voice'
import {
  getAudioContext,
  getLevel,
  startThinkingSfx,
  stopThinkingSfx,
  playStartCue,
  playListenCue,
  disposeSfx,
} from '../lib/voiceSfx'

type Phase = 'connecting' | 'listening' | 'thinking' | 'speaking'

function pickVoice(): SpeechSynthesisVoice | null {
  return resolveVoice()
}

// Per-bar amplitude multipliers — taller in the centre for a natural waveform.
const WAVE_BARS = [0.55, 0.8, 1.15, 1.35, 1.15, 0.8, 0.55]

export default function VoiceCall({
  open,
  onClose,
  model,
}: {
  open: boolean
  onClose: () => void
  model: ModelTier
}) {
  const { settings, memories, user } = useStore()

  // Persist the voice conversation as a normal chat so it shows in history.
  async function saveConversation() {
    const msgs = historyRef.current
    if (!user || msgs.length < 2) return
    const now = Date.now()
    const stored: StoredMessage[] = msgs.map((m, i) => ({
      id: `${now}-${i}`,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : '',
      model,
      createdAt: now + i,
    }))
    const firstUser = msgs.find((m) => m.role === 'user')
    const title = '🎙️ ' + (typeof firstUser?.content === 'string' ? firstUser.content : 'Voice call').slice(0, 40)
    await saveChat(user.uid, {
      id: crypto.randomUUID(),
      title,
      model,
      messages: stored,
      updatedAt: now,
      createdAt: now,
    })
  }

  function endCall() {
    void saveConversation()
    onClose()
  }
  const [phase, setPhase] = useState<Phase>('connecting')
  const [caption, setCaption] = useState('')
  const [userSaid, setUserSaid] = useState('')
  const [manual, setManual] = useState('')
  const webStt =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  // Native speech (Capacitor plugins) unlocks hands-free voice inside the app,
  // where the WebView has no usable Web Speech API. Detected async on open.
  const nativeRef = useRef(false)
  const [nativeReady, setNativeReady] = useState(false)
  const sttSupported = webStt || nativeReady
  const recRef = useRef<any>(null)
  const historyRef = useRef<ChatMessage[]>([])
  const activeRef = useRef(false)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)

  // Gapless streaming speech queue (Puter neural TTS → native/web fallback).
  const queueRef = useRef<SpeechQueue | null>(null)
  // Live audio level (0..1) for the reactive waveform / orb. Kept in a ref and
  // mirrored to state on a rAF loop so we don't re-render on every frame's data
  // but the CSS vars still update smoothly.
  const levelRef = useRef(0)
  const [level, setLevel] = useState(0)
  const rafRef = useRef<number | null>(null)

  // Live camera vision
  const [camOn, setCamOn] = useState(false)
  const [facing, setFacing] = useState<'user' | 'environment'>('environment')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  async function startCamera(face: 'user' | 'environment' = 'environment') {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setFacing(face)
      setCamOn(true)
      hapticPattern([15])
    } catch {
      setCaption("I couldn't access the camera — check permissions.")
    }
  }
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamOn(false)
  }
  // Capture the current frame, downscaled, as a JPEG data URL for the vision model.
  function captureFrame(): string | null {
    const v = videoRef.current
    if (!v || !v.videoWidth) return null
    const scale = Math.min(1, 720 / v.videoWidth)
    const c = document.createElement('canvas')
    c.width = Math.round(v.videoWidth * scale)
    c.height = Math.round(v.videoHeight * scale)
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(v, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.7)
  }

  useEffect(() => {
    if (!open) return
    activeRef.current = true
    historyRef.current = []
    voiceRef.current = pickVoice()
    window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
      voiceRef.current = pickVoice()
    })
    hapticPattern([20, 60, 20])

    // Unlock/resume the Web Audio context from this user-gesture-driven open,
    // and build the gapless speech queue. The queue tries Puter neural TTS for
    // each sentence and falls back to native/web TTS if Puter is unavailable.
    getAudioContext()
    queueRef.current = new SpeechQueue(
      (t) => puterSynthesize(t),
      (t) => speakUnified(t),
    )

    // rAF loop: read the live audio level and mirror it to state for the
    // reactive waveform / orb. Cheap enough at 60fps for a single number.
    const loop = () => {
      const lvl = getLevel()
      levelRef.current = lvl
      // Only re-render when it moves meaningfully to avoid churn.
      setLevel((prev) => (Math.abs(prev - lvl) > 0.03 ? lvl : prev))
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    ;(async () => {
      // Prefer native speech (the app's WebView lacks the Web Speech API).
      const native = await nativeVoiceAvailable().catch(() => false)
      if (native) await ensureSpeechPermission().catch(() => false)
      if (!activeRef.current) return
      nativeRef.current = native
      setNativeReady(native)
      const canHear = native || webStt

      const greeting = canHear
        ? `Hey, I'm AskAI. I'm listening — what's up?`
        : `Hey, I'm AskAI. Heads up: this browser can't hear you — open AskAI in Chrome to talk. I can still read out loud.`
      setPhase('speaking')
      setCaption(greeting)
      playStartCue()
      await speakQueued(greeting)
      if (!activeRef.current) return
      if (canHear) startListening()
      else setCaption("This browser doesn't support voice input. Open AskAI in Chrome, or use the box below.")
    })()

    return () => {
      activeRef.current = false
      try {
        recRef.current?.stop()
      } catch {
        /* ignore */
      }
      queueRef.current?.stop()
      queueRef.current = null
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      stopThinkingSfx()
      disposeSfx()
      window.speechSynthesis?.cancel()
      void nativeStopListening()
      void nativeStopSpeaking()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Speak via native TTS in the app, else the Web Speech API. Resolves on end.
  function speakUnified(text: string): Promise<void> {
    const clean = text.replace(/[*_#`>]/g, '')
    const vp = getVoicePrefs()
    if (nativeRef.current) {
      return nativeSpeak(clean, { rate: vp.rate || 1.0, pitch: vp.pitch || 1.0 })
    }
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve()
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(clean)
      if (voiceRef.current) u.voice = voiceRef.current
      u.rate = vp.rate || 1.03
      u.pitch = vp.pitch || 1.05
      u.onend = () => resolve()
      u.onerror = () => resolve()
      window.speechSynthesis.speak(u)
    })
  }

  // Speak a complete piece of text through the gapless queue, split into
  // sentences, resolving once everything has finished playing. Used for the
  // greeting and as the final flush of a streamed reply.
  function speakQueued(text: string): Promise<void> {
    const q = queueRef.current
    if (!q) return speakUnified(text)
    const clean = cleanForSpeech(text)
    if (!clean) return Promise.resolve()
    const { chunks, rest } = splitSentences(clean)
    ;[...chunks, rest].forEach((c) => c.trim() && q.push(c))
    return waitForQueueIdle()
  }

  // Resolve when the speech queue has drained (or the call ends).
  function waitForQueueIdle(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (!activeRef.current || !queueRef.current?.active) return resolve()
        setTimeout(check, 80)
      }
      check()
    })
  }

  // One native listening turn, looped — the app's hands-free equivalent of the
  // Web SpeechRecognition flow below.
  async function listenNative() {
    if (!activeRef.current) return
    setPhase('listening')
    setCaption('Listening…')
    setUserSaid('')
    playListenCue()
    const said = await nativeListenOnce((t) => setUserSaid(t))
    if (!activeRef.current) return
    if (said) {
      setUserSaid(said)
      respond(said)
    } else {
      listenNative()
    }
  }

  function startListening() {
    if (nativeRef.current) {
      void listenNative()
      return
    }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Ctor) {
      setCaption('Voice input is not supported in this browser. Try Chrome.')
      return
    }
    const rec = new Ctor()
    recRef.current = rec
    rec.lang = navigator.language || 'en-US'
    rec.interimResults = true
    rec.continuous = false
    let finalText = ''
    setPhase('listening')
    setCaption('Listening…')
    playListenCue()
    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalText += t
        else interim += t
      }
      setUserSaid((finalText + interim).trim())
    }
    rec.onerror = () => {}
    rec.onend = () => {
      if (!activeRef.current) return
      const said = finalText.trim()
      if (said) {
        setUserSaid(said)
        respond(said)
      } else {
        // Nothing heard — keep listening.
        startListening()
      }
    }
    try {
      rec.start()
    } catch {
      /* already started */
    }
  }

  async function respond(text: string) {
    setPhase('thinking')
    setCaption('Thinking…')
    hapticPattern([10])
    // If the camera is on, grab the current frame and answer with a vision model.
    const frame = camOn ? captureFrame() : null
    const m = frame ? getModel('ripoai-2o-instant') : getModel(model)
    const system =
      buildSystemPrompt(m, settings, memories) +
      '\n\nYou are on a live VOICE call. Reply in a natural, conversational, spoken style — concise (1-4 sentences), no markdown, no lists, no code unless explicitly asked. Sound warm and human.' +
      (frame
        ? " You can SEE through the user's live camera. Answer naturally about what is actually visible in the image right now; if they ask 'what is this', describe what you see."
        : '')
    historyRef.current.push({ role: 'user', content: text })
    const msgs: ChatMessage[] = [{ role: 'system', content: system }, ...historyRef.current.slice(-8)]
    if (frame) {
      // Attach the frame only to the current turn (keep history light).
      msgs[msgs.length - 1] = {
        role: 'user',
        content: [
          { type: 'text', text: text || 'What do you see?' },
          { type: 'image_url', image_url: { url: frame } },
        ] as ContentPart[],
      }
    }
    // Soft "thinking / searching" sound cues until the first words come back.
    startThinkingSfx()

    const q = queueRef.current
    let answer = ''
    let buffer = '' // unspoken tail not yet ending a sentence
    let startedSpeaking = false

    // As tokens stream in, peel off complete sentences and speak them right
    // away — latency becomes "time to first sentence", not the whole reply.
    const onToken = (delta: string) => {
      if (!activeRef.current) return
      answer += delta
      buffer += delta
      const { chunks, rest } = splitSentences(buffer)
      buffer = rest
      if (chunks.length && q) {
        if (!startedSpeaking) {
          startedSpeaking = true
          stopThinkingSfx()
          playStartCue()
          setPhase('speaking')
        }
        setCaption(answer)
        chunks.forEach((c) => q.push(c))
      }
    }

    try {
      const res = await streamChat({
        model: m.groqModel,
        messages: msgs,
        temperature: 0.7,
        maxTokens: 400,
        onToken,
      })
      // Ensure we have the canonical full text (handles non-streaming providers).
      if (res.content && res.content.length > answer.length) answer = res.content
    } catch {
      answer = 'Sorry, I had trouble responding. Could you say that again?'
    }
    if (!activeRef.current) return
    stopThinkingSfx()
    historyRef.current.push({ role: 'assistant', content: answer })

    // Flush: if streaming never produced chunks (non-streaming provider or an
    // error message), speak the whole answer now. Otherwise just speak whatever
    // tail remains, then wait for the queue to drain before listening again.
    if (!startedSpeaking) {
      speakThenListen(answer)
      return
    }
    setPhase('speaking')
    setCaption(answer)
    const tail = cleanForSpeech(buffer)
    if (tail && q) q.push(tail)
    waitForQueueIdle().then(() => {
      if (activeRef.current) startListening()
    })
  }

  function speakThenListen(text: string) {
    setPhase('speaking')
    setCaption(text)
    speakQueued(text).then(() => {
      if (activeRef.current) startListening()
    })
  }

  // Only let the live level drive the visuals while speaking/listening, so the
  // orb is calm while connecting/thinking.
  const reactiveLevel = phase === 'speaking' || phase === 'listening' ? level : 0
  const waveActive = phase === 'speaking' || phase === 'listening'

  const ringColor =
    phase === 'listening' ? 'from-emerald-400 to-cyan-400'
    : phase === 'speaking' ? 'from-violet-500 to-blue-500'
    : phase === 'thinking' ? 'from-amber-400 to-pink-500'
    : 'from-slate-400 to-slate-500'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-between bg-surface/95 px-6 py-16 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="text-center">
            <div className="text-lg font-bold brand-gradient">AskAI Voice</div>
            <div className="mt-1 text-sm text-muted capitalize">{phase}</div>
          </div>

          {/* Live camera feed (always mounted so the ref exists) + animated orb */}
          <div className="relative flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`${camOn ? 'block' : 'hidden'} h-72 w-72 rounded-[2rem] object-cover shadow-2xl ring-4`}
              style={{ ['--tw-ring-color' as any]: 'rgb(var(--accent))' }}
            />
            {camOn ? (
              <motion.div
                className={`pointer-events-none absolute inset-0 rounded-[2rem] bg-gradient-to-br ${ringColor} opacity-20`}
                animate={{ opacity: phase === 'speaking' ? [0.1, 0.35, 0.1] : [0.08, 0.2, 0.08] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            ) : (
              <>
                {/* Audio-reactive halo — scales with the live spoken/heard level. */}
                <div
                  className={`vc-orb-halo bg-gradient-to-br ${ringColor}`}
                  style={{ ['--amp' as any]: reactiveLevel }}
                />
                {/* Speaking ripples. */}
                {phase === 'speaking' && (
                  <>
                    <span className="vc-ripple" />
                    <span className="vc-ripple vc-ripple--2" />
                    <span className="vc-ripple vc-ripple--3" />
                  </>
                )}
                <motion.div
                  className={`h-44 w-44 rounded-full bg-gradient-to-br ${ringColor} blur-xl`}
                  animate={{
                    scale: phase === 'speaking' ? [1, 1.18, 1] : phase === 'listening' ? [1, 1.08, 1] : 1,
                    opacity: phase === 'thinking' ? [0.5, 0.9, 0.5] : 0.8,
                  }}
                  transition={{ duration: phase === 'thinking' ? 1.2 : 1.6, repeat: Infinity }}
                />
                <div className={`absolute h-36 w-36 rounded-full bg-gradient-to-br ${ringColor} shadow-2xl`} />
                <div className="absolute flex h-32 w-32 items-center justify-center rounded-full bg-surface-raised/40 backdrop-blur">
                  <Mic size={40} className="text-white" />
                </div>
              </>
            )}
          </div>

          <div className="w-full max-w-md text-center">
            {userSaid && phase !== 'speaking' && (
              <p className="mb-3 text-sm text-muted">“{userSaid}”</p>
            )}
            <p className="min-h-[3rem] text-lg font-medium leading-relaxed">{caption}</p>

            {/* Live feedback: thinking dots, or a reactive talking/listening waveform. */}
            <div className="mt-3 flex h-14 items-center justify-center">
              {phase === 'thinking' ? (
                <div className="vc-thinking" aria-label="Thinking">
                  <span className="vc-thinking__dot" />
                  <span className="vc-thinking__dot" />
                  <span className="vc-thinking__dot" />
                </div>
              ) : waveActive ? (
                <div
                  className="vc-wave"
                  data-idle={reactiveLevel < 0.04 ? 'true' : 'false'}
                  aria-hidden
                >
                  {WAVE_BARS.map((mult, i) => (
                    <span
                      key={i}
                      className="vc-wave__bar"
                      style={{ ['--amp' as any]: Math.min(1, reactiveLevel * mult) }}
                    />
                  ))}
                </div>
              ) : null}
            </div>

            {!sttSupported && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const t = manual.trim()
                  if (!t || phase === 'thinking') return
                  setManual('')
                  setUserSaid(t)
                  respond(t)
                }}
                className="glass-strong mx-auto mt-6 flex max-w-sm items-center gap-2 rounded-2xl p-1.5"
              >
                <input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="Type — AskAI will reply out loud"
                  className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted"
                />
                <button type="submit" className="accent-gradient-bg rounded-xl px-3 py-2 text-sm font-semibold text-white">
                  Send
                </button>
              </form>
            )}

            <div className="mt-8 flex items-center justify-center gap-5">
              <button
                onClick={() => (camOn ? stopCamera() : startCamera(facing))}
                className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition active:scale-95 ${
                  camOn ? 'accent-gradient-bg text-white' : 'bg-surface-raised/60 text-ink backdrop-blur'
                }`}
                aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
                title={camOn ? 'Camera off' : 'Show camera (live vision)'}
              >
                {camOn ? <Camera size={22} /> : <CameraOff size={22} />}
              </button>

              <button
                onClick={() => {
                  hapticPattern([30])
                  endCall()
                }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/40 transition active:scale-95"
                aria-label="End call"
              >
                <PhoneOff size={26} />
              </button>

              <button
                onClick={() => camOn && startCamera(facing === 'environment' ? 'user' : 'environment')}
                disabled={!camOn}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised/60 text-ink shadow-lg backdrop-blur transition active:scale-95 disabled:opacity-30"
                aria-label="Flip camera"
                title="Flip camera"
              >
                <SwitchCamera size={22} />
              </button>
            </div>
            <p className="mt-3 text-[11px] text-muted">
              {camOn
                ? 'Live vision on — ask “what is this?” and I’ll look.'
                : sttSupported
                  ? "Tap the camera to let me see. Uses your device's voices."
                  : 'Voice input needs Chrome; replies are spoken aloud.'}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
