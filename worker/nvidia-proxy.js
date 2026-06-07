// RipoAI - NVIDIA proxy (Cloudflare Worker). Handles BOTH chat and image/video
// generation, holds the API key server-side, and adds CORS so the static app
// can call NVIDIA (which otherwise blocks browser requests).
//
// Routing by request path:
//   POST /                         -> chat   (integrate.api.nvidia.com/v1/chat/completions)
//   POST /v1/chat/completions      -> chat
//   POST /genai/<org>/<model>      -> image/video (ai.api.nvidia.com/v1/genai/<org>/<model>)
//
// DEPLOY: Workers & Pages -> Create -> "Start with Hello World!" -> paste this ->
// Deploy. Then Settings -> Variables and Secrets -> add SECRET NVIDIA_API_KEY = your
// nvapi-... key. (Re-paste over the old version if you already had the chat-only one.)

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
    .replace(/\bpeugeot\b/gi, 'a modern European compact car')

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

function extractRequestedText(prompt) {
  const source = String(prompt || '').replace(/\s+/g, ' ').trim()
  const quoted = source.match(/["']([^"']{2,60})["']/)
  if (quoted?.[1]) return quoted[1].trim()
  const match = source.match(
    /\b(?:name of it is|name is|brand name is|called|named|text says|says|with text)\b\s*:?\s*([^,.!?]{2,80}?)(?:\s+\b(?:and|with|plus|add|include|aswell|as well)\b|[,.!?]|$)/i,
  )
  return (match?.[1] || '').replace(/^["':\s]+|["':\s]+$/g, '').trim()
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function fallbackLogoImage(prompt, width, height, seed) {
  const label = extractRequestedText(prompt) || 'Original Brand'
  const isAuto = /\b(auto|car|mechanic|garage|servis|service|vehicle|peugeot)\b/i.test(prompt || '')
  const subtitle = isAuto ? 'AUTO SERVICE' : 'ORIGINAL LOGO'
  const mark = isAuto
    ? `<g transform="translate(272 276)">
        <path d="M58 188h404c18 0 32 14 32 32v46h-52c-8-32-37-56-72-56s-64 24-72 56H220c-8-32-37-56-72-56s-64 24-72 56H24v-44c0-19 14-34 32-34h2Zm48-42 74-88c13-15 31-24 51-24h154c19 0 37 9 49 24l72 88H106@m108-36-31 36h110V82h-39c-16 0-30 7-40 28Zm112 36h112l-30-36c-10-21-24-28-41-28h-41v64Z" fill="#f8fafc"/>
        <circle cx="148" cy="266" r="43" fill="#111827"/>
        <circle cx="148" cy="266" r="19" fill="#f8fafc"/>
        <circle cx="370" cy="266" r="43" fill="#111827"/>
        <circle cx="370" cy="266" r="19" fill="#f8fafc"/>
      </g>`
    : `<g transform="translate(333 232)">
        <path d="M178 0 222 92l101 14-73 71 17 100-89-47-90 47 17-100-72-71 100-14L178 0Z" fill="#f8fafc"/>
      </g>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#111827"/>
        <stop offset="0.52" stop-color="#b91c1c"/>
        <stop offset="1" stop-color="#f97316"/>
      </linearGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="26" stdDeviation="26" flood-color="#0f172a" flood-opacity="0.28"/>
      </filter>
    </defs>
    <rect width="1024" height="1024" rx="116" fill="#f8fafc"/>
    <rect x="76" y="76" width="872" height="872" rx="96" fill="url(#bg)" filter="url(#softShadow)"/>
    <path d="M116 160c168-76 337-74 507 6 105 50 198 61 281 32v552c-147 71-304 71-471 0-120-51-226-62-317-34V160Z" fill="#ffffff" opacity="0.1"/>
    ${mark}
    <text x="512" y="690" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${label.length > 24 ? 54 : 68}" font-weight="900" fill="#ffffff" letter-spacing="1">${escapeXml(label)}</text>
    <text x="512" y="752" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="800" fill="#ffffff" opacity="0.78" letter-spacing="8">${subtitle}</text>
    <rect x="126" y="126" width="772" height="772" rx="78" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.35"/>
  </svg>`
  const image = svgDataUrl(svg)
  return json({
    provider: 'ripoai',
    model: `${IMAGE_MODEL}+text-safe-logo-fallback`,
    width,
    height,
    seed,
    repaired: true,
    fallback: true,
    image,
    base64: '',
  })
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

  const attempts = [
    { ...payload, seed },
    { ...payload, prompt: repairBlankPrompt(input.prompt), seed: seed + 1 },
    {
      ...payload,
      prompt: `${repairBlankPrompt(input.prompt)}, exact readable sign text "${extractRequestedText(input.prompt)}", polished commercial logo, white background`.slice(
        0,
        1200,
      ),
      seed: seed + 2,
    },
  ]

  let base64 = ''
  let repaired = false
  let finalSeed = seed
  for (let i = 0; i < attempts.length; i++) {
    const upstream = await callGenai(IMAGE_MODEL, attempts[i], auth)
    if (!upstream.res.ok) {
      return json(
        { error: `NVIDIA image generation failed (${upstream.res.status}).`, detail: upstream.text.slice(0, 500) },
        upstream.res.status,
      )
    }
    base64 = extractImageBase64(upstream.data)
    repaired = i > 0
    finalSeed = attempts[i].seed
    if (!isLikelyBlankImage(base64, width, height)) break
  }

  if (isLikelyBlankImage(base64, width, height) && isLogoOrTextPrompt(input.prompt)) {
    return fallbackLogoImage(input.prompt, width, height, finalSeed + 1)
  }
  if (!base64) return json({ error: 'NVIDIA returned no image.' }, 502)
  return json({
    provider: 'nvidia',
    model: IMAGE_MODEL,
    width,
    height,
    seed: finalSeed,
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
