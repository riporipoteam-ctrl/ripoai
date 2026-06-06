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
  const searchVerb = /\b(search|find|look up|lookup|google|browse|get|show|display|preview|pull up|source)\b/.test(t)
  const sourceHint = /\b(web|online|internet|source|sources|link|links|real|actual|from search|where .* from)\b/.test(t)
  const lookLike = /\bwhat does\b.+\blook like\b/.test(t)
  const generationIntent =
    /\b(generate|create|make|draw|design|render|paint|illustrate)\b/.test(t) &&
    /\b(image|picture|photo|logo|poster|wallpaper|avatar|banner|thumbnail|illustration)\b/.test(t)

  if (generationIntent && !sourceHint && !/\b(search|find|web)\b/.test(t)) return false
  return (hasImageWord && (searchVerb || sourceHint)) || lookLike
}

export function webImageQuery(text: string): string {
  let q = (text || '').replace(/\s+/g, ' ').trim()
  q = q
    .replace(/\b(can you|could you|please|for me)\b/gi, ' ')
    .replace(/\b(search|find|look up|lookup|google|browse|get|show|display|preview|pull up|source)\b/gi, ' ')
    .replace(/\b(images?|pictures?|pics?|photos?|visuals?|wallpapers?|reference images?)\b/gi, ' ')
    .replace(/\b(from|on|the)?\s*(web|online|internet|source|sources|links?)\b/gi, ' ')
    .replace(/\bwhat does\b/gi, ' ')
    .replace(/\blook like\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return q || text.trim() || 'RipoAI'
}

async function searchOpenverse(query: string, limit: number): Promise<WebImageResult[]> {
  const params = new URLSearchParams({
    q: query,
    page_size: String(Math.min(Math.max(limit, 4), 20)),
    mature: 'false',
  })
  const res = await fetch(`https://api.openverse.engineering/v1/images/?${params.toString()}`)
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
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`)
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
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`)
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

export async function searchWebImages(query: string, limit = 8): Promise<WebImageResult[]> {
  const results: WebImageResult[] = []
  const attempts = [
    () => searchOpenverse(query, limit),
    () => searchCommons(query, limit),
    () => searchWikipediaPageImages(query, limit),
  ]

  for (const attempt of attempts) {
    try {
      results.push(...(await attempt()))
    } catch {
      // Keep trying the next source.
    }
    const unique = uniqueBySource(results)
    if (unique.length >= limit) return unique.slice(0, limit)
  }

  return uniqueBySource(results).slice(0, limit)
}
