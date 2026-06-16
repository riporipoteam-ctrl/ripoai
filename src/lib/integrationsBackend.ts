// Typed client for the AskAI Integrations Worker (worker/integrations-worker.js).
// Real OAuth connect/disconnect + status. Tokens never reach the client — the
// Worker stores them in KV and returns only connection metadata.
//
// Configure the Worker URL via VITE_INTEGRATIONS_WORKER_URL. When unset, these
// helpers report "not configured" so callers can fall back to the local
// preview-connect flow without throwing.

export type BackendProvider = 'github' | 'slack' | 'google' | 'notion' | 'linear'

export const BACKEND_PROVIDERS: BackendProvider[] = ['github', 'slack', 'google', 'notion', 'linear']

export interface ConnectionMeta {
  connectedAt: number
  scope: string
  team?: string
}

export interface IntegrationsStatus {
  /** Providers the current user has connected, keyed by provider id. */
  connected: Partial<Record<BackendProvider, ConnectionMeta>>
  /** Providers the owner has configured (has a client_id) — others can't connect. */
  configured: Partial<Record<BackendProvider, boolean>>
}

/** Base URL of the deployed Integrations Worker, or '' when not configured. */
export function getIntegrationsWorkerUrl(): string {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
  return (env?.VITE_INTEGRATIONS_WORKER_URL || '').trim().replace(/\/$/, '')
}

/** True when a backend Worker is configured (real OAuth available). */
export function hasIntegrationsBackend(): boolean {
  return !!getIntegrationsWorkerUrl()
}

class BackendNotConfiguredError extends Error {
  constructor() {
    super('Integrations backend is not configured (set VITE_INTEGRATIONS_WORKER_URL).')
    this.name = 'BackendNotConfiguredError'
  }
}

/**
 * Ask the Worker for a provider authorize URL, then return it so the caller can
 * redirect the browser to begin OAuth. `redirect` is where the provider sends
 * the user back after the Worker stores the token (defaults to the app origin).
 */
export async function oauthStartUrl(
  provider: BackendProvider,
  uid: string,
  redirect: string = typeof window !== 'undefined' ? window.location.origin : '',
): Promise<string> {
  const base = getIntegrationsWorkerUrl()
  if (!base) throw new BackendNotConfiguredError()
  const params = new URLSearchParams({ uid, redirect })
  const res = await fetch(`${base}/oauth/${provider}/start?${params.toString()}`)
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok || !data.url) {
    throw new Error(data.error || `Could not start ${provider} OAuth (${res.status}).`)
  }
  return data.url
}

/**
 * Convenience: kick off OAuth by navigating the current window to the provider
 * authorize URL. On return, the app lands back on `redirect?connected={provider}`.
 */
export async function startOAuth(provider: BackendProvider, uid: string, redirect?: string): Promise<void> {
  const url = await oauthStartUrl(provider, uid, redirect)
  if (typeof window !== 'undefined') window.location.assign(url)
}

/** Fetch which providers are connected (and which the owner configured). */
export async function fetchStatus(uid: string): Promise<IntegrationsStatus> {
  const base = getIntegrationsWorkerUrl()
  if (!base) return { connected: {}, configured: {} }
  const res = await fetch(`${base}/integrations/status?uid=${encodeURIComponent(uid)}`)
  if (!res.ok) throw new Error(`Could not fetch integrations status (${res.status}).`)
  const data = (await res.json()) as Partial<IntegrationsStatus>
  return {
    connected: data.connected ?? {},
    configured: data.configured ?? {},
  }
}

/** Disconnect a provider for this user (deletes the server-side token). */
export async function disconnect(provider: BackendProvider, uid: string): Promise<boolean> {
  const base = getIntegrationsWorkerUrl()
  if (!base) throw new BackendNotConfiguredError()
  const res = await fetch(`${base}/integrations/${provider}/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok) throw new Error(data.error || `Could not disconnect ${provider} (${res.status}).`)
  return data.ok !== false
}

/** A due job pushed up to the Worker so the cron can run it server-side. */
export interface SyncJob {
  id: string
  title: string
  prompt: string
  agentId?: string
  cadence: 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly'
  nextRunAt: number
  enabled?: boolean
  lastRunAt?: number
}

/** Push the user's jobs to the Worker's cron store. Returns how many were stored. */
export async function syncJobs(uid: string, jobs: SyncJob[]): Promise<number> {
  const base = getIntegrationsWorkerUrl()
  if (!base) return 0
  const res = await fetch(`${base}/jobs/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, jobs }),
  })
  const data = (await res.json().catch(() => ({}))) as { stored?: number; error?: string }
  if (!res.ok) throw new Error(data.error || `Could not sync jobs (${res.status}).`)
  return data.stored ?? 0
}

export interface RenderResult {
  ok: boolean
  url: string
  /** data:image/png;base64,... when ok. */
  image?: string
  title?: string
  /** Text snapshot of the page used as the fallback when no image is available. */
  snapshot?: string
  reason?: string
}

/**
 * Render a live screenshot of a page via the Worker's headless browser.
 * Always resolves (never throws) — on failure it returns `ok:false` with a URL
 * and text snapshot so the UI can degrade gracefully instead of showing a black
 * box. Returns null only when no Worker is configured.
 */
export async function renderPage(
  url: string,
  opts: { fullPage?: boolean; width?: number; height?: number; signal?: AbortSignal } = {},
): Promise<RenderResult | null> {
  const base = getIntegrationsWorkerUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}/browse/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, fullPage: opts.fullPage, width: opts.width, height: opts.height }),
      signal: opts.signal,
    })
    const data = (await res.json().catch(() => ({}))) as Partial<RenderResult>
    return {
      ok: !!data.ok,
      url: data.url || url,
      image: data.image,
      title: data.title,
      snapshot: data.snapshot,
      reason: data.reason,
    }
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e
    return { ok: false, url, reason: 'fetch_error' }
  }
}
