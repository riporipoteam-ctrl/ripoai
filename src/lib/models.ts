// AskAI model registry. Each tier maps to a legitimately available Groq model,
// validated against the live Groq /models endpoint.

export type ModelTier =
  | 'auto'
  | 'ripoai-1o-instant'
  | 'ripoai-2o-instant'
  | 'ripoai-1o-pro'
  | 'ripoai-2o-pro'
  | 'ripoai-3o-instant'
  | 'ripoai-3o-pro'
  | 'ripoai-4o-instant'
  | 'ripoai-4o-pro'
  | 'ripoai-search'

export interface RipoModel {
  id: ModelTier
  name: string
  tagline: string
  groqModel: string
  /** Provider backing this model. */
  provider?: 'groq' | 'openrouter' | 'puter' | 'nvidia'
  /** OpenRouter model id (when provider === 'openrouter'); groqModel is the
   * automatic fallback when OpenRouter is rate-limited or errors. */
  orModel?: string
  /** NVIDIA NIM model id (when provider === 'nvidia'); groqModel is the
   * automatic fallback. NVIDIA needs a proxy (no CORS) — see VITE_NVIDIA_BASE. */
  nvModel?: string
  /** Puter model id (when provider === 'puter'). */
  puterModel?: string
  /** Supports image inputs (vision). */
  vision: boolean
  /** Emits <think> reasoning blocks we should render as collapsible reasoning. */
  reasoning: boolean
  /** Valid Groq reasoning_effort for THIS model, or undefined if unsupported.
   * qwen accepts 'default'; gpt-oss requires 'low' | 'medium' | 'high'. */
  reasoningEffort?: string
  temperature: number
  maxTokens: number
  topP: number
  badge?: string
}

export const MODELS: Record<ModelTier, RipoModel> = {
  'ripoai-1o-instant': {
    id: 'ripoai-1o-instant',
    name: 'AskAI 1o instant',
    tagline: 'Fast everyday answers',
    groqModel: 'qwen/qwen3-32b',
    vision: false,
    reasoning: false,
    reasoningEffort: 'none',
    temperature: 0.6,
    maxTokens: 3072,
    topP: 0.95,
  },
  'ripoai-2o-instant': {
    id: 'ripoai-2o-instant',
    name: 'AskAI 2o instant',
    tagline: 'Quick + understands images',
    groqModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    vision: true,
    reasoning: false,
    temperature: 1,
    maxTokens: 4096,
    topP: 1,
  },
  'ripoai-1o-pro': {
    id: 'ripoai-1o-pro',
    name: 'AskAI 1o Pro',
    tagline: 'Deeper reasoning + writing',
    groqModel: 'llama-3.3-70b-versatile',
    vision: false,
    reasoning: false,
    temperature: 0.7,
    maxTokens: 5120,
    topP: 0.95,
    badge: 'PRO',
  },
  'ripoai-2o-pro': {
    id: 'ripoai-2o-pro',
    name: 'AskAI 2o Pro',
    tagline: 'Flagship — best designs, code & reasoning',
    groqModel: 'openai/gpt-oss-120b',
    vision: false,
    reasoning: true,
    reasoningEffort: 'low',
    temperature: 0.8,
    maxTokens: 5120,
    topP: 1,
    badge: 'PRO',
  },
  'ripoai-3o-instant': {
    id: 'ripoai-3o-instant',
    name: 'AskAI 3o instant',
    tagline: 'Lightning-fast and very capable',
    provider: 'openrouter',
    orModel: 'qwen/qwen3-next-80b-a3b-instruct:free',
    groqModel: 'llama-3.3-70b-versatile',
    vision: false,
    reasoning: false,
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.95,
    badge: 'NEW',
  },
  'ripoai-3o-pro': {
    id: 'ripoai-3o-pro',
    name: 'AskAI 3o Pro',
    tagline: 'Our most powerful — best for building & design',
    provider: 'openrouter',
    orModel: 'moonshotai/kimi-k2.6:free',
    groqModel: 'openai/gpt-oss-120b',
    vision: false,
    reasoning: false,
    temperature: 0.7,
    maxTokens: 6000,
    topP: 1,
    badge: 'MAX',
  },
  'ripoai-4o-instant': {
    id: 'ripoai-4o-instant',
    name: 'AskAI 4o instant',
    tagline: 'New — fast and very capable',
    provider: 'nvidia',
    nvModel: 'meta/llama-4-maverick-17b-128e-instruct',
    groqModel: 'llama-3.3-70b-versatile',
    vision: false,
    reasoning: false,
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    badge: 'NEW',
  },
  'ripoai-4o-pro': {
    id: 'ripoai-4o-pro',
    name: 'AskAI 4o Pro',
    tagline: 'Our most advanced — deepest reasoning',
    provider: 'nvidia',
    // Secret backend: Kimi 2.6 (Moonshot) served via the NVIDIA proxy. Never
    // surfaced to users — the UI only ever shows "AskAI 4o Pro".
    nvModel: 'moonshotai/kimi-k2.6',
    groqModel: 'openai/gpt-oss-120b',
    vision: false,
    reasoning: true,
    temperature: 0.7,
    maxTokens: 6000,
    topP: 1,
    badge: 'MAX',
  },
  'ripoai-search': {
    id: 'ripoai-search',
    name: 'AskAI Search',
    tagline: 'Live answers from the web, with sources',
    groqModel: 'llama-3.3-70b-versatile',
    vision: false,
    reasoning: false,
    temperature: 0.6,
    maxTokens: 3072,
    topP: 0.95,
    badge: 'LIVE',
  },
  auto: {
    id: 'auto',
    name: 'Auto',
    tagline: 'AskAI picks the best model for each task',
    groqModel: 'openai/gpt-oss-120b',
    vision: false,
    reasoning: false,
    temperature: 0.7,
    maxTokens: 5120,
    topP: 1,
  },
}

export const MODEL_LIST = Object.values(MODELS)
export const DEFAULT_MODEL: ModelTier = 'ripoai-4o-pro'

// Groq's agentic model with built-in web search. `groq/compound` works reliably
// (compound-beta started returning 413). Powers Web Search and Agent modes.
export const COMPOUND_MODEL = 'groq/compound'
export const COMPOUND_MINI_MODEL = 'groq/compound-mini'

// The best coder model for Projects.
export const CODER_MODEL = 'openai/gpt-oss-120b'

export function getModel(id: ModelTier): RipoModel {
  return MODELS[id] ?? MODELS[DEFAULT_MODEL]
}

// Auto mode: pick the best real model for the task (like auto web search).
export function resolveAutoModel(text: string): ModelTier {
  const t = (text || '').toLowerCase()
  if (/\b(website|web ?app|landing|portfolio site|3d|three\.?js|webgl|game)\b/.test(t)) return 'ripoai-4o-pro'
  if (/\b(code|coding|function|component|script|debug|refactor|algorithm|program|api|regex|sql|build (me )?an? (app|tool))\b/.test(t))
    return 'ripoai-2o-pro'
  if (
    t.length > 260 ||
    /\b(explain|why|how come|analy|reason|prove|solve|step[- ]by[- ]step|essay|compare|strateg|in depth|research|complex|architecture|trade-?offs?)\b/.test(t)
  )
    return 'ripoai-4o-pro'
  return 'ripoai-4o-instant'
}
