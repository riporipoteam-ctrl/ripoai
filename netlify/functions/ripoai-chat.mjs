const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

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

function getKey(provider) {
  if (provider === 'openrouter') {
    return process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY || ''
  }
  return process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || ''
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const provider = payload.provider === 'openrouter' ? 'openrouter' : 'groq'
  const body = payload.body && typeof payload.body === 'object' ? payload.body : null
  if (!body) return json(400, { error: 'Missing chat body' })

  const apiKey = getKey(provider)
  if (!apiKey) {
    return json(500, {
      error:
        provider === 'openrouter'
          ? 'OPENROUTER_API_KEY or VITE_OPENROUTER_API_KEY is not set on Netlify.'
          : 'GROQ_API_KEY or VITE_GROQ_API_KEY is not set on Netlify.',
    })
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://riporipoteam-ctrl.github.io/ripoai/'
    headers['X-Title'] = 'RipoAI'
  }

  const upstream = await fetch(provider === 'openrouter' ? OPENROUTER_URL : GROQ_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const text = await upstream.text()
  return {
    statusCode: upstream.status,
    headers: {
      ...corsHeaders,
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
    },
    body: text,
  }
}
