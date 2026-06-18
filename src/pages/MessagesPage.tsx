// Messages — the signed-in user's DM conversations and friends in one place.
// Open a chat by tapping a conversation/friend row (navigates to /dm/:uid), or
// start a voice/video call straight from a friend row. Calls are started the
// same way the rest of the app does it: by dispatching the `askai-start-call`
// window event that the global CallManager listens for. Matches the Nebula
// monochrome redesign (paper + ink, accent tokens only).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageSquare, Users, Phone, Video, ArrowRight } from 'lucide-react'
import { useStore } from '../store'
import { watchConversations, watchFriends, type Conversation, type UserProfile } from '../lib/friends'
import type { CallKind } from '../lib/calls'

/** Fire the call-start event the global CallManager listens for. */
function startCall(other: { uid: string; name: string }, kind: CallKind) {
  window.dispatchEvent(new CustomEvent('askai-start-call', { detail: { other, kind } }))
}

function timeAgo(ts?: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Avatar({ name, photoURL }: { name: string; photoURL?: string }) {
  if (photoURL) {
    return <img src={photoURL} alt={name} className="h-10 w-10 shrink-0 rounded-full object-cover" />
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  )
}

export default function MessagesPage() {
  const navigate = useNavigate()
  const user = useStore((s) => s.user)

  const [convs, setConvs] = useState<Conversation[]>([])
  const [friends, setFriends] = useState<UserProfile[]>([])

  useEffect(() => {
    if (!user) return
    const u1 = watchConversations(user.uid, setConvs)
    const u2 = watchFriends(user.uid, setFriends)
    return () => {
      u1()
      u2()
    }
  }, [user])

  const friendByUid = useMemo(() => new Map(friends.map((f) => [f.uid, f])), [friends])

  const otherOf = (c: Conversation): UserProfile => {
    const otherUid = c.participants.find((u) => u !== user?.uid) || ''
    return friendByUid.get(otherUid) || { uid: otherUid, name: 'User', handle: '' }
  }

  return (
    <div className="nb-page h-full w-full overflow-y-auto mx-auto max-w-2xl px-4 pt-9 pb-28">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
        <h1 className="nebula-display text-[1.7rem] font-bold leading-tight text-ink sm:text-3xl">Messages</h1>
        <p className="mt-1 text-[0.95rem] text-muted">Your conversations, friends, and one-tap voice &amp; video calls.</p>
      </motion.div>

      {/* Conversations */}
      <section className="mb-8">
        <h2 className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-muted">Conversations</h2>

        {convs.length === 0 ? (
          <div className="ag-card flex w-full flex-col items-start gap-3 rounded-[20px] border border-line bg-card px-4 py-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
              <MessageSquare size={16} />
            </span>
            <p className="text-sm text-muted">No conversations yet — add friends to start chatting, voice &amp; video calling.</p>
            <button
              onClick={() => navigate('/friends')}
              className="pressable inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3.5 py-2 text-sm font-bold text-accent"
            >
              Find friends <ArrowRight size={15} />
            </button>
          </div>
        ) : (
          <div className="nb-stagger flex flex-col divide-y divide-line/60 overflow-hidden rounded-[20px] border border-line bg-card">
            {convs.map((c) => {
              const p = otherOf(c)
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/dm/${p.uid}`)}
                  className="pressable flex items-center gap-3 px-4 py-3 text-left"
                >
                  <Avatar name={p.name} photoURL={p.photoURL} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{p.name}</span>
                    <span className="block truncate text-sm text-muted">{c.last || 'Tap to chat'}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(c.ts)}</span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Friends */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Friends</h2>
          <button onClick={() => navigate('/friends')} className="text-xs font-bold text-accent hover:underline">
            Manage
          </button>
        </div>

        {friends.length === 0 ? (
          <div className="ag-card flex w-full flex-col items-start gap-3 rounded-[20px] border border-line bg-card px-4 py-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Users size={16} />
            </span>
            <p className="text-sm text-muted">No friends yet. Add people to chat and call them.</p>
            <button
              onClick={() => navigate('/friends')}
              className="pressable inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3.5 py-2 text-sm font-bold text-accent"
            >
              Add friends <ArrowRight size={15} />
            </button>
          </div>
        ) : (
          <div className="nb-stagger flex flex-col divide-y divide-line/60 overflow-hidden rounded-[20px] border border-line bg-card">
            {friends.map((f) => (
              <div key={f.uid} className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => navigate(`/dm/${f.uid}`)}
                  className="pressable flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Avatar name={f.name} photoURL={f.photoURL} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{f.name}</span>
                    <span className="block truncate text-sm text-muted">{f.handle ? `@${f.handle}` : 'Friend'}</span>
                  </span>
                </button>
                <button
                  onClick={() => startCall({ uid: f.uid, name: f.name }, 'audio')}
                  aria-label={`Voice call ${f.name}`}
                  title="Voice call"
                  className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"
                >
                  <Phone size={17} />
                </button>
                <button
                  onClick={() => startCall({ uid: f.uid, name: f.name }, 'video')}
                  aria-label={`Video call ${f.name}`}
                  title="Video call"
                  className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"
                >
                  <Video size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
