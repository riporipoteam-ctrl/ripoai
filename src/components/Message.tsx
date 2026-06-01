import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check, RefreshCw, Pencil, FileText, Volume2, Square } from 'lucide-react'
import { Markdown } from './Markdown'
import Reasoning from './Reasoning'
import AgentTrace from './AgentTrace'
import ImageCard from './ImageCard'
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
}

export default function Message({ message, streaming, isLastAssistant, onRegenerate, onEdit }: Props) {
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
              className="w-full resize-none rounded-2xl border border-white/15 bg-white/5 p-3 outline-none focus:border-accent"
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
              <div className="glass whitespace-pre-wrap rounded-3xl rounded-tr-lg px-4 py-2.5">
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
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
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
        {message.image && <ImageCard prompt={message.image.prompt} url={message.image.url} />}
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
          </div>
        )}
      </div>
    </motion.div>
  )
}
