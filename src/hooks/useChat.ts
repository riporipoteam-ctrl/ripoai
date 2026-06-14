import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { streamChat, complete, type ChatMessage, type ContentPart } from '../lib/groq'
import { editImage, generateImage, styleSuffix, dimsFor } from '../lib/imagegen'
import { wantsPlaces, searchPlaces, getUserLocation, getUserPlace, wantsLocationContext } from '../lib/places'
import { wantsWeather, getWeather } from '../lib/weather'
import { wantsCurrency, convertCurrency } from '../lib/currency'
import { wantsDefine, getDefinition, wantsWiki, getWiki, wantsUnits, convertUnits } from '../lib/tools'
import { streamPuter } from '../lib/puter'
import { MAX_IMAGES_PER_MESSAGE } from '../lib/files'
import { earnFromChat, tryImageGen } from '../lib/plus'
import { wantsSlides, generateDeck } from '../lib/slides'
import { getModel, resolveAutoModel, type ModelTier } from '../lib/models'
import { buildSystemPrompt, buildAgentSystemPrompt, AGENT_SYSTEM, WEB3D_INSTRUCTIONS, wantsWebsite, needsDeepThinking } from '../lib/prompt'
import { getAgent, agentCanBrowse, agentWantsBrowse, type Agent } from '../lib/agents'
import { extractSocialImages, buildSocialPrompt } from '../lib/social'
import { searchModel, shouldAutoSearch } from '../lib/search'
import { liveSearchContext } from '../lib/liveSearch'
import { looksLikeAgentRequest } from '../lib/agents'
import { searchWebImages, wantsWebImageSearch, webImageQuery } from '../lib/webImages'
import { runAgentBrowserTask, type AgentBrowserEvent, type AgentBrowserState } from '../lib/agentBrowser'
import { extractMemories } from '../lib/memory'
import { installSkillFromUrl, detectSkillInstall, detectSlashSkill, findSkill, autoPickSkill } from '../lib/skills'
import { markPending, clearPending, isPending, loadPendingRuns } from '../lib/pendingRuns'
import { haptic } from './useSpeech'
import { useStore } from '../store'
import {
  loadChat,
  readLocalChat,
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
  /** When set, this is a 1-on-1 chat with this agent — drives the persona + tag. */
  agentChat?: Agent
  /** User explicitly asked this turn to browse the live web (composer toggle). */
  forceBrowse?: boolean
}

const uid4 = () => crypto.randomUUID()

// Keep the prompt within free-tier token limits: send only the most recent
// messages that fit a rough character budget (~4 chars/token), always keeping
// the latest user turn.
function trimHistory(messages: StoredMessage[], maxChars = 13000): StoredMessage[] {
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
      // Cap images per turn — vision models get confused / time out when handed
      // too many at once. Keep the first MAX, note any extras in the text.
      const shown = images.slice(0, MAX_IMAGES_PER_MESSAGE)
      const extra = images.length - shown.length
      let promptText = text
      if (extra > 0)
        promptText += `\n\n[${images.length} images attached; analyzing the first ${shown.length}. Ask about specific images if needed.]`
      const parts: ContentPart[] = [{ type: 'text', text: promptText }]
      for (const img of shown) parts.push({ type: 'image_url', image_url: { url: img.url! } })
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
  const { user, settings, memories, refreshMemories, markUnread, clearUnread } = useStore()
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [steps, setSteps] = useState<{ type: string; detail?: string }[]>([])
  const [loadedModel, setLoadedModel] = useState<ModelTier | null>(null)
  const loadedId = useRef<string | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)
  const titleRef = useRef<string>('New chat')
  const modelRef = useRef<ModelTier>(settings.defaultModel)
  const createdAtRef = useRef<number>(0)
  // Agent tag for a 1-on-1 agent chat (kept across saves so it survives reloads).
  const agentTagRef = useRef<{ agentId?: string; agentName?: string; agentEmoji?: string }>({})
  const [chatAgent, setChatAgent] = useState<Agent | null>(null)

  // Load (or reset) when the active chat id changes.
  useEffect(() => {
    if (chatId === loadedId.current) return
    // Switching chats: the view is no longer streaming (any in-flight run keeps
    // going in the background and will flag the chat unread when it finishes).
    setStreaming(false)
    setSteps([])
    if (!chatId) {
      loadedId.current = undefined
      titleRef.current = 'New chat'
      createdAtRef.current = 0
      agentTagRef.current = {}
      setChatAgent(null)
      setMessages([])
      return
    }
    if (!user) return
    loadedId.current = chatId
    agentTagRef.current = {}
    setChatAgent(null)
    clearUnread(chatId) // opening a chat clears its blue dot
    // Restore the agent tag (if any) so this chat keeps driving the agent persona
    // and shows its badge after a reload.
    const applyAgentTag = (c: { agentId?: string; agentName?: string; agentEmoji?: string }) => {
      if (!c.agentId && !c.agentName) return
      agentTagRef.current = { agentId: c.agentId, agentName: c.agentName, agentEmoji: c.agentEmoji }
      const full = c.agentId ? getAgent(user.uid, c.agentId) : null
      setChatAgent(
        full ?? { id: c.agentId ?? '', name: c.agentName ?? 'Agent', emoji: c.agentEmoji ?? '🤖', role: 'Agent', personality: '', color: '#6366f1' },
      )
    }
    // Show the cached chat INSTANTLY (no awaiting Firestore), then reconcile.
    const cached = readLocalChat(user.uid, chatId)
    if (cached) {
      setMessages(cached.messages)
      titleRef.current = cached.title
      modelRef.current = cached.model
      createdAtRef.current = cached.createdAt || Date.now()
      if (cached.model) setLoadedModel(cached.model)
      applyAgentTag(cached)
    }
    loadChat(user.uid, chatId)
      .then((c) => {
        if (loadedId.current !== chatId) return
        if (c) {
          setMessages(c.messages)
          titleRef.current = c.title
          modelRef.current = c.model
          createdAtRef.current = c.createdAt || Date.now()
          if (c.model) setLoadedModel(c.model) // restore the chat's last model
          applyAgentTag(c)
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
        // Carry the agent tag so this stays a 1-on-1 agent chat after a reload.
        agentId: agentTagRef.current.agentId,
        agentName: agentTagRef.current.agentName,
        agentEmoji: agentTagRef.current.agentEmoji,
        updatedAt: Date.now(),
        createdAt: createdAtRef.current,
      }
      await saveChat(user.uid, chat)
      // A completed assistant turn means the run finished — drop it from the
      // resume registry so it isn't re-run on next open.
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && (last.content || last.image || last.steps?.length || last.deck)) {
        clearPending(user.uid, id)
      }
    },
    [user],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
    // Explicit stop = user no longer wants this run; don't resume it later.
    if (user && loadedId.current) clearPending(user.uid, loadedId.current)
  }, [user])

  const run = useCallback(
    async (history: StoredMessage[], opts: SendOptions, id: string) => {
      if (!user) return
      // 1-on-1 agent chat: tag the chat (so it saves + shows the badge) and keep
      // the agent on screen. The tag persists across reloads via persist().
      if (opts.agentChat) {
        agentTagRef.current = {
          agentId: opts.agentChat.id,
          agentName: opts.agentChat.name,
          agentEmoji: opts.agentChat.emoji,
        }
        setChatAgent(opts.agentChat)
      }
      const lastUser = [...history].reverse().find((m) => m.role === 'user')
      // Record this run so it can be resumed if the app is closed mid-flight.
      markPending(user.uid, {
        chatId: id,
        opts,
        label: (lastUser?.content ?? 'Task').slice(0, 80),
        startedAt: Date.now(),
      })
      // Auto mode → pick the best real model for this task.
      const autoHasImages = (lastUser?.attachments ?? []).some((a) => a.kind === 'image' && a.url)
      const effModel = opts.model === 'auto' ? resolveAutoModel(lastUser?.content ?? '', autoHasImages) : opts.model
      const model = getModel(effModel)

      // Skill install — "install this skill: <url>" fetches + saves a skill.
      const installUrl = !opts.image && !opts.systemOverride ? detectSkillInstall(lastUser?.content ?? '') : null
      if (installUrl) {
        const assistantId = uid4()
        setMessages((m) => [
          ...m,
          { id: assistantId, role: 'assistant', content: 'Installing skill…', model: opts.model, createdAt: Date.now() },
        ])
        setStreaming(true)
        let finalMsgs: StoredMessage[] = []
        try {
          const skill = await installSkillFromUrl(user.uid, installUrl)
          setMessages((m) => {
            finalMsgs = m.map((x) =>
              x.id === assistantId
                ? {
                    ...x,
                    content: `**${skill.name}** is installed. Use it anytime by typing \`/${skill.slug}\`.`,
                    skillInstalled: { name: skill.name, description: skill.description },
                  }
                : x,
            )
            return finalMsgs
          })
        } catch (e: any) {
          setMessages((m) => {
            finalMsgs = m.map((x) =>
              x.id === assistantId ? { ...x, content: `⚠️ ${e?.message ?? "Couldn't install that skill."}` } : x,
            )
            return finalMsgs
          })
        }
        setStreaming(false)
        if (titleRef.current === 'New chat') titleRef.current = 'Installed a skill'
        await persist(finalMsgs, id, opts.model, opts.projectId)
        return
      }

      // Create an agent from chat: "make an agent named Leon that researches…"
      if (
        !opts.image &&
        !opts.systemOverride &&
        !opts.agent &&
        looksLikeAgentRequest(lastUser?.content ?? '')
      ) {
        const desc = (lastUser?.content ?? '').trim()
        const assistantId = uid4()
        setMessages((m) => [
          ...m,
          { id: assistantId, role: 'assistant', content: '🎨 Designing your agent…', model: opts.model, createdAt: Date.now() },
        ])
        setStreaming(true)
        let finalMsgs: StoredMessage[] = []
        try {
          const { aiDesignAgent, upsertAgent } = await import('../lib/agents')
          const agent = await aiDesignAgent(desc)
          upsertAgent(user.uid, agent)
          const skills = agent.skills?.length ? ` Great at ${agent.skills.slice(0, 3).join(', ')}.` : ''
          setMessages((m) => {
            finalMsgs = m.map((x) =>
              x.id === assistantId
                ? {
                    ...x,
                    content: `✅ Meet **${agent.name}** — your ${agent.role}.${skills} I painted a profile picture and added them to your team. Pick them in chat or **@${agent.name}** to dispatch them.`,
                  }
                : x,
            )
            return finalMsgs
          })
        } catch {
          setMessages((m) => {
            finalMsgs = m.map((x) =>
              x.id === assistantId ? { ...x, content: "I couldn't create that agent — try rephrasing." } : x,
            )
            return finalMsgs
          })
        }
        setStreaming(false)
        if (titleRef.current === 'New chat') titleRef.current = 'New agent'
        await persist(finalMsgs, id, opts.model, opts.projectId)
        return
      }

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

      // Online image requests should be handled by the app's image-search
      // pipeline, even if stale Image or Agent mode was left enabled.
      if (!opts.systemOverride && wantsWebImageSearch(lastUser?.content ?? '')) {
        opts = { ...opts, image: false, agent: false }
      }

      // Image generation / editing mode.
      if (opts.image) {
        const prompt = (lastUser?.content ?? '').trim()
        // Enforce the per-plan daily image-generation cap.
        if (!tryImageGen(user.uid)) {
          const assistantId = uid4()
          let capped: StoredMessage[] = []
          setMessages((m) => {
            capped = [
              ...m,
              {
                id: assistantId,
                role: 'assistant',
                content:
                  "You've reached today's image-generation limit. Upgrade to **AskAI+** for more images per day, or come back tomorrow.",
                model: opts.model,
                createdAt: Date.now(),
              },
            ]
            return capped
          })
          setStreaming(false)
          await persist(capped, id, opts.model, opts.projectId)
          return
        }
        const editBase = (lastUser?.attachments ?? []).find((a) => a.kind === 'image' && a.url)?.url
        const assistantId = uid4()
        setMessages((m) => [
          ...m,
          { id: assistantId, role: 'assistant', content: '', model: opts.model, createdAt: Date.now(), imagePending: { prompt: prompt || 'image' } },
        ])
        setStreaming(true)

        // Build a strong FLUX prompt. FLUX renders text well, so we KEEP any
        // requested words/names/logo text in the prompt and let the model draw
        // them — no cheap canvas caption box.
        let scene = prompt
        try {
          const j = await complete(
            'llama-3.3-70b-versatile',
            [
              {
                role: 'system',
                content:
                  'You write prompts for the FLUX image model. Rewrite the user request into ONE vivid, detailed, WELL-LIT, colorful, high-detail image prompt with clear subject, composition and lighting. NEVER produce an all-black, dark, empty or plain background unless explicitly asked — prefer bright, professional, photographic or crisp-vector compositions. If the user wants any text/name/title/slogan/logo wording, INCLUDE that EXACT text so FLUX renders it (e.g. the text "Auto Servis Sunja" in a bold modern font). For a logo: a clean, professional, centered design on a white or tasteful brand-colored background. Keep under 80 words. Output ONLY the final prompt — no quotes, no preamble.',
              },
              { role: 'user', content: prompt },
            ],
            { temperature: 0.5, maxTokens: 180 },
          )
          if (j && j.trim()) scene = j.trim().replace(/^["']+|["']+$/g, '').slice(0, 800)
        } catch {
          /* use raw prompt */
        }

        const styledScene = (scene + styleSuffix(opts.imageStyle)).slice(0, 900)
        const { w, h } = dimsFor(prompt)
        let baseUrl: string
        try {
          baseUrl = editBase
            ? await editImage(styledScene, editBase, { w, h })
            : await generateImage(styledScene, { w, h })
        } catch (e: any) {
          let errMsgs: StoredMessage[] = []
          setMessages((m) => {
            errMsgs = m.map((x) =>
              x.id === assistantId
                ? { ...x, imagePending: undefined, content: `⚠️ Couldn't generate the image. ${e?.message ?? ''}`.trim() }
                : x,
            )
            return errMsgs
          })
          setStreaming(false)
          await persist(errMsgs, id, opts.model, opts.projectId)
          return
        }
        const finalUrl = baseUrl

        let finalMsgs: StoredMessage[] = []
        setMessages((m) => {
          finalMsgs = m.map((x) =>
            x.id === assistantId ? { ...x, content: '', imagePending: undefined, image: { prompt, url: finalUrl } } : x,
          )
          return finalMsgs
        })
        setStreaming(false)
        if (titleRef.current === 'New chat') titleRef.current = (prompt || 'Image').slice(0, 40)
        await persist(finalMsgs, id, opts.model, opts.projectId)
        return
      }

      // Web image search: when the user asks for real images from the web,
      // return a preview gallery with source links instead of treating it as
      // image generation.
      if (!opts.systemOverride && wantsWebImageSearch(lastUser?.content ?? '')) {
        const queryText = webImageQuery(lastUser?.content ?? '')
        const assistantId = uid4()
        setMessages((m) => [
          ...m,
          {
            id: assistantId,
            role: 'assistant',
            content: 'Searching for web images...',
            model: opts.model,
            steps: [{ type: 'search', detail: `Image search: ${queryText}` }],
            createdAt: Date.now(),
          },
        ])
        setStreaming(true)

        let finalMsgs: StoredMessage[] = []
        try {
          const images = await searchWebImages(queryText, 8)
          const content = images.length
            ? `Here ${images.length === 1 ? 'is an image' : `are ${images.length} images`} for "${queryText}" — tap any one to see it full-size with its source, creator and license.`
            : `I could not find good web images for "${queryText}" from the public image sources available right now. Try a more specific name or turn on Web Search for a broader answer.`
          const subject = queryText.split(/\s+/).slice(0, 6).join(' ')
          setMessages((m) => {
            finalMsgs = m.map((x) =>
              x.id === assistantId
                ? {
                    ...x,
                    content,
                    webImages: images.length ? { query: queryText, images } : undefined,
                    followups: images.length
                      ? [`Tell me about ${subject}`, `Show me more images of ${subject}`]
                      : undefined,
                  }
                : x,
            )
            return finalMsgs
          })
        } catch (e: any) {
          const content = `I could not load web image results right now. ${e?.message ?? ''}`.trim()
          setMessages((m) => {
            finalMsgs = m.map((x) => (x.id === assistantId ? { ...x, content } : x))
            return finalMsgs
          })
        }
        setStreaming(false)
        if (titleRef.current === 'New chat') titleRef.current = `Images: ${queryText}`.slice(0, 60)
        await persist(finalMsgs, id, opts.model, opts.projectId)
        return
      }

      // If the latest user turn includes images, force a vision-capable model
      // (only the 2o models can see images) and skip web-search routing, since
      // the compound model can't view images.
      const hasImages = (lastUser?.attachments ?? []).some((a) => a.kind === 'image' && a.url)

      // Agent mode (and 1-on-1 agent chats) must never route through the compound
      // web-search model. The real OpenClaw browser panel below is the source of
      // truth whenever an agent is browsing.
      const isAgentChat = !!(opts.agentChat || agentTagRef.current.agentId || chatAgent)
      const wantsSearch =
        !opts.systemOverride &&
        !opts.agent &&
        !isAgentChat &&
        (opts.webSearch ||
          (!opts.webSearch && shouldAutoSearch(history[history.length - 1]?.content ?? '')))
      const useCompound = !hasImages && wantsSearch
      if (useCompound) {
        try {
          localStorage.setItem(`askai:did-search:${new Date().toISOString().slice(0, 10)}`, '1')
        } catch {
          /* ignore */
        }
      }

      // REAL web search: actually search + read pages and ground the answer on
      // the results (reliable), instead of trusting the compound tool to do it.
      // Cap the whole search+read at ~18s so a slow page-read can never hang the
      // turn — on timeout we just answer without the grounding context.
      let searchGrounding = ''
      if (useCompound) {
        try {
          const r = await Promise.race([
            liveSearchContext(history[history.length - 1]?.content ?? ''),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 18000)),
          ])
          if (r?.context) searchGrounding = r.context
        } catch {
          /* fall back to compound */
        }
      }
      const groundedSearch = searchGrounding.length > 0

      // 3o models run on OpenRouter (free), with automatic Groq fallback on
      // rate-limit/slow/error. Not used for vision or web-search turns.
      const useOR = model.provider === 'openrouter' && !!model.orModel && !hasImages && !useCompound

      const fallback = model

      const visionModel = getModel('ripoai-2o-instant')
      const groqModel = hasImages
        ? visionModel.groqModel
        : useCompound && !groundedSearch
          ? searchModel()
          : fallback.groqModel
      const visionCapable = hasImages || model.vision
      const usingCompound = groqModel === searchModel()
      // compound (web search/agent) does NOT support reasoning_effort; nor does
      // the vision model when we auto-switch to it.
      const reasoningEffort = usingCompound || hasImages ? undefined : fallback.reasoningEffort

      // For a 1-on-1 agent chat, the agent's persona drives the reply. Resolve
      // the agent from this turn's option, else the tag restored on reload.
      const personaAgent: Agent | null =
        opts.agentChat ??
        (agentTagRef.current.agentId ? getAgent(user.uid, agentTagRef.current.agentId) : null) ??
        chatAgent

      let system =
        opts.systemOverride ??
        (personaAgent
          ? buildAgentSystemPrompt(personaAgent, model, settings, memories)
          : opts.agent
            ? AGENT_SYSTEM + '\n\n' + buildSystemPrompt(model, settings, memories)
            : buildSystemPrompt(model, settings, memories))

      const lastText = lastUser?.content ?? ''

      // 1-on-1 agent chat: let the agent actually browse the live web with
      // OpenClaw. It browses when the agent has browsing enabled AND either the
      // user force-browsed (composer toggle) or the message looks like it needs
      // current/web info — mirroring how the main Agent mode browses.
      const agentChatBrowse =
        !opts.image &&
        !opts.systemOverride &&
        !hasImages &&
        !!personaAgent &&
        agentCanBrowse(personaAgent) &&
        (opts.forceBrowse === true || agentWantsBrowse(lastText))

      // Either the global Agent mode OR a browsing-enabled agent chat runs the
      // live OpenClaw browser panel below.
      const runBrowser = (opts.agent || agentChatBrowse) && (settings.agentBrowserPreview ?? true)

      // Ground the answer on the real search results we just fetched.
      if (groundedSearch) {
        system +=
          '\n\n' +
          searchGrounding +
          '\n\nAnswer the user using these live results. Be specific and practical (names, numbers, steps, prices). Cite sources inline as Markdown links. If they don\'t cover it, say what you do know and what to check next.'
      }

      // Skills: explicit "/slug" wins; otherwise auto-pick the most relevant
      // installed skill (like auto web search) and follow it.
      if (!opts.systemOverride && !opts.image) {
        const slug = detectSlashSkill(lastText)
        let activeSkill = slug ? findSkill(user.uid, slug) : null
        if (!activeSkill) activeSkill = await autoPickSkill(user.uid, lastText, complete)
        if (activeSkill)
          system += `\n\n### Active skill: ${activeSkill.name}\nFollow these instructions for this response:\n${activeSkill.content}`
      }

      // Premium 3D website mode when the user asks to build a site.
      const buildingSite = !opts.image && !opts.systemOverride && wantsWebsite(lastText)
      if (buildingSite) {
        system += '\n\n' + WEB3D_INSTRUCTIONS
        // Let the user drop ANY 3D asset: "use this model: <url>" or a bare .glb/.gltf link.
        const modelUrl =
          lastText.match(/use\s+(?:this\s+)?(?:3d\s+)?(?:model|asset)\s*:?\s*(https?:\/\/\S+)/i)?.[1] ||
          lastText.match(/https?:\/\/\S+\.(?:glb|gltf)(?:\?\S+)?/i)?.[0]
        if (modelUrl)
          system += `\n\nMANDATORY: load THIS exact 3D model with THREE.GLTFLoader (do not substitute a catalog model): ${modelUrl.replace(/[)>\].,]+$/, '')}`
        // Real profile photos from any social handles the user mentioned.
        const social = buildSocialPrompt(extractSocialImages(lastText))
        if (social) system += '\n\n' + social
      }
      // Big code/website outputs need a larger token budget (+ auto-continue below).
      const bigOutput =
        buildingSite ||
        (!opts.image &&
          /\b(full|complete|entire|whole)\b.*\b(code|app|website|page|game|file|script|component)\b|\b(build|make|create|generate|write)\b.*\b(website|web app|webapp|web page|landing|dashboard|game|app)\b|\b(three\.?js|webgl)\b/i.test(
            lastText,
          ))

      // Location awareness: give the AI the user's REAL location (device GPS +
      // reverse geocode) for "where am I / near me / find X" questions, in any
      // language — so it stops hallucinating a city.
      if (!opts.image && !opts.systemOverride && wantsLocationContext(lastText)) {
        const place = await getUserPlace()
        if (place)
          system += `\n\nThe user's current location (from their device GPS) is: ${place.label} (latitude ${place.lat.toFixed(4)}, longitude ${place.lng.toFixed(4)}). Use this as their actual location. Do NOT guess a different city.`
      }

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
        // For "my location / near me / here" (or when no city is named), use the
        // device's real GPS (cached + reverse-geocoded) so it never says it can't.
        const wantsHere = /\bnear me|nearby|here|my (location|area|city|place|position)|current location|where i am|around me\b/i.test(lastText)
        const hasNamedPlace = /\b(in|at|for)\s+[A-Z][a-z]/.test(lastText)
        let near: [number, number] | undefined
        if (wantsHere || !hasNamedPlace) {
          const place = await getUserPlace()
          if (place) near = [place.lat, place.lng]
        }
        weatherData = await getWeather(lastText, near)
        if (weatherData)
          system += `\n\nLive weather for ${weatherData.place}: ${weatherData.current.temp}° (wind ${weatherData.current.wind}, humidity ${weatherData.current.humidity}%). A weather card is already shown. Give a brief, friendly 1-2 sentence comment using THIS data — never say you can't access the weather.`
        else if (near)
          system += `\n\nThe user's device location is available; if you still cannot fetch live weather, give your best general guidance for their region rather than refusing.`
      }

      // Maps: if the user is looking for places, search OSM and attach a map.
      let placesData: { center: [number, number]; places: any[]; label: string } | null = null
      if (!opts.image && !opts.systemOverride && !opts.agent && wantsPlaces(lastText)) {
        setMessages((m) => m) // no-op to keep order
        // Bias all place searches to the user's real location (cached).
        const place = await getUserPlace()
        const near: [number, number] | null = place ? [place.lat, place.lng] : null
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
      const initialAgentBrowser: AgentBrowserState | undefined =
        runBrowser
          ? {
              status: 'running',
              events: [{ type: 'start', label: 'Starting real browser session', at: Date.now() }],
            }
          : undefined
      setMessages((m) => [
        ...m,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          reasoning: '',
          model: effModel,
          steps: [],
          map: placesData ?? undefined,
          weather: weatherData ?? undefined,
          agentBrowser: initialAgentBrowser,
          createdAt: Date.now(),
        } as StoredMessage & { agentBrowser?: AgentBrowserState },
      ])
      setSteps([])
      setStreaming(true)

      const ac = new AbortController()
      abortRef.current = ac
      const localSteps: { type: string; detail?: string }[] = []
      // True only while THIS run's chat is the one on screen. When you navigate
      // away, the run keeps going in the background (and still saves) but stops
      // touching the now-different view.
      const isLive = () => loadedId.current === id

      let agentBrowser: AgentBrowserState | undefined = initialAgentBrowser
      if (runBrowser) {
        const events: AgentBrowserEvent[] = [...(initialAgentBrowser?.events ?? [])]
        const applyAgentBrowser = (state: AgentBrowserState) => {
          agentBrowser = state
          if (!isLive()) return
          setMessages((m) =>
            m.map((x) =>
              x.id === assistantId
                ? ({ ...x, agentBrowser: state } as StoredMessage & { agentBrowser?: AgentBrowserState })
                : x,
            ),
          )
        }
        try {
          const browserResult = await runAgentBrowserTask(lastText, {
            signal: ac.signal,
            onEvent: (event) => {
              events.push(event)
              // Fold live screenshot / URL / title into the panel as the agent moves.
              applyAgentBrowser({
                ...(agentBrowser ?? { status: 'running', events: [] }),
                status: 'running',
                events: [...events],
                screenshot: event.screenshot ?? agentBrowser?.screenshot,
                currentUrl: event.url ?? agentBrowser?.currentUrl,
                title: event.title ?? agentBrowser?.title,
              })
            },
          })
          const finalBrowser = { ...browserResult, events: browserResult.events?.length ? browserResult.events : events }
          applyAgentBrowser(finalBrowser)
          const browserNotes = [
            finalBrowser.currentUrl ? `Current URL: ${finalBrowser.currentUrl}` : '',
            finalBrowser.title ? `Page title: ${finalBrowser.title}` : '',
            finalBrowser.summary ? `Browser summary: ${finalBrowser.summary}` : '',
            finalBrowser.sources?.length
              ? `Sources opened: ${finalBrowser.sources.map((s) => `${s.title || s.url} (${s.url})`).join('; ')}`
              : '',
            finalBrowser.error ? `Browser status: ${finalBrowser.error}` : '',
          ]
            .filter(Boolean)
            .join('\n')
          if (browserNotes) {
            system += `\n\nYOU just controlled a real browser and completed a live browsing session. These are YOUR OWN browsing results:\n${browserNotes}\nWrite your answer AS the agent who did this browsing: present the findings directly and confidently, citing the source URLs. NEVER say you are "not capable of interacting with websites", "can't perform actions", "can't browse" or any similar disclaimer — you literally just did. If the task asked for something impossible/against platform rules (e.g. artificially inflating likes), give the genuinely useful version: what you found, what works, concrete next steps — still no capability disclaimers. Do not fall back to generic advice that ignores the pages you visited.`
            groqMessages[0] = { role: 'system', content: system }
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') throw e
          applyAgentBrowser({
            status: 'error',
            events,
            error: e?.message || 'Agent browser failed.',
          })
        }
      }

      let finalContent = ''
      let finalReasoning = ''
      let thinkStart = 0
      let thinkEnd = 0

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
        if (!isLive()) return
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
        if (thinkStart && !thinkEnd) thinkEnd = Date.now()
        pendC += delta
        schedule()
      }
      const onReasoning = (delta: string) => {
        if (!thinkStart) thinkStart = Date.now()
        haptic(4)
        pendR += delta
        schedule()
      }
      const onTool = (info: { type: string; detail?: string }) => {
        localSteps.push(info)
        setSteps([...localSteps])
        if (isLive()) setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, steps: [...localSteps] } : x)))
      }
      const clearStreamed = () => {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
        pendC = ''
        pendR = ''
        setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: '', reasoning: '' } : x)))
      }

      // Ordered fallback chain — try the best model, then progressively more
      // reliable/faster ones, so a rate-limit never shows as the answer.
      type Attempt = { provider?: 'openrouter' | 'groq' | 'puter' | 'nvidia'; model: string; maxTokens: number; reasoningEffort?: string }
      const usePuter = model.provider === 'puter' && !!model.puterModel && !hasImages && !useCompound
      const useNvidia = model.provider === 'nvidia' && !!model.nvModel && !hasImages && !useCompound
      const attempts: Attempt[] = []
      if (groundedSearch) {
        // Real search already injected live results into the system prompt —
        // answer with a strong NORMAL model (no flaky compound tool).
        attempts.push({ provider: 'groq', model: 'openai/gpt-oss-120b', maxTokens: 2560 })
        attempts.push({ provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 2048 })
      } else if (useCompound) {
        attempts.push({ provider: 'groq', model: searchModel(), maxTokens: 2048 })
        attempts.push({ provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 1500 })
      } else if (hasImages) {
        // Strongest vision model first (Maverick), then Scout as a fast fallback,
        // so image understanding is as accurate as possible. Bigger budget lets
        // it describe rich/multi-image inputs thoroughly.
        attempts.push({ provider: 'groq', model: 'meta-llama/llama-4-maverick-17b-128e-instruct', maxTokens: 2048 })
        attempts.push({ provider: 'groq', model: visionModel.groqModel, maxTokens: 2048 })
      } else if (usePuter) {
        attempts.push({ provider: 'puter', model: model.puterModel!, maxTokens: model.maxTokens })
        attempts.push({ provider: 'groq', model: model.groqModel, maxTokens: Math.min(model.maxTokens, 4096) })
        attempts.push({ provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 2048 })
      } else if (useNvidia) {
        // 4o Pro: only use the (slower, deeper) GLM model when the task is hard
        // or is big code. For simple/short messages, answer FAST with Groq so a
        // "hi" is instant instead of waiting on GLM.
        const deepThink = model.reasoning && needsDeepThinking(lastText)
        if (deepThink || bigOutput) {
          attempts.push({ provider: 'nvidia', model: model.nvModel!, maxTokens: bigOutput ? 8192 : Math.min(model.maxTokens, 4096) })
          attempts.push({ provider: 'groq', model: model.groqModel, maxTokens: bigOutput ? Math.min(model.maxTokens, 8000) : Math.min(model.maxTokens, 4096), reasoningEffort: model.reasoningEffort })
          attempts.push({ provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 2048 })
        } else {
          attempts.push({ provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: Math.min(model.maxTokens, 4096) })
          attempts.push({ provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 2048 })
        }
      } else if (useOR) {
        attempts.push({ provider: 'openrouter', model: model.orModel!, maxTokens: Math.min(model.maxTokens, 4096) })
        attempts.push({ provider: 'groq', model: model.groqModel, maxTokens: Math.min(model.maxTokens, 4096), reasoningEffort: model.reasoningEffort })
        attempts.push({ provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 2048 })
      } else {
        attempts.push({ provider: 'groq', model: groqModel, maxTokens: bigOutput ? Math.max(fallback.maxTokens, 8000) : fallback.maxTokens, reasoningEffort })
        if (groqModel !== 'llama-3.1-8b-instant')
          attempts.push({ provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 2048 })
      }

      let usedAttempt: Attempt | null = null
      let lastFinish: string | undefined
      try {
        for (const a of attempts) {
          if (ac.signal.aborted) break
          try {
            clearStreamed()
            finalContent = ''
            finalReasoning = ''
            localSteps.length = 0
            let res: { content: string; reasoning: string; finishReason?: string }
            if (a.provider === 'puter') {
              const pr = await streamPuter({ model: a.model, messages: groqMessages as any, signal: ac.signal, onToken })
              res = { content: pr.content, reasoning: '' }
            } else {
              res = await streamChat({
                provider: a.provider as 'groq' | 'openrouter' | 'nvidia' | undefined,
                model: a.model,
                messages: groqMessages,
                temperature: model.temperature,
                maxTokens: a.maxTokens,
                topP: model.topP,
                reasoningEffort: a.reasoningEffort,
                // Think only when the message is genuinely hard — keeps simple
                // chats instant and avoids "thinking forever" on big code.
                thinking:
                  a.provider === 'nvidia' && model.reasoning && !bigOutput && needsDeepThinking(lastText),
                signal: ac.signal,
                onToken,
                onReasoning,
                onTool,
              })
            }
            finalContent = res.content
            finalReasoning = res.reasoning
            if (finalContent.trim() || finalReasoning.trim()) {
              usedAttempt = a
              lastFinish = res.finishReason
              break
            }
          } catch (err: any) {
            if (err?.name === 'AbortError') throw err
            // try the next model in the chain
          }
        }

        // Graceful degradation for the grounded web-search branch: the live
        // search context can be large, and the grounded models occasionally
        // return a 5xx/524/timeout on follow-ups. If every grounded attempt
        // failed (no content), retry ONCE with a fast model on a SHORTER
        // context, then — as a last resort — answer WITHOUT the search context
        // at all, so the user gets a real answer instead of a "524" error.
        if (groundedSearch && !finalContent.trim() && !ac.signal.aborted) {
          // (1) Same grounding, but trimmed + a small/fast model.
          const trimmedGrounding = searchGrounding.slice(0, 4000)
          const shortSystem =
            (opts.systemOverride ??
              (personaAgent
                ? buildAgentSystemPrompt(personaAgent, model, settings, memories)
                : buildSystemPrompt(model, settings, memories))) +
            '\n\n' +
            trimmedGrounding +
            '\n\nAnswer the user using these live results. Be specific (names, numbers, steps). Cite sources inline as Markdown links where relevant.'
          const degraded: { messages: ChatMessage[]; model: string }[] = [
            {
              model: 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: shortSystem },
                ...toGroqMessages(trimHistory(history), visionCapable),
              ],
            },
            // (2) Last resort: drop the search grounding entirely and just
            // answer from the model's own knowledge with a fast model.
            {
              model: 'llama-3.1-8b-instant',
              messages: [
                { role: 'system', content: opts.systemOverride ?? buildSystemPrompt(model, settings, memories) },
                ...toGroqMessages(trimHistory(history), visionCapable),
              ],
            },
          ]
          for (const d of degraded) {
            if (ac.signal.aborted || finalContent.trim()) break
            try {
              clearStreamed()
              finalContent = ''
              finalReasoning = ''
              const res = await streamChat({
                provider: 'groq',
                model: d.model,
                messages: d.messages,
                temperature: model.temperature,
                maxTokens: 2048,
                topP: model.topP,
                signal: ac.signal,
                onToken,
                onReasoning,
                onTool,
              })
              finalContent = res.content
              finalReasoning = res.reasoning
              if (finalContent.trim() || finalReasoning.trim()) {
                usedAttempt = { provider: 'groq', model: d.model, maxTokens: 2048 }
                lastFinish = res.finishReason
              }
            } catch (err: any) {
              if (err?.name === 'AbortError') throw err
              // try the next degraded step
            }
          }
        }

        // Auto-continue: if the model hit its token limit mid-output (long code /
        // premium websites), keep asking it to continue and append, seamlessly.
        let contRounds = 0
        while (
          lastFinish === 'length' &&
          usedAttempt &&
          usedAttempt.provider !== 'puter' &&
          finalContent.trim() &&
          contRounds < 12 &&
          !ac.signal.aborted
        ) {
          contRounds++
          try {
            const tail = finalContent.length > 4000 ? finalContent.slice(-3500) : finalContent
            const cont = await streamChat({
              provider: usedAttempt.provider as 'groq' | 'openrouter' | 'nvidia' | undefined,
              model: usedAttempt.model,
              messages: [
                ...groqMessages,
                { role: 'assistant', content: tail },
                {
                  role: 'user',
                  content:
                    'Continue EXACTLY where you left off — pick up from the very last character. Output ONLY the remaining content; do NOT repeat anything already written, do NOT restart, no commentary or code-fence re-opening unless it was still open.',
                },
              ],
              temperature: model.temperature,
              maxTokens: usedAttempt.maxTokens,
              topP: model.topP,
              signal: ac.signal,
              onToken,
              onReasoning,
            })
            if (!cont.content.trim()) break
            finalContent += cont.content
            lastFinish = cont.finishReason
          } catch {
            break
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
            finalContent = hasImages
              ? "I couldn't read that image clearly. Try a sharper, well-lit photo (JPEG or PNG), or tell me what you're looking at and I'll help."
              : "I couldn't pull together a clean answer for that — please try rephrasing or switch models."
          }
          const fc = finalContent
          if (isLive()) setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: fc } : x)))
        } else {
          // Apply the sanitized final content (live stream may have shown raw tags).
          const fc = finalContent
          if (isLive()) setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: fc } : x)))
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // keep whatever streamed so far
        } else if (isLive()) {
          setMessages((m) =>
            m.map((x) =>
              x.id === assistantId
                ? { ...x, content: x.content || `⚠️ ${err?.message ?? 'Something went wrong.'}` }
                : x,
            ),
          )
        }
      } finally {
        if (isLive()) setStreaming(false)
        abortRef.current = null
      }

      // Build the final transcript explicitly (NOT from the on-screen messages),
      // so a background run that finished off-screen still saves correctly.
      const assistantMsg: StoredMessage = {
        id: assistantId,
        role: 'assistant',
        content: finalContent || '⚠️ No response.',
        reasoning: finalReasoning || undefined,
        thinkMs: thinkStart ? (thinkEnd || Date.now()) - thinkStart : undefined,
        model: effModel,
        steps: localSteps.length ? [...localSteps] : undefined,
        map: placesData ?? undefined,
        weather: weatherData ?? undefined,
        agentBrowser,
        createdAt: Date.now(),
      } as StoredMessage & { agentBrowser?: AgentBrowserState }
      const finalMsgs: StoredMessage[] = [...history, assistantMsg]
      if (isLive()) setMessages(finalMsgs)

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
      // If the user navigated away while this finished, flag the chat as unread
      // (blue dot in the sidebar) instead of silently completing.
      if (!isLive()) markUnread(id)

      // Suggested follow-up prompts — generated after the answer so the user can
      // keep the conversation going with one tap. Best-effort, never blocks.
      if (finalContent && finalContent.trim().length > 40 && !opts.projectId) {
        complete(
          'llama-3.1-8b-instant',
          [
            {
              role: 'system',
              content:
                'Given a user question and the assistant answer, suggest 3 short natural follow-up questions the user might ask next. Output ONLY a JSON array of 3 strings, each under 8 words, no numbering.',
            },
            { role: 'user', content: `Q: ${(history[history.length - 1]?.content ?? '').slice(0, 400)}\nA: ${finalContent.slice(0, 700)}` },
          ],
          { temperature: 0.6, maxTokens: 120 },
        )
          .then((raw) => {
            const m = raw.match(/\[[\s\S]*\]/)
            if (!m) return
            const arr = JSON.parse(m[0])
            const ups = Array.isArray(arr)
              ? arr.filter((s) => typeof s === 'string' && s.trim()).slice(0, 3)
              : []
            if (!ups.length) return
            const withUps = finalMsgs.map((x) => (x.id === assistantId ? { ...x, followups: ups } : x))
            if (isLive()) setMessages((mm) => mm.map((x) => (x.id === assistantId ? { ...x, followups: ups } : x)))
            persist(withUps, id, opts.model, opts.projectId).catch(() => {})
          })
          .catch(() => {})
      }

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
    [user, settings, memories, persist, refreshMemories, chatAgent],
  )

  const send = useCallback(
    async (text: string, attachments: Attachment[], opts: SendOptions) => {
      if (!user || (!text.trim() && attachments.length === 0) || streaming) return
      modelRef.current = opts.model
      // Earn AskAI coins for chatting (daily-capped).
      try {
        earnFromChat(user.uid)
      } catch {
        /* economy is best-effort */
      }

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

  const toggleBookmark = useCallback(
    (messageId: string) => {
      if (!user || !chatId) return
      let updated: StoredMessage[] = []
      setMessages((m) => {
        updated = m.map((x) => (x.id === messageId ? { ...x, bookmarked: !x.bookmarked } : x))
        return updated
      })
      persist(updated, chatId, modelRef.current).catch(() => {})
    },
    [user, chatId, persist],
  )

  // ----- Resume unfinished runs --------------------------------------------
  // If the user closed AskAI while a chat/agent task was still generating, the
  // user's turn was saved but no answer followed. On reopening that chat we
  // pick the run back up and finish it automatically.
  const resumedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!user || !chatId || streaming) return
    if (resumedRef.current.has(chatId)) return
    if (!messages.length) return
    if (!isPending(user.uid, chatId)) return

    const last = messages[messages.length - 1]
    const lastAssistantEmpty =
      last?.role === 'assistant' && !last.content && !last.steps?.length && !last.image && !last.deck
    const needsAnswer = last?.role === 'user' || lastAssistantEmpty
    if (!needsAnswer) {
      clearPending(user.uid, chatId)
      return
    }

    resumedRef.current.add(chatId)
    let opts: SendOptions
    try {
      opts = loadPendingRuns(user.uid).find((r) => r.chatId === chatId)?.opts ?? {
        model: modelRef.current,
        webSearch: false,
        agent: false,
      }
    } catch {
      opts = { model: modelRef.current, webSearch: false, agent: false }
    }
    // Drop a dangling empty assistant turn, then re-run from the last user turn.
    const base = lastAssistantEmpty ? messages.slice(0, -1) : messages
    setMessages(base)
    void run(base, opts, chatId)
  }, [user, chatId, messages, streaming, run])

  return { messages, streaming, steps, send, stop, regenerate, editAndResend, toggleBookmark, loadedModel, chatAgent }
}
