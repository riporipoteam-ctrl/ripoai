// Client-side image compositing — draws crisp, exact text (a caption or speech
// bubble) onto a base image using canvas. This is how we get PERFECT text
// (image models garble text) and basic editing of an uploaded photo.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // Pollinations sends ACAO:* so canvas stays untainted
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function composeTextOnImage(
  baseSrc: string,
  text: string,
  position: 'top' | 'bottom' | 'center' = 'top',
): Promise<string> {
  const img = await loadImage(baseSrc)
  const W = img.naturalWidth || 1024
  const H = img.naturalHeight || 1024
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, W, H)

  // Font scales with image size.
  const fontSize = Math.round(W * 0.075)
  ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const maxTextWidth = W * 0.82
  const lines = wrapText(ctx, text, maxTextWidth)
  const lineH = fontSize * 1.18
  const padX = fontSize * 0.7
  const padY = fontSize * 0.5
  const bubbleW = Math.min(W * 0.9, Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2)
  const bubbleH = lines.length * lineH + padY * 2
  const cx = W / 2
  let by =
    position === 'top' ? H * 0.06 : position === 'bottom' ? H - bubbleH - H * 0.06 : H / 2 - bubbleH / 2
  const bx = cx - bubbleW / 2

  // Bubble background
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = fontSize * 0.4
  ctx.shadowOffsetY = fontSize * 0.12
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  roundRect(ctx, bx, by, bubbleW, bubbleH, fontSize * 0.5)
  ctx.fill()
  // little speech-bubble tail
  ctx.beginPath()
  ctx.moveTo(cx - fontSize * 0.35, by + bubbleH - 2)
  ctx.lineTo(cx + fontSize * 0.35, by + bubbleH - 2)
  ctx.lineTo(cx, by + bubbleH + fontSize * 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Text
  ctx.fillStyle = '#111'
  lines.forEach((l, i) => {
    ctx.fillText(l, cx, by + padY + lineH * i + lineH / 2, maxTextWidth)
  })

  return canvas.toDataURL('image/png')
}
