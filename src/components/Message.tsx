import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check, RefreshCw, Pencil, FileText, Volume2, Square, Bookmark, ArrowUpRight } from 'lucide-react'
import { Markdown } from './Markdown'
import Reasoning from './Reasoning'
import AgentTrace from './AgentTrace'
import ImageCard from './ImageCard'
import MapCard from './MapCard'
import WeatherCard from './WeatherCard'
import SlidesCard from './SlidesCard'
import Logo from './Logo'
import { MODELS } from '../lib/models'
import { speak, stopSpeaking, isSpeechSupported } from '../hooks/useSpeech'
import type { StoredMessage } from '../lib/db'

interface Props {
  message: StoredMessage
  streaming?: boolean
  isLastAssistant?: boolean
  onRegenerate?: () => void
  onEdit?: (text: string) => void
  onFollowup?: (text: string) => void
  onToggleBookmark?: () => void
}

export default function Message({ message, streaming, isLastAssistant, onRegenerate, onEdit, onFollowup, onToggleBookmark }: Props) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const isUser = message.role === 'user'

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
        className="flex flex-col items-end gap-2"
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
            <div className="group relative max-w-[80%]">
              <div className="whitespace-pre-wrap rounded-3xl rounded-tr-lg border border-[rgb(var(--accent)/0.18)] bg-[rgb(var(--accent)/0.1)] px-4 py-2.5 text-ink">
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
      className={`flex gap-3 ${message.bookmarked ? 'rounded-2xl border-l-2 border-accent bg-accent/5 py-2 pl-3 pr-2' : ''}`}
    >
      <div className="mt-0.5 shrink-0">
        <Logo size={32} />
      </div>
      <div className="min-w-0 flex-1">
        {modelName && <div className="mb-1 text-xs font-semibold text-muted">{modelName}</div>}
        {!!message.steps?.length && <AgentTrace steps={message.steps} live={emptyStreaming} />}
        {emptyStreaming && !message.steps?.length && (
          <div className="flex items-center gap-1.5 py-2 text-muted">
            <span className="h-2 w-2 animate-pulse-dot rounded-full bg-accent" />
            <span className="h-2 w-2 animate-pulse-dot rounded-full bg-accent [animation-delay:0.2s]" />
            <span className="h-2 w-2 animate-pulse-dot rounded-full bg-accent [animation-delay:0.4s]" />
          </div>
        )}
        {message.reasoning && <Reasoning text={message.reasoning} live={liveStreaming && !message.content} />}
        {message.imagePending && (
          <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-lg">
            <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
              <span className="text-accent">✦</span> Generating image
              <span className="ml-auto flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.4s]" />
              </span>
            </div>
            <div className="relative aspect-square w-full">
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
        {message.image && <ImageCard prompt={message.image.prompt} url={message.image.url} />}
        {message.map && <MapCard data={message.map} />}
        {message.weather && <WeatherCard data={message.weather} />}
        {message.deck && <SlidesCard deck={message.deck} />}
        {message.content && (
          <div className={liveStreaming ? 'stream-caret' : ''}>
            <Markdown>{message.content}</Markdown>
          </div>
        )}
        {!liveStreaming && message.content && (
          <div className="mt-2 flex items-center gap-1">
            <button
              onClick={copy}
              className="pressable flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-white/10 hover:text-ink"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {isSpeechSupported() && (
              <button
                onClick={() => {
                  if (speaking) {
                    stopSpeaking()
                    setSpeaking(false)
                  } else {
                    setSpeaking(true)
                    speak(message.content, () => setSpeaking(false))
                  }
                }}
                className="pressable flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-white/10 hover:text-ink"
              >
                {speaking ? <Square size={13} /> : <Volume2 size={13} />}
                {speaking ? 'Stop' : 'Read'}
              </button>
            )}
            {isLastAssistant && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="pressable flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-white/10 hover:text-ink"
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
