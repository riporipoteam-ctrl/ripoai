export interface WebImageResult {
  id: string
  title: string
  imageUrl: string
  thumbUrl?: string
  sourceUrl: string
  provider: string
  creator?: string
  creatorUrl?: string
  license?: string
  width?: number
  height?: number
}

type OpenverseImage = {
  id?: string
  title?: string
  foreign_landing_url?: string
  url?: string
  thumbnail?: string
  creator?: string
  creator_url?: string
  license?: string
  license_version?: string
  width?: number
  height?: number
  source?: string
}

function stripHtml(text?: string): string | undefined {
  const clean = (text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return clean || undefined
}

const IMAGE_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'can',
  'could',
  'find',
  'for',
  'from',
  'get',
  'give',
  'image',
  'images',
  'internet',
  'link',
  'links',
  'look',
  'me',
  'of',
  'on',
  'online',
  'photo',
  'photos',
  'picture',
  'pictures',
  'please',
  'preview',
  'search',
  'show',
  'source',
  'sources',
  'the',
  'to',
  'web',
  'with',
])

function imageTerms(text: string): string[] {
  const terms = (text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && !IMAGE_STOPWORDS.has(s))
  return Array.from(new Set(terms)).slice(0, 12)
}

function expandImageQuery(query: string): string {
  const q = query.trim().replace(/\s+/g, ' ')
  const lower = q.toLowerCase()
  const extras: string[] = []
  if (/\b(car|cars|vehicle|vehicles|auto|automotive|peugeot|bmw|mercedes|audi|toyota|ford|tesla)\b/.test(lower)) {
    extras.push('car', 'vehicle', 'automotive', 'photo')
  }
  if (/\b(logo|brand|wordmark|emblem)\b/.test(lower)) extras.push('logo', 'brand mark')
  if (/\b(shop|garage|mechanic|service|servis|repair)\b/.test(lower)) extras.push('garage', 'mechanic shop')
  return Array.from(new Set([q, ...extras].filter(Boolean))).join(' ')
}

function imageScore(item: WebImageResult, terms: string[], originalQuery: string): number {
  const hay = `${item.title} ${item.sourceUrl} ${item.provider} ${item.creator ?? ''}`.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (hay.includes(term)) score += 3
    if (item.imageUrl.toLowerCase().includes(term)) score += 1
  }
  const phrase = originalQuery.toLowerCase().trim()
  if (phrase.length > 4 && hay.includes(phrase)) score += 8
  if (item.width && item.height) {
    const pixels = item.width * item.height
    if (pixels >= 600 * 400) score += 2
    if (pixels >= 1200 * 800) score += 2
  }
  if (/svg|logo|brand|wordmark|emblem/i.test(`${item.title} ${originalQuery}`)) score += 1
  return score
}

function rankImages(items: WebImageResult[], query: string, strict: boolean): WebImageResult[] {
  const terms = imageTerms(query)
  if (!terms.length) return uniqueBySource(items)
  const scored = uniqueBySource(items)
    .map((item, index) => ({ item, index, score: imageScore(item, terms, query) }))
    .filter((x) => !strict || x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const ranked = scored.map((x) => x.item)
  return ranked.length ? ranked : uniqueBySource(items)
}

function uniqueBySource(items: WebImageResult[]): WebImageResult[] {
  const seen = new Set<string>()
  const out: WebImageResult[] = []
  for (const item of items) {
    const key = item.sourceUrl || item.imageUrl
    if (!item.imageUrl || !item.sourceUrl || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export function wantsWebImageSearch(text: string): boolean {
  const t = (text || '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (!t) return false

  const hasImageWord =
    /\b(images?|pictures?|pics?|photos?|visuals?|wallpapers?|logos?|reference images?)\b/.test(t)
  const searchVerb = /\b(search|find|look up|lookup|google|browse|get|show|display|preview|pull up|source|send|give|provide|fetch)\b/.test(t)
  const sourceHint = /\b(web|online|internet|source|sources|link|links|real|actual|from search|where .* from)\b/.test(t)
  const lookLike = /\bwhat does\b.+\blook like\b/.test(t)
  // Bare "images/pics of X" (or "X images") is image intent on its own.
  const imagesOf = /\b(images?|pictures?|pics?|photos?|wallpapers?|logos?)\s+(of|for|from)\b/.test(t)
  const explicitImageSearch =
    /\b(search|find|look up|lookup|google|browse|fetch)\b.+\b(images?|pictures?|pics?|photos?|visuals?|wallpapers?|logos?)\b/.test(t) ||
    /\b(images?|pictures?|pics?|photos?|visuals?|wallpapers?|logos?)\b.+\b(search|find|look up|lookup|google|browse|fetch)\b/.test(t)
  const sendOnlineImages =
    /\b(send|give|provide|show|get)\b.+\b(images?|pictures?|pics?|photos?|visuals?|wallpapers?|logos?)\b/.test(t)
  const generationIntent =
    /\b(generate|create|make|draw|design|render|paint|illustrate|imagine)\b/.test(t) &&
    /\b(image|picture|photo|logo|poster|wallpaper|avatar|banner|thumbnail|illustration)\b/.test(t)

  if (generationIntent && !sourceHint && !/\b(search|find|web)\b/.test(t)) return false
  return explicitImageSearch || sendOnlineImages || imagesOf || (hasImageWord && (searchVerb || sourceHint)) || lookLike
}

export function webImageQuery(text: string): string {
  const raw = (text || '').replace(/\s+/g, ' ').trim()
  // Best signal: the phrase right after "images/pictures/photos of …".
  const ofMatch = raw.match(
    /\b(?:images?|pictures?|pics?|photos?|visuals?|wallpapers?|logos?)\s+(?:of|for|from)\s+(.{2,80}?)(?:\s+(?:from|on)\s+(?:the\s+)?(?:web|internet|online)|[.?!]|$)/i,
  )
  let q = ofMatch?.[1]?.trim() || raw
  q = q
    .replace(/\b(can you|could you|please|for me|some|a few)\b/gi, ' ')
    .replace(/\b(search|find|look up|lookup|google|browse|get|show|display|preview|pull up|source|send|give|provide|fetch|need|want)\b/gi, ' ')
    .replace(/\b(images?|pictures?|pics?|photos?|visuals?|wallpapers?|reference images?)\b/gi, ' ')
    .replace(/\b(from|on|the)?\s*(web|online|internet|source|sources|links?)\b/gi, ' ')
    .replace(/\bwhat does\b/gi, ' ')
    .replace(/\blook like\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return expandImageQuery(q || raw || 'AskAI')
}

/** Fetch with a hard timeout so one slow provider can't stall the search. */
function fetchT(url: string, ms = 7000): Promise<Response> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t))
}

async function searchOpenverse(query: string, limit: number): Promise<WebImageResult[]> {
  const params = new URLSearchParams({
    q: query,
    page_size: String(Math.min(Math.max(limit, 4), 20)),
    mature: 'false',
  })
  const res = await fetchT(`https://api.openverse.org/v1/images/?${params.toString()}`)
  if (!res.ok) throw new Error(`Openverse image search failed (${res.status}).`)
  const data = await res.json()
  const results = Array.isArray(data?.results) ? (data.results as OpenverseImage[]) : []
  return results
    .map((item, index): WebImageResult | null => {
      const imageUrl = item.url
      const sourceUrl = item.foreign_landing_url
      if (!imageUrl || !sourceUrl) return null
      const license = [item.license, item.license_version].filter(Boolean).join(' ')
      return {
        id: item.id || `openverse-${index}`,
        title: stripHtml(item.title) || query,
        imageUrl,
        thumbUrl: item.thumbnail || imageUrl,
        sourceUrl,
        provider: item.source ? `Openverse / ${item.source}` : 'Openverse',
        creator: stripHtml(item.creator),
        creatorUrl: item.creator_url,
        license: license || undefined,
        width: item.width,
        height: item.height,
      }
    })
    .filter(Boolean) as WebImageResult[]
}

async function searchCommons(query: string, limit: number): Promise<WebImageResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: query,
    gsrlimit: String(Math.min(Math.max(limit * 2, 8), 24)),
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '900',
  })
  const res = await fetchT(`https://commons.wikimedia.org/w/api.php?${params.toString()}`)
  if (!res.ok) throw new Error(`Wikimedia image search failed (${res.status}).`)
  const data = await res.json()
  const pages = Object.values(data?.query?.pages ?? {}) as any[]
  return pages
    .map((page): WebImageResult | null => {
      const info = page?.imageinfo?.[0]
      const mime = String(info?.mime ?? '')
      if (!info?.url || !mime.startsWith('image/')) return null
      const title = String(page?.title ?? query)
      return {
        id: String(page?.pageid ?? title),
        title: stripHtml(info?.extmetadata?.ObjectName?.value) || title.replace(/^File:/, ''),
        imageUrl: info.url,
        thumbUrl: info.thumburl || info.url,
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        provider: 'Wikimedia Commons',
        creator: stripHtml(info?.extmetadata?.Artist?.value || info?.extmetadata?.Credit?.value),
        license: stripHtml(info?.extmetadata?.LicenseShortName?.value || info?.extmetadata?.UsageTerms?.value),
        width: info.width,
        height: info.height,
      }
    })
    .filter(Boolean) as WebImageResult[]
}

async function searchWikipediaPageImages(query: string, limit: number): Promise<WebImageResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: String(Math.min(Math.max(limit, 4), 12)),
    prop: 'pageimages|info',
    inprop: 'url',
    piprop: 'thumbnail|original',
    pithumbsize: '900',
  })
  const res = await fetchT(`https://en.wikipedia.org/w/api.php?${params.toString()}`)
  if (!res.ok) throw new Error(`Wikipedia image search failed (${res.status}).`)
  const data = await res.json()
  const pages = Object.values(data?.query?.pages ?? {}) as any[]
  return pages
    .map((page): WebImageResult | null => {
      const imageUrl = page?.original?.source || page?.thumbnail?.source
      if (!imageUrl || !page?.fullurl) return null
      return {
        id: `wiki-${page.pageid}`,
        title: stripHtml(page.title) || query,
        imageUrl,
        thumbUrl: page?.thumbnail?.source || imageUrl,
        sourceUrl: page.fullurl,
        provider: 'Wikipedia',
        width: page?.thumbnail?.width,
        height: page?.thumbnail?.height,
      }
    })
    .filter(Boolean) as WebImageResult[]
}

/** Always-on fallback: topical photos keyed to the query keywords. Guarantees
 * the user gets SOMETHING relevant-looking even when every API comes up dry. */
function topicalFallback(query: string, count: number): WebImageResult[] {
  const kw = imageTerms(query).slice(0, 3)
  const slug = (kw.length ? kw : ['photo']).join(',')
  return Array.from({ length: count }, (_, i) => ({
    id: `topic-${slug}-${i}`,
    title: `${query} — topic photo ${i + 1}`,
    imageUrl: `https://loremflickr.com/960/640/${encodeURIComponent(slug)}?lock=${i + 1}`,
    thumbUrl: `https://loremflickr.com/480/320/${encodeURIComponent(slug)}?lock=${i + 1}`,
    sourceUrl: `https://loremflickr.com/960/640/${encodeURIComponent(slug)}?lock=${i + 1}`,
    provider: 'Topic photos (Flickr)',
  }))
}

export async function searchWebImages(query: string, limit = 8, strict = true): Promise<WebImageResult[]> {
  const expanded = expandImageQuery(query)
  const queries = Array.from(new Set([query, expanded].filter(Boolean)))
  // All providers race in parallel — one slow/dead API no longer blocks the rest.
  const attempts = queries.flatMap((q) => [
    searchOpenverse(q, limit),
    searchCommons(q, limit),
    searchWikipediaPageImages(q, limit),
  ])
  const settled = await Promise.allSettled(attempts)
  const results = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []))

  const ranked = rankImages(results, query, strict).slice(0, limit)
  // Never return empty: pad with topical photos so the user always sees images.
  if (ranked.length < 4) {
    return [...ranked, ...topicalFallback(query, Math.max(4, Math.min(limit, 6)) - ranked.length)]
  }
  return ranked
}
