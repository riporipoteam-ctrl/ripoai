// RipoAI — NVIDIA proxy (Cloudflare Worker). Handles BOTH chat and image/video
// generation, holds the API key server-side, and adds CORS so the static app
// can call NVIDIA (which otherwise blocks browser requests).
//
// Routing by request path:
//   POST /                         -> chat   (integrate.api.nvidia.com/v1/chat/completions)
//   POST /v1/chat/completions      -> chat
//   POST /genai/<org>/<model>      -> image/video (ai.api.nvidia.com/v1/genai/<org>/<model>)
//
// DEPLOY: Workers & Pages → Create → "Start with Hello World!" → paste this →
// Deploy. Then Settings → Variables and Secrets → add SECRET NVIDIA_API_KEY = your
// nvapi-… key. (Re-paste over the old version if you already had the chat-only one.)

const CHAT = 'https://integrate.api.nvidia.com/v1/chat/completions'
const GENAI = 'https://ai.api.nvidia.com/v1/genai'
const STATUS = 'https://api.nvcf.nvidia.com/v2/nvcf/exec/status'
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

    const path = new URL(request.url).pathname
    const auth = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
    const body = await request.text()

    // Image / video generation (NVCF genai endpoints).
    if (path.includes('/genai/')) {
      const model = path.split('/genai/')[1]
      let res = await fetch(`${GENAI}/${model}`, {
        method: 'POST',
        headers: { ...auth, Accept: 'application/json' },
        body,
      })
      // Async (202): poll the status endpoint until the result is ready.
      let tries = 0
      while (res.status === 202 && tries < 60) {
        const reqId = res.headers.get('NVCF-REQID')
        if (!reqId) break
        await new Promise((r) => setTimeout(r, 1500))
        res = await fetch(`${STATUS}/${reqId}`, { headers: { ...auth, Accept: 'application/json' } })
        tries++
      }
      const headers = new Headers({ 'Content-Type': 'application/json', ...CORS })
      return new Response(res.body, { status: res.status, headers })
    }

    // Chat completions (streaming passes straight through).
    const res = await fetch(CHAT, { method: 'POST', headers: { ...auth, Accept: 'text/event-stream' }, body })
    const headers = new Headers(res.headers)
    Object.entries(CORS).forEach(([k, v]) => headers.set(k, v))
    return new Response(res.body, { status: res.status, headers })
  },
}
