// A suite of free, keyless "always-on" tools the AI uses automatically. Each
// returns a short text block injected into the system prompt so the model
// answers with real, current data.

/* ----------------------------- Dictionary ---------------------------- */
export function wantsDefine(text: string): boolean {
  return /\b(define|definition of|meaning of|what does .+ mean|synonyms? (for|of)|antonyms?)\b/i.test(text)
}
export async function getDefinition(text: string): Promise<string> {
  try {
    const m = text.match(/\b(?:define|definition of|meaning of|synonyms? (?:for|of)|antonyms? (?:for|of))\s+["']?([A-Za-z-]+)/i)
    const word = m?.[1] || text.match(/what does\s+["']?([A-Za-z-]+)/i)?.[1]
    if (!word) return ''
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
    if (!r.ok) return ''
    const d = await r.json()
    const entry = d?.[0]
    if (!entry) return ''
    const defs = (entry.meanings || [])
      .slice(0, 3)
      .map((mn: any) => `${mn.partOfSpeech}: ${mn.definitions?.[0]?.definition}`)
      .join('; ')
    return `Dictionary — ${entry.word}${entry.phonetic ? ` /${entry.phonetic}/` : ''}: ${defs}`
  } catch {
    return ''
  }
}

/* ------------------------------ Wikipedia ----------------------------- */
export function wantsWiki(text: string): boolean {
  return /\b(who (is|was|were)|what (is|was|are)|tell me about|history of|facts about)\b/i.test(text)
}
export async function getWiki(text: string): Promise<string> {
  try {
    const m = text.match(/\b(?:who (?:is|was|were)|what (?:is|was|are)|tell me about|history of|facts about)\s+(?:the\s+)?([A-Za-z0-9 .'-]{2,50})/i)
    let topic = (m?.[1] || '').replace(/[?.!]/g, '').trim()
    if (!topic) return ''
    const s = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*&srlimit=1`)
    const sd = await s.json()
    const title = sd?.query?.search?.[0]?.title
    if (!title) return ''
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
    if (!r.ok) return ''
    const d = await r.json()
    if (!d.extract) return ''
    return `Wikipedia — ${d.title}: ${d.extract}`
  } catch {
    return ''
  }
}

/* ------------------------------- Units -------------------------------- */
const UNIT: Record<string, { base: string; f: number }> = {
  // length (base m)
  m: { base: 'len', f: 1 }, meter: { base: 'len', f: 1 }, meters: { base: 'len', f: 1 }, metre: { base: 'len', f: 1 },
  km: { base: 'len', f: 1000 }, kilometer: { base: 'len', f: 1000 }, kilometers: { base: 'len', f: 1000 },
  cm: { base: 'len', f: 0.01 }, mm: { base: 'len', f: 0.001 },
  mi: { base: 'len', f: 1609.34 }, mile: { base: 'len', f: 1609.34 }, miles: { base: 'len', f: 1609.34 },
  ft: { base: 'len', f: 0.3048 }, foot: { base: 'len', f: 0.3048 }, feet: { base: 'len', f: 0.3048 },
  in: { base: 'len', f: 0.0254 }, inch: { base: 'len', f: 0.0254 }, inches: { base: 'len', f: 0.0254 },
  yd: { base: 'len', f: 0.9144 }, yard: { base: 'len', f: 0.9144 }, yards: { base: 'len', f: 0.9144 },
  // mass (base g)
  g: { base: 'mass', f: 1 }, gram: { base: 'mass', f: 1 }, grams: { base: 'mass', f: 1 },
  kg: { base: 'mass', f: 1000 }, kilogram: { base: 'mass', f: 1000 }, kilograms: { base: 'mass', f: 1000 },
  lb: { base: 'mass', f: 453.592 }, lbs: { base: 'mass', f: 453.592 }, pound: { base: 'mass', f: 453.592 }, pounds: { base: 'mass', f: 453.592 },
  oz: { base: 'mass', f: 28.3495 }, ounce: { base: 'mass', f: 28.3495 }, ounces: { base: 'mass', f: 28.3495 },
  // volume (base l)
  l: { base: 'vol', f: 1 }, liter: { base: 'vol', f: 1 }, liters: { base: 'vol', f: 1 }, litre: { base: 'vol', f: 1 },
  ml: { base: 'vol', f: 0.001 }, gal: { base: 'vol', f: 3.78541 }, gallon: { base: 'vol', f: 3.78541 }, gallons: { base: 'vol', f: 3.78541 },
}
export function wantsUnits(text: string): boolean {
  if (/\b(°?\s?[cf]\b|celsius|fahrenheit|kelvin)\b/i.test(text) && /\d/.test(text) && /\b(to|in|=)\b/i.test(text)) return true
  const u = new RegExp(`\\b(${Object.keys(UNIT).join('|')})\\b`, 'i')
  return /\d/.test(text) && /\b(convert|to|in)\b/i.test(text) && u.test(text)
}
export function convertUnits(text: string): string {
  const t = text.toLowerCase()
  // temperature
  const tm = t.match(/(-?\d+(?:\.\d+)?)\s*°?\s*(c|f|celsius|fahrenheit|kelvin|k)\b.*\b(?:to|in)\b\s*°?\s*(c|f|celsius|fahrenheit|kelvin|k)\b/)
  if (tm) {
    const v = parseFloat(tm[1])
    const from = tm[2][0], to = tm[3][0]
    let c = from === 'c' ? v : from === 'f' ? (v - 32) * 5 / 9 : v - 273.15
    const out = to === 'c' ? c : to === 'f' ? c * 9 / 5 + 32 : c + 273.15
    return `${v}°${tm[2][0].toUpperCase()} = ${out.toFixed(1)}°${tm[3][0].toUpperCase()}`
  }
  const m = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${Object.keys(UNIT).join('|')})\\b.*?\\b(?:to|in)\\b\\s*(${Object.keys(UNIT).join('|')})\\b`))
  if (!m) return ''
  const v = parseFloat(m[1]), a = UNIT[m[2]], b = UNIT[m[3]]
  if (!a || !b || a.base !== b.base) return ''
  const out = (v * a.f) / b.f
  return `${v} ${m[2]} = ${out.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${m[3]}`
}
