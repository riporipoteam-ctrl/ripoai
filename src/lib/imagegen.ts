// Quick image style presets appended to the prompt.
export const IMAGE_STYLES: { id: string; label: string; suffix: string }[] = [
  { id: 'auto', label: 'Auto', suffix: '' },
  { id: 'photo', label: 'Photo', suffix: ', ultra-realistic photograph, 50mm, natural lighting, sharp focus, high detail' },
  { id: 'anime', label: 'Anime', suffix: ', anime style, vibrant colors, clean line art, studio anime key visual' },
  { id: '3d', label: '3D', suffix: ', 3D render, octane render, soft studio lighting, cinematic, highly detailed' },
  { id: 'art', label: 'Art', suffix: ', digital painting, artstation trending, dramatic lighting, masterpiece' },
  { id: 'logo', label: 'Logo', suffix: ', minimal flat vector logo, centered, bright white background, high contrast, crisp readable lettering when text is requested, no black canvas' },
  { id: 'sketch', label: 'Sketch', suffix: ', detailed pencil sketch, hand-drawn, black and white' },
]

import { getNvidiaProxyRoot } from './groq'

const NVIDIA_IMAGE_MODEL = 'black-forest-labs/flux.1-dev'

export function styleSuffix(id?: string): string {
  return IMAGE_STYLES.find((s) => s.id === id)?.suffix ?? ''
}

export function wantsImageGeneration(text: string): boolean {
  const t = (text || '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (!t) return false
  if (/\b(image|photo|picture|logo|poster|wallpaper|avatar|sticker|icon|banner|thumbnail)\s+prompts?\b/.test(t))
    return false
  if (/\b(analy[sz]e|describe|explain|read|what'?s in|identify|caption)\b.*\b(image|photo|picture|screenshot)\b/.test(t))
    return false

  const action =
    /\b(generate|create|make|draw|design|render|produce|paint|illustrate|visuali[sz]e)\b/.test(t)
  const target =
    /\b(image|picture|photo|artwork|illustration|poster|logo|wallpaper|avatar|sticker|icon|banner|thumbnail|cover art|album cover|scene|render)\b/.test(t)
  const directAsk =
    /\b(show me|give me|i need|can you make|could you make|make me)\b.*\b(image|picture|photo|logo|poster|wallpaper|avatar|banner|thumbnail|illustration)\b/.test(
      t,
    )

  return (action && target) || directAsk
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

function isLogoOrTextPrompt(prompt: string): boolean {
  return /\b(logo|wordmark|typography|lettering|letters|text|says|slogan|brand name|with words|called|named)\b/i.test(
    prompt,
  )
}

function saferPrompt(prompt: string): string {
  const guard =
    'well-lit, high contrast, complete visible subject, no black canvas, no blank frame, no empty dark background'
  if (isLogoOrTextPrompt(prompt)) {
    return `${prompt}, bright professional vector design, clean white or brand-color background, readable exact lettering, centered composition, ${guard}`.slice(
      0,
      1200,
    )
  }
  return `${prompt}, ${guard}`.slice(0, 1200)
}

async function imageLooksBlank(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    if (!url.startsWith('data:')) img.crossOrigin = 'anonymous'
    const timer = window.setTimeout(() => resolve(false), 8000)
    img.onload = () => {
      window.clearTimeout(timer)
      try {
        const canvas = document.createElement('canvas')
        const size = 28
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(false)
        ctx.drawImage(img, 0, 0, size, size)
        const data = ctx.getImageData(0, 0, size, size).data
        let dark = 0
        let total = 0
        let sum = 0
        let sumSq = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 20) continue
          const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
          if (lum < 12) dark++
          total++
          sum += lum
          sumSq += lum * lum
        }
        if (!total) return resolve(true)
        const avg = sum / total
        const variance = sumSq / total - avg * avg
        resolve((avg < 10 && variance < 18) || dark / total > 0.985)
      } catch {
        resolve(false)
      }
    }
    img.onerror = () => {
      window.clearTimeout(timer)
      resolve(false)
    }
    img.src = url
  })
}

async function generateNvidiaImage(
  prompt: string,
  opts: { w?: number; h?: number; seed?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const root = getNvidiaProxyRoot()
  const res = await fetch(`${root}/genai/${NVIDIA_IMAGE_MODEL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      prompt: prompt.slice(0, 9000),
      mode: 'base',
      width: opts.w ?? 1024,
      height: opts.h ?? 1024,
      steps: isLogoOrTextPrompt(prompt) ? 50 : 40,
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
  const b64: string | undefined =
    data?.artifacts?.[0]?.base64 ||
    data?.data?.[0]?.b64_json ||
    data?.image ||
    data?.b64_json ||
    (Array.isArray(data?.images) ? data.images[0] : undefined)
  if (!b64) throw new Error('Image generation returned no image.')
  return b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`
}

export async function generateImage(
  prompt: string,
  opts: { w?: number; h?: number; seed?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const safe = saferPrompt(prompt)
  let lastError: unknown
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000)
  for (let i = 0; i < 3; i++) {
    try {
      const generated = await generateNvidiaImage(safe, { ...opts, seed: seed + i })
      if (await imageLooksBlank(generated)) throw new Error('Generated image was blank.')
      return generated
    } catch (e) {
      lastError = e
      if (opts.signal?.aborted) throw e
    }
  }
  if (isLogoOrTextPrompt(prompt)) {
    throw new Error(
      lastError instanceof Error
        ? lastError.message
        : 'The NVIDIA image model could not produce a usable logo image.',
    )
  }
  return imageUrl(safe, { w: opts.w, h: opts.h, seed, model: 'flux' })
}

export async function generateImageAsset(
  prompt: string,
  opts: { w?: number; h?: number; seed?: number; signal?: AbortSignal } = {},
): Promise<string> {
  return generateImage(prompt, opts)
}

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
