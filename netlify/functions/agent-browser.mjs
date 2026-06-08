const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }
}

function firstUrl(text = '') {
  return text.match(/https?:\/\/[^\s)"']+/i)?.[0]?.replace(/[),.]+$/, '') || ''
}

function searchUrl(prompt = '') {
  const q = prompt
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b(agent|browse|browser|click|type|search|open|go to|look up|find)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `https://duckduckgo.com/?q=${encodeURIComponent(q || prompt || 'AskAI')}`
}

async function proxyToConfiguredBackend(event, endpoint) {
  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.AGENT_BROWSER_TOKEN ? { Authorization: `Bearer ${process.env.AGENT_BROWSER_TOKEN}` } : {}),
    },
    body: event.body || '{}',
  })
  return {
    statusCode: upstream.status,
    headers: {
      ...corsHeaders,
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
    },
    body: await upstream.text(),
  }
}

async function cf(path, init = {}) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || ''
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || ''
  if (!accountId || !token) {
    const missing = [
      !accountId ? 'CLOUDFLARE_ACCOUNT_ID' : '',
      !token ? 'CLOUDFLARE_API_TOKEN' : '',
    ].filter(Boolean).join(' and ')
    const err = new Error(`${missing} must be set to use Cloudflare Browser Run.`)
    err.statusCode = 501
    throw err
  }
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    /* keep raw text */
  }
  if (!res.ok) {
    const err = new Error(payload?.errors?.[0]?.message || text || `Cloudflare Browser Run error ${res.status}`)
    err.statusCode = res.status
    throw err
  }
  return payload?.result || payload
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const configuredEndpoint = (process.env.AGENT_BROWSER_ENDPOINT || '').trim()
  if (configuredEndpoint) return proxyToConfiguredBackend(event, configuredEndpoint)

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const prompt = String(payload.prompt || '').trim()
  const targetUrl = firstUrl(prompt) || searchUrl(prompt)
  const events = [
    { type: 'start', label: 'Starting Cloudflare Browser Run session', at: Date.now() },
    firstUrl(prompt)
      ? { type: 'open', label: 'Opening requested URL', url: targetUrl, at: Date.now() }
      : { type: 'search', label: 'Opening browser search page', url: targetUrl, at: Date.now() },
  ]

  try {
    const session = await cf('/devtools/browser?keep_alive=600000', { method: 'POST' })
    const sessionId = session.sessionId
    if (!sessionId) throw new Error('Cloudflare did not return a browser session id.')
    const tab = await cf(`/devtools/browser/${encodeURIComponent(sessionId)}/json/new?url=${encodeURIComponent(targetUrl)}`, {
      method: 'PUT',
    })
    events.push({ type: 'open', label: tab?.title ? `Loaded ${tab.title}` : 'Loaded page in live browser', url: tab?.url || targetUrl, at: Date.now() })
    events.push({ type: 'done', label: 'Live browser is ready', url: tab?.devtoolsFrontendUrl, at: Date.now() })
    return json(200, {
      status: 'done',
      sessionId,
      liveUrl: tab?.devtoolsFrontendUrl,
      currentUrl: tab?.url || targetUrl,
      title: tab?.title,
      summary:
        'A real Cloudflare Browser Run session was created. The live view opens the remote browser so the user can watch or take over.',
      sources: [{ title: tab?.title || targetUrl, url: tab?.url || targetUrl }],
      events,
    })
  } catch (e) {
    const status = e.statusCode || 500
    return json(status === 501 ? 501 : 502, {
      status: status === 501 ? 'unavailable' : 'error',
      error: e.message || 'Agent browser failed.',
      events,
    })
  }
}
