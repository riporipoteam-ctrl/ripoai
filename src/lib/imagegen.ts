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
import { composeTextOnImage } from './compose'

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

const KONTEXT_DIMENSIONS = [672, 688, 720, 752, 800, 832, 880, 944, 1024, 1104, 1184, 1248, 1328, 1392, 1456, 1504, 1568]

function closestKontextDimension(value: number | undefined): number {
  if (!value) return 1024
  return KONTEXT_DIMENSIONS.reduce((best, dim) => (Math.abs(dim - value) < Math.abs(best - value) ? dim : best), 1024)
}

function dataUrlFromImageResponse(data: any, fallbackMime = 'image/jpeg'): string {
  // NVIDIA/Stability-style responses vary; accept the common shapes.
  const b64: string | undefined =
    data?.artifacts?.[0]?.base64 ||
    data?.data?.[0]?.b64_json ||
    data?.image ||
    data?.b64_json ||
    (Array.isArray(data?.images) ? data.images[0] : undefined)
  if (!b64) throw new Error('Image request returned no image.')
  return b64.startsWith('data:') ? b64 : `data:${fallbackMime};base64,${b64}`
}

export class ImageEditUnsupportedError extends Error {
  constructor(message = 'Image editing is not available yet for this request.') {
    super(message)
    this.name = 'ImageEditUnsupportedError'
  }
}

function isLikelyUnsupportedEdit(status: number, detail: string): boolean {
  const text = detail.toLowerCase()
  return (
    status === 404 ||
    status === 405 ||
    status === 422 ||
    text.includes('predefined set of images') ||
    text.includes('example_id') ||
    text.includes('not found') ||
    text.includes('not supported') ||
    text.includes('unsupported')
  )
}

function extractQuotedText(prompt: string): string | null {
  const quoted = prompt.match(/["“”'‘’]([^"“”'‘’]{1,120})["“”'‘’]/)
  return quoted?.[1]?.trim() || null
}

function explicitTextComposite(prompt: string): { text: string; position: 'top' | 'bottom' | 'center' } | null {
  const p = prompt.trim()
  if (!p) return null

  const hasTextIntent =
    /\b(add|put|place|overlay|write|insert|draw)\b[\s\S]{0,80}\b(text|caption|title|label|words?|quote|slogan|headline)\b/i.test(p) ||
    /\b(caption|meme|text overlay)\b/i.test(p)
  if (!hasTextIntent) return null

  const quoted = extractQuotedText(p)
  const captured =
    quoted ||
    p.match(/\b(?:saying|that says|reading|with text|text|caption|title|label)\s*:?\s*(.{1,120})$/i)?.[1]?.trim() ||
    p.match(/\b(?:add|put|place|overlay|write|insert|draw)\b.{0,40}?\b(?:text|caption|title|label|words?)\b\s*:?\s*(.{1,120})$/i)?.[1]?.trim()

  let text = (captured || '').replace(/^['"“”‘’]+|['"“”‘’.,]+$/g, '').trim()
  text = text.replace(/\s+\b(?:at|on)\s+the\s+(?:top|bottom|center|middle)\b.*$/i, '').trim()
  if (!text) return null

  const position = /\b(bottom|lower)\b/i.test(p) ? 'bottom' : /\b(center|middle)\b/i.test(p) ? 'center' : 'top'
  return { text, position }
}

// Generate an image with NVIDIA FLUX.1-dev (via the proxy worker). Returns a
// base64 data URL. This replaces the old keyless Pollinations endpoint, which
// went paid (HTTP 402).
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
    throw new Error(`Image generation failed (${res.status}). ${t.slice(0, 160)}`)
  }
  const data = await res.json()
  return dataUrlFromImageResponse(data)
}

// Edit an uploaded image with NVIDIA FLUX.1-Kontext when the configured proxy
// exposes it. If that endpoint is unavailable in the current deployment, only
// explicit text/caption overlay requests fall back to the local canvas composer;
// other edit requests fail loudly so we never return the unchanged upload.
export async function editImage(
  prompt: string,
  imageUrl: string,
  opts: { w?: number; h?: number; seed?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const root = getNvidiaProxyRoot()
  const body = {
    prompt: prompt.slice(0, 9000),
    image: imageUrl,
    width: closestKontextDimension(opts.w),
    height: closestKontextDimension(opts.h),
    aspect_ratio: 'match_input_image',
    steps: 30,
    cfg_scale: 3.5,
    samples: 1,
    seed: opts.seed ?? Math.floor(Math.random() * 1_000_000),
  }

  try {
    const res = await fetch(`${root}/genai/black-forest-labs/flux.1-kontext-dev`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: opts.signal,
      body: JSON.stringify(body),
    })
    if (res.ok) return dataUrlFromImageResponse(await res.json())

    const t = await res.text().catch(() => '')
    if (!isLikelyUnsupportedEdit(res.status, t)) {
      throw new Error(`Image editing failed (${res.status}). ${t.slice(0, 160)}`)
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e
    if (e instanceof ImageEditUnsupportedError) throw e
    // Network/proxy routing failures usually mean the edit endpoint is not
    // deployed for this static app. Let explicit text overlays use compose.
    if (e?.message && !/Failed to fetch|NetworkError|Load failed/i.test(e.message)) throw e
  }

  const overlay = explicitTextComposite(prompt)
  if (overlay) return composeTextOnImage(imageUrl, overlay.text, overlay.position)

  throw new ImageEditUnsupportedError(
    'Image editing is not available yet for uploaded images. I can still generate a new image from text, or add an explicit text/caption overlay to your uploaded image.',
  )
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
