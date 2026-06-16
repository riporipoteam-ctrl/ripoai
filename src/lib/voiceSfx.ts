// Web Audio sound effects + live audio level metering for the voice call.
// All tones are synthesised with the Web Audio API — there are NO external
// assets, so this works identically on web, the Capacitor WebView and Electron.
//
// Two jobs:
//   1. Subtle "thinking / searching" sound cues while the AI is reasoning.
//   2. A shared AudioContext + master analyser the UI can read a 0..1 "level"
//      from to drive talking / listening waveform animations.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let analyser: AnalyserNode | null = null
let freqData: Uint8Array | null = null

/** Lazily create (and resume) the shared AudioContext. Safe to call often. */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = 0.9
      analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      freqData = new Uint8Array(analyser.frequencyBinCount)
      // master -> analyser -> destination, so anything routed through master
      // (our SFX) is also reflected in the live level.
      master.connect(analyser)
      analyser.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

/** Route an external HTMLAudioElement (e.g. Puter/NVIDIA TTS) through the
 *  analyser so the talking waveform reacts to the *actual* spoken audio.
 *  Falls back silently if the element can't be captured (CORS / unsupported). */
const routed = new WeakSet<HTMLMediaElement>()
export function routeMediaElement(el: HTMLMediaElement) {
  const c = getAudioContext()
  if (!c || !master || routed.has(el)) return
  try {
    const src = c.createMediaElementSource(el)
    src.connect(master)
    routed.add(el)
  } catch {
    /* element already captured elsewhere or cross-origin — animation will use
       the synthetic speaking pulse instead; audio still plays normally. */
  }
}

/** Current normalised audio level (0..1) from the master analyser. */
export function getLevel(): number {
  if (!analyser || !freqData) return 0
  analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>)
  let sum = 0
  for (let i = 0; i < freqData.length; i++) sum += freqData[i]
  const avg = sum / freqData.length / 255
  // Gentle curve so quiet speech still moves the bars.
  return Math.min(1, Math.pow(avg, 0.7) * 1.6)
}

/* --------------------------- Thinking sound cues --------------------------- */

let thinkingTimer: number | null = null
let thinkingNodes: Array<{ osc: OscillatorNode; gain: GainNode }> = []

function blip(freq: number, when: number, dur = 0.18, peak = 0.05) {
  const c = getAudioContext()
  if (!c || !master) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, when)
  // small upward glide — feels "curious / searching"
  osc.frequency.exponentialRampToValueAtTime(freq * 1.06, when + dur)
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.04)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  osc.connect(gain)
  gain.connect(master)
  osc.start(when)
  osc.stop(when + dur + 0.02)
  thinkingNodes.push({ osc, gain })
  osc.onended = () => {
    thinkingNodes = thinkingNodes.filter((n) => n.osc !== osc)
    try {
      osc.disconnect()
      gain.disconnect()
    } catch {
      /* ignore */
    }
  }
}

/** Start a soft, repeating two-note "thinking" motif. Idempotent. */
export function startThinkingSfx() {
  const c = getAudioContext()
  if (!c) return
  if (thinkingTimer !== null) return
  const notes = [523.25, 659.25, 587.33, 783.99] // C5 E5 D5 G5 — airy, pleasant
  let i = 0
  const tick = () => {
    const t = c.currentTime
    blip(notes[i % notes.length], t, 0.22, 0.045)
    // soft shadow note a fifth up for a richer, premium texture
    blip(notes[i % notes.length] * 1.5, t + 0.02, 0.16, 0.018)
    i++
  }
  tick()
  thinkingTimer = window.setInterval(tick, 620)
}

/** Stop the thinking motif and let any tails ring out. */
export function stopThinkingSfx() {
  if (thinkingTimer !== null) {
    clearInterval(thinkingTimer)
    thinkingTimer = null
  }
}

/** A short rising chime — e.g. when the assistant is about to speak. */
export function playStartCue() {
  const c = getAudioContext()
  if (!c) return
  const t = c.currentTime
  blip(659.25, t, 0.16, 0.04)
  blip(987.77, t + 0.09, 0.2, 0.045)
}

/** A short soft "listening" cue (gentle low-high). */
export function playListenCue() {
  const c = getAudioContext()
  if (!c) return
  const t = c.currentTime
  blip(440, t, 0.14, 0.03)
  blip(587.33, t + 0.08, 0.18, 0.035)
}

/** Release everything (call when the call ends). The context is kept around
 *  for the next call but is suspended to save battery. */
export function disposeSfx() {
  stopThinkingSfx()
  thinkingNodes.forEach(({ osc, gain }) => {
    try {
      osc.stop()
      osc.disconnect()
      gain.disconnect()
    } catch {
      /* ignore */
    }
  })
  thinkingNodes = []
  try {
    if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => {})
  } catch {
    /* ignore */
  }
}
