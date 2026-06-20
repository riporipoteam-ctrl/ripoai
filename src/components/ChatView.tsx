import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
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
  Users,
  Presentation,
  GraduationCap,
} from 'lucide-react'
import { useChat } from '../hooks/useChat'
import InviteAgents from './InviteAgents'
import { useStore } from '../store'
import { useT } from '../lib/i18n'
import { haptic } from '../lib/native'
import Composer from './Composer'
import VoiceCall from './VoiceCall'
import Message from './Message'
import Logo from './Logo'
import AgentProfile from './AgentProfile'
import { Globe2 } from 'lucide-react'
import { agentCanBrowse } from '../lib/agents'
import type { ModelTier } from '../lib/models'
import type { Attachment } from '../lib/db'
import { banActive, todaysMessageCount, bumpMessageCount } from '../lib/admin'
import { wantsImageGeneration } from '../lib/imagegen'
import { wantsWebImageSearch } from '../lib/webImages'
import { mentionedAgents, takePendingAgentChat, peekPendingAgentPrompt, takePendingAgentPrompt, type Agent } from '../lib/agents'
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
  { title: 'Team', sub: 'dispatch your AI agents', icon: Users, prompt: '@Bob get the team to build ' },
  { title: 'Slides', sub: 'instant presentations', icon: Presentation, prompt: 'Make a presentation about ' },
  { title: 'Learn', sub: 'explained step by step', icon: GraduationCap, prompt: 'Teach me, step by step: ' },
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
  const location = useLocation()
  const { settings, user, sidebarOpen, toggleSidebar, banStatus, openSettings } = useStore()
  const t = useT()
  const ban = banStatus?.ban
  const banned = banActive(ban)
  const msgLimit = banStatus?.msgLimit || 0
  const [model, setModel] = useState<ModelTier>(settings.defaultModel)
  const [webSearch, setWebSearch] = useState(false)
  const [agent, setAgent] = useState(false)
  const [imageMode, setImageMode] = useState(false)
  const [imageStyle, setImageStyle] = useState('auto')
  const [voiceCall, setVoiceCall] = useState(false)
  const { messages, streaming, send, stop, regenerate, editAndResend, toggleBookmark, loadedModel, chatAgent } = useChat(chatId)
  // When a 1-on-1 chat is started from the Agents list, the agent is handed off
  // here so this chat is tagged + driven by their persona. Once the chat has a
  // saved agent tag (chatAgent), that becomes the source of truth.
  const [pendingAgent, setPendingAgent] = useState<Agent | null>(null)
  // On every navigation, adopt a fresh agent handoff (if any) and drop any stale
  // one. takePendingAgentChat() CONSUMES the handoff, so opening a plain chat
  // returns null (clearing the banner) while a real handoff returns the agent.
  // Keying on location.key — not chatId — lets the Agents page hand off straight
  // into a specific chat id (the shared room) without a chatId-effect wiping it.
  useEffect(() => {
    setPendingAgent(takePendingAgentChat())
  }, [location.key])
  const activeAgent = chatAgent ?? pendingAgent
  const [profileOpen, setProfileOpen] = useState(false)
  // Per-turn "browse the live web with OpenClaw" toggle, shown in agent chats.
  const [forceBrowse, setForceBrowse] = useState(false)
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

  // The dedicated Search model always runs live web search.
  const searchModel = model === 'ripoai-search'
  const opts = { model, webSearch: webSearch || searchModel, agent, image: imageMode, imageStyle }

  function handleSend(text: string, attachments: Attachment[]) {
    if (banned) return
    // @mention any agent → hand off to the Team room (agents answer there, not
    // in the main chat). The room decides if it's a quick reply or a real build.
    // Skipped inside a 1-on-1 agent chat — the active agent answers here.
    if (user && !activeAgent) {
      const mentions = mentionedAgents(user.uid, text)
      if (mentions.length) {
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
    send(text, attachments, {
      ...opts,
      image: autoWebImages ? false : imageMode || autoImage,
      agentChat: activeAgent ?? undefined,
      forceBrowse: activeAgent && agentCanBrowse(activeAgent) ? forceBrowse : false,
    })
    setForceBrowse(false)
  }

  // Auto-send a goal handed off from the Agents page. We wait until the agent
  // handoff has been applied (activeAgent set) so the reply is agent-led and
  // delegates — then send exactly once. Using handleSend here (not a stale event
  // listener) guarantees the CURRENT activeAgent + options are used.
  const autoSentRef = useRef(false)
  useEffect(() => {
    autoSentRef.current = false
  }, [chatId, location.key])
  useEffect(() => {
    if (autoSentRef.current || banned || streaming) return
    if (!peekPendingAgentPrompt()) return
    if (!activeAgent) return // wait for the handoff so the reply is agent-led
    const prompt = takePendingAgentPrompt()
    if (!prompt) return
    autoSentRef.current = true
    handleSend(prompt, [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgent, chatId, streaming, banned])

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
        <header className="mobile-topbar top-app-bar cg-topbar sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center px-2 py-2">
          <div className="justify-self-start">
            <button
              onClick={toggleSidebar}
              className="pressable cg-iconbtn"
              title="Open sidebar"
            >
              <PanelLeftOpen size={20} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 justify-self-center">
            <Logo size={20} variant="icon" />
            <span className="text-[15px] font-semibold tracking-tight">AskAI</span>
          </div>
          <div className="justify-self-end">
            <button
              onClick={() => navigate('/')}
              className="pressable cg-iconbtn"
              title="New chat"
            >
              <PenSquare size={20} />
            </button>
          </div>
        </header>
      )}
      {/* 1-on-1 agent chat header — a modern, tappable bar with the agent's
          avatar, name, role and live status. Tapping it opens the profile. */}
      {activeAgent && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]">
          <button
            onClick={() => setProfileOpen(true)}
            className="glass-strong pressable pointer-events-auto flex max-w-[92%] items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-sm shadow-sm"
            style={{ boxShadow: `0 0 0 1px ${activeAgent.color}44` }}
            title={`View ${activeAgent.name}'s profile`}
          >
            <span className="relative shrink-0">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-base"
                style={{ background: `linear-gradient(135deg, ${activeAgent.color}3a, ${activeAgent.color}14)` }}
              >
                {activeAgent.emoji}
              </span>
              {/* online dot */}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[rgb(var(--surface))] bg-emerald-400" />
            </span>
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-bold">{activeAgent.name}</span>
                {activeAgent.role && <span className="truncate text-xs font-medium text-muted">{activeAgent.role}</span>}
              </span>
              <span className="text-[11px] font-semibold text-emerald-400">
                {streaming ? (
                  <span className="flex items-center gap-1 text-accent">
                    <span className="typing-dots flex gap-0.5">
                      <span className="h-1 w-1 animate-pulse-dot rounded-full bg-accent" />
                      <span className="h-1 w-1 animate-pulse-dot rounded-full bg-accent [animation-delay:150ms]" />
                      <span className="h-1 w-1 animate-pulse-dot rounded-full bg-accent [animation-delay:300ms]" />
                    </span>
                    typing…
                  </span>
                ) : agentCanBrowse(activeAgent) ? (
                  <span className="flex items-center gap-1">
                    <Globe2 size={11} /> Online · can browse
                  </span>
                ) : (
                  'Online'
                )}
              </span>
            </span>
          </button>
          <div className="pointer-events-auto ml-2">
            <InviteAgents lead={activeAgent} />
          </div>
        </div>
      )}
      <div ref={scrollRef} onScroll={onScroll} className="chat-scroll absolute inset-0 overflow-y-auto">
        {empty && activeAgent ? (
          <div
            className={`empty-state relative flex h-full flex-col items-center justify-center px-4 pb-6 ${
              sidebarOpen ? 'pt-6' : 'pt-[calc(env(safe-area-inset-top,0px)+5.5rem)]'
            }`}
          >
            <motion.button
              initial={{ opacity: 0, scale: 0.88, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              onClick={() => setProfileOpen(true)}
              className="relative"
              title={`View ${activeAgent.name}'s profile`}
            >
              <span
                className="pointer-events-none absolute inset-0 -z-10 -m-6 rounded-full blur-3xl"
                style={{ background: activeAgent.color + '22' }}
              />
              <span
                className="animate-float flex h-24 w-24 items-center justify-center rounded-[1.7rem] text-5xl"
                style={{ background: `linear-gradient(135deg, ${activeAgent.color}4a, ${activeAgent.color}18)`, boxShadow: `0 0 0 2px ${activeAgent.color}55` }}
              >
                {activeAgent.emoji}
              </span>
            </motion.button>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="mt-5 text-center text-[1.6rem] font-extrabold leading-tight tracking-tight sm:text-3xl"
            >
              {activeAgent.name}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.14 }}
              className="mt-1 max-w-md text-center text-sm text-muted"
            >
              {activeAgent.role ? `Your ${activeAgent.role}` : 'Your AI agent'}
              {agentCanBrowse(activeAgent) && ' · can browse the live web'}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-5 flex max-w-md flex-wrap justify-center gap-2"
            >
              {(agentCanBrowse(activeAgent)
                ? [
                    `What can you help me with, ${activeAgent.name}?`,
                    'Research the latest on ',
                    "Find me the best ",
                  ]
                : [
                    `What can you help me with, ${activeAgent.name}?`,
                    'Give me a few ideas for ',
                    'Help me with ',
                  ]
              ).map((chip) => (
                <button
                  key={chip}
                  onClick={() => {
                    if (chip.endsWith(' ')) {
                      // a starter prompt the user completes — drop it in the composer
                      window.dispatchEvent(new CustomEvent('askai-prefill', { detail: chip }))
                    } else {
                      handleSend(chip, [])
                    }
                  }}
                  className="pressable rounded-full border border-[rgb(var(--line))] bg-[rgb(var(--surface))] px-3.5 py-2 text-xs font-semibold text-ink hover:bg-[rgb(var(--ink)/0.06)] dark:bg-[rgb(var(--surface-raised))]"
                >
                  {chip.trim()}
                </button>
              ))}
            </motion.div>
          </div>
        ) : empty ? (
          <div
            className={`empty-state relative flex h-full flex-col items-center justify-center px-4 pb-6 ${
              sidebarOpen ? 'pt-6' : 'pt-[calc(env(safe-area-inset-top,0px)+4.5rem)]'
            }`}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 16 }}
              className="home-mark nb-orb nb-orb-ring relative flex h-16 w-16 items-center justify-center rounded-[20px] text-white"
            >
              <Sparkles size={30} className="nb-breathe" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.3 }}
              className="nebula-display mt-5 text-center text-[1.6rem] font-bold leading-tight tracking-tight sm:text-[2rem]"
            >
              {(() => {
                const name = (settings.displayName || user?.displayName || '').split(' ')[0]
                return name ? (
                  <>
                    {name}, <span className="nb-grad-text">{t('What are we making?')}</span>
                  </>
                ) : (
                  <span className="nb-grad-text">{t('What can I help with?')}</span>
                )
              })()}
            </motion.h1>

            {/* Quick-start suggestions — tap to drop a starter into the composer */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="mt-7 grid w-full max-w-md grid-cols-2 gap-2.5 sm:gap-3"
            >
              {suggestions.map((s, i) => (
                <motion.button
                  key={s.title}
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 240, damping: 20 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    haptic('light')
                    if (s.prompt.endsWith(' ')) {
                      window.dispatchEvent(new CustomEvent('askai-prefill', { detail: s.prompt }))
                    } else {
                      handleSend(s.prompt, [])
                    }
                  }}
                  className="ag-card pressable group flex items-start gap-2.5 rounded-2xl border border-line bg-card/70 p-3 text-left backdrop-blur-sm"
                >
                  <span className="accent-gradient-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
                    <s.icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold leading-tight text-ink">{s.title}</span>
                    <span className="block text-[11px] leading-snug text-muted">{s.sub}</span>
                  </span>
                </motion.button>
              ))}
            </motion.div>
          </div>
        ) : (
          /* Extra top clearance when the floating top bar overlays the scroll
             area — otherwise the first message + AskAI logo hide under it. */
          <div className={`chat-thread cg-thread space-y-7 px-4 pb-44 sm:pb-48 ${sidebarOpen ? 'pt-6' : 'pt-[calc(env(safe-area-inset-top,0px)+4.75rem)]'}`}>
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
                    agent={
                      m.agentName
                        ? { name: m.agentName, emoji: m.agentEmoji ?? '🤖', color: m.agentColor ?? '#6366f1' }
                        : (activeAgent ?? undefined)
                    }
                    onAgentClick={() => setProfileOpen(true)}
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
              browseEnabled={!!activeAgent && agentCanBrowse(activeAgent)}
              browseActive={forceBrowse}
              onToggleBrowse={() => setForceBrowse((v) => !v)}
            />
          </div>
        )}
      </div>
      <VoiceCall open={voiceCall} onClose={() => setVoiceCall(false)} model={model} />
      <AgentProfile
        open={profileOpen}
        agent={activeAgent}
        onClose={() => setProfileOpen(false)}
        onChat={() => {
          // Already in a 1-on-1 chat with this agent — just close the profile.
          setProfileOpen(false)
        }}
        onEdit={() => {
          setProfileOpen(false)
          openSettings()
        }}
      />
    </div>
  )
}
