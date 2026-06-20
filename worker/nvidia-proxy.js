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
const TTS = 'https://integrate.api.nvidia.com/v1/audio/speech'
const GENAI = 'https://ai.api.nvidia.com/v1/genai'
const STATUS = 'https://api.nvcf.nvidia.com/v2/nvcf/exec/status'
const OPENAI_IMAGE_BASES = ['https://ai.api.nvidia.com/v1', 'https://integrate.api.nvidia.com/v1']
const PRIMARY_IMAGE_MODEL = 'black-forest-labs/flux.2-klein-4b'
const FALLBACK_IMAGE_MODEL = 'black-forest-labs/flux.1-dev'
const EDIT_IMAGE_MODEL = 'black-forest-labs/flux.2-klein-4b'
const KONTEXT_EDIT_MODEL = 'black-forest-labs/flux.1-kontext-dev'
const QWEN_IMAGE_MODEL = 'qwen/qwen-image-2512'
const QWEN_EDIT_MODEL = 'qwen/qwen-image-edit-2511'
const IMAGE_MODEL = PRIMARY_IMAGE_MODEL
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
    return `${safe}, original logo concept, do not copy existing trademarks or official brand marks, premium identity design, clean vector design, bright white or brand-color background, centered composition, crisp readable lettering, vector-clean edges, ${guard}`.slice(
      0,
      1200,
    )
  }
  return `${safe}, ultra realistic, natural shadows, detailed textures, believable materials, professional composition, high dynamic range, no plastic skin, no AI artifacts, ${guard}`.slice(
    0,
    1200,
  )
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
        <path d="M58 188h404c18 0 32 14 32 32v46h-52c-8-32-37-56-72-56s-64 24-72 56H220c-8-32-37-56-72-56s-64 24-72 56H24v-44c0-19 14-34 32-34h2Zm48-42 74-88c13-15 31-24 51-24h154c19 0 37 9 49 24l72 88H106Zm108-36-31 36h110V82h-39c-16 0-30 7-40 28Zm112 36h112l-30-36c-10-21-24-28-41-28h-41v64Z" fill="#f8fafc"/>
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

async function callOpenAIImage(path, payload, auth) {
  let last = null
  for (const base of OPENAI_IMAGE_BASES) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { ...auth, Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    const text = await res.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    last = { res, text, data }
    if (res.status !== 404 && res.status !== 405) return last
  }
  return last
}

function payloadForModel(model, payload) {
  if (model === PRIMARY_IMAGE_MODEL || model === EDIT_IMAGE_MODEL) {
    return {
      prompt: payload.prompt,
      image: payload.image,
      width: payload.width,
      height: payload.height,
      seed: payload.seed,
      steps: Math.min(4, Math.max(1, Number(payload.steps) || 4)),
    }
  }
  if (model === FALLBACK_IMAGE_MODEL) {
    return {
      prompt: payload.prompt,
      mode: payload.mode || 'base',
      image: payload.image,
      preprocess_image: payload.preprocess_image,
      width: payload.width,
      height: payload.height,
      steps: Number(payload.steps) || (isLogoOrTextPrompt(payload.prompt) ? 50 : 40),
      cfg_scale: Number(payload.cfg_scale) || 4.5,
      samples: 1,
      seed: payload.seed,
    }
  }
  return payload
}

async function generateWithModel(model, payload, auth) {
  if (model === QWEN_IMAGE_MODEL) {
    return callOpenAIImage('/images/generations', {
      model,
      prompt: payload.prompt,
      n: 1,
      response_format: 'b64_json',
    }, auth)
  }
  return callGenai(model, payloadForModel(model, payload), auth)
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
  const basePayload = {
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
    { ...basePayload, seed },
    { ...basePayload, prompt: repairBlankPrompt(input.prompt), seed: seed + 1 },
    {
      ...basePayload,
      prompt: `${repairBlankPrompt(input.prompt)}, exact readable sign text "${extractRequestedText(input.prompt)}", polished commercial logo, white background`.slice(
        0,
        1200,
      ),
      seed: seed + 2,
    },
  ]
  const models = isLogoOrTextPrompt(input.prompt)
    ? [QWEN_IMAGE_MODEL, PRIMARY_IMAGE_MODEL, FALLBACK_IMAGE_MODEL]
    : [PRIMARY_IMAGE_MODEL, FALLBACK_IMAGE_MODEL]

  let base64 = ''
  let repaired = false
  let finalSeed = seed
  let usedModel = PRIMARY_IMAGE_MODEL
  let lastError = null
  for (const model of models) {
    for (let i = 0; i < attempts.length; i++) {
      const upstream = await generateWithModel(model, attempts[i], auth)
      if (!upstream?.res.ok) {
        lastError = upstream
        if ([400, 401, 403, 404, 405, 422].includes(upstream?.res.status || 0)) break
        continue
      }
      base64 = extractImageBase64(upstream.data)
      repaired = i > 0 || model !== models[0]
      finalSeed = attempts[i].seed
      usedModel = model
      if (!isLikelyBlankImage(base64, width, height)) break
    }
    if (!isLikelyBlankImage(base64, width, height)) break
  }

  if (isLikelyBlankImage(base64, width, height) && isLogoOrTextPrompt(input.prompt)) {
    return fallbackLogoImage(input.prompt, width, height, finalSeed + 1)
  }
  if (!base64) {
    return json(
      {
        error: 'NVIDIA returned no image.',
        detail: lastError?.text?.slice(0, 500) || '',
      },
      lastError?.res?.status && lastError.res.status >= 400 ? lastError.res.status : 502,
    )
  }
  return json({
    provider: 'nvidia',
    model: usedModel,
    width,
    height,
    seed: finalSeed,
    repaired,
    image: `data:image/jpeg;base64,${base64}`,
    base64,
  })
}

async function editImage(request, auth) {
  let input = {}
  try {
    input = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }
  if (!input.image) return json({ error: 'Missing image for edit.' }, 400)
  const width = normalizeDimension(input.width, 1024)
  const height = normalizeDimension(input.height, 1024)
  const seed =
    Number.isFinite(Number(input.seed)) && Number(input.seed) >= 0
      ? Number(input.seed)
      : Math.floor(Math.random() * 1_000_000)
  const prompt = hardenImagePrompt(input.prompt || 'Improve this image with realistic detail and clean composition')
  const images = Array.isArray(input.image) ? input.image : input.image
  const candidates = [
    { model: QWEN_EDIT_MODEL, openai: true },
    { model: EDIT_IMAGE_MODEL, openai: false },
    { model: KONTEXT_EDIT_MODEL, openai: false },
    { model: FALLBACK_IMAGE_MODEL, openai: false, mode: 'canny', preprocess: true },
    { model: FALLBACK_IMAGE_MODEL, openai: false, mode: 'depth', preprocess: true },
  ]
  let lastError = null
  for (const candidate of candidates) {
    const upstream = candidate.openai
      ? await callOpenAIImage('/images/edits', {
          model: candidate.model,
          prompt,
          image: images,
          n: 1,
          response_format: 'b64_json',
        }, auth)
      : await callGenai(candidate.model, payloadForModel(candidate.model, {
          prompt,
          image: images,
          mode: candidate.mode,
          preprocess_image: candidate.preprocess,
          width,
          height,
          seed,
          steps: candidate.model === EDIT_IMAGE_MODEL ? 4 : candidate.model === FALLBACK_IMAGE_MODEL ? 50 : 30,
        }), auth)
    if (!upstream?.res.ok) {
      lastError = upstream
      continue
    }
    const base64 = extractImageBase64(upstream.data)
    if (!isLikelyBlankImage(base64, width, height)) {
      return json({
        provider: 'nvidia',
        model: candidate.model,
        width,
        height,
        seed,
        edited: true,
        image: `data:image/jpeg;base64,${base64}`,
        base64,
      })
    }
    lastError = upstream
  }
  const fallbackPrompt =
    `${prompt}, recreate the requested edit as a polished high-quality image, preserve the main subject and composition from the uploaded reference as much as possible`.slice(
      0,
      1200,
    )
  const fallback = await callGenai(
    IMAGE_MODEL,
    payloadForModel(IMAGE_MODEL, { prompt: fallbackPrompt, width, height, seed: seed + 1, steps: 4 }),
    auth,
  )
  if (fallback.res.ok) {
    const base64 = extractImageBase64(fallback.data)
    if (!isLikelyBlankImage(base64, width, height)) {
      return json({
        provider: 'nvidia',
        model: IMAGE_MODEL,
        width,
        height,
        seed: seed + 1,
        edited: true,
        editFallback: true,
        image: `data:image/jpeg;base64,${base64}`,
        base64,
      })
    }
  }
  return json(
    {
      error: 'NVIDIA image edit returned no usable image.',
      detail: lastError?.text?.slice(0, 500) || '',
    },
    lastError?.res?.status && lastError.res.status >= 400 ? lastError.res.status : 502,
  )
}

// Text-to-speech. Attempts NVIDIA's OpenAI-compatible /v1/audio/speech route
// (Magpie voices). Model/voice availability varies per account, so we try a few
// and return audio bytes on success; the client falls back to on-device TTS if
// none are enabled. Returns audio/mpeg streamed straight through with CORS.
async function ttsVoice(request, auth) {
  let input = {}
  try {
    input = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }
  const text = String(input.text || input.input || '').replace(/\s+/g, ' ').trim().slice(0, 4000)
  if (!text) return json({ error: 'Missing text.' }, 400)
  const voice = input.voice || 'Magpie-Multilingual.EN-US.Aria'
  const models = [input.model, 'magpie-tts-multilingual', 'magpie-tts-zeroshot'].filter(Boolean)
  let last = null
  for (const model of models) {
    let res
    try {
      res = await fetch(TTS, {
        method: 'POST',
        headers: { ...auth, Accept: 'audio/mpeg' },
        body: JSON.stringify({ model, input: text, voice, response_format: 'mp3' }),
      })
    } catch (e) {
      last = { status: 502, detail: String(e).slice(0, 200) }
      continue
    }
    const ct = res.headers.get('Content-Type') || ''
    if (res.ok && /audio|mpeg|octet-stream/i.test(ct)) {
      return new Response(res.body, {
        status: 200,
        headers: new Headers({ 'Content-Type': /audio/i.test(ct) ? ct : 'audio/mpeg', ...CORS }),
      })
    }
    last = { status: res.status, detail: (await res.text().catch(() => '')).slice(0, 300) }
  }
  return json({ error: 'tts-unavailable', ...last }, 502)
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

    if (path === '/voice/tts') {
      return ttsVoice(new Request(request.url, { method: 'POST', headers: request.headers, body }), auth)
    }

    if (path === '/image/generate') {
      return generateImage(new Request(request.url, { method: 'POST', headers: request.headers, body }), auth)
    }
    if (path === '/image/edit') {
      return editImage(new Request(request.url, { method: 'POST', headers: request.headers, body }), auth)
    }

    // Image / video generation (NVCF genai endpoints).
    if (path.includes('/genai/')) {
      const model = path.split('/genai/')[1]
      if (model === IMAGE_MODEL || model === FALLBACK_IMAGE_MODEL) {
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
