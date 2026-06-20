// A single direct-message conversation, opened by route (/dm/:uid). Used from
// the Home "Messages" list and the Friends list. Real-time text/images/files,
// @askai support, and voice/video call buttons.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Send, Paperclip, Phone, Video, Bot } from 'lucide-react'
import { useStore } from '../store'
import { isNative } from '../lib/native'
import {
  convId,
  watchMessages,
  sendMessage,
  maybeAskAI,
  getProfile,
  type UserProfile,
  type DMMessage,
} from '../lib/friends'

function Avatar({ p, size = 36 }: { p: { name?: string; photoURL?: string }; size?: number }) {
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

export default function DMPage() {
  const navigate = useNavigate()
  const { uid: otherUid = '' } = useParams()
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
  const [other, setOther] = useState<UserProfile>({ uid: otherUid, name: 'User', handle: '' })
  const [msgs, setMsgs] = useState<DMMessage[]>([])
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const cid = useMemo(() => (me ? convId(me.uid, otherUid) : ''), [me, otherUid])

  useEffect(() => {
    getProfile(otherUid).then((p) => p && setOther(p))
  }, [otherUid])
  useEffect(() => (cid ? watchMessages(cid, setMsgs) : undefined), [cid])
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [msgs.length])

  const send = useCallback(async () => {
    const t = text.trim()
    if (!t || !me) return
    setText('')
    await sendMessage(cid, me, otherUid, { text: t })
    void maybeAskAI(cid, msgs, t)
  }, [text, cid, me, otherUid, msgs])

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f || !me) return
    const reader = new FileReader()
    reader.onload = () =>
      void sendMessage(cid, me, otherUid, {
        text: '',
        kind: f.type.startsWith('image/') ? 'image' : 'file',
        url: String(reader.result),
        name: f.name,
      })
    reader.readAsDataURL(f)
    e.target.value = ''
  }

  if (!me) return <div className="p-8 text-center text-muted">Sign in to chat.</div>

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-3 pt-3">
      <div className="mb-2 flex items-center gap-3 border-b border-line pb-3">
        <button onClick={() => navigate(-1)} className="pressable text-muted">
          <ArrowLeft size={20} />
        </button>
        <Avatar p={other} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink">{other.name}</div>
          <div className="text-xs text-muted">@{other.handle} · @askai to ask the AI</div>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('askai-start-call', { detail: { other, kind: 'audio' } }))}
          className="pressable flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-white/10"
        >
          <Phone size={19} />
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('askai-start-call', { detail: { other, kind: 'video' } }))}
          className="pressable flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-white/10"
        >
          <Video size={19} />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto py-2">
        {msgs.map((m) => {
          const mine = m.from === me.uid
          const ai = m.kind === 'ai'
          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
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
        <input ref={fileRef} type="file" onChange={onFile} className="hidden" />
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
          className="max-h-28 flex-1 resize-none rounded-2xl border border-line bg-card px-3 py-2.5 text-sm text-ink placeholder:text-muted"
        />
        <button onClick={() => void send()} className="pressable flex h-10 w-10 items-center justify-center rounded-full accent-gradient-bg text-white">
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
