import { complete } from './groq'

export interface Slide {
  title: string
  bullets: string[]
  notes?: string
}
export interface Deck {
  title: string
  subtitle?: string
  slides: Slide[]
}

export function wantsSlides(text: string): boolean {
  return /\b(presentation|slides?|slide deck|power\s?point|pptx?|pitch deck|deck (about|on|for))\b/i.test(text)
}

export async function generateDeck(topic: string): Promise<Deck | null> {
  const prompt = `Create a polished, professional slide presentation for this request: "${topic}".
Return ONLY valid JSON (no markdown) shaped exactly like:
{"title":"...","subtitle":"...","slides":[{"title":"Slide title","bullets":["concise point","..."],"notes":"speaker notes"}]}
Rules: 8-12 slides. First slide is the title slide (few/no bullets). Each content slide has 3-5 punchy bullets (max ~12 words each). Cover intro, key points, data/examples, and a closing/CTA. Make it genuinely excellent.`
  try {
    const raw = await complete(
      'openai/gpt-oss-120b',
      [{ role: 'user', content: prompt }],
      { temperature: 0.6, maxTokens: 4000 },
    )
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    const deck = JSON.parse(m[0]) as Deck
    if (!deck.slides?.length) return null
    deck.slides = deck.slides.slice(0, 14).map((s) => ({
      title: String(s.title || ''),
      bullets: Array.isArray(s.bullets) ? s.bullets.map(String).slice(0, 8) : [],
      notes: s.notes ? String(s.notes) : undefined,
    }))
    return deck
  } catch {
    return null
  }
}

const ACCENT = '10A37F'
const DARK = '1A1A22'

export async function downloadPptx(deck: Deck) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const p = new PptxGenJS()
  p.defineLayout({ name: 'W', width: 13.333, height: 7.5 })
  p.layout = 'W'

  // Title slide
  const title = p.addSlide()
  title.background = { color: DARK }
  title.addText(deck.title || 'Presentation', {
    x: 0.7, y: 2.6, w: 11.9, h: 1.6, fontSize: 44, bold: true, color: 'FFFFFF', align: 'left',
  })
  if (deck.subtitle)
    title.addText(deck.subtitle, { x: 0.7, y: 4.2, w: 11.9, h: 0.8, fontSize: 20, color: ACCENT })
  title.addShape(p.ShapeType.rect, { x: 0.7, y: 2.45, w: 1.6, h: 0.12, fill: { color: ACCENT } })

  // Content slides
  deck.slides.slice(1).forEach((s) => {
    const sl = p.addSlide()
    sl.background = { color: 'FFFFFF' }
    sl.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: ACCENT } })
    sl.addText(s.title, { x: 0.7, y: 0.5, w: 11.9, h: 1, fontSize: 30, bold: true, color: DARK })
    if (s.bullets.length)
      sl.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: { code: '2022' }, fontSize: 20, color: '333333', paraSpaceAfter: 10 } })),
        { x: 0.9, y: 1.7, w: 11.5, h: 5.2, valign: 'top' },
      )
    if (s.notes) sl.addNotes(s.notes)
  })

  await p.writeFile({ fileName: `${(deck.title || 'presentation').replace(/[^\w]+/g, '_').slice(0, 40)}.pptx` })
}
