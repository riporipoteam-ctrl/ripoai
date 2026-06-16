// App-wide notification bell + dropdown. Generates real notifications from
// incoming friend requests and new messages, plus anything other features push
// via notify() / the `askai-notify` event. Mounted once in Home (top-right).
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, UserPlus, MessageSquare, Phone, Check } from 'lucide-react'
import { useStore } from '../store'
import { watchRequests, watchConversations } from '../lib/friends'
import {
  listNotifications,
  unreadCount,
  markAllRead,
  clearNotifications,
  onNotificationsChanged,
  notify,
  type AppNotification,
} from '../lib/notifications'

const ICONS = { friend_request: UserPlus, message: MessageSquare, call: Phone, job: Check, agent: Bell, info: Bell }

export default function NotificationBell() {
  const navigate = useNavigate()
  const user = useStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>(listNotifications())
  const [unread, setUnread] = useState(unreadCount())
  const seenReq = useRef<Set<string>>(new Set())
  const convTs = useRef<Map<string, number>>(new Map())
  const primed = useRef(false)

  useEffect(() => {
    const refresh = () => {
      setItems(listNotifications())
      setUnread(unreadCount())
    }
    const off = onNotificationsChanged(refresh)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default')
      Notification.requestPermission().catch(() => {})
    return off
  }, [])

  // Friend requests → notifications.
  useEffect(() => {
    if (!user) return
    return watchRequests(user.uid, (reqs) => {
      reqs.forEach((r) => {
        if (!seenReq.current.has(r.uid)) {
          seenReq.current.add(r.uid)
          if (primed.current) notify({ kind: 'friend_request', title: 'Friend request', body: `${r.name} wants to connect`, to: '/friends' })
        }
      })
      primed.current = true
    })
  }, [user])

  // New messages → notifications.
  useEffect(() => {
    if (!user) return
    let init = false
    return watchConversations(user.uid, (convs) => {
      convs.forEach((c) => {
        const prev = convTs.current.get(c.id) ?? 0
        if (c.ts > prev) {
          convTs.current.set(c.id, c.ts)
          if (init && c.lastFrom && c.lastFrom !== user.uid) {
            const otherUid = c.participants.find((u) => u !== user.uid) || ''
            notify({ kind: 'message', title: 'New message', body: c.last || '', to: `/dm/${otherUid}` })
          }
        }
      })
      init = true
    })
  }, [user])

  function openPanel() {
    setOpen((o) => !o)
    if (!open) {
      markAllRead()
    }
  }

  return (
    <div className="fixed right-3 top-3 z-40" style={{ top: 'max(env(safe-area-inset-top), 0.75rem)' }}>
      <button
        onClick={openPanel}
        className="glass pressable relative flex h-10 w-10 items-center justify-center rounded-full text-ink shadow-sm"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 -z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              className="absolute right-0 mt-2 w-80 max-w-[88vw] overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <span className="font-bold text-ink">Notifications</span>
                {items.length > 0 && (
                  <button onClick={() => clearNotifications()} className="text-xs font-semibold text-muted hover:text-ink">
                    Clear
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No notifications yet.</p>}
                {items.map((n) => {
                  const Icon = ICONS[n.kind] || Bell
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (n.to) navigate(n.to)
                        setOpen(false)
                      }}
                      className="pressable flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-white/5"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{n.title}</span>
                        {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
