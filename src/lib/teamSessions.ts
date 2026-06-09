// Saved Agent Team conversations. Sessions persist locally so team chats
// survive navigation and reloads, and can be reopened from the team room.
import type { TeamEvent } from './agentTeam'

export interface TeamSession {
  id: string
  title: string
  events: TeamEvent[]
  deliverable: string
  createdAt: number
  updatedAt: number
}

const MAX_SESSIONS = 20
const MAX_EVENT_CHARS = 12000

const key = (uid: string) => `askai:team:sessions:${uid}`

export function loadTeamSessions(uid: string): TeamSession[] {
  try {
    const raw = localStorage.getItem(key(uid))
    if (!raw) return []
    const list = JSON.parse(raw) as TeamSession[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function getTeamSession(uid: string, id: string): TeamSession | null {
  return loadTeamSessions(uid).find((s) => s.id === id) ?? null
}

export function saveTeamSession(uid: string, session: TeamSession) {
  const trimmed: TeamSession = {
    ...session,
    events: session.events.map((e) =>
      e.text.length > MAX_EVENT_CHARS ? { ...e, text: e.text.slice(0, MAX_EVENT_CHARS) } : e,
    ),
  }
  const rest = loadTeamSessions(uid).filter((s) => s.id !== session.id)
  const next = [trimmed, ...rest].slice(0, MAX_SESSIONS)
  try {
    localStorage.setItem(key(uid), JSON.stringify(next))
  } catch {
    // Storage full — drop oldest sessions until it fits.
    for (let n = next.length - 1; n > 0; n--) {
      try {
        localStorage.setItem(key(uid), JSON.stringify(next.slice(0, n)))
        return
      } catch {
        /* keep shrinking */
      }
    }
  }
}

export function deleteTeamSession(uid: string, id: string) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(loadTeamSessions(uid).filter((s) => s.id !== id)))
  } catch {
    /* ignore */
  }
}
