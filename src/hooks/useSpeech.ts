import { useCallback, useEffect, useRef, useState } from 'react'

// Lightweight wrappers around the browser Web Speech APIs. Both degrade
// gracefully when unsupported (e.g. some mobile browsers).

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: any) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

function getRecognition(): SpeechRecognitionLike | null {
  const Ctor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!Ctor) return null
  return new Ctor()
}

export function useVoiceInput(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const supported = typeof window !== 'undefined' && !!getRecognition()

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const rec = getRecognition()
    if (!rec) return
    recRef.current = rec
    rec.lang = navigator.language || 'en-US'
    rec.interimResults = true
    rec.continuous = false
    let finalText = ''
    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalText += t
        else interim += t
      }
      onText((finalText + interim).trim())
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [onText])

  useEffect(() => () => recRef.current?.stop(), [])

  return { supported, listening, start, stop }
}

let currentUtterance: SpeechSynthesisUtterance | null = null

/* ------------------------- Voice preferences ------------------------- */

export interface VoicePrefs {
  voiceURI?: string
  rate: number
  pitch: number
}

const VOICE_KEY = 'ripoai:voice'

export function getVoicePrefs(): VoicePrefs {
  try {
    const v = localStorage.getItem(VOICE_KEY)
    if (v) return { rate: 1.0, pitch: 1.0, ...JSON.parse(v) }
  } catch {
    /* ignore */
  }
  return { rate: 1.0, pitch: 1.0 }
}

export function setVoicePrefs(prefs: Partial<VoicePrefs>) {
  try {
    localStorage.setItem(VOICE_KEY, JSON.stringify({ ...getVoicePrefs(), ...prefs }))
  } catch {
    /* ignore */
  }
}

const QUALITY_HINTS = ['enhanced', 'premium', 'neural', 'natural', 'google', 'siri', 'ava', 'zoe', 'evan', 'samantha', 'aria', 'jenny']

/** All English voices, highest-quality first. */
export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return []
  const all = window.speechSynthesis.getVoices()
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase()
    let s = 0
    QUALITY_HINTS.forEach((h, i) => { if (n.includes(h)) s += QUALITY_HINTS.length - i + 5 })
    if (v.lang?.toLowerCase().startsWith('en')) s += 4
    if (v.localService) s += 1
    return s
  }
  return [...all].sort((a, b) => score(b) - score(a))
}

export function resolveVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() ?? []
  if (!voices.length) return null
  const prefs = getVoicePrefs()
  if (prefs.voiceURI) {
    const v = voices.find((x) => x.voiceURI === prefs.voiceURI)
    if (v) return v
  }
  return listVoices()[0] ?? voices[0]
}

export function speak(text: string, onEnd?: () => void) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  // Strip markdown so it reads naturally.
  const clean = text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/[*_#>`~|]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .slice(0, 4000)
  const u = new SpeechSynthesisUtterance(clean)
  const prefs = getVoicePrefs()
  const voice = resolveVoice()
  if (voice) u.voice = voice
  u.rate = prefs.rate || 1.02
  u.pitch = prefs.pitch || 1
  u.onend = () => {
    currentUtterance = null
    onEnd?.()
  }
  currentUtterance = u
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
    currentUtterance = null
  }
}

export function isSpeechSupported() {
  return typeof window !== 'undefined' && !!window.speechSynthesis
}

let lastBuzz = 0
/** Short, throttled haptic tick — used while reasoning / streaming tokens. */
export function haptic(ms = 6) {
  try {
    const now = Date.now()
    if (now - lastBuzz < 110) return
    lastBuzz = now
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported (e.g. iOS Safari) */
  }
}

export function hapticPattern(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported */
  }
}
