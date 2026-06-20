// Agent activity timeline — a lightweight, localStorage-backed run history for
// every agent. Records when an agent is handed a goal, runs a job, designs a
// teammate, or gets created/edited, so the Agents home feed and each agent's
// detail page can show real "activity" the way Nebula's activity threads do.
//
// Intentionally tiny and dependency-free: just append-only events with a small
// cap per user, plus query helpers + a change event so open screens refresh.

export type ActivityKind =
  | 'created' // an agent was created (from a template or described)
  | 'goal' // a goal was routed/handed off to an agent
  | 'job_run' // a scheduled job fired for an agent
  | 'job_created' // a job was scheduled for an agent
  | 'chat' // a 1-on-1 chat was opened with an agent
  | 'edited' // an agent's profile/prompt was edited

export interface ActivityEvent {
  id: string
  /** Which agent this event is about. */
  agentId: string
  /** Cached name so the feed renders even if the agent is later deleted. */
  agentName: string
  kind: ActivityKind
  /** Short headline, e.g. "Wrote the launch email". */
  title: string
  /** Optional one-line detail / snippet. */
  detail?: string
  /** Optional deep link target inside the app (e.g. a chat id "/c/abc"). */
  href?: string
  at: number
}

const CAP = 80
const key = (uid: string) => `askai:agent-activity:${uid}`
export const ACTIVITY_CHANGED = 'askai-agent-activity-changed'

function uid4(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  }
}

/** All activity for a user, newest first. */
export function loadActivity(uid: string): ActivityEvent[] {
  try {
    const raw = localStorage.getItem(key(uid))
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return (list as ActivityEvent[]).sort((a, b) => b.at - a.at)
  } catch {
    return []
  }
}

function persist(uid: string, list: ActivityEvent[]) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(list.slice(0, CAP)))
  } catch {
    /* ignore quota */
  }
  try {
    window.dispatchEvent(new CustomEvent(ACTIVITY_CHANGED))
  } catch {
    /* ignore */
  }
}

/** Append a new activity event for an agent. Returns the created event. */
export function logActivity(
  uid: string,
  agentId: string,
  agentName: string,
  kind: ActivityKind,
  title: string,
  extra: { detail?: string; href?: string } = {},
): ActivityEvent | null {
  if (!uid || !agentId) return null
  const event: ActivityEvent = {
    id: uid4(),
    agentId,
    agentName,
    kind,
    title,
    detail: extra.detail,
    href: extra.href,
    at: Date.now(),
  }
  const list = loadActivity(uid)
  list.unshift(event)
  persist(uid, list)
  return event
}

/** Activity for a single agent, newest first. */
export function agentActivity(uid: string, agentId: string): ActivityEvent[] {
  return loadActivity(uid).filter((e) => e.agentId === agentId)
}

/** Clear the whole activity log for a user (used by "Clear" in the feed). */
export function clearActivity(uid: string) {
  persist(uid, [])
}

/** Remove every event belonging to a deleted agent so the feed stays clean. */
export function dropAgentActivity(uid: string, agentId: string) {
  persist(
    uid,
    loadActivity(uid).filter((e) => e.agentId !== agentId),
  )
}

const KIND_LABEL: Record<ActivityKind, string> = {
  created: 'Joined the team',
  goal: 'Picked up a goal',
  job_run: 'Ran a scheduled job',
  job_created: 'Got a new job',
  chat: 'Started a chat',
  edited: 'Was updated',
}

/** Human label for an activity kind (used as the eyebrow on feed rows). */
export function activityKindLabel(kind: ActivityKind): string {
  return KIND_LABEL[kind] ?? 'Activity'
}

/** Compact relative timestamp shared by the feed + detail timeline. */
export function activityWhen(ts: number, now = Date.now()): string {
  const diff = now - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ts).toLocaleDateString()
}
