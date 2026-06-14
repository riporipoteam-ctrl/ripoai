import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check, RefreshCw, Pencil, FileText, Volume2, Square, Bookmark, ArrowUpRight, Wand2 } from 'lucide-react'
import { Markdown } from './Markdown'
import Reasoning from './Reasoning'
import AgentTrace from './AgentTrace'
import AgentBrowserPanel from './AgentBrowserPanel'
import ImageCard from './ImageCard'
import WebImagesCard from './WebImagesCard'
import MapCard from './MapCard'
import WeatherCard from './WeatherCard'
import SlidesCard from './SlidesCard'
import Logo from './Logo'
import { MODELS } from '../lib/models'
import { isSpeechSupported } from '../hooks/useSpeech'
import { speakHQ, stopVoice } from '../lib/voice'
import { parseSkillBlock, saveSkill } from '../lib/skills'
import { useStore } from '../store'
import type { StoredMessage } from '../lib/db'
import type { WebImageResult } from '../lib/webImages'
import type { AgentBrowserState } from '../lib/agentBrowser'

interface Props {
  message: StoredMessage
  streaming?: boolean
  isLastAssistant?: boolean
  onRegenerate?: () => void
  onEdit?: (text: string) => void
  onFollowup?: (text: string) => void
  onToggleBookmark?: () => void
  /** When set, this is a 1-on-1 agent chat — assistant rows show the agent's
   *  avatar + name instead of the generic AskAI mark. */
  agent?: { name: string; emoji: string; color: string; avatar?: string } | null
  onAgentClick?: () => void
}

const THINKING_PHRASES = ['Thinking', 'Reasoning', 'Working on it', 'Putting it together']

function ThinkingIndicator() {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setS((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const phrase = THINKING_PHRASES[Math.min(Math.floor(s / 4), THINKING_PHRASES.length - 1)]
  return (
    <div className="flex items-center gap-2.5 py-2">
      <span className="thinking-orb" aria-hidden />
      <span className="shimmer-text text-sm font-semibold">
        {phrase}
        {s >= 2 ? ` · ${s}s` : '…'}
      </span>
    </div>
  )
}

export default function Message({ message, streaming, isLastAssistant, onRegenerate, onEdit, onFollowup, onToggleBookmark, agent, onAgentClick }: Props) {
  const { user } = useStore()
  const [installedSkill, setInstalledSkill] = useState('')
  const skillFromBlock =
    message.role !== 'user' && /```skill[\s\S]*?```/i.test(message.content)
      ? parseSkillBlock(message.content)
      : null
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const isUser = message.role === 'user'
  const webImages = (
    message as StoredMessage & { webImages?: { query: string; images: WebImageResult[] } }
  ).webImages
  const agentBrowser = (message as StoredMessage & { agentBrowser?: AgentBrowserState }).agentBrowser

  function copy() {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const modelName = message.model ? MODELS[message.model]?.name : undefined
  const liveStreaming = streaming && isLastAssistant
  const emptyStreaming = liveStreaming && !message.content && !message.reasoning && !(message.steps?.length)

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 240, damping: 24 }}
        className="message-row user-message-row flex flex-col items-end gap-2"
        data-no-translate
      >
        {!!message.attachments?.length && (
          <div className="flex max-w-[80%] flex-wrap justify-end gap-2">
            {message.attachments.map((a, i) =>
              a.kind === 'image' && a.url ? (
                <img
                  key={i}
                  src={a.url}
                  alt={a.name}
                  className="h-24 w-24 rounded-2xl border border-white/15 object-cover"
                />
              ) : (
                <div
                  key={i}
                  className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-xs"
                >
                  <FileText size={14} className="text-accent" />
                  <span className="max-w-[160px] truncate">{a.name}</span>
                </div>
              ),
            )}
          </div>
        )}
        {editing ? (
          <div className="w-full max-w-[80%]">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="field resize-none"
              rows={3}
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                className="rounded-xl px-3 py-1.5 text-sm text-muted hover:bg-white/10"
                onClick={() => {
                  setEditing(false)
                  setDraft(message.content)
                }}
              >
                Cancel
              </button>
              <button
                className="accent-gradient-bg rounded-xl px-3 py-1.5 text-sm font-semibold text-white"
                onClick={() => {
                  setEditing(false)
                  onEdit?.(draft)
                }}
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          message.content && (
            <div className="group relative max-w-[82%]">
              <div className="user-bubble whitespace-pre-wrap rounded-[22px] rounded-tr-md bg-gradient-to-br from-[rgb(var(--accent))] to-[rgb(var(--accent)/0.82)] px-4 py-2.5 font-medium text-[rgb(var(--accent-ink))] shadow-[0_8px_22px_-12px_rgb(var(--ink)/0.5)]">
                {message.content}
              </div>
              {onEdit && (
                <button
                  onClick={() => {
                    setDraft(message.content)
                    setEditing(true)
                  }}
                  className="absolute -left-9 top-1.5 rounded-full p-1.5 text-muted opacity-0 transition hover:bg-white/10 hover:text-ink group-hover:opacity-100"
                  title="Edit"
                >
                  <Pencil size={15} />
                </button>
              )}
            </div>
          )
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24 }}
      className={`message-row assistant-message-row flex gap-3 ${message.bookmarked ? 'rounded-2xl border-l-2 border-accent bg-accent/5 py-2 pl-3 pr-2' : ''}`}
      data-no-translate
    >
      <div className="assistant-avatar mt-0.5 shrink-0">
        {agent ? (
          <button
            onClick={onAgentClick}
            className="block overflow-hidden rounded-xl ring-1 ring-[rgb(var(--ink)/0.08)]"
            style={{ boxShadow: `0 4px 12px -6px ${agent.color}` }}
            title={`${agent.name}'s profile`}
          >
            {agent.avatar ? (
              <img src={agent.avatar} alt={agent.name} className="h-8 w-8 object-cover" />
            ) : (
              <span
                className="flex h-8 w-8 items-center justify-center text-lg"
                style={{ background: agent.color + '2a' }}
              >
                {agent.emoji}
              </span>
            )}
          </button>
        ) : (
          <div className="overflow-hidden rounded-xl shadow-[0_4px_12px_-6px_rgb(var(--ink)/0.5)] ring-1 ring-[rgb(var(--ink)/0.08)]">
            <Logo size={32} variant="icon" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="font-display text-sm font-bold tracking-tight">{agent ? agent.name : 'AskAI'}</span>
          {modelName && (
            <span className="rounded-full border border-[rgb(var(--ink)/0.08)] bg-[rgb(var(--ink)/0.04)] px-2 py-0.5 text-[10px] font-semibold text-muted">
              {modelName}
            </span>
          )}
          {liveStreaming && !emptyStreaming && (
            <span className="shimmer-text text-[11px] font-semibold">writing…</span>
          )}
        </div>
        <AgentBrowserPanel browser={agentBrowser} live={liveStreaming && agentBrowser?.status === 'running'} />
        {!!message.steps?.length && (
          <AgentTrace steps={message.steps} live={emptyStreaming} />
        )}
        {emptyStreaming && !message.steps?.length && <ThinkingIndicator />}
        {message.reasoning && <Reasoning text={message.reasoning} live={liveStreaming && !message.content} thinkMs={message.thinkMs} />}
        {message.imagePending && (
          <div className="image-card w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-lg">
            <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
              <span className="text-accent">✦</span> Generating image
              <span className="ml-auto flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.4s]" />
              </span>
            </div>
            <div className="image-stage relative aspect-square w-full overflow-hidden">
              <div className="img-skeleton absolute inset-0">
                <div className="img-shimmer absolute inset-0" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="animate-float text-4xl opacity-70">✦</span>
              </div>
            </div>
            <div className="truncate px-3 py-2 text-xs text-muted">{message.imagePending.prompt}</div>
          </div>
        )}
        {message.skillInstalled && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="mb-2 flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-3"
          >
            <motion.span
              initial={{ rotate: -20, scale: 0.6 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.05 }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl accent-gradient-bg text-white"
            >
              <Wand2 size={20} />
            </motion.span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-bold">
                {message.skillInstalled.name}
                <Check size={15} className="text-accent" />
              </div>
              {message.skillInstalled.description && (
                <div className="truncate text-xs text-muted">{message.skillInstalled.description}</div>
              )}
            </div>
          </motion.div>
        )}
        {message.image && <ImageCard prompt={message.image.prompt} url={message.image.url} />}
        {webImages && <WebImagesCard query={webImages.query} images={webImages.images} />}
        {message.map && <MapCard data={message.map} />}
        {message.weather && <WeatherCard data={message.weather} />}
        {message.deck && <SlidesCard deck={message.deck} />}
        {message.content && (
          <div data-answer className={liveStreaming ? 'stream-caret' : ''}>
            <Markdown>{message.content}</Markdown>
          </div>
        )}
        {skillFromBlock && !liveStreaming && (
          <button
            onClick={() => {
              if (!user) return
              saveSkill(user.uid, skillFromBlock)
              setInstalledSkill(skillFromBlock.name)
            }}
            disabled={!!installedSkill}
            className="pressable mt-3 inline-flex items-center gap-2 rounded-2xl accent-gradient-bg px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
          >
            {installedSkill ? <Check size={16} /> : <Wand2 size={16} />}
            {installedSkill ? `Installed “${installedSkill}” — use /${skillFromBlock.slug}` : `Install skill “${skillFromBlock.name}”`}
          </button>
        )}
        {!liveStreaming && message.content && (
          <div className="action-pill mt-2.5 inline-flex items-center gap-0.5 rounded-full border border-[rgb(var(--ink)/0.07)] bg-[rgb(var(--glass-bg)/0.5)] px-1 py-0.5 backdrop-blur-md">
            <button
              onClick={copy}
              className="pressable flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted hover:bg-[rgb(var(--ink)/0.07)] hover:text-ink"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {isSpeechSupported() && (
              <button
                onClick={() => {
                  if (speaking) {
                    stopVoice()
                    setSpeaking(false)
                  } else {
                    setSpeaking(true)
                    speakHQ(message.content, () => setSpeaking(false))
                  }
                }}
                className="pressable flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted hover:bg-[rgb(var(--ink)/0.07)] hover:text-ink"
              >
                {speaking ? <Square size={13} /> : <Volume2 size={13} />}
                {speaking ? 'Stop' : 'Read'}
              </button>
            )}
            {isLastAssistant && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="pressable flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted hover:bg-[rgb(var(--ink)/0.07)] hover:text-ink"
              >
                <RefreshCw size={13} />
                Regenerate
              </button>
            )}
            {onToggleBookmark && (
              <button
                onClick={onToggleBookmark}
                className={`pressable flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-white/10 ${
                  message.bookmarked ? 'text-accent' : 'text-muted hover:text-ink'
                }`}
                title={message.bookmarked ? 'Saved' : 'Save'}
              >
                <Bookmark size={13} fill={message.bookmarked ? 'currentColor' : 'none'} />
                {message.bookmarked ? 'Saved' : 'Save'}
              </button>
            )}
          </div>
        )}
        {/* Suggested follow-ups */}
        {isLastAssistant && !liveStreaming && !!message.followups?.length && onFollowup && (
          <div className="mt-3 flex flex-col gap-1.5">
            {message.followups.map((f, i) => (
              <button
                key={i}
                onClick={() => onFollowup(f)}
                className="pressable group flex items-center justify-between gap-2 rounded-xl border border-[rgb(var(--ink)/0.08)] bg-[rgb(var(--surface-raised)/0.6)] px-3 py-2 text-left text-sm text-ink/90 hover:border-accent/40 hover:bg-accent/5"
              >
                <span className="min-w-0 truncate">{f}</span>
                <ArrowUpRight size={15} className="shrink-0 text-muted group-hover:text-accent" />
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
