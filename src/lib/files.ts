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
    const url = await readAsDataURL(file)
    return { kind: 'image', name: file.name, url, mime: file.type }
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
