// High-quality voice playback.
//
// Voice priority (best → safest fallback):
//   1. Puter.js neural TTS  (puter.ai.txt2speech — OpenAI "nova" voice)
//   2. NVIDIA neural TTS via the proxy worker (/voice/tts)
//   3. On-device speech synthesis (Web Speech API) / native Capacitor TTS
//
// Every higher tier is a *real* attempt wrapped in try/catch — if it is
// unavailable or errors (including Puter wanting a login popup) we fall through
// to the next tier so audio always works. Puter is loaded globally via
// https://js.puter.com/v2/ in index.html and reached through window.puter.
import { getNvidiaProxyRoot } from './groq'
import { speak as browserSpeak, stopSpeaking, getVoicePrefs } from '../hooks/useSpeech'
import { routeMediaElement } from './voiceSfx'

let currentAudio: HTMLAudioElement | null = null
let currentUrl: string | null = null

// Remember whether Puter TTS works so we stop hammering it after a failure
// (e.g. it requires a login we deliberately never trigger).
let puterTtsState: 'unknown' | 'ok' | 'bad' = 'unknown'

export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[*_#>`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)
}

/* --------------------------- Sentence chunking ---------------------------- */

const ABBREV = /\b(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|inc|ltd|co|fig|e\.g|i\.e|a\.m|p\.m|u\.s|u\.k)\.$/i

/**
 * Split streamed text into speakable chunks on sentence-ending punctuation
 * followed by whitespace, while guarding abbreviations ("Dr.", "Mr.") and
 * decimals ("3.14"). Returns the complete chunks plus the leftover remainder
 * that has not yet ended a sentence (carry this back in next time).
 */
export function splitSentences(buffer: string, minLen = 12): { chunks: string[]; rest: string } {
  const chunks: string[] = []
  let start = 0
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i]
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '\n') continue
    const next = buffer[i + 1]
    // Must be followed by whitespace / end (so "3.14" and "U.S." mid-word stay intact).
    if (next && !/\s/.test(next)) continue
    // Decimal guard: digit . digit
    if (ch === '.' && /\d/.test(buffer[i - 1] || '') && /\d/.test(next || '')) continue
    const candidate = buffer.slice(start, i + 1)
    // Abbreviation guard.
    if (ch === '.' && ABBREV.test(candidate.trimEnd())) continue
    const trimmed = candidate.trim()
    if (trimmed.length < minLen) continue // keep accumulating tiny fragments
    chunks.push(trimmed)
    start = i + 1
  }
  return { chunks, rest: buffer.slice(start) }
}

/* ------------------------------ Puter TTS -------------------------------- */

function getPuter(): any | null {
  if (typeof window === 'undefined') return null
  const p = (window as any).puter
  return p && p.ai && typeof p.ai.txt2speech === 'function' ? p : null
}

/** True if Puter neural TTS is plausibly usable (not yet known-bad). */
export function puterTtsAvailable(): boolean {
  return puterTtsState !== 'bad' && !!getPuter()
}

/**
 * Synthesise speech with Puter.js. Resolves with a ready-to-play
 * HTMLAudioElement, or null if Puter is unavailable / errored. Never throws and
 * never triggers a login popup (any auth requirement surfaces as a rejection we
 * swallow, marking Puter bad so we fall back permanently for this session).
 */
export async function puterSynthesize(text: string): Promise<HTMLAudioElement | null> {
  const puter = getPuter()
  if (!puter) return null
  try {
    const vp = getVoicePrefs()
    const audio: HTMLAudioElement = await puter.ai.txt2speech(text, {
      provider: 'openai',
      voice: vp.puterVoice || 'nova',
    })
    if (!audio || typeof audio.play !== 'function') {
      puterTtsState = 'bad'
      return null
    }
    puterTtsState = 'ok'
    return audio
  } catch {
    puterTtsState = 'bad'
    return null
  }
}

/* ------------------------------ NVIDIA TTS -------------------------------- */

async function nvidiaSynthesize(clean: string): Promise<HTMLAudioElement | null> {
  const root = getNvidiaProxyRoot()
  if (!root) return null
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
      ;(audio as any).__objUrl = url
      return audio
    }
  } catch {
    /* fall through */
  }
  return null
}

/* --------------------------- Single-shot speak --------------------------- */

function playElement(audio: HTMLAudioElement, onEnd?: () => void) {
  currentAudio = audio
  currentUrl = (audio as any).__objUrl || null
  try {
    routeMediaElement(audio)
  } catch {
    /* analyser routing is best-effort */
  }
  audio.playbackRate = getVoicePrefs().rate || 1
  audio.onended = () => {
    releaseAudio()
    onEnd?.()
  }
  audio.onerror = () => {
    releaseAudio()
    onEnd?.()
  }
  audio.play().catch(() => {
    releaseAudio()
    onEnd?.()
  })
}

/** Speak text with the best available voice (Puter → NVIDIA → on-device). */
export async function speakHQ(text: string, onEnd?: () => void): Promise<void> {
  stopVoice()
  const clean = cleanForSpeech(text)
  if (!clean) {
    onEnd?.()
    return
  }
  const puterAudio = await puterSynthesize(clean)
  if (puterAudio) {
    playElement(puterAudio, onEnd)
    return
  }
  const nvAudio = await nvidiaSynthesize(clean)
  if (nvAudio) {
    playElement(nvAudio, onEnd)
    return
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

/** Stop any voice playback (Puter/NVIDIA audio or on-device). */
export function stopVoice() {
  if (currentAudio) {
    try {
      currentAudio.pause()
    } catch {
      /* ignore */
    }
    releaseAudio()
  }
  stopSpeaking()
}

/* ----------------------- Gapless streaming queue ------------------------- */

/**
 * Plays speech chunks back-to-back with no gaps. Push sentences as they stream
 * in; the queue synthesises the next chunk while the current one plays, so
 * latency is just the first sentence rather than the whole reply.
 *
 * `synth` produces an HTMLAudioElement for a chunk (e.g. Puter/NVIDIA). If it
 * returns null the queue uses `fallbackSpeak` (Web Speech / native TTS) for
 * that chunk so audio never drops.
 */
export class SpeechQueue {
  private queue: string[] = []
  private playing = false
  private stopped = false
  private current: HTMLAudioElement | null = null
  private currentUrl: string | null = null

  constructor(
    private synth: (text: string) => Promise<HTMLAudioElement | null>,
    private fallbackSpeak: (text: string) => Promise<void>,
    private onIdle?: () => void,
  ) {}

  /** Queue a chunk of text to be spoken in order. */
  push(text: string) {
    const clean = cleanForSpeech(text)
    if (!clean || this.stopped) return
    this.queue.push(clean)
    if (!this.playing) void this.pump()
  }

  private async pump() {
    this.playing = true
    while (!this.stopped && this.queue.length) {
      const text = this.queue.shift() as string
      const audio = await this.synth(text).catch(() => null)
      if (this.stopped) {
        this.cleanupAudio(audio)
        break
      }
      if (audio) {
        await this.playOne(audio)
      } else {
        // Fall back to on-device / native TTS for this chunk.
        await this.fallbackSpeak(text).catch(() => {})
      }
    }
    this.playing = false
    if (!this.stopped && !this.queue.length) this.onIdle?.()
  }

  private playOne(audio: HTMLAudioElement): Promise<void> {
    return new Promise((resolve) => {
      this.current = audio
      this.currentUrl = (audio as any).__objUrl || null
      try {
        routeMediaElement(audio)
      } catch {
        /* best-effort */
      }
      audio.playbackRate = getVoicePrefs().rate || 1
      const done = () => {
        this.releaseCurrent()
        resolve()
      }
      audio.onended = done
      audio.onerror = done
      audio.play().catch(done)
    })
  }

  private cleanupAudio(audio: HTMLAudioElement | null) {
    if (!audio) return
    try {
      audio.pause()
    } catch {
      /* ignore */
    }
    const u = (audio as any).__objUrl
    if (u) URL.revokeObjectURL(u)
  }

  private releaseCurrent() {
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl)
      this.currentUrl = null
    }
    this.current = null
  }

  /** True while there is audio playing or queued. */
  get active() {
    return this.playing || this.queue.length > 0
  }

  /** Stop immediately and drop everything queued. */
  stop() {
    this.stopped = true
    this.queue = []
    if (this.current) {
      try {
        this.current.pause()
      } catch {
        /* ignore */
      }
      this.releaseCurrent()
    }
  }
}
