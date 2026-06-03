import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { streamChat, complete, type ChatMessage, type ContentPart } from '../lib/groq'
import { imageUrl, styleSuffix } from '../lib/imagegen'
import { composeTextOnImage } from '../lib/compose'
import { wantsPlaces, searchPlaces, getUserLocation } from '../lib/places'
import { wantsWeather, getWeather } from '../lib/weather'
import { wantsCurrency, convertCurrency } from '../lib/currency'
import { wantsDefine, getDefinition, wantsWiki, getWiki, wantsUnits, convertUnits } from '../lib/tools'
import { streamPuter } from '../lib/puter'
import { wantsSlides, generateDeck } from '../lib/slides'
import { getModel, type ModelTier } from '../lib/models'
import { buildSystemPrompt, AGENT_SYSTEM } from '../lib/prompt'
import { searchModel, shouldAutoSearch } from '../lib/search'
import { extractMemories } from '../lib/memory'
import { haptic } from './useSpeech'
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
  image?: boolean
  imageStyle?: string
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
  const createdAtRef = useRef<number>(0)

  // Load (or reset) when the active chat id changes.
  useEffect(() => {
    if (chatId === loadedId.current) return
    if (!chatId) {
      loadedId.current = undefined
      titleRef.current = 'New chat'
      createdAtRef.current = 0
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
          createdAtRef.current = c.createdAt || Date.now()
        }
      })
      .catch(() => {
        /* read failed (rules/offline) — start empty rather than crash */
      })
  }, [chatId, user])

  const persist = useCallback(
    async (msgs: StoredMessage[], id: string, model: ModelTier, projectId?: string) => {
      if (!user) return
      if (!createdAtRef.current) createdAtRef.current = Date.now()
      // Until the AI generates a title, fall back to the first user message so
      // the sidebar never shows a blank/"New chat" placeholder for a real chat.
      let title = titleRef.current
      if (title === 'New chat') {
        const firstUser = msgs.find((m) => m.role === 'user')?.content?.trim()
        if (firstUser) title = firstUser.slice(0, 60)
      }
      const chat: Chat = {
        id,
        title,
        model,
        messages: msgs,
        projectId,
        updatedAt: Date.now(),
        createdAt: createdAtRef.current,
      }
      await saveChat(user.uid, chat)
    },
    [user],
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
      const lastUser = [...history].reverse().find((m) => m.role === 'user')

      // Presentation generation — build a slide deck the user can preview + export.
      if (!opts.image && !opts.systemOverride && wantsSlides(lastUser?.content ?? '')) {
        const prompt = (lastUser?.content ?? '').trim()
        const assistantId = uid4()
        setMessages((m) => [
          ...m,
          { id: assistantId, role: 'assistant', content: '🎤 Building your presentation…', model: opts.model, createdAt: Date.now() },
        ])
        setStreaming(true)
        const deck = await generateDeck(prompt)
        let finalMsgs: StoredMessage[] = []
        setMessages((m) => {
          finalMsgs = m.map((x) =>
            x.id === assistantId
              ? deck
                ? { ...x, content: `Here's your **${deck.title}** deck — preview the slides below and download as PowerPoint.`, deck }
                : { ...x, content: "I couldn't build that presentation — try rephrasing the topic." }
              : x,
          )
          return finalMsgs
        })
        setStreaming(false)
        if (titleRef.current === 'New chat') titleRef.current = (deck?.title || prompt).slice(0, 40)
        await persist(finalMsgs, id, opts.model, opts.projectId)
        return
      }

      // Image generation / editing mode.
      if (opts.image) {
        const prompt = (lastUser?.content ?? '').trim()
        const editBase = (lastUser?.attachments ?? []).find((a) => a.kind === 'image' && a.url)?.url
        const assistantId = uid4()
        setMessages((m) => [
          ...m,
          { id: assistantId, role: 'assistant', content: '', model: opts.model, createdAt: Date.now() },
        ])
        setStreaming(true)

        // Decide the scene prompt + any exact text to overlay (models can't
        // render text, so we draw it precisely with canvas).
        let scene = prompt
        let overlay: string | null = null
        let position: 'top' | 'bottom' | 'center' = 'top'
        try {
          const j = await complete(
            'llama-3.3-70b-versatile',
            [
              {
                role: 'system',
                content:
                  'Given an image request, output ONLY JSON {"scene":"...","text":"...","position":"top|bottom|center"}. "scene" = a vivid, detailed image-generation prompt with NO letters/words in the image. "text" = the EXACT words the user wants written on the image (empty string if none). "position" = where the text goes.',
              },
              { role: 'user', content: prompt },
            ],
            { temperature: 0.5, maxTokens: 250 },
          )
          const mm = j.match(/\{[\s\S]*\}/)
          if (mm) {
            const o = JSON.parse(mm[0])
            scene = (o.scene || prompt).slice(0, 800)
            overlay = (o.text || '').trim() || null
            if (['top', 'bottom', 'center'].includes(o.position)) position = o.position
          }
        } catch {
          /* use raw prompt */
        }
        if (/\babove\b|\btop\b/i.test(prompt)) position = 'top'
        else if (/\bbelow\b|\bbottom\b|\bunder\b/i.test(prompt)) position = 'bottom'

        const styledScene = (scene + styleSuffix(opts.imageStyle)).slice(0, 900)
        const baseUrl = editBase || imageUrl(styledScene)
        let finalUrl = baseUrl
        if (overlay) {
          try {
            finalUrl = await composeTextOnImage(baseUrl, overlay, position)
          } catch {
            finalUrl = baseUrl
          }
        }

        let finalMsgs: StoredMessage[] = []
        setMessages((m) => {
          finalMsgs = m.map((x) =>
            x.id === assistantId ? { ...x, content: '', image: { prompt, url: finalUrl } } : x,
          )
          return finalMsgs
        })
        setStreaming(false)
        if (titleRef.current === 'New chat') titleRef.current = (prompt || 'Image').slice(0, 40)
        await persist(finalMsgs, id, opts.model, opts.projectId)
        return
      }

      // If the latest user turn includes images, force a vision-capable model
      // (only the 2o models can see images) and skip web-search routing, since
      // the compound model can't view images.
      const hasImages = (lastUser?.attachments ?? []).some((a) => a.kind === 'image' && a.url)

      const wantsSearch =
        opts.agent ||
        opts.webSearch ||
        (!opts.webSearch && shouldAutoSearch(history[history.length - 1]?.content ?? ''))
      const useCompound = !hasImages && wantsSearch

      // 3o models run on OpenRouter (free), with automatic Groq fallback on
      // rate-limit/slow/error. Not used for vision or web-search turns.
      const useOR = model.provider === 'openrouter' && !!model.orModel && !hasImages && !useCompound

      const fallback = model

      const visionModel = getModel('ripoai-2o-instant')
      const groqModel = hasImages
        ? visionModel.groqModel
        : useCompound
          ? searchModel()
          : fallback.groqModel
      const visionCapable = hasImages || model.vision
      const usingCompound = groqModel === searchModel()
      // compound (web search/agent) does NOT support reasoning_effort; nor does
      // the vision model when we auto-switch to it.
      const reasoningEffort = usingCompound || hasImages ? undefined : fallback.reasoningEffort

      let system =
        opts.systemOverride ??
        (opts.agent
          ? AGENT_SYSTEM + '\n\n' + buildSystemPrompt(model, settings, memories)
          : buildSystemPrompt(model, settings, memories))

      const lastText = lastUser?.content ?? ''

      // Always-on tools: currency, units, dictionary, wikipedia.
      if (!opts.image && !opts.systemOverride) {
        if (wantsCurrency(lastText)) {
          const conv = await convertCurrency(lastText)
          if (conv) system += `\n\nLive currency conversion: ${conv}. Use this exact figure.`
        }
        if (wantsUnits(lastText)) {
          const u = convertUnits(lastText)
          if (u) system += `\n\nUnit conversion: ${u}. Use this exact result.`
        }
        if (wantsDefine(lastText)) {
          const def = await getDefinition(lastText)
          if (def) system += `\n\n${def}`
        } else if (wantsWiki(lastText) && !wantsPlaces(lastText)) {
          const wiki = await getWiki(lastText)
          if (wiki) system += `\n\nReference (${wiki}). Use it if relevant; you may add more.`
        }
      }

      // Weather: if the user asks about weather, fetch a forecast card.
      let weatherData: any = null
      if (!opts.image && !opts.systemOverride && !opts.agent && wantsWeather(lastText)) {
        const near = /\bnear me|here|my (location|area)\b/i.test(lastText) ? await getUserLocation() : null
        weatherData = await getWeather(lastText, near || undefined)
        if (weatherData)
          system += `\n\nA weather card for ${weatherData.place} is already shown (now ${weatherData.current.temp}°). Give a brief, friendly comment (1-2 sentences) — don't list all the numbers.`
      }

      // Maps: if the user is looking for places, search OSM and attach a map.
      let placesData: { center: [number, number]; places: any[]; label: string } | null = null
      if (!opts.image && !opts.systemOverride && !opts.agent && wantsPlaces(lastText)) {
        setMessages((m) => m) // no-op to keep order
        const near = /\bnear me|nearby|near by|around me|closest|nearest\b/i.test(lastText)
          ? await getUserLocation()
          : null
        const res = await searchPlaces(lastText, near || undefined)
        if (res && res.places.length) {
          placesData = { center: res.center, places: res.places, label: res.label }
          system += `\n\nThe user asked to find places. An interactive map with these results is ALREADY shown to them: ${res.places
            .slice(0, 8)
            .map((p, i) => `${i + 1}. ${p.name}`)
            .join('; ')}. Write a short, friendly summary (2-4 sentences) — do not repeat the full list or addresses; the map shows them.`
        }
      }

      const groqMessages: ChatMessage[] = [
        { role: 'system', content: system },
        ...toGroqMessages(trimHistory(history), visionCapable),
      ]

      const assistantId = uid4()
      setMessages((m) => [
        ...m,
        { id: assistantId, role: 'assistant', content: '', reasoning: '', model: opts.model, steps: [], map: placesData ?? undefined, weather: weatherData ?? undefined, createdAt: Date.now() },
      ])
      setSteps([])
      setStreaming(true)

      const ac = new AbortController()
      abortRef.current = ac
      const localSteps: { type: string; detail?: string }[] = []

      let finalContent = ''
      let finalReasoning = ''

      // Batched stream handlers: accumulate tokens and flush to state ~25fps
      // instead of on every token. This keeps streaming fast even with heavy
      // markdown (tables/code) that would otherwise re-render on each token.
      let pendC = ''
      let pendR = ''
      let flushTimer: ReturnType<typeof setTimeout> | null = null
      const flush = () => {
        flushTimer = null
        if (!pendC && !pendR) return
        const addC = pendC
        const addR = pendR
        pendC = ''
        pendR = ''
        setMessages((m) =>
          m.map((x) =>
            x.id === assistantId
              ? { ...x, content: x.content + addC, reasoning: (x.reasoning ?? '') + addR }
              : x,
          ),
        )
      }
      const schedule = () => {
        if (!flushTimer) flushTimer = setTimeout(flush, 40)
      }
      const onToken = (delta: string) => {
        haptic(5)
        pendC += delta
        schedule()
      }
      const onReasoning = (delta: string) => {
        haptic(4)
        pendR += delta
        schedule()
      }
      const onTool = (info: { type: string; detail?: string }) => {
        localSteps.push(info)
        setSteps([...localSteps])
        setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, steps: [...localSteps] } : x)))
      }
      const clearStreamed = () => {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
        pendC = ''
        pendR = ''
        setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: '', reasoning: '' } : x)))
      }

      // Ordered fallback chain — try the best model, then progressively more
      // reliable/faster ones, so a rate-limit never shows as the answer.
      type Attempt = { provider?: 'openrouter' | 'groq' | 'puter'; model: string; maxTokens: number; reasoningEffort?: string }
      const usePuter = model.provider === 'puter' && !!model.puterModel && !hasImages && !useCompound
      const attempts: Attempt[] = []
      if (useCompound) {
        attempts.push({ provider: 'groq', model: searchModel(), maxTokens: 2048 })
        attempts.push({ provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 1500 })
      } else if (hasImages) {
        attempts.push({ provider: 'groq', model: visionModel.groqModel, maxTokens: 1500 })
      } else if (usePuter) {
        attempts.push({ provider: 'puter', model: model.puterModel!, maxTokens: model.maxTokens })
        attempts.push({ provider: 'groq', model: model.groqModel, maxTokens: Math.min(model.maxTokens, 4096) })
        attempts.push({ provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 2048 })
      } else if (useOR) {
        attempts.push({ provider: 'openrouter', model: model.orModel!, maxTokens: Math.min(model.maxTokens, 4096) })
        attempts.push({ provider: 'groq', model: model.groqModel, maxTokens: Math.min(model.maxTokens, 4096), reasoningEffort: model.reasoningEffort })
        attempts.push({ provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 2048 })
      } else {
        attempts.push({ provider: 'groq', model: groqModel, maxTokens: fallback.maxTokens, reasoningEffort })
        if (groqModel !== 'llama-3.1-8b-instant')
          attempts.push({ provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 2048 })
      }

      try {
        for (const a of attempts) {
          if (ac.signal.aborted) break
          try {
            clearStreamed()
            finalContent = ''
            finalReasoning = ''
            localSteps.length = 0
            let res: { content: string; reasoning: string }
            if (a.provider === 'puter') {
              const pr = await streamPuter({ model: a.model, messages: groqMessages as any, signal: ac.signal, onToken })
              res = { content: pr.content, reasoning: '' }
            } else {
              res = await streamChat({
                provider: a.provider as 'groq' | 'openrouter' | undefined,
                model: a.model,
                messages: groqMessages,
                temperature: model.temperature,
                maxTokens: a.maxTokens,
                topP: model.topP,
                reasoningEffort: a.reasoningEffort,
                signal: ac.signal,
                onToken,
                onReasoning,
                onTool,
              })
            }
            finalContent = res.content
            finalReasoning = res.reasoning
            if (finalContent.trim() || finalReasoning.trim()) break
          } catch (err: any) {
            if (err?.name === 'AbortError') throw err
            // try the next model in the chain
          }
        }

        // Stop any pending batched flush before applying the final content.
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
        pendC = ''
        pendR = ''

        // Models (esp. compound web search) sometimes end with the answer stuck
        // in the reasoning/tool trace and empty content. Never dump raw
        // <think>/<tool>/<output> — synthesize a clean answer from the notes.
        if (!finalContent.trim()) {
          const notes = (finalReasoning || '')
            .replace(/<\/?(think|tool|output|reason|reasoning)>/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 7000)
          const question = lastUser?.content ?? history[history.length - 1]?.content ?? ''
          try {
            finalContent = await complete(
              'llama-3.3-70b-versatile',
              [
                {
                  role: 'system',
                  content:
                    'Write a clear, direct, well-formatted answer to the user using the research notes. Never mention "notes", "tools", or your process. If the notes contain findings (prices, places, facts), present them cleanly.',
                },
                { role: 'user', content: `Question: ${question}\n\nResearch notes:\n${notes || '(none)'}` },
              ],
              { temperature: 0.4, maxTokens: 1800 },
            )
          } catch {
            /* fall through */
          }
          if (!finalContent.trim()) {
            finalContent = "I couldn't pull together a clean answer for that — please try rephrasing or switch models."
          }
          const fc = finalContent
          setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: fc } : x)))
        } else {
          // Apply the sanitized final content (live stream may have shown raw tags).
          const fc = finalContent
          setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: fc } : x)))
        }
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

      // Memory: auto-extract, plus an explicit save when the user asks to
      // "remember" / "save" something.
      const userText = history[history.length - 1]?.content ?? ''
      const explicitRemember = /\b(remember|memor(ize|ise)|save (this|that|to memory|it)|note that|keep in mind)\b/i.test(userText)
      if ((settings.memoryEnabled || explicitRemember) && finalContent && !opts.projectId) {
        const force = explicitRemember
        extractMemories(user.uid, userText, finalContent, memories, force)
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
      // Persist the user's turn IMMEDIATELY so the chat survives even if
      // generation fails, is stopped, or the app is closed mid-stream. persist()
      // derives a provisional title from the first message; run() upgrades it to
      // the AI-generated title afterwards.
      persist(history, id, opts.model, opts.projectId).catch(() => {})
      await run(history, { ...opts }, id)
    },
    [user, streaming, chatId, messages, navigate, run, persist],
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
