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
