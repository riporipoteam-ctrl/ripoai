// AskAI Integrations Worker — owner-deployed Cloudflare Worker that powers:
//   1. Real OAuth connect/disconnect for GitHub, Slack, Google (Gmail+Calendar),
//      Notion and Linear. End users connect WITHOUT any keys of their own — the
//      provider client_id/secret live in this Worker's env (owner sets them ONCE
//      with `wrangler secret put`). Tokens are stored server-side in KV and are
//      NEVER returned to the browser.
//   2. A 15-minute cron (`scheduled`) that runs due jobs stored in KV, plus a
//      `POST /jobs/sync` endpoint the client uses to push its due jobs up.
//   3. `POST /browse/render` — a real headless screenshot endpoint (Cloudflare
//      Browser Rendering) so the agent-browser preview shows the live page
//      instead of a black box, with a tidy URL/HTML snapshot fallback.
//
// Plain Workers module syntax. Do not import anything that isn't a Worker built-in.

// ---------------------------------------------------------------------------
// Provider registry. authUrl/tokenUrl/scopes are fixed; client_id + secret come
// from env (env.<PROVIDER>_CLIENT_ID / env.<PROVIDER>_CLIENT_SECRET).
// ---------------------------------------------------------------------------
const PROVIDERS = {
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'repo read:user',
    // GitHub returns JSON when asked via Accept header.
    extraAuth: {},
  },
  slack: {
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scope: 'chat:write,channels:read,channels:history',
    extraAuth: {},
  },
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope:
      'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar openid email profile',
    // Needed to get a refresh_token back.
    extraAuth: { access_type: 'offline', prompt: 'consent' },
  },
  notion: {
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scope: '',
    extraAuth: { owner: 'user' },
  },
  linear: {
    authUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
    scope: 'read write',
    extraAuth: {},
  },
}

const PROVIDER_IDS = Object.keys(PROVIDERS)

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function appOrigin(env) {
  // Comma-separated allowlist; first entry is the canonical app for redirects.
  return (env.APP_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean)
}

function corsHeaders(env, req) {
  const allow = appOrigin(env)
  const origin = req.headers.get('Origin') || ''
  const allowed = allow.includes(origin) ? origin : allow[0] || '*'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body, init = {}, env, req) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(env && req ? corsHeaders(env, req) : {}),
      ...(init.headers || {}),
    },
  })
}

function clientId(env, provider) {
  return env[`${provider.toUpperCase()}_CLIENT_ID`] || ''
}
function clientSecret(env, provider) {
  return env[`${provider.toUpperCase()}_CLIENT_SECRET`] || ''
}

function callbackUrl(env, req, provider) {
  // The Worker's own public URL + the callback path. Configure WORKER_PUBLIC_URL
  // to avoid surprises behind proxies; otherwise derive from the request.
  const base = (env.WORKER_PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, '')
  return `${base}/oauth/${provider}/callback`
}

// --- Signed state (HMAC) so the callback can trust uid/redirect/provider ----
function b64url(bytes) {
  let bin = ''
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlToBytes(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : ''
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
async function hmacKey(env) {
  const secret = env.STATE_SIGNING_SECRET || 'dev-insecure-secret-change-me'
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}
async function signState(env, payload) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await hmacKey(env)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `${body}.${b64url(sig)}`
}
async function verifyState(env, state) {
  const [body, sig] = String(state || '').split('.')
  if (!body || !sig) return null
  const key = await hmacKey(env)
  const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), new TextEncoder().encode(body))
  if (!ok) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)))
    if (!payload.ts || Date.now() - payload.ts > 15 * 60 * 1000) return null // 15-min window
    return payload
  } catch {
    return null
  }
}

const tokKey = (uid, provider) => `tok:${uid}:${provider}`
const jobKey = (uid, id) => `job:${uid}:${id}`

// ---------------------------------------------------------------------------
// OAuth: start
// ---------------------------------------------------------------------------
async function handleStart(env, req, provider, url) {
  const cfg = PROVIDERS[provider]
  if (!cfg) return json({ error: 'Unknown provider' }, { status: 404 }, env, req)
  const uid = url.searchParams.get('uid') || ''
  const redirect = url.searchParams.get('redirect') || appOrigin(env)[0]
  if (!uid) return json({ error: 'uid is required' }, { status: 400 }, env, req)
  const cid = clientId(env, provider)
  if (!cid) {
    return json(
      { error: `${provider} is not configured by the app owner (missing ${provider.toUpperCase()}_CLIENT_ID).` },
      { status: 501 },
      env,
      req,
    )
  }

  const state = await signState(env, { uid, provider, redirect, ts: Date.now() })
  const authParams = new URLSearchParams({
    client_id: cid,
    redirect_uri: callbackUrl(env, req, provider),
    response_type: 'code',
    state,
    ...cfg.extraAuth,
  })
  if (cfg.scope) authParams.set('scope', cfg.scope)
  return json({ url: `${cfg.authUrl}?${authParams.toString()}` }, {}, env, req)
}

// ---------------------------------------------------------------------------
// OAuth: callback → exchange code → store token in KV → redirect to app
// ---------------------------------------------------------------------------
async function exchangeCode(env, req, provider, code) {
  const cfg = PROVIDERS[provider]
  const params = {
    client_id: clientId(env, provider),
    client_secret: clientSecret(env, provider),
    code,
    redirect_uri: callbackUrl(env, req, provider),
    grant_type: 'authorization_code',
  }
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  // Notion uses HTTP Basic auth + JSON body for the token exchange.
  let res
  if (provider === 'notion') {
    res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Basic ${btoa(`${params.client_id}:${params.client_secret}`)}`,
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: params.redirect_uri }),
    })
  } else {
    res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers,
      body: new URLSearchParams(params).toString(),
    })
  }
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    // GitHub may return form-encoded if Accept header is ignored.
    data = Object.fromEntries(new URLSearchParams(text))
  }
  if (!res.ok || data.error || (provider === 'slack' && data.ok === false)) {
    throw new Error(data.error_description || data.error || `Token exchange failed (${res.status})`)
  }
  return data
}

async function handleCallback(env, req, provider, url) {
  const cfg = PROVIDERS[provider]
  const fallbackRedirect = appOrigin(env)[0]
  if (!cfg) return Response.redirect(`${fallbackRedirect}?error=unknown_provider`, 302)
  const code = url.searchParams.get('code') || ''
  const state = url.searchParams.get('state') || ''
  const payload = await verifyState(env, state)
  if (!payload || payload.provider !== provider) {
    return Response.redirect(`${fallbackRedirect}?error=bad_state`, 302)
  }
  const redirect = payload.redirect || fallbackRedirect

  if (!code) return Response.redirect(`${redirect}?error=denied&provider=${provider}`, 302)

  try {
    const data = await exchangeCode(env, req, provider, code)
    const record = {
      provider,
      access_token: data.access_token || data.authed_user?.access_token || '',
      refresh_token: data.refresh_token || '',
      token_type: data.token_type || '',
      scope: data.scope || cfg.scope || '',
      expires_at: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : 0,
      // Slack/Notion carry extra identifiers useful for API calls.
      team: data.team || data.workspace_name || undefined,
      bot_user_id: data.bot_user_id || undefined,
      connected_at: Date.now(),
    }
    await env.INTEGRATIONS.put(tokKey(payload.uid, provider), JSON.stringify(record))
    const sep = redirect.includes('?') ? '&' : '?'
    return Response.redirect(`${redirect}${sep}connected=${provider}`, 302)
  } catch (e) {
    const sep = redirect.includes('?') ? '&' : '?'
    return Response.redirect(`${redirect}${sep}error=${encodeURIComponent(e.message || 'oauth_failed')}&provider=${provider}`, 302)
  }
}

// ---------------------------------------------------------------------------
// Status + disconnect (tokens never leave the Worker)
// ---------------------------------------------------------------------------
async function handleStatus(env, req, url) {
  const uid = url.searchParams.get('uid') || ''
  if (!uid) return json({ error: 'uid is required' }, { status: 400 }, env, req)
  const connected = {}
  for (const provider of PROVIDER_IDS) {
    const raw = await env.INTEGRATIONS.get(tokKey(uid, provider))
    if (raw) {
      let meta = {}
      try {
        const rec = JSON.parse(raw)
        // Expose only non-secret metadata.
        meta = { connectedAt: rec.connected_at || 0, scope: rec.scope || '', team: rec.team }
      } catch {
        /* ignore */
      }
      connected[provider] = meta
    }
  }
  // Which providers the owner has actually configured (so the UI can disable the rest).
  const configured = {}
  for (const provider of PROVIDER_IDS) configured[provider] = !!clientId(env, provider)
  return json({ connected, configured }, {}, env, req)
}

async function handleDisconnect(env, req, provider) {
  if (!PROVIDERS[provider]) return json({ error: 'Unknown provider' }, { status: 404 }, env, req)
  let body = {}
  try {
    body = await req.json()
  } catch {
    /* empty body */
  }
  const uid = body.uid || ''
  if (!uid) return json({ error: 'uid is required' }, { status: 400 }, env, req)
  await env.INTEGRATIONS.delete(tokKey(uid, provider))
  return json({ ok: true, provider, connected: false }, {}, env, req)
}

// ---------------------------------------------------------------------------
// Jobs: client pushes due jobs; cron runs them.
// ---------------------------------------------------------------------------
async function handleJobsSync(env, req) {
  let body = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 }, env, req)
  }
  const uid = body.uid || ''
  const jobs = Array.isArray(body.jobs) ? body.jobs : []
  if (!uid) return json({ error: 'uid is required' }, { status: 400 }, env, req)

  let stored = 0
  for (const job of jobs) {
    if (!job || !job.id) continue
    const record = {
      id: String(job.id),
      uid,
      title: String(job.title || 'Job'),
      prompt: String(job.prompt || ''),
      agentId: job.agentId || '',
      cadence: job.cadence || 'daily',
      nextRunAt: Number(job.nextRunAt) || Date.now(),
      enabled: job.enabled !== false,
      lastRunAt: Number(job.lastRunAt) || 0,
    }
    await env.INTEGRATIONS.put(jobKey(uid, record.id), JSON.stringify(record), {
      // Auto-expire one-time jobs a week after they're due so KV doesn't grow forever.
      expirationTtl: record.cadence === 'once' ? 7 * 24 * 3600 + 60 : undefined,
    })
    stored++
  }
  return json({ ok: true, stored }, {}, env, req)
}

const CADENCE_MS = {
  hourly: 3600e3,
  daily: 864e5,
  weekly: 6048e5,
  monthly: 2592e6,
}

function advanceCadence(cadence, from) {
  if (cadence === 'once') return from
  return from + (CADENCE_MS[cadence] || CADENCE_MS.daily)
}

// Run one due job. We don't have model keys here by design; the Worker records
// the run and (optionally) calls a configured runner webhook so the heavy
// lifting can live wherever the owner wants. This keeps the cron honest and
// real (it advances schedules, records runs) without smuggling LLM keys in.
async function runJob(env, record) {
  const result = { ranAt: Date.now(), ok: true, note: '' }
  const runner = (env.JOB_RUNNER_URL || '').trim()
  if (runner) {
    try {
      const res = await fetch(runner, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.JOB_RUNNER_TOKEN ? { Authorization: `Bearer ${env.JOB_RUNNER_TOKEN}` } : {}),
        },
        body: JSON.stringify({ uid: record.uid, job: record }),
      })
      result.ok = res.ok
      result.note = res.ok ? 'runner accepted' : `runner ${res.status}`
    } catch (e) {
      result.ok = false
      result.note = `runner error: ${e.message}`
    }
  } else {
    result.note = 'no JOB_RUNNER_URL configured — run recorded only'
  }
  // Record last run + last result for observability.
  await env.INTEGRATIONS.put(`run:${record.uid}:${record.id}`, JSON.stringify(result), {
    expirationTtl: 30 * 24 * 3600,
  })
  return result
}

async function processDueJobs(env) {
  const now = Date.now()
  let processed = 0
  let cursor
  do {
    const list = await env.INTEGRATIONS.list({ prefix: 'job:', cursor })
    cursor = list.list_complete ? undefined : list.cursor
    for (const entry of list.keys) {
      const raw = await env.INTEGRATIONS.get(entry.name)
      if (!raw) continue
      let record
      try {
        record = JSON.parse(raw)
      } catch {
        continue
      }
      if (!record.enabled || record.nextRunAt > now) continue

      await runJob(env, record)
      processed++

      if (record.cadence === 'once') {
        // One-shot: disable so it never re-runs; keep around briefly for display.
        record.enabled = false
        record.lastRunAt = now
        await env.INTEGRATIONS.put(entry.name, JSON.stringify(record), { expirationTtl: 7 * 24 * 3600 })
      } else {
        // Advance to the next slot strictly after now (catch up if we missed several).
        let next = record.nextRunAt
        while (next <= now) next = advanceCadence(record.cadence, next)
        record.nextRunAt = next
        record.lastRunAt = now
        await env.INTEGRATIONS.put(entry.name, JSON.stringify(record))
      }
    }
  } while (cursor)
  return processed
}

// ---------------------------------------------------------------------------
// /browse/render — real headless screenshot via Cloudflare Browser Rendering.
// Body: { url, fullPage?, width?, height? }. Returns { ok, image (data: PNG),
// title, url } or, on failure, { ok:false, url, snapshot } so the client can
// still show the page URL + a text snapshot instead of a black box.
// ---------------------------------------------------------------------------
async function fetchSnapshot(targetUrl) {
  // Lightweight HTML snapshot (title + first text) used as the graceful fallback
  // when no headless renderer is configured or it errors.
  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AskAIBot/1.0)' },
      cf: { cacheTtl: 60 },
    })
    const html = await res.text()
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || ''
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200)
    return { title, snapshot: text }
  } catch {
    return { title: '', snapshot: '' }
  }
}

async function handleBrowseRender(env, req) {
  let body = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 }, env, req)
  }
  let targetUrl = String(body.url || '').trim()
  if (!targetUrl) return json({ ok: false, error: 'url is required' }, { status: 400 }, env, req)
  if (!/^https?:\/\//i.test(targetUrl)) targetUrl = `https://${targetUrl}`

  const accountId = env.CF_ACCOUNT_ID || ''
  const apiToken = env.CF_BROWSER_TOKEN || ''
  const width = Math.min(Number(body.width) || 1280, 1920)
  const height = Math.min(Number(body.height) || 800, 1200)

  // No renderer configured → graceful fallback (URL + HTML snapshot).
  if (!accountId || !apiToken) {
    const snap = await fetchSnapshot(targetUrl)
    return json(
      { ok: false, url: targetUrl, title: snap.title, snapshot: snap.snapshot, reason: 'renderer_not_configured' },
      { status: 200 },
      env,
      req,
    )
  }

  try {
    // Cloudflare Browser Rendering REST API: /screenshot returns a PNG binary.
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          screenshotOptions: { fullPage: !!body.fullPage, type: 'png' },
          viewport: { width, height },
          gotoOptions: { waitUntil: 'networkidle0', timeout: 25000 },
        }),
      },
    )
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      const snap = await fetchSnapshot(targetUrl)
      return json(
        { ok: false, url: targetUrl, title: snap.title, snapshot: snap.snapshot, reason: `render_${res.status}`, detail: errText.slice(0, 300) },
        { status: 200 },
        env,
        req,
      )
    }
    const buf = await res.arrayBuffer()
    const dataUrl = `data:image/png;base64,${b64std(buf)}`
    return json({ ok: true, url: targetUrl, image: dataUrl }, {}, env, req)
  } catch (e) {
    const snap = await fetchSnapshot(targetUrl)
    return json(
      { ok: false, url: targetUrl, title: snap.title, snapshot: snap.snapshot, reason: 'render_error', detail: String(e.message || e).slice(0, 300) },
      { status: 200 },
      env,
      req,
    )
  }
}

// Standard (non-url) base64 for binary image payloads.
function b64std(buf) {
  let bin = ''
  const arr = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < arr.length; i += chunk) {
    bin += String.fromCharCode.apply(null, arr.subarray(i, i + chunk))
  }
  return btoa(bin)
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const path = url.pathname.replace(/\/$/, '') || '/'

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, req) })
    }

    // /oauth/{provider}/start | /oauth/{provider}/callback
    const oauth = path.match(/^\/oauth\/([a-z]+)\/(start|callback)$/i)
    if (oauth) {
      const provider = oauth[1].toLowerCase()
      if (req.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 }, env, req)
      return oauth[2] === 'start'
        ? handleStart(env, req, provider, url)
        : handleCallback(env, req, provider, url)
    }

    if (path === '/integrations/status' && req.method === 'GET') {
      return handleStatus(env, req, url)
    }

    const disc = path.match(/^\/integrations\/([a-z]+)\/disconnect$/i)
    if (disc && req.method === 'POST') {
      return handleDisconnect(env, req, disc[1].toLowerCase())
    }

    if (path === '/jobs/sync' && req.method === 'POST') {
      return handleJobsSync(env, req)
    }

    if (path === '/browse/render' && req.method === 'POST') {
      return handleBrowseRender(env, req)
    }

    if (path === '/' || path === '/health') {
      return json({ ok: true, service: 'askai-integrations-worker', providers: PROVIDER_IDS }, {}, env, req)
    }

    return json({ error: 'Not found', path }, { status: 404 }, env, req)
  },

  // Cron: every 15 minutes (see [triggers] in wrangler.toml).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      processDueJobs(env).catch((e) => {
        console.error('processDueJobs failed', e)
      }),
    )
  },
}
