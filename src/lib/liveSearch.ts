// Real, backend-free web search to GROUND chat answers — so AskAI actually
// searches instead of relying on a server tool that may do nothing. Now runs on
// the shared multi-engine research core (webResearch.ts), so it queries several
// search engines, reads the top results through a proxy chain with failover,
// and grounds the answer on real page content. Runs client-side; no hosting.
import { searchWeb, readPage } from './webResearch'

export interface LiveSearchResult {
  context: string
  sources: { title: string; url: string }[]
}

/** Search the live web and return grounded context + sources for the answer. */
export async function liveSearchContext(query: string, maxPages = 3): Promise<LiveSearchResult | null> {
  const q = (query || '').trim()
  if (!q) return null
  const links = await searchWeb(q, { limit: 8 })
  if (!links.length) return null
  const top = links.slice(0, maxPages)
  const pages = await Promise.all(top.map((l) => readPage(l.url, undefined, 6000).catch(() => null)))
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
