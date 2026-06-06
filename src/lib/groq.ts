// Direct browser -> Groq client. Groq returns `access-control-allow-origin: *`
// so the static Firebase Hosting app can call it without a proxy.
//
// The key is NOT hardcoded in source — GitHub push protection refuses to let an
// API key be committed. Instead it is resolved at runtime from, in order:
//   1. a key the user saved in Settings (localStorage), or
//   2. the build-time env var VITE_GROQ_API_KEY (set as a GitHub Actions secret
//      for the deployed site, or in a local .env for development).
// The resolved key still ends up in the client bundle on the deployed site,
// which is the public/abusable trade-off the owner accepted.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const KEY_STORAGE = 'ripoai-groq-key'
const OR_KEY_STORAGE = 'ripoai-openrouter-key'

export function getApiKey(): string {
  try {
    const local = localStorage.getItem(KEY_STORAGE)
    if (local) return local
  } catch {
    /* ignore */
  }
  return (import.meta.env.VITE_GROQ_API_KEY as string) || ''
}

export function setApiKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* ignore */
  }
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0
}

export function getOpenRouterKey(): string {
  try {
    const local = localStorage.getItem(OR_KEY_STORAGE)
    if (local) return local
  } catch {
    /* ignore */
  }
  return (import.meta.env.VITE_OPENROUTER_API_KEY as string) || ''
}

export function setOpenRouterKey(key: string) {
  try {
    if (key) localStorage.setItem(OR_KEY_STORAGE, key)
    else localStorage.removeItem(OR_KEY_STORAGE)
  } catch {
    /* ignore */
  }
}

// NVIDIA NIM. NVIDIA's API does NOT send CORS headers, so the browser can't call
// it directly — point VITE_NVIDIA_BASE at a tiny proxy (see worker/nvidia-proxy)
// that forwards to https://integrate.api.nvidia.com and adds CORS. The proxy can
// also hold the key, in which case no client key is needed.
const NV_KEY_STORAGE = 'ripoai-nvidia-key'
const NVIDIA_DIRECT = 'https://integrate.api.nvidia.com/v1/chat/completions'
// Default proxy (Cloudflare Worker) that fronts NVIDIA with CORS + holds the key
// server-side. Hardcoding it is safe — it's just an endpoint, the key lives in
// the worker, not here. Override with VITE_NVIDIA_BASE if you redeploy it.
const NVIDIA_PROXY_DEFAULT = 'https://ripoai-nvidia.ripo-ripoteam.workers.dev'

export function getNvidiaBase(): string {
  let base = ((import.meta.env.VITE_NVIDIA_BASE as string) || '').trim()
  // Be resilient to a misconfigured secret (e.g. an API key pasted into
  // VITE_NVIDIA_BASE): anything that isn't an http(s) URL is ignored and we fall
  // back to the known-good worker. This prevents the app from POSTing to a
  // relative URL (which a static host answers with 405).
  if (!/^https?:\/\//i.test(base)) base = NVIDIA_PROXY_DEFAULT
  // Talking straight to NVIDIA (CORS will block browsers — only for proxies/tests).
  if (base.includes('integrate.api.nvidia.com')) return NVIDIA_DIRECT
  if (base.endsWith('/chat/completions')) return base
  // A proxy/worker: POST to it directly; it forwards to NVIDIA's endpoint.
  return base.replace(/\/$/, '')
}

// Root of the NVIDIA proxy (worker), used to build /genai/<model> image URLs.
export function getNvidiaProxyRoot(): string {
  return getNvidiaBase()
    .replace(/\/v1\/chat\/completions$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/$/, '')
}

export function getNvidiaKey(): string {
  try {
    const local = localStorage.getItem(NV_KEY_STORAGE)
    if (local) return local
  } catch {
    /* ignore */
  }
  return (import.meta.env.VITE_NVIDIA_API_KEY as string) || ''
}

export function setNvidiaKey(key: string) {
  try {
    if (key) localStorage.setItem(NV_KEY_STORAGE, key)
    else localStorage.removeItem(NV_KEY_STORAGE)
  } catch {
    /* ignore */
  }
}

export type TextPart = { type: 'text'; text: string }
export type ImagePart = { type: 'image_url'; image_url: { url: string } }
export type ContentPart = TextPart | ImagePart

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface StreamOptions {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  topP?: number
  reasoningEffort?: string
  /** 'groq' (default), 'openrouter', or 'nvidia'. */
  provider?: 'groq' | 'openrouter' | 'nvidia'
  /** Ask GLM (NVIDIA) to emit its thinking as reasoning. */
  thinking?: boolean
  signal?: AbortSignal
  /** Called with each token of the visible answer. */
  onToken?: (delta: string) => void
  /** Called with each token of reasoning (from <think> blocks or reasoning field). */
  onReasoning?: (delta: string) => void
  /** Tool/search activity surfaced by groq/compound. */
  onTool?: (info: ToolEvent) => void
}

export interface ToolEvent {
  type: string
  detail?: string
}

export interface StreamResult {
  content: string
  reasoning: string
  finishReason?: string
}

// Splits a token stream that may contain <think>...</think> reasoning inline
// (qwen3 / gpt-oss style) into visible content vs. reasoning.
class ThinkSplitter {
  private inThink = false
  private buffer = ''
  constructor(
    private onToken: (s: string) => void,
    private onReasoning: (s: string) => void,
  ) {}

  push(text: string) {
    this.buffer += text
    // Process complete-enough chunks, holding back a tail that could be a partial tag.
    while (true) {
      const tag = this.inThink ? '</think>' : '<think>'
      const idx = this.buffer.indexOf(tag)
      if (idx === -1) {
        // Emit everything except a possible partial tag at the end.
        const safe = this.holdbackTail()
        if (safe) this.emit(safe)
        return
      }
      const before = this.buffer.slice(0, idx)
      if (before) this.emit(before)
      this.buffer = this.buffer.slice(idx + tag.length)
      this.inThink = !this.inThink
    }
  }

  private holdbackTail(): string {
    // Keep back up to the length of the longest tag minus 1, in case a tag is split.
    const keep = 8
    if (this.buffer.length <= keep) return ''
    const out = this.buffer.slice(0, this.buffer.length - keep)
    this.buffer = this.buffer.slice(this.buffer.length - keep)
    return out
  }

  flush() {
    if (this.buffer) this.emit(this.buffer)
    this.buffer = ''
  }

  private emit(s: string) {
    if (this.inThink) this.onReasoning(s)
    else this.onToken(s)
  }
}

export async function streamChat(opts: StreamOptions): Promise<StreamResult> {
  const isOR = opts.provider === 'openrouter'
  const isNV = opts.provider === 'nvidia'
  const url = isNV ? getNvidiaBase() : isOR ? OPENROUTER_URL : GROQ_URL
  const apiKey = isNV ? getNvidiaKey() : isOR ? getOpenRouterKey() : getApiKey()
  // NVIDIA may be fronted by a proxy that holds the key, so a client key is
  // optional there; Groq/OpenRouter require one.
  if (!apiKey && !isNV) {
    throw new Error(
      isOR
        ? 'No OpenRouter API key set (Settings → General → OpenRouter key).'
        : 'No API key set. Add your Groq API key in Settings → General.',
    )
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    top_p: opts.topP ?? 1,
    stream: true,
  }
  // Groq uses max_completion_tokens + reasoning_effort; OpenRouter/NVIDIA use max_tokens.
  if (isOR || isNV) {
    body.max_tokens = opts.maxTokens ?? 4096
    if (isNV && opts.thinking)
      body.chat_template_kwargs = { enable_thinking: true, clear_thinking: false }
  } else {
    body.max_completion_tokens = opts.maxTokens ?? 8192
    if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (isOR) {
    headers['HTTP-Referer'] = 'https://ripoai-dff5d.web.app/'
    headers['X-Title'] = 'RipoAI'
  }

  const doFetch = (b: Record<string, unknown>) =>
    fetch(url, { method: 'POST', headers, body: JSON.stringify(b), signal: opts.signal })

  let res = await doFetch(body)

  // Free-tier tokens-per-minute (413): the requested max tokens count against
  // the limit, so shrink and retry once.
  if (res.status === 413) {
    if (isOR) body.max_tokens = 1536
    else body.max_completion_tokens = 1536
    res = await doFetch(body)
  }

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '')
    let msg = `Error ${res.status}`
    if (res.status === 413)
      msg = 'That request hit the free-tier rate limit. Try a shorter message or a faster model.'
    else if (res.status === 429) msg = 'rate-limited'
    else msg = `${msg}: ${errText.slice(0, 200)}`
    throw new Error(msg)
  }

  let content = ''
  let reasoning = ''
  let finishReason: string | undefined
  const splitter = new ThinkSplitter(
    (s) => {
      content += s
      opts.onToken?.(s)
    },
    (s) => {
      reasoning += s
      opts.onReasoning?.(s)
    },
  )

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const fr = json.choices?.[0]?.finish_reason
        if (fr) finishReason = fr
        const delta = json.choices?.[0]?.delta
        if (!delta) continue
        // Native reasoning field (gpt-oss / deepseek / GLM style).
        const reasoningDelta =
          (typeof delta.reasoning === 'string' && delta.reasoning) ||
          (typeof delta.reasoning_content === 'string' && delta.reasoning_content) ||
          ''
        if (reasoningDelta) {
          reasoning += reasoningDelta
          opts.onReasoning?.(reasoningDelta)
        }
        // compound tool/search activity.
        const execTools = delta.executed_tools || json.choices?.[0]?.delta?.executed_tools
        if (execTools && opts.onTool) {
          for (const t of execTools) {
            opts.onTool({ type: t.type || 'tool', detail: t.arguments || t.name })
          }
        }
        if (typeof delta.content === 'string' && delta.content) {
          splitter.push(delta.content)
        }
      } catch {
        // Ignore malformed keep-alive lines.
      }
    }
  }
  splitter.flush()
  // Strip any reasoning/tool tags that slipped into the visible answer.
  const cleanContent = content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<tool>[\s\S]*?<\/tool>/gi, '')
    .replace(/<output>[\s\S]*?<\/output>/gi, '')
    .replace(/<\/?(think|tool|output|reason|reasoning)>/gi, '')
    .trim()
  return { content: cleanContent, reasoning: reasoning.trim(), finishReason }
}

// Non-streaming completion for short utility tasks (titles, memory extraction).
export async function complete(
  model: string,
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_completion_tokens: opts.maxTokens ?? 512,
      stream: false,
    }),
  })
  if (!res.ok) throw new Error(`Groq error ${res.status}`)
  const json = await res.json()
  let text: string = json.choices?.[0]?.message?.content ?? ''
  // Strip any reasoning blocks from utility output.
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return text
}
