// RipoAI model registry. Each tier maps to a legitimately available Groq model,
// validated against the live Groq /models endpoint.

export type ModelTier = 'ripoai-1o-instant' | 'ripoai-2o-instant' | 'ripoai-1o-pro' | 'ripoai-2o-pro'

export interface RipoModel {
  id: ModelTier
  name: string
  tagline: string
  groqModel: string
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
    name: 'RipoAI 1o instant',
    tagline: 'Fast everyday answers',
    groqModel: 'qwen/qwen3-32b',
    vision: false,
    reasoning: true,
    reasoningEffort: 'default',
    temperature: 0.6,
    maxTokens: 8192,
    topP: 0.95,
  },
  'ripoai-2o-instant': {
    id: 'ripoai-2o-instant',
    name: 'RipoAI 2o instant',
    tagline: 'Quick + understands images',
    groqModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    vision: true,
    reasoning: false,
    temperature: 1,
    maxTokens: 8192,
    topP: 1,
  },
  'ripoai-1o-pro': {
    id: 'ripoai-1o-pro',
    name: 'RipoAI 1o Pro',
    tagline: 'Deeper reasoning + writing',
    groqModel: 'llama-3.3-70b-versatile',
    vision: false,
    reasoning: false,
    temperature: 0.7,
    maxTokens: 16384,
    topP: 0.95,
    badge: 'PRO',
  },
  'ripoai-2o-pro': {
    id: 'ripoai-2o-pro',
    name: 'RipoAI 2o Pro',
    tagline: 'Flagship — best designs, code & reasoning',
    groqModel: 'openai/gpt-oss-120b',
    vision: false,
    reasoning: true,
    reasoningEffort: 'high',
    temperature: 0.8,
    maxTokens: 32768,
    topP: 1,
    badge: 'PRO',
  },
}

export const MODEL_LIST = Object.values(MODELS)
export const DEFAULT_MODEL: ModelTier = 'ripoai-2o-pro'

// Groq's agentic model with built-in web search + tools. Powers Web Search and
// Agent modes natively (no extra key needed).
export const COMPOUND_MODEL = 'groq/compound'
export const COMPOUND_MINI_MODEL = 'groq/compound-mini'

// The best coder model for Projects.
export const CODER_MODEL = 'openai/gpt-oss-120b'

export function getModel(id: ModelTier): RipoModel {
  return MODELS[id] ?? MODELS[DEFAULT_MODEL]
}
