import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  Plane,
  PanelLeftOpen,
  PenSquare,
  Sparkles,
  Code2,
  FileText,
  MapPin,
  Images,
  Search,
  Zap,
} from 'lucide-react'
import { useChat } from '../hooks/useChat'
import { useStore } from '../store'
import Composer from './Composer'
import VoiceCall from './VoiceCall'
import Message from './Message'
import Logo from './Logo'
import type { ModelTier } from '../lib/models'
import type { Attachment } from '../lib/db'
import { banActive, todaysMessageCount, bumpMessageCount } from '../lib/admin'
import { wantsImageGeneration } from '../lib/imagegen'
import { wantsWebImageSearch } from '../lib/webImages'
import { mentionedAgents, wantsTeamDispatch } from '../lib/agents'
import { dispatchTeam } from '../pages/TeamPage'

const ALL_SUGGESTIONS = [
  { title: 'Images', sub: 'find web photos with sources', icon: Images, prompt: 'Find web images with sources for ' },
  { title: 'Create', sub: 'generate polished visuals', icon: Sparkles, prompt: 'Generate an image of ' },
  { title: 'Search', sub: 'research the live web', icon: Search, prompt: 'Search the web for ' },
  { title: 'Build', sub: 'apps, sites, and code', icon: Code2, prompt: 'Build a 3D website with scroll animations for ' },
  { title: 'Places', sub: 'maps and nearby spots', icon: MapPin, prompt: 'Find places near me for ' },
  { title: 'Trips', sub: 'routes and budgets', icon: Plane, prompt: 'Plan a trip to ' },
  { title: 'Files', sub: 'summaries and answers', icon: FileText, prompt: 'Summarize this document and pull out the key points.' },
  { title: 'Fast', sub: 'short direct answer', icon: Zap, prompt: 'Give me a fast answer for ' },
]

function BanBanner({ ban }: { ban: { until: number; reason: string } }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!ban.until) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [ban.until])
  let left = ''
  if (ban.until) {
    const d = Math.max(0, ban.until - Date.now())
    const days = Math.floor(d / 86400e3)
    const h = Math.floor((d % 86400e3) / 3600e3)
    const m = Math.floor((d % 3600e3) / 60e3)
    const s = Math.floor((d % 60e3) / 1000)
    left = days ? `${days}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`
  }
  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-center">
      <div className="font-bold text-red-400">You're banned from messaging</div>
      <div className="mt-1 text-sm text-ink/80">Reason: {ban.reason}</div>
      <div className="mt-1 text-sm text-muted">
        {ban.until ? <>Time left: <span className="font-semibold tabular-nums">{left}</span></> : 'This is a permanent ban.'}
      </div>
      <div className="mt-2 text-xs text-muted">You can still read your past messages.</div>
    </div>
  )
}

export default function ChatView() {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const { settings, user, sidebarOpen, toggleSidebar, banStatus } = useStore()
  const ban = banStatus?.ban
  const banned = banActive(ban)
  const msgLimit = banStatus?.msgLimit || 0
  const [model, setModel] = useState<ModelTier>(settings.defaultModel)
  const [webSearch, setWebSearch] = useState(false)
  const [agent, setAgent] = useState(false)
  const [imageMode, setImageMode] = useState(false)
  const [imageStyle, setImageStyle] = useState('auto')
  const [voiceCall, setVoiceCall] = useState(false)
  const { messages, streaming, send, stop, regenerate, editAndResend, toggleBookmark, loadedModel } = useChat(chatId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)

  useEffect(() => {
    setModel(settings.defaultModel)
  }, [settings.defaultModel])

  // Per-chat model memory: when a saved chat loads, restore the model it used.
  useEffect(() => {
    if (loadedModel) setModel(loadedModel)
  }, [loadedModel])

  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' })
  }, [messages, streaming, atBottom])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120)
  }

  const opts = { model, webSearch, agent, image: imageMode, imageStyle }

  function handleSend(text: string, attachments: Attachment[]) {
    if (banned) return
    // @mention an agent (and ask to dispatch the team) → hand off to the Team room.
    if (user) {
      const mentions = mentionedAgents(user.uid, text)
      if (mentions.length && wantsTeamDispatch(text)) {
        dispatchTeam(text, mentions[0].id)
        navigate('/team')
        return
      }
    }
    if (user && msgLimit > 0 && todaysMessageCount(user.uid) >= msgLimit) {
      window.alert(`You've reached your daily limit of ${msgLimit} messages. Try again tomorrow.`)
      return
    }
    if (user) bumpMessageCount(user.uid)
    const autoWebImages = wantsWebImageSearch(text)
    const autoImage = !imageMode && !autoWebImages && wantsImageGeneration(text)
    if (autoWebImages && imageMode) setImageMode(false)
    if (autoImage) setImageMode(true)
    send(text, attachments, { ...opts, image: autoWebImages ? false : imageMode || autoImage })
  }

  const empty = messages.length === 0
  const suggestions = useMemo(
    () => [...ALL_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 4),
    [chatId],
  )

  return (
    <div className="chat-stage relative h-full overflow-hidden">
      {/* Top app bar — gives the screen real structure instead of two lonely
          floating icons. Shown when the sidebar is collapsed (i.e. on mobile). */}
      {!sidebarOpen && (
        <header className="mobile-topbar top-app-bar sticky top-0 z-20 flex items-center justify-between gap-2 px-2.5 py-2">
          <button
            onClick={toggleSidebar}
            className="pressable glass-control rounded-xl p-2 text-ink"
            title="Open sidebar"
          >
            <PanelLeftOpen size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Logo size={22} />
            <span className="text-[17px] font-bold tracking-tight brand-gradient">AskAI</span>
          </div>
          <button
            onClick={() => navigate('/')}
            className="pressable glass-control rounded-xl p-2 text-ink"
            title="New chat"
          >
            <PenSquare size={20} />
          </button>
        </header>
      )}
      <div ref={scrollRef} onScroll={onScroll} className="chat-scroll absolute inset-0 overflow-y-auto">
        {empty ? (
          <div className="empty-state relative flex h-full flex-col items-center justify-center px-4 py-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18 }}
              className="home-mark animate-float"
            >
              <Logo size={82} variant="icon" glow />
            </motion.div>
            <div className="empty-suggestions mt-6 grid w-full max-w-2xl grid-cols-2 gap-2.5 sm:gap-3">
              {suggestions.map((s, i) => (
                <motion.button
                  key={s.title}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  whileHover={{ y: -4, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSend(s.prompt, [])}
                  className="suggestion-card launch-card glass pressable flex min-h-[92px] items-start gap-3 rounded-[22px] p-3.5 text-left transition hover:brightness-110 sm:min-h-[104px] sm:p-4"
                >
                  <span className="launch-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                    <s.icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <div className="text-[15px] font-bold">{s.title}</div>
                    <div className="mt-0.5 text-xs leading-snug text-muted sm:text-sm">{s.sub}</div>
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-thread mx-auto w-full max-w-3xl space-y-6 px-4 pb-44 pt-6 sm:pb-48">
            <AnimatePresence initial={false}>
              {messages.map((m, i) => {
                const isLastAssistant =
                  m.role === 'assistant' && i === messages.length - 1
                return (
                  <Message
                    key={m.id}
                    message={m}
                    streaming={streaming}
                    isLastAssistant={isLastAssistant}
                    onRegenerate={isLastAssistant && !streaming ? () => regenerate(opts) : undefined}
                    onEdit={
                      m.role === 'user' && !streaming
                        ? (text) => editAndResend(m.id, text, opts)
                        : undefined
                    }
                    onFollowup={!streaming ? (text) => handleSend(text, []) : undefined}
                    onToggleBookmark={
                      m.role === 'assistant' && m.content && !streaming
                        ? () => toggleBookmark(m.id)
                        : undefined
                    }
                  />
                )
              })}
            </AnimatePresence>
            <div ref={bottomRef} className="h-2" />
          </div>
        )}
      </div>

      <div className="composer-dock pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pt-8 pb-[max(env(safe-area-inset-bottom),0.7rem)] sm:px-4 sm:pb-4">
        <AnimatePresence>
          {!empty && !atBottom && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 8 }}
              onClick={() => {
                setAtBottom(true)
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="glass-strong pointer-events-auto absolute -top-6 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full text-ink shadow-lg"
              title="Scroll to bottom"
            >
              <ChevronDown size={18} />
            </motion.button>
          )}
        </AnimatePresence>
        {banned ? (
          <BanBanner ban={ban!} />
        ) : (
          <div className="pointer-events-auto">
            <Composer
              model={model}
              onModelChange={setModel}
              webSearch={webSearch}
              agent={agent}
              imageMode={imageMode}
              onToggleWeb={() => { setWebSearch((v) => !v); setAgent(false); setImageMode(false) }}
              onToggleAgent={() => { setAgent((v) => !v); setWebSearch(false); setImageMode(false) }}
              onToggleImage={() => { setImageMode((v) => !v); setWebSearch(false); setAgent(false) }}
              imageStyle={imageStyle}
              onImageStyle={setImageStyle}
              onSend={handleSend}
              onStop={stop}
              streaming={streaming}
              onVoiceCall={() => setVoiceCall(true)}
              onTeam={(text) => {
                if (text.trim()) dispatchTeam(text)
                navigate('/team')
              }}
            />
          </div>
        )}
      </div>
      <VoiceCall open={voiceCall} onClose={() => setVoiceCall(false)} model={model} />
    </div>
  )
}
