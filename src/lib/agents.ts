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
    name: 'Bob',
    emoji: '🧭',
    role: 'Team Lead',
    personality:
      'A decisive coordinator. You break a goal into clear tasks, delegate each to the right specialist, keep everyone on track, and assemble the final, complete deliverable. You are concise and action-oriented.',
    color: '#6366f1',
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
const seededKey = (uid: string) => `askai:agents:seeded-extra-v2:${uid}`

export function loadAgents(uid: string): Agent[] {
  try {
    const raw = localStorage.getItem(key(uid))
    if (!raw) return [...DEFAULT_AGENTS, ...EXTRA_AGENTS]
    const list = JSON.parse(raw) as Agent[]
    if (!Array.isArray(list) || !list.length) return [...DEFAULT_AGENTS, ...EXTRA_AGENTS]
    // One-time merge of the newer specialists for users with a saved roster.
    // Done once so deleting them afterwards sticks.
    if (!localStorage.getItem(seededKey(uid))) {
      const merged = [...list, ...EXTRA_AGENTS.filter((e) => !list.some((a) => a.id === e.id))]
      localStorage.setItem(seededKey(uid), '1')
      if (merged.length !== list.length) {
        localStorage.setItem(key(uid), JSON.stringify(merged))
        return merged
      }
    }
    return list
  } catch {
    return [...DEFAULT_AGENTS, ...EXTRA_AGENTS]
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

/** AskAI (head agent) designs a new agent from a plain-English request and
 *  generates a realistic profile picture for it. */
export async function aiDesignAgent(description: string): Promise<Agent> {
  const { complete } = await import('./groq')
  const { generateImage } = await import('./imagegen')
  const sys = `You design an AI team agent from the user's request. Reply with ONLY compact JSON, no prose:
{"name":"<short first name; use the one the user gave, else invent a fitting one — no spaces>","role":"<2-4 word role>","personality":"<2-3 sentences of personality + how it works>","skills":["skill1","skill2","skill3"],"avatar":"<a vivid 1-line image prompt for a friendly, realistic avatar portrait, e.g. 'a friendly golden retriever wearing glasses, studio portrait' or 'a warm smiling young engineer, soft studio light'>"}`
  let obj: any = {}
  try {
    const out = await complete(
      'llama-3.3-70b-versatile',
      [
        { role: 'system', content: sys },
        { role: 'user', content: description },
      ],
      { temperature: 0.5, maxTokens: 400 },
    )
    const a = out.indexOf('{')
    const b = out.lastIndexOf('}')
    if (a >= 0 && b >= 0) obj = JSON.parse(out.slice(a, b + 1))
  } catch {
    /* fall back to defaults below */
  }
  const agent: Agent = {
    id: crypto.randomUUID(),
    name: String(obj.name || 'Nova').replace(/\s+/g, ''),
    emoji: '🤖',
    role: String(obj.role || 'Specialist'),
    personality: String(obj.personality || 'A capable, friendly AI specialist.'),
    color: randomColor(),
    skills: Array.isArray(obj.skills) ? obj.skills.map(String) : [],
    browsing: true,
  }
  try {
    agent.avatar = await generateImage(
      `${obj.avatar || 'a friendly robot avatar, studio portrait, soft lighting'}. High-quality avatar portrait, centered, clean background.`,
      { w: 512, h: 512 },
    )
  } catch {
    /* keep emoji fallback */
  }
  return agent
}

/** Build a friendly, realistic portrait prompt from an agent's role/personality. */
function avatarPromptFor(agent: Agent): string {
  const persona = (agent.personality || '').replace(/\s+/g, ' ').slice(0, 220)
  return `A friendly, realistic professional portrait avatar of ${agent.name}, a ${
    agent.role || 'specialist'
  }. ${persona} Warm approachable expression, soft studio lighting, clean simple background, centered head-and-shoulders, high-quality avatar portrait.`
}

// Guards so the same agent's avatar isn't generated twice concurrently (and so a
// failed generation doesn't retry in a tight render loop within the same session).
const avatarInFlight = new Map<string, Promise<Agent>>()
const avatarTried = new Set<string>()

/** Lazily generate a realistic AI avatar for an agent that only has an emoji.
 *  Idempotent: generates once, caches the result on the agent via upsertAgent,
 *  and returns the (possibly updated) agent. While generating, callers keep the
 *  emoji as a fallback. */
export async function ensureAgentAvatar(uid: string, agent: Agent): Promise<Agent> {
  if (agent.avatar) return agent
  const guardKey = `${uid}:${agent.id}`
  const existing = avatarInFlight.get(guardKey)
  if (existing) return existing
  if (avatarTried.has(guardKey)) return agent
  const job = (async () => {
    avatarTried.add(guardKey)
    try {
      const { generateImage } = await import('./imagegen')
      const url = await generateImage(avatarPromptFor(agent), { w: 512, h: 512 })
      // Re-read the latest copy so we don't clobber concurrent edits.
      const latest = getAgent(uid, agent.id) ?? agent
      if (latest.avatar) return latest
      const updated: Agent = { ...latest, avatar: url }
      upsertAgent(uid, updated)
      return updated
    } catch {
      return agent
    } finally {
      avatarInFlight.delete(guardKey)
    }
  })()
  avatarInFlight.set(guardKey, job)
  return job
}

/** Proactively warm up avatars for every agent that still only has an emoji, so
 *  pictures are ready by the time Settings/Team render. Runs sequentially and
 *  swallows errors; cheap because ensureAgentAvatar no-ops once an avatar exists
 *  or generation is in-flight/already tried this session. */
export async function pregenerateAgentAvatars(uid: string): Promise<void> {
  for (const a of loadAgents(uid)) {
    if (a.avatar) continue
    try {
      await ensureAgentAvatar(uid, a)
    } catch {
      /* ignore — keep the emoji fallback */
    }
  }
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

/** Does this message ask to dispatch / mobilize the team of agents? */
export function wantsTeamDispatch(text: string): boolean {
  return /\b(dispatch|mobiliz|assemble|the (whole|hole|entire) team|all (the )?agents|whole team|team of agents|get the team|whole squad)\b/i.test(
    text,
  )
}
