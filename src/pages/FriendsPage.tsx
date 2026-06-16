// Friends — search people, see suggestions, send/accept requests, and jump
// into a conversation (which now lives at /dm/:uid). The Messages inbox moved
// to the Home page. Built on Firestore (lib/friends.ts).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, UserPlus, Check, X, MessageSquare } from 'lucide-react'
import { useStore } from '../store'
import { isNative } from '../lib/native'
import {
  publishProfile,
  searchUsers,
  suggestedUsers,
  sendFriendRequest,
  watchRequests,
  acceptRequest,
  declineRequest,
  watchFriends,
  type UserProfile,
  type FriendRequest,
} from '../lib/friends'

function Avatar({ p, size = 44 }: { p: { name?: string; photoURL?: string }; size?: number }) {
  const px = `${size}px`
  return p.photoURL ? (
    <img src={p.photoURL} alt="" className="shrink-0 rounded-full object-cover" style={{ width: px, height: px }} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-accent/15 font-semibold text-accent"
      style={{ width: px, height: px, fontSize: size * 0.4 }}
    >
      {(p.name || '?').charAt(0).toUpperCase()}
    </span>
  )
}

function Row({ p, children }: { p: UserProfile; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Avatar p={p} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{p.name}</span>
        <span className="block truncate text-sm text-muted">@{p.handle}</span>
      </span>
      {children}
    </div>
  )
}

export default function FriendsPage() {
  const navigate = useNavigate()
  const user = useStore((s) => s.user)
  const me: UserProfile | null = useMemo(
    () =>
      user
        ? {
            uid: user.uid,
            name: user.displayName || (user.email ? user.email.split('@')[0] : 'You'),
            handle: (user.displayName || user.email || 'you').toLowerCase().replace(/[^a-z0-9._-]/g, ''),
            photoURL: user.photoURL || undefined,
          }
        : null,
    [user],
  )

  const [friends, setFriends] = useState<UserProfile[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<UserProfile[]>([])
  const [suggested, setSuggested] = useState<UserProfile[]>([])
  const [sent, setSent] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return
    void publishProfile(user)
    const u1 = watchFriends(user.uid, setFriends)
    const u2 = watchRequests(user.uid, setRequests)
    return () => {
      u1()
      u2()
    }
  }, [user])

  useEffect(() => {
    if (!me) return
    const t = setTimeout(async () => setResults(term.trim() ? await searchUsers(term, me.uid) : []), 280)
    return () => clearTimeout(t)
  }, [term, me])

  const friendByUid = useMemo(() => new Map(friends.map((f) => [f.uid, f])), [friends])

  useEffect(() => {
    if (!me) return
    suggestedUsers(
      me.uid,
      friends.map((f) => f.uid),
    ).then(setSuggested)
  }, [me, friends])

  if (!me) return <div className="p-8 text-center text-muted">Sign in to use Friends.</div>

  async function add(p: UserProfile) {
    await sendFriendRequest(me!, p)
    setSent((s) => new Set(s).add(p.uid))
  }

  const AddBtn = ({ p }: { p: UserProfile }) => (
    <button
      onClick={() => add(p)}
      disabled={sent.has(p.uid) || !!friendByUid.get(p.uid)}
      className="pressable flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50"
    >
      <UserPlus size={13} /> {friendByUid.get(p.uid) ? 'Friends' : sent.has(p.uid) ? 'Sent' : 'Add'}
    </button>
  )

  return (
    <div className={`mx-auto h-full w-full max-w-2xl overflow-y-auto px-4 pt-5 ${isNative ? 'pb-28' : 'pb-6'}`}>
      <h1 className="mb-4 text-2xl font-bold text-ink">Friends</h1>

      <div className="mb-5 flex items-center gap-2 rounded-2xl border border-line bg-card px-3 py-2.5">
        <Search size={16} className="text-muted" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search people by username…"
          className="w-full bg-transparent text-sm text-ink placeholder:text-muted"
        />
      </div>

      {results.length > 0 && (
        <Section title="Results">
          {results.map((p) => (
            <Row key={p.uid} p={p}>
              <AddBtn p={p} />
            </Row>
          ))}
        </Section>
      )}

      {requests.length > 0 && (
        <Section title={`Requests · ${requests.length}`}>
          {requests.map((r) => (
            <Row key={r.uid} p={r}>
              <div className="flex gap-1.5">
                <button onClick={() => acceptRequest(me, r)} className="pressable flex h-8 w-8 items-center justify-center rounded-full accent-gradient-bg text-white">
                  <Check size={15} />
                </button>
                <button onClick={() => declineRequest(me.uid, r.uid)} className="pressable flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted">
                  <X size={15} />
                </button>
              </div>
            </Row>
          ))}
        </Section>
      )}

      {!term && suggested.length > 0 && (
        <Section title="Suggestions">
          {suggested.map((p) => (
            <Row key={p.uid} p={p}>
              <AddBtn p={p} />
            </Row>
          ))}
        </Section>
      )}

      <Section title={`Your friends · ${friends.length}`}>
        {friends.length === 0 && <p className="py-4 text-center text-sm text-muted">No friends yet — add someone above.</p>}
        {friends.map((f) => (
          <Row key={f.uid} p={f}>
            <button
              onClick={() => navigate(`/dm/${f.uid}`)}
              className="pressable flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink"
            >
              <MessageSquare size={13} /> Message
            </button>
          </Row>
        ))}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </div>
  )
}
