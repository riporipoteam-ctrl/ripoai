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
const IMAGE_MODEL = 'black-forest-labs/flux.1-dev'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function normalizeDimension(value, fallback) {
  const allowed = [768, 832, 896, 960, 1024, 1088, 1152]
  const n = Number(value)
  if (allowed.includes(n)) return n
  return fallback
}

function isLogoOrTextPrompt(prompt) {
  return /\b(logo|wordmark|typography|lettering|letters|text|says|slogan|brand name|with words|called|named)\b/i.test(
    prompt || '',
  )
}

function hardenImagePrompt(prompt) {
  let safe = String(prompt || '').replace(/\s+/g, ' ').trim()
  // Some NVIDIA image endpoints answer exact trademark-logo copy requests with
  // a tiny all-black JPEG. Generate an original brand-safe logo concept instead.
  safe = safe
    .replace(/\bcoca[\s-]?cola\b/gi, 'an original cola drink brand')
    .replace(/\bpepsi\b/gi, 'an original soda drink brand')
    .replace(/\bnike\b/gi, 'an original sportswear brand')
    .replace(/\badidas\b/gi, 'an original athletic brand')
    .replace(/\bapple\b/gi, 'an original technology brand')
    .replace(/\btesla\b/gi, 'an original electric vehicle brand')

  const guard =
    'well-lit, high contrast, complete visible subject, no black canvas, no blank frame, no empty dark background'
  if (isLogoOrTextPrompt(safe)) {
    return `${safe}, original logo concept, do not copy existing trademarks or official brand marks, clean vector design, bright white or brand-color background, centered composition, readable lettering, ${guard}`.slice(
      0,
      1200,
    )
  }
  return `${safe}, ${guard}`.slice(0, 1200)
}

function repairBlankPrompt(prompt) {
  return `${hardenImagePrompt(prompt)}, use a bright white background, colorful subject, large centered mark, professional finished image, avoid solid-color frames`.slice(
    0,
    1200,
  )
}

function extractImageBase64(data) {
  const image =
    data?.artifacts?.[0]?.base64 ||
    data?.data?.[0]?.b64_json ||
    data?.image ||
    data?.b64_json ||
    (Array.isArray(data?.images) ? data.images[0] : '')
  return typeof image === 'string' ? image.replace(/^data:image\/\w+;base64,/, '') : ''
}

function isLikelyBlankImage(base64, width, height) {
  // A 1024px all-black JPEG from FLUX is usually ~8KB. Real images are much
  // larger, so this catches the NVIDIA "black response" without expensive
  // pixel decoding inside the Worker.
  const pixels = Math.max(1, Number(width) * Number(height))
  const minLength = Math.max(10000, Math.round(pixels * 0.018))
  return !base64 || base64.length < minLength
}

async function callGenai(model, payload, auth) {
  let res = await fetch(`${GENAI}/${model}`, {
    method: 'POST',
    headers: { ...auth, Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  let tries = 0
  while (res.status === 202 && tries < 60) {
    const reqId = res.headers.get('NVCF-REQID')
    if (!reqId) break
    await new Promise((r) => setTimeout(r, 1500))
    res = await fetch(`${STATUS}/${reqId}`, { headers: { ...auth, Accept: 'application/json' } })
    tries++
  }
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  return { res, text, data }
}

async function generateImage(request, auth) {
  let input = {}
  try {
    input = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }
  const width = normalizeDimension(input.width, 1024)
  const height = normalizeDimension(input.height, 1024)
  const seed =
    Number.isFinite(Number(input.seed)) && Number(input.seed) >= 0
      ? Number(input.seed)
      : Math.floor(Math.random() * 1_000_000)
  const prompt = hardenImagePrompt(input.prompt)
  const payload = {
    prompt,
    mode: input.mode || 'base',
    width,
    height,
    steps: Number(input.steps) || (isLogoOrTextPrompt(prompt) ? 50 : 40),
    cfg_scale: Number(input.cfg_scale) || 4.5,
    samples: 1,
    seed,
  }

  let upstream = await callGenai(IMAGE_MODEL, payload, auth)
  if (!upstream.res.ok) {
    return json(
      { error: `NVIDIA image generation failed (${upstream.res.status}).`, detail: upstream.text.slice(0, 500) },
      upstream.res.status,
    )
  }

  let base64 = extractImageBase64(upstream.data)
  let repaired = false
  if (isLikelyBlankImage(base64, width, height)) {
    repaired = true
    upstream = await callGenai(
      IMAGE_MODEL,
      { ...payload, prompt: repairBlankPrompt(input.prompt), seed: seed + 1 },
      auth,
    )
    if (!upstream.res.ok) {
      return json(
        { error: `NVIDIA image repair failed (${upstream.res.status}).`, detail: upstream.text.slice(0, 500) },
        upstream.res.status,
      )
    }
    base64 = extractImageBase64(upstream.data)
  }

  if (!base64) return json({ error: 'NVIDIA returned no image.' }, 502)
  return json({
    provider: 'nvidia',
    model: IMAGE_MODEL,
    width,
    height,
    seed: repaired ? seed + 1 : seed,
    repaired,
    image: `data:image/jpeg;base64,${base64}`,
    base64,
  })
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

    if (path === '/image/generate') {
      return generateImage(new Request(request.url, { method: 'POST', headers: request.headers, body }), auth)
    }

    // Image / video generation (NVCF genai endpoints).
    if (path.includes('/genai/')) {
      const model = path.split('/genai/')[1]
      if (model === IMAGE_MODEL) {
        return generateImage(new Request(request.url, { method: 'POST', headers: request.headers, body }), auth)
      }
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
