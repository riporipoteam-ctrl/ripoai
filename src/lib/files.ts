import type { Attachment } from './db'

const MAX_IMAGE = 8 * 1024 * 1024
const MAX_TEXT = 4 * 1024 * 1024

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsText(file)
  })
}

// Phone photos are huge (3–8MB) and sometimes HEIC, which vision models can't
// read and which make the request slow enough to time out ("keeps thinking,
// then says it doesn't know"). Downscale to a sane size and re-encode as JPEG so
// the upload is small, fast and always a supported format.
async function downscaleImage(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
  const dataUrl = await readAsDataURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = reject
      im.src = dataUrl
    })
    const { width, height } = img
    if (!width || !height) return dataUrl
    const scale = Math.min(1, maxDim / Math.max(width, height))
    // Already small and a supported format → keep as-is.
    if (scale === 1 && file.size < 900 * 1024 && /image\/(jpeg|png|webp)/i.test(file.type)) return dataUrl
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const out = canvas.toDataURL('image/jpeg', quality)
    // Guard against a webview that can't decode the source (e.g. HEIC) and hands
    // back a blank/tiny canvas — fall back to the original bytes in that case.
    return out && out.length > 1024 ? out : dataUrl
  } catch {
    return dataUrl
  }
}

async function parsePdf(file: File): Promise<string> {
  // Lazy-load pdf.js only when a PDF is attached.
  const pdfjs = await import('pdfjs-dist')
  // Worker is served from a CDN matching the installed version.
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  let text = ''
  const pages = Math.min(doc.numPages, 30)
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((it: any) => it.str).join(' ') + '\n\n'
  }
  return text
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  if (file.type.startsWith('image/')) {
    if (file.size > MAX_IMAGE) throw new Error('Image too large (max 8MB).')
    const url = await downscaleImage(file)
    return { kind: 'image', name: file.name, url, mime: 'image/jpeg' }
  }
  if (file.size > MAX_TEXT) throw new Error('File too large (max 4MB).')
  let text = ''
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    text = await parsePdf(file)
  } else {
    text = await readAsText(file)
  }
  return { kind: 'file', name: file.name, text, mime: file.type }
}
