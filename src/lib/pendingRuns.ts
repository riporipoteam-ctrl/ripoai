// Pending-run registry. When a chat/agent run starts we record it here; when it
// finishes we clear it. If the user closes AskAI mid-run, the entry survives, so
// on next open we can resume and finish the task automatically.
import type { SendOptions } from '../hooks/useChat'

export interface PendingRun {
  chatId: string
  opts: SendOptions
  label: string
  startedAt: number
}

const key = (uid: string) => `askai:pending-runs:${uid}`
// Don't resume ancient runs (e.g. opened days later) — only recent ones.
const MAX_AGE = 1000 * 60 * 30 // 30 minutes

function readAll(uid: string): Record<string, PendingRun> {
  try {
    return JSON.parse(localStorage.getItem(key(uid)) || '{}') || {}
  } catch {
    return {}
  }
}

function writeAll(uid: string, map: Record<string, PendingRun>) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function markPending(uid: string, run: PendingRun) {
  const map = readAll(uid)
  map[run.chatId] = run
  writeAll(uid, map)
}

export function clearPending(uid: string, chatId: string) {
  const map = readAll(uid)
  if (map[chatId]) {
    delete map[chatId]
    writeAll(uid, map)
  }
}

export function isPending(uid: string, chatId: string): boolean {
  return !!readAll(uid)[chatId]
}

/** Recent, resumable runs, newest first (stale ones are pruned out). */
export function loadPendingRuns(uid: string): PendingRun[] {
  const map = readAll(uid)
  const now = Date.now()
  let changed = false
  for (const [id, run] of Object.entries(map)) {
    if (now - (run.startedAt || 0) > MAX_AGE) {
      delete map[id]
      changed = true
    }
  }
  if (changed) writeAll(uid, map)
  return Object.values(map).sort((a, b) => b.startedAt - a.startedAt)
}
