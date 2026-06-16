// Friends + Messages — a lightweight messaging app inside AskAI. Search users,
// send/accept friend requests, and chat in real time (text, images, files) with
// @askai support. Built on Firestore (lib/friends.ts) — no extra backend.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Search, UserPlus, Check, X, Send, Paperclip, MessageSquare, Users, Bot } from 'lucide-react'
import { useStore } from '../store'
import { isNative } from '../lib/native'
import {
  publishProfile,
  searchUsers,
  sendFriendRequest,
  watchRequests,
  acceptRequest,
  declineRequest,
  watchFriends,
  watchConversations,
  watchMessages,
  sendMessage,
  maybeAskAI,
  convId,
  type UserProfile,
  type FriendRequest,
  type Conversation,
  type DMMessage,
} from '../lib/friends'

function Avatar({ p, size = 40 }: { p: { name?: string; photoURL?: string }; size?: number }) {
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

export default function FriendsPage() {
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

  const [tab, setTab] = useState<'friends' | 'messages'>('friends')
  const [friends, setFriends] = useState<UserProfile[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [convs, setConvs] = useState<Conversation[]>([])
  const [openChat, setOpenChat] = useState<UserProfile | null>(null)

  // Search
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<UserProfile[]>([])
  const [sent, setSent] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return
    void publishProfile(user)
    const u1 = watchFriends(user.uid, setFriends)
    const u2 = watchRequests(user.uid, setRequests)
    const u3 = watchConversations(user.uid, setConvs)
    return () => {
      u1()
      u2()
      u3()
    }
  }, [user])

  useEffect(() => {
    if (!me) return
    const t = setTimeout(async () => setResults(term.trim() ? await searchUsers(term, me.uid) : []), 280)
    return () => clearTimeout(t)
  }, [term, me])

  const friendByUid = useMemo(() => new Map(friends.map((f) => [f.uid, f])), [friends])

  if (!me) return <div className="p-8 text-center text-muted">Sign in to use Friends.</div>

  if (openChat) return <ChatThread me={me} other={openChat} onBack={() => setOpenChat(null)} />

  async function add(p: UserProfile) {
    await sendFriendRequest(me!, p)
    setSent((s) => new Set(s).add(p.uid))
  }

  return (
    <div className={`mx-auto flex h-full w-full max-w-2xl flex-col px-4 pt-5 ${isNative ? 'pb-28' : 'pb-6'}`}>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-2xl font-bold text-ink">Friends</h1>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        {([['friends', 'Friends', Users], ['messages', 'Messages', MessageSquare]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`pressable flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
              tab === id ? 'accent-gradient-bg text-white' : 'border border-line text-muted'
            }`}
          >
            <Icon size={15} /> {label}
            {id === 'messages' && convs.length > 0 && <span className="text-xs">({convs.length})</span>}
          </button>
        ))}
      </div>

      {tab === 'friends' && (
        <div className="flex-1 overflow-y-auto">
          {/* Search */}
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-line bg-card px-3 py-2.5">
            <Search size={16} className="text-muted" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search people by username…"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
          </div>

          {results.length > 0 && (
            <div className="mb-5">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Results</h2>
              {results.map((p) => (
                <Row key={p.uid} p={p}>
                  <button
                    onClick={() => add(p)}
                    disabled={sent.has(p.uid) || !!friendByUid.get(p.uid)}
                    className="pressable flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50"
                  >
                    <UserPlus size={13} /> {friendByUid.get(p.uid) ? 'Friends' : sent.has(p.uid) ? 'Sent' : 'Add'}
                  </button>
                </Row>
              ))}
            </div>
          )}

          {requests.length > 0 && (
            <div className="mb-5">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Requests · {requests.length}</h2>
              {requests.map((r) => (
                <Row key={r.uid} p={r}>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => acceptRequest(me, r)}
                      className="pressable flex h-8 w-8 items-center justify-center rounded-full accent-gradient-bg text-white"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      onClick={() => declineRequest(me.uid, r.uid)}
                      className="pressable flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </Row>
              ))}
            </div>
          )}

          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Your friends · {friends.length}</h2>
          {friends.length === 0 && <p className="py-6 text-center text-sm text-muted">No friends yet — search above to add some.</p>}
          {friends.map((f) => (
            <Row key={f.uid} p={f}>
              <button
                onClick={() => setOpenChat(f)}
                className="pressable flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink"
              >
                <MessageSquare size={13} /> Message
              </button>
            </Row>
          ))}
        </div>
      )}

      {tab === 'messages' && (
        <div className="flex-1 overflow-y-auto">
          {convs.length === 0 && <p className="py-10 text-center text-sm text-muted">No conversations yet.</p>}
          {convs.map((c) => {
            const otherUid = c.participants.find((u) => u !== me.uid) || ''
            const p = friendByUid.get(otherUid) || { uid: otherUid, name: 'User', handle: '' }
            return (
              <button
                key={c.id}
                onClick={() => setOpenChat(p)}
                className="pressable flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-white/5"
              >
                <Avatar p={p} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{p.name}</span>
                  <span className="block truncate text-sm text-muted">{c.last || ''}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
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

function ChatThread({ me, other, onBack }: { me: UserProfile; other: UserProfile; onBack: () => void }) {
  const cid = useMemo(() => convId(me.uid, other.uid), [me.uid, other.uid])
  const [msgs, setMsgs] = useState<DMMessage[]>([])
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => watchMessages(cid, setMsgs), [cid])
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [msgs.length])

  const send = useCallback(async () => {
    const t = text.trim()
    if (!t) return
    setText('')
    await sendMessage(cid, me, other.uid, { text: t })
    void maybeAskAI(cid, msgs, t)
  }, [text, cid, me, other.uid, msgs])

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      const kind = f.type.startsWith('image/') ? 'image' : 'file'
      void sendMessage(cid, me, other.uid, { text: '', kind, url, name: f.name })
    }
    reader.readAsDataURL(f)
    e.target.value = ''
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-3 pt-3">
      <div className="mb-2 flex items-center gap-3 border-b border-line pb-3">
        <button onClick={onBack} className="pressable text-muted">
          <ArrowLeft size={20} />
        </button>
        <Avatar p={other} size={36} />
        <div className="min-w-0">
          <div className="font-semibold text-ink">{other.name}</div>
          <div className="text-xs text-muted">@{other.handle} · tip: type @askai to ask the AI here</div>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto py-2">
        {msgs.map((m) => {
          const mine = m.from === me.uid
          const ai = m.kind === 'ai'
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? 'accent-gradient-bg text-white' : ai ? 'border border-accent/40 bg-accent/10 text-ink' : 'bg-card text-ink'
                }`}
              >
                {ai && (
                  <span className="mb-0.5 flex items-center gap-1 text-[11px] font-bold text-accent">
                    <Bot size={11} /> AskAI
                  </span>
                )}
                {m.kind === 'image' && m.url ? (
                  <img src={m.url} alt={m.name} className="max-h-60 rounded-lg" />
                ) : m.kind === 'file' && m.url ? (
                  <a href={m.url} download={m.name} className="underline">
                    📎 {m.name}
                  </a>
                ) : (
                  <span className="whitespace-pre-wrap break-words">{m.text}</span>
                )}
              </div>
            </motion.div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div className={`flex items-end gap-2 border-t border-line py-3 ${isNative ? 'pb-28' : ''}`}>
        <button onClick={() => fileRef.current?.click()} className="pressable flex h-10 w-10 items-center justify-center rounded-full text-muted">
          <Paperclip size={18} />
        </button>
        <input ref={fileRef} type="file" accept="image/*,*/*" onChange={onFile} className="hidden" />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={1}
          placeholder="Message…  (@askai to ask the AI)"
          className="max-h-28 flex-1 resize-none rounded-2xl border border-line bg-card px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted"
        />
        <button onClick={() => void send()} className="pressable flex h-10 w-10 items-center justify-center rounded-full accent-gradient-bg text-white">
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
