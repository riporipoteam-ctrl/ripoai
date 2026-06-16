import { isNative } from './native'

export type AgentBrowserStatus = 'idle' | 'running' | 'done' | 'error' | 'unavailable'

export interface AgentBrowserEvent {
  type: 'start' | 'search' | 'open' | 'click' | 'type' | 'read' | 'screenshot' | 'done' | 'error'
  label: string
  url?: string
  at?: number
  /** Live screenshot of the page this action landed on (updates the viewport). */
  screenshot?: string
  /** Page title for the browser chrome. */
  title?: string
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
  const started = normalizeEvent({ type: 'start', label: 'Starting browser session' }, 'Starting browser session')
  if (!endpoint) {
    // No remote browser backend → run the built-in browsing engine right here
    // in the app: it really searches, opens and reads pages, with live
    // screenshots — works on static hosting with zero backend.
    return runLocalBrowserAgent(prompt, opts)
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
    // Remote backend failed — fall back to the built-in browsing engine.
    return runLocalBrowserAgent(prompt, opts)
  }
}

// ============================================================================
// Built-in browsing engine — a real agent loop that runs in the app itself.
// The model decides each step (search / open a page / finish); pages are
// actually fetched and read; the viewport shows live screenshots of every
// page the agent lands on. No backend required.
// ============================================================================

const MAX_STEPS = 12
// Per-fetch read timeout. The browse loop runs through CORS proxies (Jina /
// allorigins / DuckDuckGo / thum.io) that are noticeably less reliable from
// inside the native WKWebView/Android WebView than from a desktop browser, so
// keep each request short there to avoid stacking up multi-second stalls.
const READER_TIMEOUT = isNative ? 9000 : 14000
// Hard wall-clock budget for the whole browse loop. The agent reply is gated
// behind this phase (it runs inline before the model streams), so it must never
// be able to block the answer indefinitely — on native, where the third-party
// proxies frequently hang, an unbounded loop is exactly why agents appeared to
// "never respond". When the budget is hit we stop browsing and let the model
// answer with whatever (if anything) was gathered.
const BROWSE_BUDGET_MS = isNative ? 45000 : 90000

function shotUrl(url: string): string {
  // thum.io renders on demand and returns the REAL page image (mshots often
  // returns a gray/black "Generating preview" placeholder that never resolves).
  // This is the <img src> the viewport falls back to when no headless render
  // backend is configured; the panel also tries the Worker's /browse/render for
  // a guaranteed real screenshot. We pass the screenshot URL through here so the
  // panel can decide how to display it.
  return `https://image.thum.io/get/width/1200/crop/800/noanimate/${url}`
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 40)
  }
}

function fetchTimeout(url: string, signal?: AbortSignal, ms = READER_TIMEOUT): Promise<Response> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  signal?.addEventListener('abort', () => ac.abort(), { once: true })
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t))
}

/** Quick reachability probe for the read proxy. On native WebViews the CORS
 *  proxies are sometimes blocked outright (ATS / network policy); when that's
 *  the case we want to find out in ~4s and skip browsing entirely rather than
 *  burning the whole budget on doomed requests while the user waits. Returns
 *  true if the web is reachable, false if browsing should be skipped. */
async function browsingReachable(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetchTimeout('https://r.jina.ai/https://example.com', signal, 4500)
    return res.ok
  } catch (e: any) {
    if (e?.name === 'AbortError' && signal?.aborted) throw e
    return false
  }
}

/** Read a page like a human would: full text content, title included. */
async function readPage(url: string, signal?: AbortSignal): Promise<{ title: string; text: string }> {
  // Primary reader: Jina (CORS-enabled, returns clean markdown with Title:).
  try {
    const res = await fetchTimeout(`https://r.jina.ai/${url}`, signal)
    if (res.ok) {
      const text = await res.text()
      const title = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || hostOf(url)
      return { title, text: text.slice(0, 7000) }
    }
  } catch {
    /* fall through to the proxy reader */
  }
  // Fallback reader: CORS proxy + strip the HTML ourselves.
  const res = await fetchTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, signal)
  if (!res.ok) throw new Error(`Could not load ${hostOf(url)} (${res.status}).`)
  const html = await res.text()
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || hostOf(url)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { title, text: text.slice(0, 7000) }
}

/** Search the web (DuckDuckGo) and extract organic result links. */
async function webSearch(
  query: string,
  signal?: AbortSignal,
): Promise<{ serpUrl: string; serpText: string; links: { title: string; url: string }[] }> {
  const serpUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
  const { text } = await readPage(serpUrl, signal)
  const links: { title: string; url: string }[] = []
  const seen = new Set<string>()
  const re = /\[([^\]]{3,120})\]\((https?:\/\/[^\s)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) && links.length < 10) {
    let url = m[2]
    // DuckDuckGo wraps results in a redirect — unwrap to the real site.
    const uddg = url.match(/[?&]uddg=([^&]+)/)?.[1]
    if (uddg) {
      try {
        url = decodeURIComponent(uddg)
      } catch {
        /* keep wrapped */
      }
    }
    const host = hostOf(url)
    if (/duckduckgo\.com|duck\.co/.test(host) || seen.has(url)) continue
    seen.add(url)
    links.push({ title: m[1].replace(/\s+/g, ' ').trim(), url })
  }
  return { serpUrl, serpText: text.slice(0, 3500), links }
}

interface BrowserDecision {
  action: 'search' | 'open' | 'done'
  query?: string
  url?: string
  thought?: string
  answer?: string
}

function parseDecision(out: string): BrowserDecision | null {
  const m = out.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[0])
    if (parsed.action === 'search' || parsed.action === 'open' || parsed.action === 'done') return parsed
  } catch {
    /* unparseable */
  }
  return null
}

export async function runLocalBrowserAgent(
  prompt: string,
  opts: { signal?: AbortSignal; onEvent?: (event: AgentBrowserEvent) => void } = {},
): Promise<AgentBrowserState> {
  // Lazy import to avoid a dependency cycle (groq.ts is the chat core).
  const { complete } = await import('./groq')
  const { signal, onEvent } = opts
  const events: AgentBrowserEvent[] = []
  const visited: { title: string; url: string; excerpt: string }[] = []
  // Track what we've already opened so a confused model can't burn the budget
  // re-reading the same page (or re-running the same search) over and over.
  const openedUrls = new Set<string>()
  let currentUrl = ''
  let currentTitle = ''
  let screenshot = ''
  let pageText = ''
  let searchLinks: { title: string; url: string }[] = []

  const emit = (ev: Partial<AgentBrowserEvent>) => {
    const full = normalizeEvent(
      { ...ev, screenshot: ev.screenshot ?? (screenshot || undefined), title: ev.title ?? (currentTitle || undefined) } as AgentBrowserEvent,
      ev.label || 'Browser action',
    )
    ;(full as AgentBrowserEvent).screenshot = ev.screenshot ?? (screenshot || undefined)
    ;(full as AgentBrowserEvent).title = ev.title ?? (currentTitle || undefined)
    events.push(full)
    onEvent?.(full)
  }
  const aborted = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  emit({ type: 'start', label: 'Launching AskAI browser' })

  const deadline = Date.now() + BROWSE_BUDGET_MS
  const outOfTime = () => Date.now() > deadline

  // Preflight: if the read proxies aren't reachable (common inside the native
  // app's WebView), don't spin — return 'unavailable' immediately so the model
  // still answers right away from its own knowledge instead of the user staring
  // at a hung browser panel.
  if (!(await browsingReachable(signal))) {
    emit({ type: 'error', label: 'Live browsing is unavailable here' })
    return {
      status: 'unavailable',
      events,
      error: 'Live web browsing could not be reached from this device — answering directly.',
    }
  }

  const directUrl = prompt.match(/https?:\/\/[^\s)"']+/i)?.[0]?.replace(/[),.]+$/, '')

  const decideSystem = `You are AskAI Agent controlling a real web browser to complete the user's task.
Decide the SINGLE next browser action. Reply with ONLY compact JSON, no prose:
{"action":"search","query":"...","thought":"short reason"} — type a query into the search engine
{"action":"open","url":"https://...","thought":"short reason"} — click/open one of the available links or a URL you know
{"action":"done","answer":"...full answer for the user, with concrete findings and source URLs...","thought":"why done"}
Rules: BE THOROUGH — real tasks need several pages, comparisons and cross-checking, not one quick look. Open the most promising pages, read them, refine your search, and verify facts across at least 2-3 different sources before finishing. Only choose "done" when you genuinely have everything needed for a complete, specific answer (names, numbers, prices, steps) with the URLs you used. If a page failed to load or was useless, try a different one. Never give up early.`

  for (let step = 0; step < MAX_STEPS; step++) {
    aborted()
    // Budget exhausted mid-loop: stop browsing and summarize what we have so the
    // reply is never blocked past BROWSE_BUDGET_MS.
    if (outOfTime()) break
    const context = [
      `TASK: ${prompt}`,
      visited.length
        ? `PAGES READ SO FAR:\n${visited.map((v, i) => `${i + 1}. ${v.title} — ${v.url}\n${v.excerpt.slice(0, 700)}`).join('\n\n')}`
        : 'No pages read yet.',
      searchLinks.length
        ? `LINKS AVAILABLE TO OPEN:\n${searchLinks.map((l, i) => `${i + 1}. ${l.title} — ${l.url}`).join('\n')}`
        : '',
      currentUrl ? `CURRENT PAGE: ${currentTitle} (${currentUrl})\n${pageText.slice(0, 2500)}` : '',
      step >= MAX_STEPS - 3
        ? `This is browser step ${step + 1} of ${MAX_STEPS} — the budget is nearly used. Wrap up: if you can answer, action must be "done" with your complete findings.`
        : `This is browser step ${step + 1} of ${MAX_STEPS}. Keep working until the task is properly researched — do not rush to "done" with thin findings.`,
    ]
      .filter(Boolean)
      .join('\n\n')

    let decision: BrowserDecision | null = null
    try {
      const out = await complete(
        'llama-3.3-70b-versatile',
        [
          { role: 'system', content: decideSystem },
          { role: 'user', content: context },
        ],
        { temperature: 0.2, maxTokens: 900 },
      )
      decision = parseDecision(out)
    } catch {
      /* decision model failed — use fallbacks below */
    }

    // Fallbacks: first step opens a direct URL or searches the task; later
    // steps finish up with what we have.
    if (!decision) {
      decision =
        step === 0
          ? directUrl
            ? { action: 'open', url: directUrl }
            : { action: 'search', query: prompt.slice(0, 120) }
          : { action: 'done' }
    }

    if (decision.action === 'done' && visited.length < 2 && step < MAX_STEPS - 2 && !outOfTime()) {
      // Too hasty — it hasn't actually read enough. Force more research.
      decision = visited.length || searchLinks.length
        ? { action: 'open', url: (searchLinks[0]?.url ?? visited[0]?.url) as string }
        : { action: 'search', query: prompt.slice(0, 120) }
      if (!decision.url && decision.action === 'open') decision = { action: 'search', query: prompt.slice(0, 120) }
    }

    if (decision.action === 'done') {
      let answer = decision.answer || ''
      if (!answer && visited.length) {
        try {
          answer = await complete(
            'llama-3.3-70b-versatile',
            [
              {
                role: 'system',
                content:
                  'Write the final answer for the user based on the pages the browser agent read. Be concrete (names, numbers, prices) and cite the source URLs inline as Markdown links.',
              },
              {
                role: 'user',
                content: `TASK: ${prompt}\n\nPAGES READ:\n${visited
                  .map((v) => `## ${v.title} (${v.url})\n${v.excerpt}`)
                  .join('\n\n')}`,
              },
            ],
            { temperature: 0.4, maxTokens: 1200 },
          )
        } catch {
          answer = ''
        }
      }
      emit({ type: 'done', label: 'Task complete' })
      return {
        status: 'done',
        currentUrl: currentUrl || undefined,
        title: currentTitle || undefined,
        screenshot: screenshot || undefined,
        summary: answer || undefined,
        sources: visited.map((v) => ({ title: v.title, url: v.url })),
        events,
      }
    }

    if (decision.action === 'search' && decision.query) {
      emit({ type: 'type', label: `Typing "${decision.query.slice(0, 60)}" into search` })
      try {
        const res = await webSearch(decision.query, signal)
        aborted()
        currentUrl = res.serpUrl
        currentTitle = `Search: ${decision.query.slice(0, 50)}`
        screenshot = shotUrl(res.serpUrl)
        pageText = res.serpText
        searchLinks = res.links
        emit({ type: 'search', label: `Found ${res.links.length} results`, url: res.serpUrl, screenshot, title: currentTitle })
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e
        emit({ type: 'error', label: `Search failed — retrying differently` })
      }
      continue
    }

    if (decision.action === 'open' && decision.url) {
      const url = decision.url
      // Already read this page — don't waste a step/round-trip re-opening it.
      if (openedUrls.has(url)) {
        searchLinks = searchLinks.filter((l) => l.url !== url)
        continue
      }
      openedUrls.add(url)
      emit({ type: 'click', label: `Clicking ${hostOf(url)}`, url })
      try {
        const page = await readPage(url, signal)
        aborted()
        currentUrl = url
        currentTitle = page.title
        screenshot = shotUrl(url)
        pageText = page.text
        visited.push({ title: page.title, url, excerpt: page.text.slice(0, 1800) })
        emit({ type: 'read', label: `Reading ${page.title.slice(0, 60)}`, url, screenshot, title: page.title })
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e
        emit({ type: 'error', label: `${hostOf(url)} did not load — trying another page`, url })
        searchLinks = searchLinks.filter((l) => l.url !== url)
      }
      continue
    }

    // Unrecognized decision — nudge toward finishing.
    searchLinks = []
  }

  // Step budget exhausted — summarize whatever was read.
  let answer = ''
  if (visited.length) {
    try {
      answer = await complete(
        'llama-3.3-70b-versatile',
        [
          {
            role: 'system',
            content:
              'Write the final answer for the user based on the pages the browser agent read. Be concrete and cite source URLs inline as Markdown links. If the pages were not enough, say what was found and what to try next.',
          },
          {
            role: 'user',
            content: `TASK: ${prompt}\n\nPAGES READ:\n${visited.map((v) => `## ${v.title} (${v.url})\n${v.excerpt}`).join('\n\n')}`,
          },
        ],
        { temperature: 0.4, maxTokens: 1200 },
      )
    } catch {
      /* leave empty */
    }
  }
  emit({ type: 'done', label: 'Browser session finished' })
  return {
    status: 'done',
    currentUrl: currentUrl || undefined,
    title: currentTitle || undefined,
    screenshot: screenshot || undefined,
    summary: answer || undefined,
    sources: visited.map((v) => ({ title: v.title, url: v.url })),
    events,
  }
}
