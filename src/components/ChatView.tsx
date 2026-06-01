import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useChat } from '../hooks/useChat'
import { useStore } from '../store'
import Composer from './Composer'
import VoiceCall from './VoiceCall'
import Message from './Message'
import type { ModelTier } from '../lib/models'
import type { Attachment } from '../lib/db'

const SUGGESTIONS = [
  { title: 'Design a landing page', sub: 'for a productivity startup' },
  { title: "What's new in AI", sub: 'this week (uses web search)' },
  { title: 'Explain a hard concept', sub: 'like quantum entanglement, simply' },
  { title: 'Plan a 3-day trip', sub: 'to Tokyo on a budget' },
]

export default function ChatView() {
  const { chatId } = useParams()
  const { settings, user } = useStore()
  const [model, setModel] = useState<ModelTier>(settings.defaultModel)
  const [webSearch, setWebSearch] = useState(false)
  const [agent, setAgent] = useState(false)
  const [voiceCall, setVoiceCall] = useState(false)
  const { messages, streaming, send, stop, regenerate, editAndResend } = useChat(chatId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setModel(settings.defaultModel)
  }, [settings.defaultModel])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' })
  }, [messages, streaming])

  const opts = { model, webSearch, agent }

  function handleSend(text: string, attachments: Attachment[]) {
    send(text, attachments, opts)
  }

  const greeting = settings.displayName || user?.displayName?.split(' ')[0] || 'there'
  const empty = messages.length === 0

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-4">
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center text-3xl font-bold sm:text-4xl"
            >
              <span className="brand-gradient">Hi {greeting}.</span> What should we build?
            </motion.h1>
            <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  onClick={() => handleSend(`${s.title} ${s.sub}`, [])}
                  className="glass pressable rounded-2xl p-4 text-left transition hover:brightness-110"
                >
                  <div className="font-semibold">{s.title}</div>
                  <div className="text-sm text-muted">{s.sub}</div>
                </motion.button>
              ))}
            </div>
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
                />
              )
            })}
            <div ref={bottomRef} className="h-2" />
          </div>
        )}
      </div>

      <div className="px-4 pb-4 pt-2">
        <Composer
          model={model}
          onModelChange={setModel}
          webSearch={webSearch}
          agent={agent}
          onToggleWeb={() => setWebSearch((v) => !v)}
          onToggleAgent={() => setAgent((v) => !v)}
          onSend={handleSend}
          onStop={stop}
          streaming={streaming}
          onVoiceCall={() => setVoiceCall(true)}
        />
      </div>
      <VoiceCall open={voiceCall} onClose={() => setVoiceCall(false)} model={model} />
    </div>
  )
}
