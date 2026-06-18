// Home landing — the first screen when you open AskAI. Fully redesigned:
// a gradient hero mark, a bold welcome, a glowing "New chat" action and a grid
// of quick destinations with gradient icon tiles, hover-lift and a staggered
// entrance. ChatGPT-clean, responsive, all platforms.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  PenSquare,
  Bot,
  CalendarClock,
  Users,
  AppWindow,
  ArrowRight,
  Sparkles,
  MessageSquare,
} from 'lucide-react'
import { useStore } from '../store'
import { isNative } from '../lib/native'
import { watchConversations, watchFriends, type Conversation, type UserProfile } from '../lib/friends'

const CARDS = [
  { to: '/agents', label: 'Agents', desc: 'Your AI team & Chief of Staff', icon: Bot },
  { to: '/jobs', label: 'Jobs', desc: 'Scheduled, recurring tasks', icon: CalendarClock },
  { to: '/friends', label: 'Friends', desc: 'Chat, voice & video call', icon: Users },
  { to: '/apps', label: 'Apps', desc: 'Websites & apps agents build', icon: AppWindow },
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
    <div className={`nb-page h-full w-full overflow-y-auto mx-auto max-w-2xl px-4 pt-9 ${isNative ? 'pb-28' : 'pb-10'}`}>
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 240, damping: 16 }}
          className="nb-orb nb-orb-ring relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] text-white"
        >
          <Sparkles size={30} className="nb-breathe" />
        </motion.div>
        <h1 className="nebula-display text-[1.7rem] font-bold leading-tight text-ink sm:text-4xl">
          {name ? (
            <>
              Welcome back, <span className="nb-grad-text">{name}</span>
            </>
          ) : (
            <>
              Meet <span className="nb-grad-text">AskAI</span>
            </>
          )}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[0.95rem] text-muted">
          Your AI workspace — chat, agents, and a team that works for you.
        </p>
      </motion.div>

      {/* New chat */}
      <motion.button
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => navigate('/chat')}
        className="accent-gradient-bg pressable group mb-7 flex w-full items-center justify-center gap-2.5 rounded-[22px] px-4 py-4 text-base font-bold text-white"
      >
        <PenSquare size={20} /> New chat with AskAI
        <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
      </motion.button>

      {/* Quick cards */}
      <div className="nb-stagger mb-8 grid grid-cols-2 gap-3.5">
        {CARDS.map((c) => (
          <button
            key={c.to}
            onClick={() => navigate(c.to)}
            className="ag-card pressable group flex flex-col items-start gap-2.5 rounded-[20px] border border-line bg-card p-4 text-left"
          >
            <span className="accent-gradient-bg flex h-11 w-11 items-center justify-center rounded-[14px] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
              <c.icon size={21} />
            </span>
            <span className="nebula-display font-bold text-ink">{c.label}</span>
            <span className="text-xs leading-snug text-muted">{c.desc}</span>
          </button>
        ))}
      </div>

      {/* Messages */}
      {user && (
        <div className="mb-6">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Messages</h2>
            <button onClick={() => navigate('/friends')} className="text-xs font-bold text-accent hover:underline">
              Friends
            </button>
          </div>
          {convs.length === 0 && (
            <button
              onClick={() => navigate('/friends')}
              className="ag-card pressable flex w-full items-center gap-3 rounded-[20px] border border-line bg-card px-4 py-4 text-left"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/12 text-accent">
                <MessageSquare size={16} />
              </span>
              <span className="text-sm text-muted">No messages yet — add friends to start chatting, voice & video calling.</span>
            </button>
          )}
          {convs.length > 0 && (
            <div className="flex flex-col divide-y divide-line/60 overflow-hidden rounded-[20px] border border-line bg-card">
              {convs.slice(0, 5).map((c) => {
                const otherUid = c.participants.find((u) => u !== user.uid) || ''
                const p = friendByUid.get(otherUid) || { uid: otherUid, name: 'User', handle: '' }
                return (
                  <button key={c.id} onClick={() => navigate(`/dm/${otherUid}`)} className="pressable flex items-center gap-3 px-4 py-3 text-left">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-sm font-bold text-accent">
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
          <h2 className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-muted">Recent</h2>
          <div className="flex flex-col divide-y divide-line/60 overflow-hidden rounded-[20px] border border-line bg-card">
            {recent.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/c/${c.id}`)}
                className="pressable group flex items-center gap-3 px-4 py-3 text-left"
              >
                <MessageSquare size={16} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.title || 'New chat'}</span>
                <ArrowRight size={15} className="shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-1 group-hover:text-accent" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
