// Pulls real profile pictures from social accounts the user mentions.
//
// Honest constraint: a static client app cannot scrape a user's full photo feed
// from Instagram / TikTok / Facebook — those require auth and block CORS/scraping.
// What DOES work is the public profile picture, via unavatar.io (CORS-enabled,
// keyed off the username). Combined with web search for a brand's public images
// and keyword photos as a fallback, the agent can put real, on-brand imagery in
// the site instead of generic stock.

export interface SocialImage {
  platform: string
  handle: string
  url: string
}

// Canonical platform → unavatar provider, plus the words people use for it.
const PLATFORMS: { canon: string; aliases: string[] }[] = [
  { canon: 'instagram', aliases: ['instagram', 'insta', 'ig'] },
  { canon: 'tiktok', aliases: ['tiktok', 'tik tok'] },
  { canon: 'x', aliases: ['twitter', 'x', 'tweet'] },
  { canon: 'youtube', aliases: ['youtube', 'yt'] },
  { canon: 'github', aliases: ['github', 'gh'] },
  { canon: 'facebook', aliases: ['facebook', 'fb', 'meta'] },
  { canon: 'telegram', aliases: ['telegram', 'tg'] },
  { canon: 'soundcloud', aliases: ['soundcloud'] },
  { canon: 'twitch', aliases: ['twitch'] },
  { canon: 'dribbble', aliases: ['dribbble'] },
  { canon: 'reddit', aliases: ['reddit'] },
  { canon: 'substack', aliases: ['substack'] },
]

const ALIAS_TO_CANON = new Map<string, string>()
for (const p of PLATFORMS) for (const a of p.aliases) ALIAS_TO_CANON.set(a, p.canon)

function cleanHandle(raw: string): string {
  return raw.replace(/^[@.\-]+/, '').replace(/[)>\].,!?:;"']+$/g, '').trim()
}

// Words that look like a handle but aren't (platform aliases + filler + url bits).
const STOP = new Set([
  ...ALIAS_TO_CANON.keys(),
  'com', 'www', 'is', 'the', 'a', 'an', 'my', 'on', 'account', 'profile',
  'handle', 'name', 'page', 'username', 'user', 'and', 'or', 'photos', 'pics',
  'images', 'from', 'use', 'grab', 'find',
])

/** unavatar gives the public profile photo; CORS-enabled and works as an <img>. */
export function avatarUrl(platform: string, handle: string): string {
  return `https://unavatar.io/${platform}/${encodeURIComponent(handle)}`
}

/** Find social accounts the user mentioned and resolve them to real avatar URLs. */
export function extractSocialImages(text: string): SocialImage[] {
  const out: SocialImage[] = []
  const seen = new Set<string>()
  const add = (platformRaw: string, handleRaw: string) => {
    const canon = ALIAS_TO_CANON.get(platformRaw.toLowerCase())
    const handle = cleanHandle(handleRaw)
    if (!canon || handle.length < 2 || handle.length > 40) return
    if (STOP.has(handle.toLowerCase())) return // an alias/filler word, not a real handle
    const key = `${canon}/${handle.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ platform: canon, handle, url: avatarUrl(canon, handle) })
  }

  // 1) Profile URLs: instagram.com/handle, tiktok.com/@handle, x.com/handle …
  const urlRe = /(?:https?:\/\/)?(?:www\.)?(instagram|tiktok|twitter|x|youtube|facebook|github|telegram|t|soundcloud|twitch|dribbble|reddit|substack)\.com\/(?:@|c\/|user\/|in\/)?([A-Za-z0-9._\-]{2,40})/gi
  let m: RegExpExecArray | null
  while ((m = urlRe.exec(text))) {
    const plat = m[1].toLowerCase() === 't' ? 'telegram' : m[1]
    add(plat, m[2])
  }

  // 2) Mentions: "my instagram is @x", "tiktok: y", "fb account name z", "ig @h".
  // Strip URLs first so we don't re-parse "instagram.com" fragments here.
  const prose = text.replace(urlRe, ' ')
  const aliasGroup = Array.from(ALIAS_TO_CANON.keys()).map((a) => a.replace(/\s/g, '\\s')).join('|')
  // After the platform word, skip any run of filler/alias words, then grab the handle.
  const mentionRe = new RegExp(
    `\\b(${aliasGroup})\\b(?:\\s+(?:is|are|account|profile|handle|name|page|username|user|${aliasGroup}))*\\s*[:=]?\\s*@?([A-Za-z0-9._\\-]{2,40})`,
    'gi',
  )
  while ((m = mentionRe.exec(prose))) add(m[1], m[2])

  return out
}

/** A prompt block telling the agent to use these EXACT profile photos. */
export function buildSocialPrompt(images: SocialImage[]): string {
  if (!images.length) return ''
  const lines = images.map(
    (i) => `- ${i.platform} @${i.handle} → ${i.url}`,
  )
  return `REAL PROFILE PHOTOS — the user linked these social accounts. Use these EXACT image URLs for that person/brand (avatar, team section, testimonial, hero portrait). They are live, CORS-enabled profile pictures:
${lines.join('\n')}
Always add onerror="this.src='https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(images[0].handle)}'" so the image never breaks.`
}
