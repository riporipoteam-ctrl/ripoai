// Real in-app notifications. Other features call notify(); the bell renders the
// list + unread badge. Persisted per-session in localStorage; also fires an OS
// notification when the app is backgrounded (permission permitting).
export type NotifKind = 'friend_request' | 'message' | 'call' | 'job' | 'agent' | 'info'

export interface AppNotification {
  id: string
  kind: NotifKind
  title: string
  body?: string
  ts: number
  read?: boolean
  /** optional route to open when tapped */
  to?: string
}

const KEY = 'askai:notifications'
const EVT = 'askai-notifications-changed'

function load(): AppNotification[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
function save(list: AppNotification[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100)))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVT))
}

export function listNotifications(): AppNotification[] {
  return load().sort((a, b) => b.ts - a.ts)
}

export function unreadCount(): number {
  return load().filter((n) => !n.read).length
}

export function notify(n: Omit<AppNotification, 'id' | 'ts' | 'read'>): void {
  const list = load()
  // de-dupe identical title+body within 10s
  if (list.some((x) => x.title === n.title && x.body === n.body && Date.now() - x.ts < 10000)) return
  list.unshift({ ...n, id: Math.random().toString(36).slice(2), ts: Date.now(), read: false })
  save(list)
  // OS notification when backgrounded
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      new Notification(n.title, { body: n.body, tag: n.title })
    }
  } catch {
    /* ignore */
  }
}

export function markAllRead(): void {
  save(load().map((n) => ({ ...n, read: true })))
}

export function clearNotifications(): void {
  save([])
}

export function onNotificationsChanged(cb: () => void): () => void {
  window.addEventListener(EVT, cb)
  // also let other tabs/components fire via a window CustomEvent
  const custom = (e: Event) => {
    const d = (e as CustomEvent).detail
    if (d) notify(d)
  }
  window.addEventListener('askai-notify', custom as EventListener)
  return () => {
    window.removeEventListener(EVT, cb)
    window.removeEventListener('askai-notify', custom as EventListener)
  }
}
