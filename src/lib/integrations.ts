// Apps / Integrations — connect external services that agents can act on,
// mirroring Nebula's Apps tab. Each integration is a service (GitHub, Slack,
// Gmail …) that, once connected, can be wired to one or more agents' tools.
//
// IMPORTANT: real OAuth requires a backend we don't have in this client-only
// build. `connect()` therefore performs a *simulated* (preview) connection —
// it only records the connection locally so the UI and per-agent wiring can be
// designed and demoed. The UI copy is honest about this ("Connect (preview)").
// TODO: real OAuth — swap connect()/disconnect() for a backend OAuth flow that
// exchanges a code for tokens and stores them server-side.

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
