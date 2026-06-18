// Lightweight, dependency-free data layer for FIFA World Cup 2026 matches.
// Uses the global `fetch` only. Falls back to bundled fixtures when the
// public API is unavailable or returns nothing usable.

export interface WCMatch {
  id: string
  home: string
  away: string
  homeFlag?: string
  awayFlag?: string
  homeScore?: number | null
  awayScore?: number | null
  kickoff: string /* ISO */
  status: 'scheduled' | 'live' | 'finished'
  group?: string
  venue?: string
  minute?: string
}

const WC_LEAGUE_ID = '4429' // TheSportsDB FIFA World Cup league id
const API_BASE = 'https://www.thesportsdb.com/api/v1/json/3'
const PAST_URL = `${API_BASE}/eventspastleague.php?id=${WC_LEAGUE_ID}`
const NEXT_URL = `${API_BASE}/eventsnextleague.php?id=${WC_LEAGUE_ID}`

// Window during which a match with scores is treated as in-play.
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

interface SportsDBEvent {
  idEvent?: string
  strHomeTeam?: string
  strAwayTeam?: string
  intHomeScore?: string | null
  intAwayScore?: string | null
  dateEvent?: string | null
  strTime?: string | null
  strTimestamp?: string | null
  strVenue?: string | null
  intRound?: string | null
  strGroup?: string | null
  strStatus?: string | null
}

/** Build an ISO kickoff string from TheSportsDB date/time fields. */
function buildKickoffISO(ev: SportsDBEvent): string | null {
  if (ev.strTimestamp) {
    const t = new Date(ev.strTimestamp)
    if (!Number.isNaN(t.getTime())) return t.toISOString()
  }
  if (ev.dateEvent) {
    const time = (ev.strTime || '00:00:00').slice(0, 8)
    // Treat the API time as UTC (TheSportsDB times are UTC-based).
    const candidate = new Date(`${ev.dateEvent}T${time}Z`)
    if (!Number.isNaN(candidate.getTime())) return candidate.toISOString()
  }
  return null
}

function toScore(v: string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function deriveStatus(
  kickoffISO: string,
  homeScore: number | null,
  awayScore: number | null,
  strStatus: string | null | undefined,
  now: number,
): WCMatch['status'] {
  const kickoff = new Date(kickoffISO).getTime()
  const hasScores = homeScore != null && awayScore != null
  const status = (strStatus || '').trim().toLowerCase()

  const finishedStatus = ['ft', 'aet', 'pen', 'match finished', 'finished', 'fin'].some((s) =>
    status.includes(s),
  )
  const inPlayStatus =
    status === 'live' ||
    status.includes('1h') ||
    status.includes('2h') ||
    status.includes('ht') ||
    status.includes('in play') ||
    status.includes('in-play') ||
    /^\d+'?$/.test(status)

  if (finishedStatus && hasScores) return 'finished'

  const withinLiveWindow = kickoff <= now && now <= kickoff + TWO_HOURS_MS
  if ((withinLiveWindow && hasScores) || inPlayStatus) return 'live'

  // Both scores present and the match is already in the past → finished.
  if (hasScores && kickoff < now) return 'finished'

  return 'scheduled'
}

function deriveMinute(strStatus: string | null | undefined): string | undefined {
  const status = (strStatus || '').trim()
  if (!status) return undefined
  // Already minute-like, e.g. "67'" or "67".
  if (/^\d+'?$/.test(status)) return status.endsWith("'") ? status : `${status}'`
  if (/^(ht|half)/i.test(status)) return 'HT'
  return undefined
}

function mapEvent(ev: SportsDBEvent, now: number): WCMatch | null {
  const home = ev.strHomeTeam?.trim()
  const away = ev.strAwayTeam?.trim()
  if (!home || !away) return null

  const kickoff = buildKickoffISO(ev)
  if (!kickoff) return null

  const homeScore = toScore(ev.intHomeScore)
  const awayScore = toScore(ev.intAwayScore)
  const status = deriveStatus(kickoff, homeScore, awayScore, ev.strStatus, now)

  const group =
    ev.strGroup?.trim() ||
    (ev.intRound && ev.intRound !== '0' ? `Round ${ev.intRound}` : undefined)

  return {
    id: ev.idEvent || `${home}-${away}-${kickoff}`,
    home,
    away,
    homeScore,
    awayScore,
    kickoff,
    status,
    group: group || undefined,
    venue: ev.strVenue?.trim() || undefined,
    minute: status === 'live' ? deriveMinute(ev.strStatus) : undefined,
  }
}

async function fetchJSON(url: string): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchWorldCup(): Promise<WCMatch[]> {
  try {
    const now = Date.now()
    const [pastRaw, nextRaw] = await Promise.all([fetchJSON(PAST_URL), fetchJSON(NEXT_URL)])

    const events: SportsDBEvent[] = []
    const past = (pastRaw as { events?: SportsDBEvent[] } | null)?.events
    const next = (nextRaw as { events?: SportsDBEvent[] } | null)?.events
    if (Array.isArray(past)) events.push(...past)
    if (Array.isArray(next)) events.push(...next)

    const mapped = events
      .map((ev) => mapEvent(ev, now))
      .filter((m): m is WCMatch => m != null)

    // De-duplicate by id (past + next can overlap).
    const seen = new Set<string>()
    const unique = mapped.filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    unique.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())

    if (unique.length > 0) return unique
  } catch {
    // fall through to fallback
  }
  return FALLBACK_MATCHES
}

export function isLiveNow(m: WCMatch): boolean {
  if (m.status === 'live') return true
  if (m.homeScore == null || m.awayScore == null) return false
  const kickoff = new Date(m.kickoff).getTime()
  if (Number.isNaN(kickoff)) return false
  const now = Date.now()
  return kickoff <= now && now <= kickoff + TWO_HOURS_MS
}

// Realistic group-stage fixtures around 2026-06-17..2026-06-19 (in-app "today"
// is 2026-06-18). Times are UTC ISO; the UI formats them to the user's locale.
export const FALLBACK_MATCHES: WCMatch[] = [
  {
    id: 'wc26-fallback-1',
    home: 'United States',
    away: 'Mexico',
    homeFlag: '🇺🇸',
    awayFlag: '🇲🇽',
    homeScore: 2,
    awayScore: 1,
    kickoff: '2026-06-18T19:30:00Z',
    status: 'live',
    minute: "67'",
    group: 'Group A',
    venue: 'MetLife Stadium, NJ',
  },
  {
    id: 'wc26-fallback-2',
    home: 'Canada',
    away: 'Croatia',
    homeFlag: '🇨🇦',
    awayFlag: '🇭🇷',
    homeScore: 0,
    awayScore: 0,
    kickoff: '2026-06-18T20:00:00Z',
    status: 'live',
    minute: "23'",
    group: 'Group B',
    venue: 'BC Place, Vancouver',
  },
  {
    id: 'wc26-fallback-3',
    home: 'Brazil',
    away: 'Morocco',
    homeFlag: '🇧🇷',
    awayFlag: '🇲🇦',
    homeScore: 3,
    awayScore: 2,
    kickoff: '2026-06-17T22:00:00Z',
    status: 'finished',
    group: 'Group C',
    venue: 'SoFi Stadium, LA',
  },
  {
    id: 'wc26-fallback-4',
    home: 'Argentina',
    away: 'Japan',
    homeFlag: '🇦🇷',
    awayFlag: '🇯🇵',
    homeScore: 1,
    awayScore: 1,
    kickoff: '2026-06-17T19:00:00Z',
    status: 'finished',
    group: 'Group D',
    venue: 'AT&T Stadium, Dallas',
  },
  {
    id: 'wc26-fallback-5',
    home: 'France',
    away: 'Senegal',
    homeFlag: '🇫🇷',
    awayFlag: '🇸🇳',
    homeScore: null,
    awayScore: null,
    kickoff: '2026-06-18T23:00:00Z',
    status: 'scheduled',
    group: 'Group E',
    venue: 'Mercedes-Benz Stadium, Atlanta',
  },
  {
    id: 'wc26-fallback-6',
    home: 'England',
    away: 'Netherlands',
    homeFlag: '🏴',
    awayFlag: '🇳🇱',
    homeScore: null,
    awayScore: null,
    kickoff: '2026-06-19T18:00:00Z',
    status: 'scheduled',
    group: 'Group F',
    venue: 'Estadio Azteca, Mexico City',
  },
  {
    id: 'wc26-fallback-7',
    home: 'Spain',
    away: 'Germany',
    homeFlag: '🇪🇸',
    awayFlag: '🇩🇪',
    homeScore: null,
    awayScore: null,
    kickoff: '2026-06-19T20:30:00Z',
    status: 'scheduled',
    group: 'Group G',
    venue: 'SoFi Stadium, LA',
  },
  {
    id: 'wc26-fallback-8',
    home: 'Portugal',
    away: 'Uruguay',
    homeFlag: '🇵🇹',
    awayFlag: '🇺🇾',
    homeScore: null,
    awayScore: null,
    kickoff: '2026-06-19T23:00:00Z',
    status: 'scheduled',
    group: 'Group H',
    venue: 'MetLife Stadium, NJ',
  },
]
