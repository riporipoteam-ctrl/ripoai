import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PhoneOff, Mic } from 'lucide-react'
import { streamChat, type ChatMessage } from '../lib/groq'
import { getModel, type ModelTier } from '../lib/models'
import { buildSystemPrompt } from '../lib/prompt'
import { hapticPattern, resolveVoice, getVoicePrefs } from '../hooks/useSpeech'
import { useStore } from '../store'

type Phase = 'connecting' | 'listening' | 'thinking' | 'speaking'

function pickVoice(): SpeechSynthesisVoice | null {
  return resolveVoice()
}

export default function VoiceCall({
  open,
  onClose,
  model,
}: {
  open: boolean
  onClose: () => void
  model: ModelTier
}) {
  const { settings, memories } = useStore()
  const [phase, setPhase] = useState<Phase>('connecting')
  const [caption, setCaption] = useState('')
  const [userSaid, setUserSaid] = useState('')
  const [manual, setManual] = useState('')
  const sttSupported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  const recRef = useRef<any>(null)
  const historyRef = useRef<ChatMessage[]>([])
  const activeRef = useRef(false)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)

  useEffect(() => {
    if (!open) return
    activeRef.current = true
    historyRef.current = []
    voiceRef.current = pickVoice()
    window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
      voiceRef.current = pickVoice()
    })
    hapticPattern([20, 60, 20])

    const sttSupported =
      typeof window !== 'undefined' &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

    // Greet immediately — this runs inside the tap gesture, which unlocks
    // speech synthesis on iOS, and gives audible confirmation the call started.
    const greeting = sttSupported
      ? `Hey, I'm RipoAI. I'm listening — what's up?`
      : `Hey, I'm RipoAI. Heads up: this browser can't hear you — open RipoAI in Chrome to talk. I can still read out loud.`
    setPhase('speaking')
    setCaption(greeting)
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(greeting)
      if (voiceRef.current) u.voice = voiceRef.current
      const gp = getVoicePrefs()
      u.rate = gp.rate || 1.03
      u.pitch = gp.pitch || 1.05
      u.onend = () => {
        if (!activeRef.current) return
        if (sttSupported) startListening()
        else setCaption("This browser doesn't support voice input. Open RipoAI in Chrome to talk to me.")
      }
      u.onerror = () => {
        if (activeRef.current && sttSupported) startListening()
      }
      window.speechSynthesis.speak(u)
    } else if (sttSupported) {
      startListening()
    }

    return () => {
      activeRef.current = false
      try {
        recRef.current?.stop()
      } catch {
        /* ignore */
      }
      window.speechSynthesis?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function startListening() {
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
    const m = getModel(model)
    const system =
      buildSystemPrompt(m, settings, memories) +
      '\n\nYou are on a live VOICE call. Reply in a natural, conversational, spoken style — concise (1-4 sentences), no markdown, no lists, no code unless explicitly asked. Sound warm and human.'
    historyRef.current.push({ role: 'user', content: text })
    let answer = ''
    try {
      const res = await streamChat({
        model: m.groqModel,
        messages: [{ role: 'system', content: system }, ...historyRef.current.slice(-10)],
        temperature: 0.7,
        maxTokens: 400,
        reasoningEffort: m.reasoningEffort,
      })
      answer = res.content
    } catch {
      answer = 'Sorry, I had trouble responding. Could you say that again?'
    }
    if (!activeRef.current) return
    historyRef.current.push({ role: 'assistant', content: answer })
    speakThenListen(answer)
  }

  function speakThenListen(text: string) {
    setPhase('speaking')
    setCaption(text)
    if (!window.speechSynthesis) {
      startListening()
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#`>]/g, ''))
    if (voiceRef.current) u.voice = voiceRef.current
    const vp = getVoicePrefs()
    u.rate = vp.rate || 1.03
    u.pitch = vp.pitch || 1.05
    u.onend = () => {
      if (activeRef.current) startListening()
    }
    u.onerror = () => {
      if (activeRef.current) startListening()
    }
    window.speechSynthesis.speak(u)
  }

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
            <div className="text-lg font-bold brand-gradient">RipoAI Voice</div>
            <div className="mt-1 text-sm text-muted capitalize">{phase}</div>
          </div>

          {/* Animated orb */}
          <div className="relative flex items-center justify-center">
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
          </div>

          <div className="w-full max-w-md text-center">
            {userSaid && phase !== 'speaking' && (
              <p className="mb-3 text-sm text-muted">“{userSaid}”</p>
            )}
            <p className="min-h-[3rem] text-lg font-medium leading-relaxed">{caption}</p>

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
                  placeholder="Type — RipoAI will reply out loud"
                  className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted"
                />
                <button type="submit" className="accent-gradient-bg rounded-xl px-3 py-2 text-sm font-semibold text-white">
                  Send
                </button>
              </form>
            )}

            <button
              onClick={() => {
                hapticPattern([30])
                onClose()
              }}
              className="mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/40 transition active:scale-95"
              aria-label="End call"
            >
              <PhoneOff size={26} />
            </button>
            <p className="mt-3 text-[11px] text-muted">
              {sttSupported ? "Uses your device's built-in voices." : 'Voice input needs Chrome; replies are spoken aloud.'}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
