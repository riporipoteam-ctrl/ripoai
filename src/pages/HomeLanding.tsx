// Home landing — the default screen when you open AskAI (matches the sketch):
// a clean welcome, a big "New chat with AskAI" action, and quick cards into
// Agents, Jobs, Friends and Apps. ChatGPT-clean, responsive, all platforms.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PenSquare, Bot, Zap, MessageSquare, LayoutGrid, ArrowRight, Sparkles } from 'lucide-react'
import { useStore } from '../store'
import { isNative } from '../lib/native'
import { watchConversations, watchFriends, type Conversation, type UserProfile } from '../lib/friends'

const CARDS = [
  { to: '/agents', label: 'Agents', desc: 'Your AI team & Chief of Staff', icon: Bot, tint: '#10a37f' },
  { to: '/jobs', label: 'Jobs', desc: 'Scheduled, recurring tasks', icon: Zap, tint: '#f59e0b' },
  { to: '/friends', label: 'Friends', desc: 'Chat, voice & video call', icon: MessageSquare, tint: '#6366f1' },
  { to: '/apps', label: 'Apps', desc: 'Websites & apps agents build', icon: LayoutGrid, tint: '#ec4899' },
]

export default function HomeLanding() {
  const navigate = useNavigate()
  const user = useStore((s) => s.user)
  const chats = useStore((s) => s.chats)
  const name = user?.displayName?.split(' ')[0] || (user?.email ? user.email.split('@')[0] : '')
  const recent = [...(chats || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 4)

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

  return (
    <div className={`h-full w-full overflow-y-auto mx-auto max-w-2xl px-4 pt-8 ${isNative ? 'pb-28' : 'pb-10'}`}>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl accent-gradient-bg text-white shadow-sm">
          <Sparkles size={26} />
        </div>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          {name ? `Welcome back, ${name}` : 'Welcome to AskAI'}
        </h1>
        <p className="mt-1 text-sm text-muted">Your AI workspace — chat, agents, and a team that works for you.</p>
      </motion.div>

      {/* New chat */}
      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        onClick={() => navigate('/chat')}
        className="accent-gradient-bg pressable mb-6 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-bold text-white shadow-sm"
      >
        <PenSquare size={20} /> New chat with AskAI
      </motion.button>

      {/* Quick cards */}
      <div className="mb-7 grid grid-cols-2 gap-3">
        {CARDS.map((c, i) => (
          <motion.button
            key={c.to}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.04 }}
            onClick={() => navigate(c.to)}
            className="group flex flex-col items-start gap-2 rounded-2xl border border-line bg-card p-4 text-left"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: c.tint + '22' }}>
              <c.icon size={20} style={{ color: c.tint }} />
            </span>
            <span className="font-semibold text-ink">{c.label}</span>
            <span className="text-xs text-muted">{c.desc}</span>
          </motion.button>
        ))}
      </div>

      {/* Messages */}
      {user && (
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Messages</h2>
            <button onClick={() => navigate('/friends')} className="text-xs font-semibold text-accent">
              Friends
            </button>
          </div>
          {convs.length === 0 && (
            <button
              onClick={() => navigate('/friends')}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 py-4 text-left"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent">
                <MessageSquare size={16} />
              </span>
              <span className="text-sm text-muted">No messages yet — add friends to start chatting, voice & video calling.</span>
            </button>
          )}
          {convs.length > 0 && (
          <div className="flex flex-col divide-y divide-line/60 rounded-2xl border border-line bg-card">
            {convs.slice(0, 5).map((c) => {
              const otherUid = c.participants.find((u) => u !== user.uid) || ''
              const p = friendByUid.get(otherUid) || { uid: otherUid, name: 'User', handle: '' }
              return (
                <button key={c.id} onClick={() => navigate(`/dm/${otherUid}`)} className="pressable flex items-center gap-3 px-4 py-3 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                    {(p.name || '?').charAt(0).toUpperCase()}
                  </span>
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
      )}

      {/* Recent chats */}
      {recent.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Recent</h2>
          <div className="flex flex-col divide-y divide-line/60 rounded-2xl border border-line bg-card">
            {recent.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/c/${c.id}`)}
                className="pressable flex items-center gap-3 px-4 py-3 text-left"
              >
                <MessageSquare size={16} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.title || 'New chat'}</span>
                <ArrowRight size={15} className="shrink-0 text-muted" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
