// Real, backend-free web search to GROUND chat answers — so AskAI actually
// searches instead of relying on a server tool that may do nothing. Searches
// DuckDuckGo and reads the top results via the Jina reader (the same engine the
// agent browser uses). Runs client-side; no hosting required.

const READER_TIMEOUT = 13000

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 40)
  }
}

function fetchTimeout(url: string, ms = READER_TIMEOUT): Promise<Response> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t))
}

async function readPage(url: string): Promise<{ title: string; text: string } | null> {
  try {
    const res = await fetchTimeout(`https://r.jina.ai/${url}`)
    if (res.ok) {
      const text = await res.text()
      const title = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || hostOf(url)
      return { title, text: text.slice(0, 6000) }
    }
  } catch {
    /* fall through */
  }
  try {
    const res = await fetchTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    const html = await res.text()
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || hostOf(url)
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return { title, text: text.slice(0, 6000) }
  } catch {
    return null
  }
}

async function search(query: string): Promise<{ title: string; url: string }[]> {
  const serp = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
  const page = await readPage(serp)
  if (!page) return []
  const links: { title: string; url: string }[] = []
  const seen = new Set<string>()
  const re = /\[([^\]]{3,120})\]\((https?:\/\/[^\s)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(page.text)) && links.length < 8) {
    let url = m[2]
    const uddg = url.match(/[?&]uddg=([^&]+)/)?.[1]
    if (uddg) {
      try {
        url = decodeURIComponent(uddg)
      } catch {
        /* keep */
      }
    }
    const host = hostOf(url)
    if (/duckduckgo\.com|duck\.co/.test(host) || seen.has(url)) continue
    seen.add(url)
    links.push({ title: m[1].replace(/\s+/g, ' ').trim(), url })
  }
  return links
}

export interface LiveSearchResult {
  context: string
  sources: { title: string; url: string }[]
}

/** Search the live web and return grounded context + sources for the answer. */
export async function liveSearchContext(query: string, maxPages = 3): Promise<LiveSearchResult | null> {
  const q = (query || '').trim()
  if (!q) return null
  const links = await search(q)
  if (!links.length) return null
  const top = links.slice(0, maxPages)
  const pages = await Promise.all(top.map((l) => readPage(l.url)))
  const blocks: string[] = []
  const sources: { title: string; url: string }[] = []
  pages.forEach((p, i) => {
    if (p && p.text) {
      blocks.push(`## ${p.title} — ${top[i].url}\n${p.text.slice(0, 2200)}`)
      sources.push({ title: p.title, url: top[i].url })
    }
  })
  if (!blocks.length) return null
  const today = new Date().toDateString()
  const context = `LIVE WEB SEARCH RESULTS for "${q}" (today is ${today}):\n\n${blocks.join('\n\n')}`
  return { context, sources }
}
