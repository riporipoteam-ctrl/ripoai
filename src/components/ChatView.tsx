import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Palette, Globe, Lightbulb, Plane, PanelLeftOpen, PenSquare, Sparkles, Code2, FileText, MapPin } from 'lucide-react'
import { useChat } from '../hooks/useChat'
import { useStore } from '../store'
import Composer from './Composer'
import VoiceCall from './VoiceCall'
import Message from './Message'
import Logo from './Logo'
import type { ModelTier } from '../lib/models'
import type { Attachment } from '../lib/db'
import { fadeUp, listStagger, scalePop } from '../lib/motion'
import { banActive, todaysMessageCount, bumpMessageCount } from '../lib/admin'

const ALL_SUGGESTIONS = [
  { title: 'Build a 3D website', sub: 'with scroll animations', icon: Palette },
  { title: 'Generate an image', sub: 'of anything you imagine', icon: Sparkles },
  { title: "What's trending today", sub: 'live from the web', icon: Globe },
  { title: 'Explain it simply', sub: 'any hard concept, in plain words', icon: Lightbulb },
  { title: 'Plan a trip', sub: 'tailored to your budget', icon: Plane },
  { title: 'Write & fix code', sub: 'in any language', icon: Code2 },
  { title: 'Summarize a document', sub: 'upload a PDF and ask', icon: FileText },
  { title: 'Find places near me', sub: 'restaurants, shops, more', icon: MapPin },
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

const SUBTITLES = [
  'What are you planning to do today?',
  'What should we build together?',
  'What can I help you with?',
  'Ready when you are — what’s first?',
  "What's on your mind?",
  'Ask me anything, or let’s create something.',
  'Where should we start today?',
  'Got a question, an idea, or a project?',
]

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
    if (user && msgLimit > 0 && todaysMessageCount(user.uid) >= msgLimit) {
      window.alert(`You've reached your daily limit of ${msgLimit} messages. Try again tomorrow.`)
      return
    }
    if (user) bumpMessageCount(user.uid)
    send(text, attachments, opts)
  }

  const greeting = settings.displayName || user?.displayName?.split(' ')[0] || 'there'
  const hour = new Date().getHours()
  const timeGreet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const empty = messages.length === 0
  // Pick a fresh subtitle + suggestion set each time the empty screen appears.
  const subtitle = useMemo(() => SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)], [chatId])
  const suggestions = useMemo(
    () => [...ALL_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 4),
    [chatId],
  )

  return (
    <div className="flex h-full flex-col">
      {/* Top app bar — gives the screen real structure instead of two lonely
          floating icons. Shown when the sidebar is collapsed (i.e. on mobile). */}
      {!sidebarOpen && (
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-white/10 bg-[rgb(var(--glass-bg)/0.32)] px-2.5 py-2 backdrop-blur-2xl backdrop-saturate-150">
          <button
            onClick={toggleSidebar}
            className="pressable rounded-xl p-2 text-ink hover:bg-[rgb(var(--ink)/0.06)]"
            title="Open sidebar"
          >
            <PanelLeftOpen size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Logo size={22} />
            <span className="text-[17px] font-bold tracking-tight brand-gradient">RipoAI</span>
          </div>
          <button
            onClick={() => navigate('/')}
            className="pressable rounded-xl p-2 text-ink hover:bg-[rgb(var(--ink)/0.06)]"
            title="New chat"
          >
            <PenSquare size={20} />
          </button>
        </header>
      )}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        {empty ? (
          <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-4 py-6">
            <div className="pointer-events-none absolute left-1/2 top-[18%] h-64 w-64 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
            <motion.div
              variants={scalePop}
              initial="initial"
              animate="animate"
              className="surface-glow relative animate-float rounded-[1.65rem]"
            >
              <span className="hero-orbit" aria-hidden />
              <Logo size={76} variant="icon" glow />
            </motion.div>
            <motion.div
              variants={fadeUp}
              initial="initial"
              animate="animate"
              className="glass mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.22em] text-muted"
            >
              <Sparkles size={13} className="text-accent" />
              RipoAI Studio
            </motion.div>
            <motion.h1
              variants={fadeUp}
              initial="initial"
              animate="animate"
              className="mt-3 text-center text-3xl font-extrabold tracking-tight sm:text-5xl"
            >
              <span className="brand-gradient">{timeGreet}, {greeting}.</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              initial="initial"
              animate="animate"
              className="mt-3 max-w-xl text-center text-base leading-relaxed text-muted sm:text-lg"
            >
              {subtitle}
            </motion.p>
            <motion.div
              variants={listStagger}
              initial="initial"
              animate="animate"
              className="mt-7 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {suggestions.map((s) => (
                <motion.button
                  key={s.title}
                  variants={fadeUp}
                  whileHover={{ y: -4, scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => handleSend(`${s.title} ${s.sub}`, [])}
                  className="glass suggestion-card pressable group flex items-start gap-3 rounded-3xl p-4 text-left transition hover:brightness-110"
                >
                  <span className="accent-gradient-bg flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg shadow-accent/20 transition group-hover:rotate-3 group-hover:scale-105">
                    <s.icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-sm text-muted">{s.sub}</div>
                  </span>
                </motion.button>
              ))}
            </motion.div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
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
            <div ref={bottomRef} className="h-2" />
          </div>
        )}
      </div>

      <div className="composer-shell relative border-t border-white/15 bg-[rgb(var(--glass-bg)/0.42)] px-3 pt-2.5 pb-[max(env(safe-area-inset-bottom),0.7rem)] backdrop-blur-2xl backdrop-saturate-150 sm:px-4 sm:pb-4">
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
              className="glass-strong absolute -top-6 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full text-ink shadow-lg"
              title="Scroll to bottom"
            >
              <ChevronDown size={18} />
            </motion.button>
          )}
        </AnimatePresence>
        {banned ? (
          <BanBanner ban={ban!} />
        ) : (
          <Composer
            model={model}
            onModelChange={setModel}
            webSearch={webSearch}
            agent={agent}
            imageMode={imageMode}
            onToggleWeb={() => { setWebSearch((v) => !v); setImageMode(false) }}
            onToggleAgent={() => { setAgent((v) => !v); setImageMode(false) }}
            onToggleImage={() => { setImageMode((v) => !v); setWebSearch(false); setAgent(false) }}
            imageStyle={imageStyle}
            onImageStyle={setImageStyle}
            onSend={handleSend}
            onStop={stop}
            streaming={streaming}
            onVoiceCall={() => setVoiceCall(true)}
          />
        )}
      </div>
      <VoiceCall open={voiceCall} onClose={() => setVoiceCall(false)} model={model} />
    </div>
  )
}
