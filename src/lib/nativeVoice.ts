// Native voice — true hands-free speech in the iOS/Android app via Capacitor
// community plugins (the WKWebView/Chrome WebView have no usable Web Speech API).
// On the website these are inert and the caller falls back to the Web Speech API.

import { isNative } from './native'

let SR: any = null
let TTS: any = null
let loaded = false

async function load() {
  if (loaded) return
  loaded = true
  try {
    SR = (await import('@capacitor-community/speech-recognition')).SpeechRecognition
  } catch {
    SR = null
  }
  try {
    TTS = (await import('@capacitor-community/text-to-speech')).TextToSpeech
  } catch {
    TTS = null
  }
}

/** Are native speech plugins usable here (i.e. inside the app)? */
export async function nativeVoiceAvailable(): Promise<boolean> {
  if (!isNative) return false
  await load()
  return !!SR && !!TTS
}

/** Ask for mic/speech permission up front (call from a user gesture). */
export async function ensureSpeechPermission(): Promise<boolean> {
  await load()
  if (!SR) return false
  try {
    const avail = await SR.available().catch(() => ({ available: true }))
    if (avail && avail.available === false) return false
    const perm = await SR.checkPermissions().catch(() => null)
    if (!perm || perm.speechRecognition !== 'granted') {
      const req = await SR.requestPermissions().catch(() => null)
      return !!req && req.speechRecognition === 'granted'
    }
    return true
  } catch {
    return false
  }
}

/** One listening turn. Resolves with the final transcript (or '' if nothing).
 *  onPartial streams interim results so the UI can show them live. */
export async function nativeListenOnce(onPartial?: (t: string) => void): Promise<string> {
  await load()
  if (!SR) return ''
  let last = ''
  let handle: any = null
  try {
    handle = await SR.addListener('partialResults', (data: any) => {
      const t = (data?.matches && data.matches[0]) || ''
      if (t) {
        last = t
        onPartial?.(t)
      }
    })
  } catch {
    /* partial events unsupported on this platform — final result still returns */
  }
  try {
    // popup:false → use the streaming API; partialResults drive the live caption.
    const res = await SR.start({
      language: (navigator.language || 'en-US'),
      maxResults: 1,
      partialResults: true,
      popup: false,
    })
    const finalT = (res?.matches && res.matches[0]) || last
    return (finalT || '').trim()
  } catch {
    return (last || '').trim()
  } finally {
    try {
      await handle?.remove?.()
    } catch {
      /* ignore */
    }
    try {
      await SR.stop()
    } catch {
      /* ignore */
    }
  }
}

export async function nativeStopListening(): Promise<void> {
  await load()
  try {
    await SR?.stop?.()
  } catch {
    /* ignore */
  }
}

/** Speak text with the device's native TTS. Resolves when finished. */
export async function nativeSpeak(text: string, opts?: { rate?: number; pitch?: number }): Promise<void> {
  await load()
  if (!TTS) return
  try {
    await TTS.stop().catch(() => {})
    await TTS.speak({
      text,
      lang: navigator.language || 'en-US',
      // Capacitor TTS rate is ~0.1–2.0; map our ~1.0 default sensibly.
      rate: opts?.rate ?? 1.0,
      pitch: opts?.pitch ?? 1.0,
      volume: 1.0,
      category: 'playback',
    })
  } catch {
    /* ignore — caller may fall back to Web Speech */
  }
}

export async function nativeStopSpeaking(): Promise<void> {
  await load()
  try {
    await TTS?.stop?.()
  } catch {
    /* ignore */
  }
}
