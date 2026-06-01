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
  u.rate = 1.02
  u.pitch = 1
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
