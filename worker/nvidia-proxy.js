// RipoAI — NVIDIA NIM CORS proxy (Cloudflare Worker)
//
// WHY: NVIDIA's API (integrate.api.nvidia.com) does not send CORS headers, so a
// static browser app can't call it directly. This tiny worker forwards requests
// to NVIDIA, holds the API key server-side, and adds CORS — so RipoAI's
// "RipoAI 4o Pro" model works without exposing the key in the client bundle.
//
// DEPLOY (free, ~3 min):
//   1. https://dash.cloudflare.com → Workers & Pages → Create → Worker.
//   2. Paste this file, Deploy. Note the URL, e.g. https://ripoai-nvidia.<you>.workers.dev
//   3. Worker → Settings → Variables → add a SECRET named NVIDIA_API_KEY = your nvapi-... key.
//   4. In the RipoAI repo, set the Actions secret VITE_NVIDIA_BASE to the worker URL.
//      Redeploy. "RipoAI 4o Pro" now streams from NVIDIA (Llama 4 Maverick).
//
// Streaming (SSE) passes straight through.

const NVIDIA = 'https://integrate.api.nvidia.com/v1/chat/completions'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
    if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: CORS })

    const key = env.NVIDIA_API_KEY || (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!key) return new Response('Missing NVIDIA_API_KEY', { status: 401, headers: CORS })

    const upstream = await fetch(NVIDIA, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: await request.text(),
    })

    const headers = new Headers(upstream.headers)
    Object.entries(CORS).forEach(([k, v]) => headers.set(k, v))
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
