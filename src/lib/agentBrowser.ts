export type AgentBrowserStatus = 'idle' | 'running' | 'done' | 'error' | 'unavailable'

export interface AgentBrowserEvent {
  type: 'start' | 'search' | 'open' | 'click' | 'type' | 'read' | 'screenshot' | 'done' | 'error'
  label: string
  url?: string
  at?: number
}

export interface AgentBrowserState {
  status: AgentBrowserStatus
  sessionId?: string
  liveUrl?: string
  currentUrl?: string
  title?: string
  screenshot?: string
  summary?: string
  sources?: { title: string; url: string }[]
  events: AgentBrowserEvent[]
  error?: string
}

export function getAgentBrowserUrl(): string {
  const configured = ((import.meta.env.VITE_AGENT_BROWSER_URL as string) || '').trim()
  if (configured) return configured.replace(/\/$/, '')
  try {
    const host = window.location.hostname
    if (host.endsWith('.netlify.app') || host.endsWith('.netlify.live')) return '/api/agent-browser'
    // GitHub Pages/static hosts cannot run backend functions. Do not POST to
    // /api/agent-browser there, because it returns 405 and looks like Agent broke.
    if (host.endsWith('github.io')) return ''
    if (host && host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return '/api/agent-browser'
  } catch {
    /* ignore */
  }
  return ''
}

function normalizeEvent(event: Partial<AgentBrowserEvent>, fallback: string): AgentBrowserEvent {
  const type = event.type || 'read'
  return {
    type,
    label: event.label || fallback,
    url: event.url,
    at: event.at || Date.now(),
  } as AgentBrowserEvent
}

function normalizeState(raw: any, fallbackEvents: AgentBrowserEvent[] = []): AgentBrowserState {
  const events = Array.isArray(raw?.events)
    ? raw.events.map((event: any, i: number) => normalizeEvent(event, `Browser action ${i + 1}`))
    : fallbackEvents
  return {
    status: raw?.status === 'error' || raw?.status === 'unavailable' ? raw.status : 'done',
    sessionId: raw?.sessionId,
    liveUrl: raw?.liveUrl,
    currentUrl: raw?.currentUrl,
    title: raw?.title,
    screenshot: raw?.screenshot,
    summary: raw?.summary,
    sources: Array.isArray(raw?.sources) ? raw.sources : undefined,
    events,
    error: raw?.error,
  }
}

async function readEventStream(
  res: Response,
  onEvent?: (event: AgentBrowserEvent) => void,
): Promise<AgentBrowserState> {
  const reader = res.body?.getReader()
  if (!reader) return normalizeState(await res.json())
  const decoder = new TextDecoder()
  let buffer = ''
  const events: AgentBrowserEvent[] = []
  let final: any = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const data = chunk
        .split('\n')
        .find((line) => line.startsWith('data:'))
        ?.slice(5)
        .trim()
      if (!data) continue
      try {
        const parsed = JSON.parse(data)
        if (parsed.final) final = parsed.final
        else {
          const event = normalizeEvent(parsed, parsed.label || 'Browser action')
          events.push(event)
          onEvent?.(event)
        }
      } catch {
        /* ignore malformed stream chunks */
      }
    }
  }

  return normalizeState(final || { status: 'done', events }, events)
}

export async function runAgentBrowserTask(
  prompt: string,
  opts: { signal?: AbortSignal; onEvent?: (event: AgentBrowserEvent) => void } = {},
): Promise<AgentBrowserState> {
  const endpoint = getAgentBrowserUrl()
  const started = normalizeEvent({ type: 'start', label: 'Starting real browser session' }, 'Starting real browser session')
  if (!endpoint) {
    return {
      status: 'unavailable',
      events: [started],
      error: 'Agent browser backend URL is not configured for this deployment. Set VITE_AGENT_BROWSER_URL to the Cloudflare/Netlify browser worker URL.',
    }
  }

  opts.onEvent?.(started)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: opts.signal,
    })
    const contentType = res.headers.get('content-type') || ''
    if (!res.ok) {
      let detail = ''
      try {
        detail = (await res.json())?.error || ''
      } catch {
        detail = await res.text().catch(() => '')
      }
      return {
        status: res.status === 501 || res.status === 404 || res.status === 405 ? 'unavailable' : 'error',
        events: [started],
        error: detail || `Agent browser backend unavailable (${res.status}).`,
      }
    }
    if (contentType.includes('text/event-stream')) return readEventStream(res, opts.onEvent)
    return normalizeState(await res.json(), [started])
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e
    return {
      status: 'error',
      events: [started],
      error: e?.message || 'Agent browser failed.',
    }
  }
}
