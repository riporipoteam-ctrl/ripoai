// High-quality voice playback. Tries NVIDIA neural TTS through the proxy worker
// (/voice/tts) and plays the returned audio; if the worker or NVIDIA voice is
// unavailable, it falls back seamlessly to the on-device browser voice so audio
// always works. No fake audio — the NVIDIA path is a real attempt.
import { getNvidiaProxyRoot } from './groq'
import { speak as browserSpeak, stopSpeaking, getVoicePrefs } from '../hooks/useSpeech'

let currentAudio: HTMLAudioElement | null = null
let currentUrl: string | null = null

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[*_#>`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)
}

/** Speak text with the best available voice (NVIDIA neural → on-device). */
export async function speakHQ(text: string, onEnd?: () => void): Promise<void> {
  stopVoice()
  const clean = cleanForSpeech(text)
  if (!clean) {
    onEnd?.()
    return
  }
  const root = getNvidiaProxyRoot()
  if (root) {
    try {
      const res = await fetch(`${root}/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, rate: getVoicePrefs().rate }),
      })
      const ct = res.headers.get('Content-Type') || ''
      if (res.ok && /audio/i.test(ct)) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        currentAudio = audio
        currentUrl = url
        audio.playbackRate = getVoicePrefs().rate || 1
        audio.onended = () => {
          releaseAudio()
          onEnd?.()
        }
        audio.onerror = () => {
          releaseAudio()
          browserSpeak(text, onEnd)
        }
        await audio.play()
        return
      }
    } catch {
      /* fall through to on-device voice */
    }
  }
  // Fallback: on-device speech synthesis (already markdown-aware).
  browserSpeak(text, onEnd)
}

function releaseAudio() {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl)
    currentUrl = null
  }
  currentAudio = null
}

/** Stop any voice playback (NVIDIA audio or on-device). */
export function stopVoice() {
  if (currentAudio) {
    currentAudio.pause()
    releaseAudio()
  }
  stopSpeaking()
}
