import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { streamChat, complete, type ChatMessage, type ContentPart } from '../lib/groq'
import { getModel, type ModelTier } from '../lib/models'
import { buildSystemPrompt, AGENT_SYSTEM } from '../lib/prompt'
import { searchModel, shouldAutoSearch } from '../lib/search'
import { extractMemories } from '../lib/memory'
import { useStore } from '../store'
import {
  loadChat,
  saveChat,
  type Attachment,
  type Chat,
  type StoredMessage,
} from '../lib/db'

export interface SendOptions {
  model: ModelTier
  webSearch: boolean
  agent: boolean
  projectId?: string
  /** Override system prompt (used by Projects coding agent). */
  systemOverride?: string
}

const uid4 = () => crypto.randomUUID()

// Keep the prompt within free-tier token limits: send only the most recent
// messages that fit a rough character budget (~4 chars/token), always keeping
// the latest user turn.
function trimHistory(messages: StoredMessage[], maxChars = 9000): StoredMessage[] {
  const out: StoredMessage[] = []
  let total = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const len = messages[i].content.length + 16
    if (out.length && total + len > maxChars) break
    out.unshift(messages[i])
    total += len
  }
  return out
}

function toGroqMessages(
  messages: StoredMessage[],
  visionCapable: boolean,
): ChatMessage[] {
  return messages.map((m) => {
    let text = m.content
    const images = (m.attachments ?? []).filter((a) => a.kind === 'image' && a.url)
    const files = (m.attachments ?? []).filter((a) => a.kind === 'file' && a.text)
    if (files.length) {
      text +=
        '\n\n' +
        files
          .map((f) => `[Attached file: ${f.name}]\n${f.text?.slice(0, 4000)}`)
          .join('\n\n')
    }
    if (m.role === 'user' && visionCapable && images.length) {
      const parts: ContentPart[] = [{ type: 'text', text }]
      for (const img of images) parts.push({ type: 'image_url', image_url: { url: img.url! } })
      return { role: 'user', content: parts }
    }
    if (m.role === 'user' && images.length && !visionCapable) {
      text += `\n\n[User attached ${images.length} image(s); current model can't view images — switch to a 2o model for vision.]`
    }
    return { role: m.role, content: text }
  })
}

export function useChat(chatId: string | undefined) {
  const navigate = useNavigate()
  const { user, settings, memories, refreshMemories } = useStore()
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [steps, setSteps] = useState<{ type: string; detail?: string }[]>([])
  const loadedId = useRef<string | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)
  const titleRef = useRef<string>('New chat')
  const modelRef = useRef<ModelTier>(settings.defaultModel)

  // Load (or reset) when the active chat id changes.
  useEffect(() => {
    if (chatId === loadedId.current) return
    if (!chatId) {
      loadedId.current = undefined
      titleRef.current = 'New chat'
      setMessages([])
      setSteps([])
      return
    }
    if (!user) return
    loadedId.current = chatId
    loadChat(user.uid, chatId)
      .then((c) => {
        if (loadedId.current !== chatId) return
        if (c) {
          setMessages(c.messages)
          titleRef.current = c.title
          modelRef.current = c.model
        }
      })
      .catch(() => {
        /* read failed (rules/offline) — start empty rather than crash */
      })
  }, [chatId, user])

  const persist = useCallback(
    async (msgs: StoredMessage[], id: string, model: ModelTier, projectId?: string) => {
      if (!user) return
      const existing = messages.length
      const chat: Chat = {
        id,
        title: titleRef.current,
        model,
        messages: msgs,
        projectId,
        updatedAt: Date.now(),
        createdAt: existing ? Date.now() : Date.now(),
      }
      await saveChat(user.uid, chat)
    },
    [user, messages.length],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }, [])

  const run = useCallback(
    async (history: StoredMessage[], opts: SendOptions, id: string) => {
      if (!user) return
      const model = getModel(opts.model)
      const useCompound = opts.agent || opts.webSearch || (!opts.webSearch && shouldAutoSearch(history[history.length - 1]?.content ?? ''))

      const groqModel = opts.agent || opts.webSearch || useCompound ? searchModel() : model.groqModel
      const visionCapable = model.vision
      const usingCompound = groqModel === searchModel()
      // compound (web search/agent) does NOT support reasoning_effort.
      const reasoningEffort = usingCompound ? undefined : model.reasoningEffort

      const system =
        opts.systemOverride ??
        (opts.agent
          ? AGENT_SYSTEM + '\n\n' + buildSystemPrompt(model, settings, memories)
          : buildSystemPrompt(model, settings, memories))

      const groqMessages: ChatMessage[] = [
        { role: 'system', content: system },
        ...toGroqMessages(trimHistory(history), visionCapable),
      ]

      const assistantId = uid4()
      setMessages((m) => [
        ...m,
        { id: assistantId, role: 'assistant', content: '', reasoning: '', model: opts.model, steps: [], createdAt: Date.now() },
      ])
      setSteps([])
      setStreaming(true)

      const ac = new AbortController()
      abortRef.current = ac
      const localSteps: { type: string; detail?: string }[] = []

      let finalContent = ''
      let finalReasoning = ''
      try {
        const res = await streamChat({
          model: groqModel,
          messages: groqMessages,
          temperature: model.temperature,
          maxTokens: model.maxTokens,
          topP: model.topP,
          reasoningEffort: reasoningEffort,
          signal: ac.signal,
          onToken: (delta) =>
            setMessages((m) =>
              m.map((x) => (x.id === assistantId ? { ...x, content: x.content + delta } : x)),
            ),
          onReasoning: (delta) =>
            setMessages((m) =>
              m.map((x) =>
                x.id === assistantId ? { ...x, reasoning: (x.reasoning ?? '') + delta } : x,
              ),
            ),
          onTool: (info) => {
            localSteps.push(info)
            setSteps([...localSteps])
            setMessages((m) =>
              m.map((x) => (x.id === assistantId ? { ...x, steps: [...localSteps] } : x)),
            )
          },
        })
        finalContent = res.content
        finalReasoning = res.reasoning
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // keep whatever streamed so far
        } else {
          setMessages((m) =>
            m.map((x) =>
              x.id === assistantId
                ? { ...x, content: x.content || `⚠️ ${err?.message ?? 'Something went wrong.'}` }
                : x,
            ),
          )
        }
      } finally {
        setStreaming(false)
        abortRef.current = null
      }

      // Snapshot final messages for persistence.
      let finalMsgs: StoredMessage[] = []
      setMessages((m) => {
        finalMsgs = m
        return m
      })
      await new Promise((r) => setTimeout(r, 0))

      // Generate a title from the first exchange.
      const isFirst = history.length <= 1
      if (isFirst && titleRef.current === 'New chat') {
        try {
          const title = await complete(
            'llama-3.1-8b-instant',
            [
              {
                role: 'user',
                content: `Write a 3-5 word title (no quotes, no punctuation at end) for a chat that starts with: "${history[history.length - 1]?.content?.slice(0, 300)}"`,
              },
            ],
            { temperature: 0.3, maxTokens: 24 },
          )
          if (title) titleRef.current = title.replace(/["']/g, '').slice(0, 60)
        } catch {
          titleRef.current = (history[history.length - 1]?.content ?? 'New chat').slice(0, 40)
        }
      }

      await persist(finalMsgs, id, opts.model, opts.projectId)

      // Memory extraction (non-blocking-ish).
      if (settings.memoryEnabled && finalContent && !opts.projectId) {
        extractMemories(
          user.uid,
          history[history.length - 1]?.content ?? '',
          finalContent,
          memories,
        )
          .then((created) => {
            if (created.length) refreshMemories()
          })
          .catch(() => {})
      }
      void finalReasoning
    },
    [user, settings, memories, persist, refreshMemories],
  )

  const send = useCallback(
    async (text: string, attachments: Attachment[], opts: SendOptions) => {
      if (!user || (!text.trim() && attachments.length === 0) || streaming) return
      modelRef.current = opts.model

      let id = chatId
      if (!id) {
        id = uid4()
        loadedId.current = id
        navigate(`/c/${id}`, { replace: true })
      }

      const userMsg: StoredMessage = {
        id: uid4(),
        role: 'user',
        content: text.trim(),
        attachments: attachments.length ? attachments : undefined,
        createdAt: Date.now(),
      }
      const history = [...messages, userMsg]
      setMessages(history)
      await run(history, { ...opts }, id)
    },
    [user, streaming, chatId, messages, navigate, run],
  )

  const regenerate = useCallback(
    async (opts: SendOptions) => {
      if (!user || streaming || !chatId) return
      // Drop trailing assistant message(s) and rerun from last user turn.
      let trimmed = [...messages]
      while (trimmed.length && trimmed[trimmed.length - 1].role === 'assistant') trimmed.pop()
      if (!trimmed.length) return
      setMessages(trimmed)
      await run(trimmed, opts, chatId)
    },
    [user, streaming, chatId, messages, run],
  )

  const editAndResend = useCallback(
    async (messageId: string, newText: string, opts: SendOptions) => {
      if (!user || streaming || !chatId) return
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return
      const edited = [...messages.slice(0, idx), { ...messages[idx], content: newText }]
      setMessages(edited)
      await run(edited, opts, chatId)
    },
    [user, streaming, chatId, messages, run],
  )

  return { messages, streaming, steps, send, stop, regenerate, editAndResend }
}
