// Apps / Integrations — connect external services that agents (and chat) can
// act on. Each integration is a service (GitHub, Slack, Gmail …) that, once
// connected, can be wired to one or more agents' tools.
//
// Two layers live in this file:
//   1. The per-agent WIRING + local catalog state (connect/disconnect/toggleAgent)
//      used by the Apps grid — unchanged, backed by localStorage.
//   2. The real ONE-CLICK OAUTH client (startConnect / refreshStatus /
//      disconnectProvider) that talks to the AskAI backend Worker. The user
//      never enters API keys — OAuth is handled securely server-side. The
//      connection state is cached in localStorage and exposed as an observable
//      so chat AND agents can read it app-wide. If the Worker isn't deployed
//      yet the client degrades gracefully (status simply stays disconnected).

export type IntegrationCategory =
  | 'dev'
  | 'comms'
  | 'email'
  | 'docs'
  | 'calendar'
  | 'automation'

export interface IntegrationMeta {
  id: string
  label: string
  description: string
  category: IntegrationCategory
  /** lucide-react icon name used to render the service mark. */
  icon: string
  /** Brand-ish accent used for the icon tile background/tint. */
  color: string
  /** Short scopes/capabilities this service exposes to agents. */
  scopes: string[]
  /** Which agent tool ids (see AGENT_TOOL_CATALOG) this service can power. */
  agentTools: string[]
}

export interface Integration extends IntegrationMeta {
  connected: boolean
  connectedAt?: number
  /** Agent ids the user has made this integration available to. */
  agentIds: string[]
}

/** The catalog of connectable services, mirroring Nebula's Apps grid. */
export const INTEGRATIONS: IntegrationMeta[] = [
  {
    id: 'github',
    label: 'GitHub',
    description: 'Repos, issues and pull requests.',
    category: 'dev',
    icon: 'Github',
    color: '#8b5cf6',
    scopes: ['Read repos', 'Open issues', 'Review PRs'],
    agentTools: ['code', 'files'],
  },
  {
    id: 'slack',
    label: 'Slack',
    description: 'Send messages and read channels.',
    category: 'comms',
    icon: 'Slack',
    color: '#10b981',
    scopes: ['Post messages', 'Read channels'],
    agentTools: ['memory'],
  },
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Read and send email on your behalf.',
    category: 'email',
    icon: 'Mail',
    color: '#ef4444',
    scopes: ['Read inbox', 'Send email'],
    agentTools: ['email'],
  },
  {
    id: 'notion',
    label: 'Notion',
    description: 'Docs and databases.',
    category: 'docs',
    icon: 'FileText',
    color: '#6366f1',
    scopes: ['Read pages', 'Update databases'],
    agentTools: ['files', 'memory'],
  },
  {
    id: 'gcal',
    label: 'Google Calendar',
    description: 'Read events and schedule meetings.',
    category: 'calendar',
    icon: 'Calendar',
    color: '#06b6d4',
    scopes: ['Read events', 'Create events'],
    agentTools: ['memory'],
  },
  {
    id: 'linear',
    label: 'Linear',
    description: 'Track issues, projects and cycles.',
    category: 'dev',
    icon: 'Trello',
    color: '#a855f7',
    scopes: ['Read issues', 'Create issues'],
    agentTools: ['code', 'files'],
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    description: 'Trigger external services via HTTP.',
    category: 'automation',
    icon: 'Webhook',
    color: '#f59e0b',
    scopes: ['Send requests', 'Receive events'],
    agentTools: ['code'],
  },
]

export const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  dev: 'Developer',
  comms: 'Communication',
  email: 'Email',
  docs: 'Docs',
  calendar: 'Calendar',
  automation: 'Automation',
}

/** Per-user localStorage shape: just the mutable state, keyed by integration id.
 *  The immutable catalog (label, icon …) lives in INTEGRATIONS and is merged in
 *  by loadIntegrations, so adding/renaming catalog entries never needs a
 *  migration. */
interface IntegrationState {
  connected: boolean
  connectedAt?: number
  agentIds: string[]
}

const key = (uid: string) => `askai:integrations:${uid}`
const CHANGED_EVENT = 'askai-integrations-changed'

function readState(uid: string): Record<string, IntegrationState> {
  try {
    const raw = localStorage.getItem(key(uid))
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? (obj as Record<string, IntegrationState>) : {}
  } catch {
    return {}
  }
}

function writeState(uid: string, state: Record<string, IntegrationState>) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

/** Subscribe to integration changes (returns an unsubscribe fn). */
export function onIntegrationsChanged(fn: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, fn)
  return () => window.removeEventListener(CHANGED_EVENT, fn)
}

/** The full, merged list of integrations for a user (catalog + saved state). */
export function loadIntegrations(uid: string): Integration[] {
  const state = readState(uid)
  return INTEGRATIONS.map((meta) => {
    const s = state[meta.id]
    return {
      ...meta,
      connected: s?.connected ?? false,
      connectedAt: s?.connectedAt,
      agentIds: Array.isArray(s?.agentIds) ? s!.agentIds : [],
    }
  })
}

export function getIntegration(uid: string, id: string): Integration | null {
  return loadIntegrations(uid).find((i) => i.id === id) ?? null
}

export function isConnected(uid: string, id: string): boolean {
  return readState(uid)[id]?.connected ?? false
}

/** Simulated connect (preview). Marks the integration connected locally.
 *  TODO: real OAuth — replace with a backend redirect/token exchange. */
export function connect(uid: string, id: string): Integration | null {
  if (!INTEGRATIONS.some((i) => i.id === id)) return null
  const state = readState(uid)
  const prev = state[id]
  state[id] = {
    connected: true,
    connectedAt: Date.now(),
    agentIds: prev?.agentIds ?? [],
  }
  writeState(uid, state)
  return getIntegration(uid, id)
}

export function disconnect(uid: string, id: string): Integration | null {
  const state = readState(uid)
  if (state[id]) {
    state[id] = { ...state[id], connected: false, connectedAt: undefined }
    writeState(uid, state)
  }
  return getIntegration(uid, id)
}

/** Toggle whether a connected integration is available to a given agent.
 *  Integration↔agent wiring lives entirely in THIS store — we never write to
 *  the agents.ts state schema. */
export function toggleAgent(uid: string, id: string, agentId: string): Integration | null {
  const state = readState(uid)
  const s = state[id] ?? { connected: false, agentIds: [] as string[] }
  const has = s.agentIds.includes(agentId)
  state[id] = {
    ...s,
    agentIds: has ? s.agentIds.filter((a) => a !== agentId) : [...s.agentIds, agentId],
  }
  writeState(uid, state)
  return getIntegration(uid, id)
}

/** Is this integration available to the given agent? */
export function isAvailableToAgent(uid: string, id: string, agentId: string): boolean {
  return readState(uid)[id]?.agentIds.includes(agentId) ?? false
}

/** Count of currently-connected integrations (for headers/badges). */
export function connectedCount(uid: string): number {
  const state = readState(uid)
  return INTEGRATIONS.reduce((n, i) => n + (state[i.id]?.connected ? 1 : 0), 0)
}

// ────────────────────────────────────────────────────────────────────────────
// Real one-click OAuth — backed by the AskAI backend Worker.
//
// The user never enters API keys: clicking "Connect" opens the provider's OAuth
// consent screen (popup/new tab) hosted by the Worker, and we then poll the
// Worker for the resulting connection status. Status is cached locally and
// broadcast through an observable so the whole app (chat + agents) sees it.
//
// Client ↔ Worker contract:
//   GET  {base}/oauth/{provider}/start?uid=&redirect=  → { url }
//   GET  {base}/integrations/status?uid=               → { connected: { github:bool, … } }
//   POST {base}/integrations/{provider}/disconnect     body { uid }
// ────────────────────────────────────────────────────────────────────────────

import { getNvidiaProxyRoot } from './groq'

/** Provider ids that have a real server-side OAuth flow. */
export type ProviderId =
  | 'github'
  | 'slack'
  | 'gmail'
  | 'gcal'
  | 'notion'
  | 'linear'
  | 'webhooks'

export type ConnectionMap = Partial<Record<ProviderId, boolean>>

/** Resolve the backend base URL. Prefers an explicit integrations base, then
 *  the shared NVIDIA proxy/worker root, so a single deployed Worker can serve
 *  both. */
export function getIntegrationsBase(): string {
  let base = ''
  try {
    base = ((import.meta.env.VITE_INTEGRATIONS_BASE as string) || '').trim()
  } catch {
    /* ignore */
  }
  if (!base) {
    try {
      base = getNvidiaProxyRoot()
    } catch {
      base = ''
    }
  }
  return base.replace(/\/$/, '')
}

const STATUS_KEY = (uid: string) => `askai:integrations:status:${uid}`
const STATUS_EVENT = 'askai-integrations-status'

let memStatus: ConnectionMap = {}
let memStatusUid: string | null = null

function loadCachedStatus(uid: string): ConnectionMap {
  if (memStatusUid === uid) return memStatus
  try {
    const raw = localStorage.getItem(STATUS_KEY(uid))
    const obj = raw ? JSON.parse(raw) : {}
    memStatus = obj && typeof obj === 'object' ? (obj as ConnectionMap) : {}
  } catch {
    memStatus = {}
  }
  memStatusUid = uid
  return memStatus
}

function saveCachedStatus(uid: string, status: ConnectionMap) {
  memStatus = status
  memStatusUid = uid
  try {
    localStorage.setItem(STATUS_KEY(uid), JSON.stringify(status))
  } catch {
    /* ignore quota */
  }
  // Mirror into the per-integration catalog state so the existing Apps grid
  // (and connectedCount) reflect real OAuth connections too.
  try {
    const state = readState(uid)
    for (const meta of INTEGRATIONS) {
      const connected = !!status[meta.id as ProviderId]
      const prev = state[meta.id]
      if (connected) {
        state[meta.id] = {
          connected: true,
          connectedAt: prev?.connectedAt ?? Date.now(),
          agentIds: prev?.agentIds ?? [],
        }
      } else if (prev?.connected) {
        state[meta.id] = { ...prev, connected: false, connectedAt: undefined }
      }
    }
    writeState(uid, state)
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(STATUS_EVENT))
  } catch {
    /* ignore */
  }
}

/** Synchronously read the cached connection map (no network). Safe for render. */
export function getConnectionStatus(uid: string): ConnectionMap {
  return loadCachedStatus(uid)
}

/** True if a provider is connected, per the local status cache. */
export function isProviderConnected(uid: string, provider: ProviderId): boolean {
  return !!loadCachedStatus(uid)[provider]
}

/** Subscribe to OAuth connection-status changes (returns an unsubscribe fn).
 *  Both chat and agents can use this to react to connect/disconnect anywhere. */
export function onConnectionStatus(fn: () => void): () => void {
  window.addEventListener(STATUS_EVENT, fn)
  return () => window.removeEventListener(STATUS_EVENT, fn)
}

/** Fetch the live status from the Worker and update the local cache.
 *  Degrades gracefully (returns the cached map) if the Worker is unreachable. */
export async function refreshStatus(uid: string): Promise<ConnectionMap> {
  const base = getIntegrationsBase()
  if (!base || !uid) return loadCachedStatus(uid)
  try {
    const res = await fetch(
      `${base}/integrations/status?uid=${encodeURIComponent(uid)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return loadCachedStatus(uid)
    const data = (await res.json()) as { connected?: ConnectionMap }
    const next = (data && data.connected) || {}
    saveCachedStatus(uid, next)
    return next
  } catch {
    // Worker not deployed / offline — keep whatever we had.
    return loadCachedStatus(uid)
  }
}

export interface StartConnectResult {
  ok: boolean
  connected: boolean
  error?: string
}

/** One-click OAuth: ask the Worker for the provider's consent URL, open it in a
 *  popup (or new tab), then poll status until the provider flips to connected
 *  or the popup closes / we time out. The user never types an API key. */
export async function startConnect(
  uid: string,
  provider: ProviderId,
  opts: { signal?: AbortSignal } = {},
): Promise<StartConnectResult> {
  const base = getIntegrationsBase()
  if (!base) {
    return {
      ok: false,
      connected: false,
      error: 'Connections aren’t available yet — the AskAI backend isn’t configured.',
    }
  }
  if (!uid) return { ok: false, connected: false, error: 'Please sign in first.' }

  // The Worker redirects back here after consent; it closes its own tab.
  const redirect = `${window.location.origin}/oauth/callback`
  let url = ''
  try {
    const res = await fetch(
      `${base}/oauth/${provider}/start?uid=${encodeURIComponent(uid)}&redirect=${encodeURIComponent(redirect)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) throw new Error(`start failed (${res.status})`)
    const data = (await res.json()) as { url?: string }
    url = (data && data.url) || ''
  } catch {
    return {
      ok: false,
      connected: false,
      error: 'Couldn’t start the secure connection. The backend may not be deployed yet.',
    }
  }
  if (!url) {
    return { ok: false, connected: false, error: 'The backend didn’t return a sign-in link.' }
  }

  // Open the consent screen. Popup is nicer on desktop; falls back to a tab.
  let popup: Window | null = null
  try {
    popup = window.open(url, 'askai-oauth', 'width=520,height=680,noopener=no')
  } catch {
    popup = null
  }
  if (!popup) {
    // Popup blocked — navigate the current context as a fallback.
    try {
      window.open(url, '_blank')
    } catch {
      /* ignore */
    }
  }

  // Poll the Worker for up to ~2 minutes, or until the popup closes.
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) {
      return { ok: false, connected: false, error: 'Cancelled.' }
    }
    await new Promise((r) => setTimeout(r, 1500))
    const status = await refreshStatus(uid)
    if (status[provider]) {
      try {
        popup?.close()
      } catch {
        /* ignore */
      }
      return { ok: true, connected: true }
    }
    // If the user closed the popup without finishing, stop waiting.
    let closed = false
    try {
      closed = !!popup && popup.closed
    } catch {
      closed = false
    }
    if (closed) break
  }

  const finalStatus = await refreshStatus(uid)
  return { ok: true, connected: !!finalStatus[provider] }
}

/** Disconnect a provider server-side, then refresh the local status cache. */
export async function disconnectProvider(
  uid: string,
  provider: ProviderId,
): Promise<StartConnectResult> {
  const base = getIntegrationsBase()
  // Always clear local state first so the UI feels instant.
  const cached = { ...loadCachedStatus(uid) }
  delete cached[provider]
  saveCachedStatus(uid, cached)
  if (!base || !uid) return { ok: true, connected: false }
  try {
    await fetch(`${base}/integrations/${provider}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    })
  } catch {
    // Best-effort; local state is already cleared.
  }
  await refreshStatus(uid)
  return { ok: true, connected: false }
}
