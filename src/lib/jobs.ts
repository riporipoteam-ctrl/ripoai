// Scheduled "Jobs" — recurring tasks assigned to an agent that run on a
// cadence (Nebula's Jobs tab). Persisted per-user in localStorage; the
// orchestrator/runner reads `nextRunAt` to decide when a job is due.

export type JobCadence = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly'

export interface Job {
  id: string
  /** Human title, e.g. "Daily Morning Digest". */
  title: string
  /** Agent that runs this job. */
  agentId: string
  /** Role label cached for display ("Writer", "Researcher"). */
  agentRole?: string
  /** What the agent should do each run. */
  prompt: string
  cadence: JobCadence
  /** Next scheduled run, epoch ms. */
  nextRunAt: number
  lastRunAt?: number
  enabled: boolean
  createdAt: number
  /** uid of the owner — powers "My jobs" vs "All jobs". */
  owner: string
}

export const CADENCE_LABEL: Record<JobCadence, string> = {
  once: 'One time',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

const CADENCE_MS: Record<Exclude<JobCadence, 'once'>, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
}

/** Advance nextRunAt to the next slot after `from` for the given cadence. */
export function advance(cadence: JobCadence, from = Date.now()): number {
  if (cadence === 'once') return from
  return from + CADENCE_MS[cadence]
}

/** Compact "in 20h" / "in 5d" / "now" relative label, matching Nebula. */
export function untilLabel(nextRunAt: number, now = Date.now()): string {
  const ms = nextRunAt - now
  if (ms <= 0) return 'now'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `in ${hrs}h`
  const days = Math.round(hrs / 24)
  if (days < 14) return `in ${days}d`
  const weeks = Math.round(days / 7)
  return `in ${weeks}w`
}

const key = (uid: string) => `askai:jobs:${uid}`

export function loadJobs(uid: string): Job[] {
  try {
    const raw = localStorage.getItem(key(uid))
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveJobs(uid: string, jobs: Job[]) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(jobs))
  } catch {
    /* ignore quota */
  }
}

export function upsertJob(uid: string, job: Job) {
  const jobs = loadJobs(uid)
  const i = jobs.findIndex((j) => j.id === job.id)
  if (i >= 0) jobs[i] = job
  else jobs.push(job)
  saveJobs(uid, jobs)
}

export function deleteJob(uid: string, id: string) {
  saveJobs(
    uid,
    loadJobs(uid).filter((j) => j.id !== id),
  )
}

export function newJob(owner: string, agentId: string, partial: Partial<Job> = {}): Job {
  const cadence = partial.cadence ?? 'daily'
  return {
    id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title: partial.title ?? 'New job',
    agentId,
    agentRole: partial.agentRole,
    prompt: partial.prompt ?? '',
    cadence,
    nextRunAt: partial.nextRunAt ?? advance(cadence),
    enabled: partial.enabled ?? true,
    createdAt: Date.now(),
    owner,
    ...partial,
  }
}

/** Does this message ask to schedule something for later (vs do it now)? */
export function isScheduleIntent(text: string): boolean {
  return /\b(tomorrow|tonight|later|every|daily|weekly|monthly|each (morning|day|week|night)|next (week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at \d|in \d+\s*(min|hour|day|week)|schedule|remind me|set (a )?(job|task|reminder)|make (a )?(job|task))\b/i.test(
    text,
  )
}

/** Parse a natural-language time into a next-run + cadence. Returns null if no
 *  time is found (caller can then default to "now"/daily). */
export function parseWhen(text: string, now = Date.now()): { nextRunAt: number; cadence: JobCadence } | null {
  const t = text.toLowerCase()
  const HOUR = 3600_000
  const DAY = 24 * HOUR
  // cadence words
  let cadence: JobCadence = 'once'
  if (/\b(every day|daily|each (morning|day))\b/.test(t)) cadence = 'daily'
  else if (/\b(every week|weekly|each week)\b/.test(t)) cadence = 'weekly'
  else if (/\b(every month|monthly)\b/.test(t)) cadence = 'monthly'
  else if (/\bevery hour|hourly\b/.test(t)) cadence = 'hourly'

  // Pick a clock hour if given ("at 9", "at 9am", "9pm", "morning"=9, "tonight"=20)
  const setHour = (base: Date, h: number) => {
    base.setHours(h, 0, 0, 0)
    return base
  }
  const hourMatch = t.match(/\bat (\d{1,2})\s*(am|pm)?\b/) || t.match(/\b(\d{1,2})\s*(am|pm)\b/)
  let hour = 9
  if (hourMatch) {
    hour = parseInt(hourMatch[1], 10)
    const mer = hourMatch[2]
    if (mer === 'pm' && hour < 12) hour += 12
    if (mer === 'am' && hour === 12) hour = 0
  } else if (/\btonight|this evening\b/.test(t)) hour = 20
  else if (/\bmorning\b/.test(t)) hour = 9
  else if (/\bafternoon\b/.test(t)) hour = 14

  // relative day
  const d = new Date(now)
  if (/\btomorrow\b/.test(t)) return { nextRunAt: setHour(new Date(now + DAY), hour).getTime(), cadence }
  if (/\btonight|this evening\b/.test(t)) return { nextRunAt: setHour(new Date(now), hour).getTime(), cadence }
  const inDays = t.match(/\bin (\d+)\s*days?\b/)
  if (inDays) return { nextRunAt: now + parseInt(inDays[1], 10) * DAY, cadence }
  const inHours = t.match(/\bin (\d+)\s*hours?\b/)
  if (inHours) return { nextRunAt: now + parseInt(inHours[1], 10) * HOUR, cadence }
  const inMins = t.match(/\bin (\d+)\s*(min|minute)s?\b/)
  if (inMins) return { nextRunAt: now + parseInt(inMins[1], 10) * 60_000, cadence }
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const wd = weekdays.findIndex((w) => new RegExp(`\\bnext ${w}\\b|\\b${w}\\b`).test(t))
  if (wd >= 0) {
    const target = new Date(now)
    const delta = (wd - target.getDay() + 7) % 7 || 7
    return { nextRunAt: setHour(new Date(now + delta * DAY), hour).getTime(), cadence }
  }
  if (cadence !== 'once') {
    // "every morning" etc. → first run at the next occurrence of that hour
    const next = setHour(new Date(now), hour)
    if (next.getTime() <= now) next.setTime(next.getTime() + DAY)
    return { nextRunAt: next.getTime(), cadence }
  }
  if (hourMatch) {
    const next = setHour(new Date(now), hour)
    if (next.getTime() <= now) next.setTime(next.getTime() + DAY)
    return { nextRunAt: next.getTime(), cadence: 'once' }
  }
  return null
}

/** Jobs sorted by soonest run — what the "Upcoming" list renders. */
export function upcomingJobs(uid: string): Job[] {
  return loadJobs(uid)
    .filter((j) => j.enabled)
    .sort((a, b) => a.nextRunAt - b.nextRunAt)
}

/** Jobs whose nextRunAt has passed — the runner should execute these. */
export function dueJobs(uid: string, now = Date.now()): Job[] {
  return loadJobs(uid).filter((j) => j.enabled && j.nextRunAt <= now)
}
