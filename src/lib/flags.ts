// Country flags that render EVERYWHERE.
//
// Emoji regional-indicator flags (🇺🇸) silently fail on most Android devices and
// many Windows browsers — they fall back to two grey letters or a blank box.
// To guarantee a flag always shows, we resolve every team to an ISO 3166-1
// alpha-2 code and render a real <img> from flagcdn.com (with the emoji kept as
// a graceful fallback). Live API data (TheSportsDB) ships no flags at all, so
// the name→code map below is what gives every fixture a flag too.

// Team / country name (lowercased) → flag code understood by flagcdn.com.
// The home nations use flagcdn's sub-region codes (gb-eng, gb-sct, gb-wls).
const NAME_TO_CODE: Record<string, string> = {
  // CONCACAF hosts
  'united states': 'us', usa: 'us', 'united states of america': 'us', 'u.s.a.': 'us',
  canada: 'ca', mexico: 'mx',
  // UEFA
  england: 'gb-eng', scotland: 'gb-sct', wales: 'gb-wls', 'northern ireland': 'gb-nir',
  'great britain': 'gb', 'united kingdom': 'gb',
  france: 'fr', germany: 'de', spain: 'es', portugal: 'pt', netherlands: 'nl',
  belgium: 'be', italy: 'it', croatia: 'hr', switzerland: 'ch', denmark: 'dk',
  poland: 'pl', sweden: 'se', norway: 'no', austria: 'at', serbia: 'rs',
  ukraine: 'ua', 'czech republic': 'cz', czechia: 'cz', turkey: 'tr', türkiye: 'tr',
  greece: 'gr', hungary: 'hu', romania: 'ro', ireland: 'ie', 'republic of ireland': 'ie',
  slovenia: 'si', slovakia: 'sk', finland: 'fi', iceland: 'is', albania: 'al',
  'bosnia-herzegovina': 'ba', 'bosnia and herzegovina': 'ba', bosnia: 'ba',
  'north macedonia': 'mk', kosovo: 'xk', georgia: 'ge', russia: 'ru',
  // CONMEBOL
  brazil: 'br', argentina: 'ar', uruguay: 'uy', colombia: 'co', chile: 'cl',
  peru: 'pe', ecuador: 'ec', paraguay: 'py', bolivia: 'bo', venezuela: 've',
  // CONCACAF
  'costa rica': 'cr', panama: 'pa', honduras: 'hn', jamaica: 'jm',
  'el salvador': 'sv', guatemala: 'gt', 'trinidad and tobago': 'tt', curacao: 'cw',
  haiti: 'ht',
  // AFC
  japan: 'jp', 'south korea': 'kr', 'korea republic': 'kr', korea: 'kr',
  'saudi arabia': 'sa', australia: 'au', iran: 'ir', 'ir iran': 'ir', qatar: 'qa',
  iraq: 'iq', 'united arab emirates': 'ae', uae: 'ae', uzbekistan: 'uz',
  jordan: 'jo', china: 'cn', 'china pr': 'cn', vietnam: 'vn', thailand: 'th',
  'north korea': 'kp', bahrain: 'bh', oman: 'om', kuwait: 'kw', india: 'in',
  // CAF
  morocco: 'ma', senegal: 'sn', tunisia: 'tn', algeria: 'dz', egypt: 'eg',
  nigeria: 'ng', ghana: 'gh', cameroon: 'cm', 'ivory coast': 'ci',
  "cote d'ivoire": 'ci', 'côte d’ivoire': 'ci', 'south africa': 'za', mali: 'ml',
  'burkina faso': 'bf', 'dr congo': 'cd', 'democratic republic of the congo': 'cd',
  'cape verde': 'cv', 'cabo verde': 'cv', angola: 'ao', zambia: 'zm', gabon: 'ga',
  'equatorial guinea': 'gq', guinea: 'gn', mauritania: 'mr', mozambique: 'mz',
  // OFC
  'new zealand': 'nz',
}

/** Resolve a team/country name to a flagcdn code, or null when unknown. */
export function flagCode(name?: string): string | null {
  if (!name) return null
  const key = name.trim().toLowerCase()
  if (NAME_TO_CODE[key]) return NAME_TO_CODE[key]
  // Strip common suffixes/qualifiers and retry (e.g. "Korea Republic (KOR)").
  const cleaned = key.replace(/\s*\(.*\)\s*$/, '').trim()
  if (cleaned !== key && NAME_TO_CODE[cleaned]) return NAME_TO_CODE[cleaned]
  return null
}

/** flagcdn.com PNG URL for a code at a given pixel width (1x). */
export function flagUrl(code: string, w: 20 | 40 | 80 | 160 = 80): string {
  return `https://flagcdn.com/w${w}/${code}.png`
}

/** flagcdn.com srcset (1x/2x) for crisp rendering on retina screens. */
export function flagSrcSet(code: string, w: 40 | 80 = 40): string {
  const hi = (w * 2) as 80 | 160
  return `${flagUrl(code, w)} 1x, ${flagUrl(code, hi)} 2x`
}
