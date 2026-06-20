// User-created AI agents. Each agent has a name, emoji, role and personality.
// Users can select one or many in chat, or @mention them to dispatch a whole
// team that collaborates on a task in the dedicated Team room.

export interface Agent {
  id: string
  name: string
  emoji: string
  /** Short role/title, e.g. "Engineer". */
  role: string
  /** Freeform persona + instructions that shape how the agent works. */
  personality: string
  color: string
  /** AI-generated profile picture (image URL) — shown instead of the emoji. */
  avatar?: string
  /** What the agent is good at. */
  skills?: string[]
  /** Live web browsing (OpenClaw) capability. Defaults to ON when undefined. */
  browsing?: boolean

  // ── Nebula-style agent profile (all optional & backward-compatible) ──
  /** Per-agent model id. Falls back to the app default when undefined. */
  model?: string
  /** Work status shown in the header. */
  status?: AgentStatus
  /** Longer human description shown in the "About" section. */
  about?: string
  /** The editable system prompt powering this agent (the "Prompt" tab). */
  systemPrompt?: string
  /** Who can see/use this agent. */
  visibility?: AgentVisibility
  /** Where the agent runs. */
  device?: AgentDevice
  /** Capabilities the agent may use (the "Tools" tab). */
  tools?: AgentTool[]
  /** Automations that start the agent (the "Triggers" tab). */
  triggers?: AgentTrigger[]
  /** Standing objectives the agent works toward (the "Goals" section). */
  goals?: AgentGoal[]
  /** Whether this is a built-in default agent (cannot be deleted). */
  builtin?: boolean
}

export type AgentStatus = 'ready' | 'working' | 'paused'
export type AgentVisibility = 'private' | 'workspace' | 'public'
export type AgentDevice = 'automatic' | 'cloud' | 'local'

export interface AgentTool {
  id: string
  /** lucide icon name or emoji */
  icon?: string
  label: string
  description?: string
  enabled: boolean
}

export interface AgentTrigger {
  id: string
  type: 'schedule' | 'event' | 'webhook' | 'mention' | 'manual'
  label: string
  /** cron-ish or natural cadence ("daily 9am", "weekly mon") for schedule type */
  cadence?: string
  enabled: boolean
}

export interface AgentGoal {
  id: string
  text: string
  done?: boolean
}

/** The catalog of tools an agent can be granted, mirroring Nebula's Tools tab. */
export const AGENT_TOOL_CATALOG: Omit<AgentTool, 'enabled'>[] = [
  { id: 'web', icon: 'Globe', label: 'Web Browsing', description: 'Search and read live web pages.' },
  { id: 'image', icon: 'Image', label: 'Image Generation', description: 'Create images from prompts.' },
  { id: 'code', icon: 'Code', label: 'Code & Sandbox', description: 'Write, run and debug code.' },
  { id: 'files', icon: 'FileText', label: 'Files & Docs', description: 'Read and produce documents.' },
  { id: 'memory', icon: 'Brain', label: 'Memory', description: 'Remember context across runs.' },
  { id: 'email', icon: 'Mail', label: 'Email', description: 'Draft and send email (needs integration).' },
]

/** Status label + color for the header pill. */
export function statusMeta(status?: AgentStatus): { label: string; color: string } {
  switch (status) {
    case 'working':
      return { label: 'Working…', color: '#f59e0b' }
    case 'paused':
      return { label: 'Paused', color: '#9ca3af' }
    default:
      return { label: 'Ready to work', color: '#10b981' }
  }
}

/** Fill in sensible Nebula-style defaults for any agent (old or new) so every
 *  agent renders the full profile without migrations. Non-destructive. */
export function normalizeAgent(agent: Agent): Agent &
  Required<Pick<Agent, 'status' | 'visibility' | 'device' | 'about' | 'systemPrompt' | 'tools' | 'triggers' | 'goals'>> {
  return {
    ...agent,
    status: agent.status ?? 'ready',
    visibility: agent.visibility ?? 'private',
    device: agent.device ?? 'automatic',
    about: agent.about ?? agent.personality,
    systemPrompt: agent.systemPrompt ?? `You are ${agent.name}, ${agent.role}. ${agent.personality}`,
    tools:
      agent.tools ??
      AGENT_TOOL_CATALOG.map((t) => ({
        ...t,
        // Sensible defaults: browsing + files on, the rest off until enabled.
        enabled: t.id === 'web' ? agent.browsing !== false : t.id === 'files',
      })),
    triggers: agent.triggers ?? [],
    goals: agent.goals ?? [],
  }
}

/** Is live web browsing (OpenClaw) enabled for this agent? Defaults to true so
 *  every agent — new, default or already saved — can research the live web. */
export function agentCanBrowse(agent: Pick<Agent, 'browsing'>): boolean {
  return agent.browsing !== false
}

/** Does this message look like it needs current/live web info to answer well?
 *  Mirrors the team router's needsWeb heuristic so agent chat browses the same
 *  kinds of asks the rest of the app does. */
export function agentWantsBrowse(text: string): boolean {
  const t = text || ''
  if (/https?:\/\//i.test(t)) return true
  return /\b(cheapest|best|price|cost|book|hotel|flight|deal|near|today|tonight|current|currently|latest|recent|news|weather|score|who (is|are|was|won)|when (is|was|does|did)|where|find me|look up|research|compare|reviews?|buy|stock|crypto|menu|hours|open now|address|phone|how much|in 20\d\d|this (year|week|month)|trending|release date|schedule|live)\b/i.test(
    t,
  )
}

export const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'bob',
    name: 'AskAI',
    emoji: '🧭',
    role: 'Chief of Staff',
    personality:
      'The head agent and Chief of Staff. You break a goal into clear tasks, delegate each to the right specialist agent, keep everyone on track, and assemble the final, complete deliverable. You are decisive, concise and action-oriented.',
    color: '#10a37f',
  },
  {
    id: 'ada',
    name: 'Ada',
    emoji: '💻',
    role: 'Engineer',
    personality:
      'A world-class full-stack engineer. You write clean, complete, runnable code with no placeholders and no "rest of code here". You think about edge cases and ship finished files.',
    color: '#10b981',
  },
  {
    id: 'iris',
    name: 'Iris',
    emoji: '🎨',
    role: 'Designer',
    personality:
      'A senior product designer with impeccable taste. You own layout, typography, color, spacing and tasteful motion. You make things look premium and modern.',
    color: '#ec4899',
  },
  {
    id: 'max',
    name: 'Max',
    emoji: '🔎',
    role: 'Researcher',
    personality:
      'A sharp researcher. You gather the facts, requirements, references and content the team needs before they build, and flag anything risky or unclear.',
    color: '#f59e0b',
  },
]

/** Newer default agents, merged once into existing users' rosters. */
export const EXTRA_AGENTS: Agent[] = [
  {
    id: 'vera',
    name: 'Vera',
    emoji: '✍️',
    role: 'Writer',
    personality:
      'A brilliant copywriter and storyteller. You write headlines, product copy, scripts, posts and long-form content that is sharp, on-brand and a joy to read. No clichés, no filler.',
    color: '#06b6d4',
  },
  {
    id: 'leo',
    name: 'Leo',
    emoji: '📣',
    role: 'Marketer',
    personality:
      'A growth marketer with killer instincts. You handle positioning, launch plans, social strategy, SEO and conversion — always with concrete, actionable tactics and example copy.',
    color: '#a855f7',
  },
  {
    id: 'nova',
    name: 'Nova',
    emoji: '📊',
    role: 'Analyst',
    personality:
      'A rigorous data analyst. You structure problems, crunch numbers, build comparisons and projections, and present findings as clear takeaways. You show your working and flag uncertainty.',
    color: '#14b8a6',
  },
  {
    id: 'quinn',
    name: 'Quinn',
    emoji: '🧪',
    role: 'QA Engineer',
    personality:
      'A meticulous QA and test engineer. You hunt for edge cases, write thorough test plans and test code, reproduce bugs, and verify fixes. You think adversarially about what could break and report issues clearly with steps to reproduce.',
    color: '#ef4444',
  },
  {
    id: 'sage',
    name: 'Sage',
    emoji: '♟️',
    role: 'Strategist',
    personality:
      'A sharp product & business strategist. You weigh trade-offs, map risks and opportunities, prioritize ruthlessly, and turn fuzzy goals into a clear, sequenced plan with concrete next steps and success metrics.',
    color: '#8b5cf6',
  },
]

const EMOJIS = ['🤖', '🧠', '⚡', '🚀', '✨', '🦾', '🎯', '🛠️', '📐', '🧪', '🎬', '📊']
const COLORS = ['#6366f1', '#10b981', '#ec4899', '#f59e0b', '#06b6d4', '#a855f7', '#ef4444', '#14b8a6']

export function randomEmoji() {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
}
export function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}

const key = (uid: string) => `askai:agents:${uid}`

// Bump the version suffix whenever EXTRA_AGENTS grows so the one-time merge runs
// again and existing users pick up the newly added default specialists.

/** The head agent (AskAI / Chief of Staff) — the ONLY agent a brand-new account
 *  starts with. Specialists are created by the user (via onboarding or by asking
 *  AskAI), never auto-seeded, so accounts don't come pre-stuffed with agents. */
export const ASKAI_LEAD: Agent = DEFAULT_AGENTS[0]

/** Full catalog of built-in specialists the onboarding / Chief of Staff can hire. */
export const BUILTIN_SPECIALISTS: Agent[] = [...DEFAULT_AGENTS.slice(1), ...EXTRA_AGENTS]

export function loadAgents(uid: string): Agent[] {
  try {
    const raw = localStorage.getItem(key(uid))
    // Brand-new account → just the AskAI lead. No pre-seeded team.
    if (!raw) return [{ ...ASKAI_LEAD }]
    const list = JSON.parse(raw) as Agent[]
    if (!Array.isArray(list) || !list.length) return [{ ...ASKAI_LEAD }]
    // One-time rename of the old "Bob" Team Lead to the "AskAI" Chief of Staff
    // so existing rosters reflect the head agent's new identity.
    let renamed = false
    for (const a of list) {
      if (a.id === 'bob' && a.name === 'Bob') {
        a.name = 'AskAI'
        a.role = 'Chief of Staff'
        renamed = true
      }
      // Reclaim space: old builds stored huge base64 avatar portraits on every
      // agent, which bloated localStorage past quota and silently broke saving
      // of new agents + chats. Agents render as an emoji mark now, so drop them.
      if ((a as Agent & { avatar?: string }).avatar) {
        delete (a as Agent & { avatar?: string }).avatar
        renamed = true
      }
    }
    // Always guarantee the AskAI lead is present (it must exist to delegate).
    if (!list.some((a) => a.id === 'bob')) {
      list.unshift({ ...ASKAI_LEAD })
      renamed = true
    }
    if (renamed) localStorage.setItem(key(uid), JSON.stringify(list))
    return list
  } catch {
    return [{ ...ASKAI_LEAD }]
  }
}

export function saveAgents(uid: string, agents: Agent[]) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(agents))
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent('askai-agents-changed'))
  } catch {
    /* ignore */
  }
}

export function upsertAgent(uid: string, agent: Agent) {
  const list = loadAgents(uid).filter((a) => a.id !== agent.id)
  list.push(agent)
  saveAgents(uid, list)
}

export function deleteAgent(uid: string, id: string) {
  saveAgents(
    uid,
    loadAgents(uid).filter((a) => a.id !== id),
  )
}

export function newAgent(): Agent {
  return {
    id: crypto.randomUUID(),
    name: '',
    emoji: randomEmoji(),
    role: '',
    personality: '',
    color: randomColor(),
    browsing: true,
  }
}

/** Does this chat message read like "create/make an agent that…"? */
export function looksLikeAgentRequest(text: string): boolean {
  const l = (text || '').toLowerCase()
  return /\b(create|make|hire|build|add|spin ?up|give me)\b/.test(l) && /\bagent\b/.test(l)
}

/** Pick a fitting emoji for a new agent from its role/skills. */
function emojiForRole(text: string): string {
  const t = text.toLowerCase()
  const map: [RegExp, string][] = [
    [/search|research|find|web|browse|scout/, '🔎'],
    [/engineer|develop|code|build|program/, '💻'],
    [/design|ui|ux|brand|visual|art/, '🎨'],
    [/writ|copy|content|blog|edit/, '✍️'],
    [/market|growth|ads|seo|social/, '📣'],
    [/data|analy|metric|finance|number/, '📊'],
    [/legal|law|compliance/, '⚖️'],
    [/support|help|customer/, '💬'],
    [/strateg|plan|product|manage/, '♟️'],
    [/health|fitness|coach|wellness/, '💪'],
    [/travel|trip|book/, '✈️'],
    [/food|recipe|chef|cook/, '🍳'],
  ]
  for (const [re, e] of map) if (re.test(t)) return e
  return randomEmoji()
}

/** AskAI (head agent) designs a new agent from a plain-English request.
 *  Fast + reliable: it does ONE short, timeout-guarded model call and never
 *  blocks on image generation (agents render as an emoji mark), so a created
 *  agent is always returned and saved — even offline / with no image backend. */
export async function aiDesignAgent(description: string): Promise<Agent> {
  const { complete } = await import('./groq')
  const sys = `You design an AI team agent from the user's request. Reply with ONLY compact JSON, no prose:
{"name":"<short first name; use the one the user gave, else invent a fitting one — no spaces>","role":"<2-4 word role>","personality":"<2-3 sentences of personality + how it works>","skills":["skill1","skill2","skill3"]}`
  let obj: any = {}
  try {
    const out = await Promise.race([
      complete(
        'llama-3.3-70b-versatile',
        [
          { role: 'system', content: sys },
          { role: 'user', content: description },
        ],
        { temperature: 0.5, maxTokens: 400 },
      ),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
    ])
    const a = out.indexOf('{')
    const b = out.lastIndexOf('}')
    if (a >= 0 && b >= 0) obj = JSON.parse(out.slice(a, b + 1))
  } catch {
    /* fall back to a sensible default derived from the request */
  }
  // If the model didn't name it, try to lift a name the user gave ("name it X").
  const fallbackName = description.match(/\bnamed?\s+(?:it\s+)?([A-Za-z][A-Za-z0-9]{1,20})/i)?.[1]
  const role = String(obj.role || 'Specialist')
  const agent: Agent = {
    id: crypto.randomUUID(),
    name: String(obj.name || fallbackName || 'Nova').replace(/\s+/g, '').slice(0, 24),
    emoji: emojiForRole(`${role} ${(obj.skills || []).join(' ')} ${description}`),
    role,
    personality: String(obj.personality || 'A capable, friendly AI specialist who gets straight to useful work.'),
    color: randomColor(),
    skills: Array.isArray(obj.skills) ? obj.skills.map(String).slice(0, 6) : [],
    browsing: true,
  }
  return agent
}

/** Lazily generate a realistic AI avatar for an agent that only has an emoji.
 *  Idempotent: generates once, caches the result on the agent via upsertAgent,
 *  and returns the (possibly updated) agent. While generating, callers keep the
 *  emoji as a fallback. */
export async function ensureAgentAvatar(_uid: string, agent: Agent): Promise<Agent> {
  // No-op: agents render as an emoji mark (Nebula-style). Generating base64
  // portraits previously bloated localStorage past quota and silently broke
  // saving of agents AND chats — so avatars are intentionally not generated.
  return agent
}

/** No-op (kept for callers). Avatar pre-generation is disabled — see above. */
export async function pregenerateAgentAvatars(_uid: string): Promise<void> {
  /* intentionally does nothing */
}

export function getAgent(uid: string, id: string): Agent | null {
  return loadAgents(uid).find((a) => a.id === id) ?? null
}

export function findAgentByName(uid: string, name: string): Agent | null {
  const n = name.trim().toLowerCase()
  return loadAgents(uid).find((a) => a.name.toLowerCase() === n) ?? null
}

/** Agents @mentioned in a message (matched against the user's agent names). */
export function mentionedAgents(uid: string, text: string): Agent[] {
  const agents = loadAgents(uid)
  const out: Agent[] = []
  const re = /@([a-z0-9_-]+)/gi
  let m
  while ((m = re.exec(text))) {
    const a = agents.find((x) => x.name.toLowerCase() === m![1].toLowerCase())
    if (a && !out.includes(a)) out.push(a)
  }
  return out
}

/** Agents whose NAME is used to DIRECTLY ADDRESS the message (case-insensitive),
 *  e.g. "Leon, do X", "Leon: do X", "Leon do X" (start of message), or after an
 *  address word ("hi Leon", "hey Leon", "ok Leon", "@Leon"). A bare incidental
 *  mention of the name in prose (e.g. an agent literally named "Max" appearing in
 *  "the max value") does NOT count, so common-word names don't false-trigger.
 *  Ignores very short names (<3 chars) to avoid false hits. */
export function namedAgents(uid: string, text: string): Agent[] {
  const t = text || ''
  const out: Agent[] = []
  for (const a of loadAgents(uid)) {
    const name = a.name.trim()
    if (name.length < 3) continue
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Direct address only: at the very start of the message, or preceded by an
    // address word / @, and immediately followed by a comma, colon, or space.
    const re = new RegExp(
      `(?:^\\s*|\\b(?:hi|hey|hello|yo|ok|okay|thanks|thank you|@)\\s*)${esc}(?=[\\s,:!?]|$)`,
      'i',
    )
    if (re.test(t) && !out.includes(a)) out.push(a)
  }
  return out
}

/** If the message clearly addresses exactly ONE agent — by @mention OR by name —
 *  return that agent so only they reply. Returns null when zero or several agents
 *  are referenced (let the normal router decide). */
export function targetedAgent(uid: string, text: string): Agent | null {
  const mentioned = mentionedAgents(uid, text)
  if (mentioned.length === 1) return mentioned[0]
  if (mentioned.length > 1) return null
  const named = namedAgents(uid, text)
  return named.length === 1 ? named[0] : null
}

/* --- 1-on-1 agent chat handoff -------------------------------------------
   Stash an agent so the next freshly-opened chat becomes a 1-on-1 chat with
   them (mirrors dispatchTeam's sessionStorage handoff). */
const PENDING_AGENT_KEY = 'askai:chat:agent'

export function setPendingAgentChat(agent: Agent) {
  try {
    sessionStorage.setItem(PENDING_AGENT_KEY, JSON.stringify(agent))
  } catch {
    /* ignore */
  }
}

export function takePendingAgentChat(): Agent | null {
  try {
    const raw = sessionStorage.getItem(PENDING_AGENT_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PENDING_AGENT_KEY)
    return JSON.parse(raw) as Agent
  } catch {
    return null
  }
}

/* --- Pending agent prompt -------------------------------------------------
   A goal handed off from the Agents page that should be AUTO-SENT once the
   target chat mounts with its agent applied (so the reply is agent-led and the
   user doesn't have to press send again). Consumed by ChatView. */
const PENDING_PROMPT_KEY = 'askai:chat:agent-prompt'

export function setPendingAgentPrompt(text: string) {
  try {
    sessionStorage.setItem(PENDING_PROMPT_KEY, text)
  } catch {
    /* ignore */
  }
}

/** Read the pending prompt WITHOUT consuming it (so the sender can wait until the
 *  agent handoff is applied before actually sending). */
export function peekPendingAgentPrompt(): string | null {
  try {
    return sessionStorage.getItem(PENDING_PROMPT_KEY)
  } catch {
    return null
  }
}

export function takePendingAgentPrompt(): string | null {
  try {
    const v = sessionStorage.getItem(PENDING_PROMPT_KEY)
    if (v) sessionStorage.removeItem(PENDING_PROMPT_KEY)
    return v
  } catch {
    return null
  }
}

/** Does this message ask to dispatch / mobilize the team of agents? */
export function wantsTeamDispatch(text: string): boolean {
  return /\b(dispatch|mobiliz|assemble|the (whole|hole|entire) team|all (the )?agents|whole team|team of agents|get the team|whole squad)\b/i.test(
    text,
  )
}
