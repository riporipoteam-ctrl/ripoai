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
