// Direct browser -> Groq client. Groq returns `access-control-allow-origin: *`
// so the static GitHub Pages app can call it without a proxy.
//
// The key is NOT hardcoded in source — GitHub push protection refuses to let an
// API key be committed. Instead it is resolved at runtime from, in order:
//   1. a key the user saved in Settings (localStorage), or
//   2. the build-time env var VITE_GROQ_API_KEY (set as a GitHub Actions secret
//      for the deployed site, or in a local .env for development).
// The resolved key still ends up in the client bundle on the deployed site,
// which is the public/abusable trade-off the owner accepted.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const KEY_STORAGE = 'ripoai-groq-key'

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
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    max_completion_tokens: opts.maxTokens ?? 8192,
    top_p: opts.topP ?? 1,
    stream: true,
  }
  if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort

  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No API key set. Add your Groq API key in Settings → General.')

  const doFetch = (b: Record<string, unknown>) =>
    fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
      signal: opts.signal,
    })

  let res = await doFetch(body)

  // Free-tier tokens-per-minute (413): the requested max_completion_tokens
  // counts against the limit, so shrink it and retry once.
  if (res.status === 413) {
    body.max_completion_tokens = 1536
    res = await doFetch(body)
  }

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '')
    let msg = `Groq error ${res.status}`
    if (res.status === 413)
      msg = 'That request hit the free-tier rate limit. Try a shorter message or a faster model (RipoAI 1o/2o instant).'
    else if (res.status === 429) msg = 'Rate limited — please wait a few seconds and try again.'
    else msg = `${msg}: ${errText.slice(0, 200)}`
    throw new Error(msg)
  }

  let content = ''
  let reasoning = ''
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
        const delta = json.choices?.[0]?.delta
        if (!delta) continue
        // Native reasoning field (gpt-oss / deepseek style).
        if (typeof delta.reasoning === 'string' && delta.reasoning) {
          reasoning += delta.reasoning
          opts.onReasoning?.(delta.reasoning)
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
  return { content: content.trim(), reasoning: reasoning.trim() }
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
