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

export function styleSuffix(id?: string): string {
  return IMAGE_STYLES.find((s) => s.id === id)?.suffix ?? ''
}

// Pick sensible dimensions from the request so wallpapers/portraits/banners
// aren't squeezed into a square. Flux handles non-square sizes well.
export function dimsFor(prompt: string): { w: number; h: number } {
  const p = prompt.toLowerCase()
  const portrait =
    /\b(portrait|phone wallpaper|mobile wallpaper|story|reel|9:16|vertical|tall|poster)\b/.test(p)
  const landscape =
    /\b(landscape|desktop wallpaper|wallpaper|banner|cover|thumbnail|16:9|wide|horizontal|cinematic|panorama)\b/.test(
      p,
    )
  if (portrait && !landscape) return { w: 768, h: 1344 }
  if (landscape) return { w: 1344, h: 768 }
  return { w: 1024, h: 1024 }
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
