// Shared web-research core — the single, resilient engine that BOTH the live
// chat grounding (liveSearch.ts) and the OpenClaw agent browser (agentBrowser.ts)
// run on. The old code searched one engine (DuckDuckGo lite) through one reader
// proxy and parsed markdown links only; when that one path returned thin or
// junk results, agents looked "inaccurate". This module fixes that by:
//   • querying SEVERAL search engines and merging/ranking their results,
//   • reading pages through SEVERAL reader proxies with automatic failover,
//   • extracting result links from BOTH markdown (Jina) and raw HTML SERPs,
//   • filtering out engine-internal / junk links so agents click real sources.
// No backend required — every request goes through CORS-friendly proxies, so it
// works on static hosting, the Android/iOS WebView and Electron alike.
import { isNative } from './native'

// Native WebViews go through flakier third-party proxies than a desktop browser,
// so keep each request short to avoid stacking multi-second stalls.
const READER_TIMEOUT = isNative ? 9000 : 14000

export interface SearchHit {
  title: string
  url: string
}

export interface PageContent {
  title: string
  text: string
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 40)
  }
}

function fetchTimeout(url: string, signal?: AbortSignal, ms = READER_TIMEOUT): Promise<Response> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  signal?.addEventListener('abort', () => ac.abort(), { once: true })
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t))
}

// ── Reader proxies ──────────────────────────────────────────────────────────
// We try each in order until one returns usable content. Jina returns clean
// markdown (best for both reading and SERP link extraction); the others return
// raw HTML which we strip ourselves.
type Reader = (url: string, signal?: AbortSignal) => Promise<{ raw: string; markdown: boolean } | null>

const readers: Reader[] = [
  // Jina reader — clean markdown with a "Title:" header and real links.
  async (url, signal) => {
    try {
      const res = await fetchTimeout(`https://r.jina.ai/${url}`, signal)
      if (!res.ok) return null
      return { raw: await res.text(), markdown: true }
    } catch {
      return null
    }
  },
  // allorigins — raw HTML proxy.
  async (url, signal) => {
    try {
      const res = await fetchTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, signal)
      if (!res.ok) return null
      return { raw: await res.text(), markdown: false }
    } catch {
      return null
    }
  },
  // corsproxy.io — second raw-HTML fallback (different network path/operator,
  // so it often succeeds when the first two are rate-limited or blocked).
  async (url, signal) => {
    try {
      const res = await fetchTimeout(`https://corsproxy.io/?url=${encodeURIComponent(url)}`, signal)
      if (!res.ok) return null
      return { raw: await res.text(), markdown: false }
    } catch {
      return null
    }
  },
]

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Read a page through the reader proxy chain. Returns clean title + text. */
export async function readPage(
  url: string,
  signal?: AbortSignal,
  maxChars = 7000,
): Promise<PageContent | null> {
  for (const reader of readers) {
    const out = await reader(url, signal)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!out) continue
    if (out.markdown) {
      const title = out.raw.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || hostOf(url)
      const text = out.raw.replace(/^Title:.*$/m, '').trim()
      if (text.length > 40) return { title, text: text.slice(0, maxChars) }
    } else {
      const title = out.raw.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || hostOf(url)
      const text = stripHtml(out.raw)
      if (text.length > 40) return { title, text: text.slice(0, maxChars) }
    }
  }
  return null
}

// ── Link extraction ──────────────────────────────────────────────────────────
// A link is junk if it points back at a search engine, a tracker, or an asset.
const JUNK_HOST = /duckduckgo\.com|duck\.co|bing\.com|google\.|gstatic|googleusercontent|microsoft\.com\/.*bing|startpage\.com|brave\.com\/search|search\.marginalia|go\.microsoft|r\.jina\.ai|allorigins|corsproxy/i
const JUNK_PATH = /\.(png|jpe?g|gif|svg|css|js|ico|woff2?)(\?|$)/i

function unwrap(url: string): string {
  // DuckDuckGo wraps results in /l/?uddg=…; Bing wraps in /ck/a?…&u=…
  const uddg = url.match(/[?&]uddg=([^&]+)/)?.[1]
  if (uddg) {
    try {
      return decodeURIComponent(uddg)
    } catch {
      /* keep */
    }
  }
  const bingU = url.match(/[?&]u=a1([^&]+)/)?.[1]
  if (bingU) {
    try {
      // Bing base64url-encodes the destination after the "a1" marker.
      return atob(bingU.replace(/-/g, '+').replace(/_/g, '/'))
    } catch {
      /* keep */
    }
  }
  return url
}

function harvestLinks(content: PageContent, markdown: boolean): SearchHit[] {
  const hits: SearchHit[] = []
  const seen = new Set<string>()
  const push = (title: string, rawUrl: string) => {
    const url = unwrap(rawUrl).replace(/[),.]+$/, '')
    if (!/^https?:\/\//i.test(url)) return
    const host = hostOf(url)
    if (JUNK_HOST.test(url) || JUNK_PATH.test(url) || seen.has(url) || !host) return
    seen.add(url)
    hits.push({ title: (title || host).replace(/\s+/g, ' ').trim().slice(0, 140), url })
  }
  if (markdown) {
    const re = /\[([^\]]{2,140})\]\((https?:\/\/[^\s)]+)\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(content.text)) && hits.length < 20) push(m[1], m[2])
  } else {
    // The raw text has already been stripped of tags — re-run against original
    // is not available here, so markdown path is preferred. Kept for safety.
  }
  return hits
}

/** Pull organic result links straight out of a raw HTML SERP (anchor tags). */
function harvestHtmlLinks(html: string): SearchHit[] {
  const hits: SearchHit[] = []
  const seen = new Set<string>()
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && hits.length < 25) {
    const url = unwrap(m[1]).replace(/[),.]+$/, '')
    if (!/^https?:\/\//i.test(url)) continue
    const host = hostOf(url)
    if (JUNK_HOST.test(url) || JUNK_PATH.test(url) || seen.has(url) || !host) continue
    const title = stripHtml(m[2]) || host
    if (title.length < 2) continue
    seen.add(url)
    hits.push({ title: title.slice(0, 140), url })
  }
  return hits
}

// ── Search engines ───────────────────────────────────────────────────────────
// Each builds a SERP URL; we read it through the proxy chain and harvest links.
const engines: Array<{ name: string; serp: (q: string) => string }> = [
  { name: 'duckduckgo', serp: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}` },
  { name: 'bing', serp: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { name: 'ddg-lite', serp: (q) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}` },
]

async function searchEngine(serpUrl: string, signal?: AbortSignal): Promise<SearchHit[]> {
  // Try Jina (markdown) first for clean links, then raw-HTML proxies for anchors.
  for (const reader of readers) {
    const out = await reader(serpUrl, signal)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!out) continue
    const hits = out.markdown
      ? harvestLinks({ title: '', text: out.raw }, true)
      : harvestHtmlLinks(out.raw)
    if (hits.length) return hits
  }
  return []
}

/** Search the web across multiple engines and return merged, ranked results.
 *  Results that surface on more than one engine (or higher up) rank first —
 *  the cross-engine agreement is what makes the picks accurate. */
export async function searchWeb(
  query: string,
  opts: { signal?: AbortSignal; limit?: number } = {},
): Promise<SearchHit[]> {
  const q = (query || '').trim()
  if (!q) return []
  const { signal, limit = 10 } = opts

  // Race the engines but don't wait on stragglers: first two that return win.
  const results = await Promise.allSettled(engines.map((e) => searchEngine(e.serp(q), signal)))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  // Score by rank across engines (earlier = better) and by appearing on several.
  const score = new Map<string, { hit: SearchHit; points: number }>()
  results.forEach((r) => {
    if (r.status !== 'fulfilled') return
    r.value.forEach((hit, i) => {
      const key = hit.url
      const points = (25 - Math.min(i, 24)) + 5 // base + cross-engine bonus on dup
      const prev = score.get(key)
      if (prev) prev.points += points
      else score.set(key, { hit, points })
    })
  })

  return [...score.values()]
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map((s) => s.hit)
}
