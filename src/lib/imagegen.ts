// Quick image style presets appended to the prompt.
export const IMAGE_STYLES: { id: string; label: string; suffix: string }[] = [
  { id: 'auto', label: 'Auto', suffix: '' },
  { id: 'photo', label: 'Photo', suffix: ', ultra-realistic photograph, 50mm, natural lighting, sharp focus, high detail' },
  { id: 'anime', label: 'Anime', suffix: ', anime style, vibrant colors, clean line art, studio anime key visual' },
  { id: '3d', label: '3D', suffix: ', 3D render, octane render, soft studio lighting, cinematic, highly detailed' },
  { id: 'art', label: 'Art', suffix: ', digital painting, artstation trending, dramatic lighting, masterpiece' },
  { id: 'logo', label: 'Logo', suffix: ', minimal flat vector logo, centered, simple, clean solid background' },
  { id: 'sketch', label: 'Sketch', suffix: ', detailed pencil sketch, hand-drawn, black and white' },
]

import { getNvidiaProxyRoot } from './groq'

export function styleSuffix(id?: string): string {
  return IMAGE_STYLES.find((s) => s.id === id)?.suffix ?? ''
}

// Pick dimensions from the request. Values are constrained to NVIDIA FLUX's
// allowed set (768/832/896/960/1024/1088/1152) so requests never 422.
export function dimsFor(prompt: string): { w: number; h: number } {
  const p = prompt.toLowerCase()
  const portrait =
    /\b(portrait|phone wallpaper|mobile wallpaper|story|reel|9:16|vertical|tall|poster)\b/.test(p)
  const landscape =
    /\b(landscape|desktop wallpaper|wallpaper|banner|cover|thumbnail|16:9|wide|horizontal|cinematic|panorama)\b/.test(
      p,
    )
  if (portrait && !landscape) return { w: 896, h: 1152 }
  if (landscape) return { w: 1152, h: 896 }
  return { w: 1024, h: 1024 }
}

// Generate an image with NVIDIA FLUX.1-dev (via the proxy worker). Returns a
// base64 data URL. This replaces the old keyless Pollinations endpoint, which
// went paid (HTTP 402).
export type ImageGenerationProvider = 'nvidia' | 'pollinations'

export interface ImageGenerationResult {
  url: string
  provider: ImageGenerationProvider
}

export interface ImageGenerationOptions {
  w?: number
  h?: number
  seed?: number
  signal?: AbortSignal
  model?: string
  preload?: boolean
}

export async function generateImage(
  prompt: string,
  opts: { w?: number; h?: number; seed?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const root = getNvidiaProxyRoot()
  const res = await fetch(`${root}/genai/black-forest-labs/flux.1-dev`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      prompt: prompt.slice(0, 9000),
      mode: 'base',
      width: opts.w ?? 1024,
      height: opts.h ?? 1024,
      steps: 40,
      cfg_scale: 4.5,
      samples: 1,
      seed: opts.seed ?? Math.floor(Math.random() * 1_000_000),
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    const err = new Error(`Image generation failed (${res.status}). ${t.slice(0, 160)}`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }
  const data = await res.json()
  // NVIDIA/Stability-style responses vary; accept the common shapes.
  const b64: string | undefined =
    data?.artifacts?.[0]?.base64 ||
    data?.data?.[0]?.b64_json ||
    data?.image ||
    data?.b64_json ||
    (Array.isArray(data?.images) ? data.images[0] : undefined)
  if (!b64) throw new Error('Image generation returned no image.')
  return b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`
}

function shouldFallbackToPollinations(err: unknown): boolean {
  const e = err as { name?: string; status?: number; message?: string; cause?: { status?: number } }
  if (e?.name === 'AbortError') return false

  const status = e?.status ?? e?.cause?.status
  if (
    status === 401 ||
    status === 402 ||
    status === 405 ||
    status === 429 ||
    (typeof status === 'number' && status >= 500)
  ) {
    return true
  }

  const message = String(e?.message ?? '').toLowerCase()
  if (/\((401|402|405|429|5\d\d)\)/.test(message)) return true
  return (
    err instanceof TypeError ||
    /network|failed to fetch|fetch failed|load failed|connection|timeout|timed out|econn|enotfound|cors/.test(message)
  )
}

// Prefer NVIDIA FLUX via the proxy, but fall back to the keyless Pollinations
// URL path when the proxy is down, rate-limited, over quota, or unavailable.
export async function generateImageWithFallback(
  prompt: string,
  opts: ImageGenerationOptions = {},
): Promise<ImageGenerationResult> {
  try {
    const url = await generateImage(prompt, opts)
    return { url, provider: 'nvidia' }
  } catch (err) {
    if (!shouldFallbackToPollinations(err)) throw err
  }

  const url = imageUrl(prompt, opts)
  if (opts.preload !== false) await preloadImage(url)
  return { url, provider: 'pollinations' }
}

// Free, keyless image generation via Pollinations (open CORS — usable directly
// as an <img> src). Returns a stable URL for a given prompt + seed.
export function imageUrl(
  prompt: string,
  opts: { w?: number; h?: number; seed?: number; model?: string } = {},
): string {
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000)
  const w = opts.w ?? 1024
  const h = opts.h ?? 1024
  const model = opts.model ?? 'flux'
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    prompt,
  )}?width=${w}&height=${h}&nologo=true&seed=${seed}&model=${model}`
}

/** Resolves once the generated image has finished loading (or errors out). */
export function preloadImage(url: string, timeoutMs = 45000): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    const done = () => resolve()
    img.onload = done
    img.onerror = done
    img.src = url
    setTimeout(done, timeoutMs)
  })
}
