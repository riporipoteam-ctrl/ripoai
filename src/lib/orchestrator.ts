// Chief-of-Staff orchestrator — the small brain behind the Agents home.
//
// Modeled on Nebula's "Chief of Staff" pattern: an orchestrator agent (branded
// "AskAI") that sets up a starting team for new users and routes a plain-English
// goal to the right specialist(s). It is intentionally thin: it reuses the
// existing agent roster, heuristics and 1-on-1 handoff already in agents.ts and
// agentTeam.ts rather than re-implementing any of them.

import {
  loadAgents,
  upsertAgent,
  getAgent,
  mentionedAgents,
  targetedAgent,
  setPendingAgentChat,
  DEFAULT_AGENTS,
  EXTRA_AGENTS,
  type Agent,
} from './agents'
import { isCodeBuild, needsWeb, isSmalltalk } from './agentTeam'
import { instantiate, getTemplate, type AgentTemplate } from './agentTemplates'
import { logActivity } from './agentActivity'

/** The orchestrator's display identity (the intro card persona). */
export const CHIEF = {
  name: 'AskAI',
  role: 'Chief of Staff',
  emoji: '✨',
  color: '#6366f1',
} as const

/** One member of the starting team, with the copy used on the intro card. */
export interface TeamRole {
  /** The agent id this role maps to in the roster (reused, never duplicated). */
  agentId: string
  label: string
  emoji: string
  color: string
  /** One-line description of what this teammate handles. */
  blurb: string
}

/**
 * The starting team the Chief of Staff sets up. Each role reuses an existing
 * default-agent id so we never create duplicate agents:
 *  - Builder    → Ada (Engineer)
 *  - Researcher → Max (Researcher)
 *  - Writer     → Vera (Writer)
 */
export const STARTING_TEAM: TeamRole[] = [
  {
    agentId: 'ada',
    label: 'Builder',
    emoji: '💻',
    color: '#10b981',
    blurb: 'Technical builds, coding, debugging and shipping projects.',
  },
  {
    agentId: 'max',
    label: 'Researcher',
    emoji: '🔎',
    color: '#f59e0b',
    blurb: 'Web research, competitive analysis and fact-finding.',
  },
  {
    agentId: 'vera',
    label: 'Writer',
    emoji: '✍️',
    color: '#06b6d4',
    blurb: 'Content, emails, docs and reports.',
  },
]

/** Look up a default agent definition (DEFAULT_AGENTS + EXTRA_AGENTS) by id. */
function defaultAgentById(id: string): Agent | undefined {
  return [...DEFAULT_AGENTS, ...EXTRA_AGENTS].find((a) => a.id === id)
}

const seededKey = (uid: string) => `askai:orchestrator:starting-team:${uid}`

/**
 * Ensure the Builder / Researcher / Writer starting team exists for this user.
 *
 * Idempotent and guarded by a localStorage flag so we only seed once. Reuses the
 * existing default-agent ids (Ada/Max/Vera) and only `upsertAgent`s a teammate
 * that isn't already present, so we never duplicate an agent the user already
 * has (or has deliberately deleted after the first run).
 */
export function ensureStartingTeam(uid: string): void {
  if (!uid) return
  try {
    if (localStorage.getItem(seededKey(uid))) return
  } catch {
    /* localStorage unavailable — treat as not seeded, still guard below */
  }

  const existing = loadAgents(uid)
  const have = new Set(existing.map((a) => a.id))
  for (const role of STARTING_TEAM) {
    if (have.has(role.agentId)) continue
    const def = defaultAgentById(role.agentId)
    if (def) upsertAgent(uid, { ...def })
  }

  try {
    localStorage.setItem(seededKey(uid), '1')
  } catch {
    /* ignore — worst case we re-run the idempotent seed */
  }
}

export interface ChiefIntro {
  name: string
  role: string
  emoji: string
  color: string
  /** Welcome headline + body shown on the intro card. */
  headline: string
  body: string
  /** The starting team summary rendered as chips/rows. */
  team: TeamRole[]
}

/** The welcome copy + team summary used by the intro card. */
export function chiefOfStaffIntro(): ChiefIntro {
  return {
    name: CHIEF.name,
    role: CHIEF.role,
    emoji: CHIEF.emoji,
    color: CHIEF.color,
    headline: "I'm AskAI, your Chief of Staff.",
    body: "I set up your starting team so you can hit the ground running. Tell me what you want done and I'll route it to the right agent — or hand the whole goal to the team room.",
    team: STARTING_TEAM,
  }
}

export type GoalAction = 'chat' | 'build' | 'research' | 'write' | 'team'

export interface GoalRoute {
  /** The agent chosen to handle the goal. */
  agent: Agent
  /** Other agents that were referenced/relevant (e.g. extra @mentions). */
  also: Agent[]
  /** A short, human label for what we suggest doing. */
  action: GoalAction
  /** One-line rationale shown to the user ("Routing to Ada to build this"). */
  reason: string
  /** True when the goal clearly spans disciplines and the team room fits best. */
  teamSuggested: boolean
}

/** Find the roster agent that best matches one of our starting-team roles. */
function roleAgent(uid: string, agentId: string): Agent | null {
  return getAgent(uid, agentId)
}

/** Pick the first roster agent whose role/personality matches a keyword test. */
function byRole(list: Agent[], re: RegExp): Agent | undefined {
  return list.find((a) => re.test(`${a.role} ${a.personality} ${a.name}`))
}

/**
 * Decide which agent(s) should handle a user goal.
 *
 * Order of precedence (reusing the heuristics already in agents.ts/agentTeam.ts):
 *  1. Explicit @mentions or a directly-addressed agent → honor exactly that.
 *  2. A clear code/build ask → the Builder (Ada / first engineer).
 *  3. A research / live-web ask → the Researcher (Max / first researcher).
 *  4. A writing ask → the Writer (Vera / first writer).
 *  5. Otherwise → the lead/coordinator, or the first agent.
 *
 * Never mutates the roster. The page can navigate into the chosen agent's chat
 * via `setPendingAgentChat` (re-exported below as `handoffToAgent`).
 */
export function routeGoal(uid: string, text: string): GoalRoute | null {
  const list = loadAgents(uid)
  if (!list.length) return null
  const t = (text || '').trim()

  // 1. Explicit targeting wins — @mentions, then a single directly-addressed name.
  const mentioned = mentionedAgents(uid, t)
  if (mentioned.length) {
    const [first, ...rest] = mentioned
    return {
      agent: first,
      also: rest,
      action: actionFor(t),
      reason: `Routing to ${mentioned.map((a) => a.name).join(', ')} — you mentioned ${mentioned.length === 1 ? 'them' : 'them directly'}.`,
      teamSuggested: mentioned.length > 1,
    }
  }
  const addressed = targetedAgent(uid, t)
  if (addressed) {
    return {
      agent: addressed,
      also: [],
      action: actionFor(t),
      reason: `Routing to ${addressed.name} — you addressed them directly.`,
      teamSuggested: false,
    }
  }

  // 2-N. Skill-based routing using the shared heuristics + richer keyword map.
  const wantsCode = isCodeBuild(t)
  const wantsWeb = !wantsCode && needsWeb(t)
  const wantsDesign =
    !wantsCode && /\b(design|ui|ux|layout|logo|palette|brand|mockup|wireframe|typography|color scheme)\b/i.test(t)
  const wantsData =
    /\b(analy[sz]e|data|spreadsheet|sql|query|metric|chart|forecast|projection|numbers|csv|dataset)\b/i.test(t)
  const wantsWrite =
    !wantsCode &&
    /\b(write|draft|email|copy|blog|post|article|essay|caption|script|story|newsletter|summar(y|ize)|report|letter|doc(ument)?|content)\b/i.test(
      t,
    )

  let agent: Agent | undefined
  let action: GoalAction = 'chat'
  let reason = ''

  if (wantsCode) {
    agent = roleAgent(uid, 'ada') ?? byRole(list, /engineer|develop|code|build|full[- ]?stack|builder/i)
    action = 'build'
    reason = agent ? `Routing to ${agent.name} — this looks like a build.` : ''
  } else if (wantsDesign) {
    agent = roleAgent(uid, 'iris') ?? byRole(list, /design|ui|ux|brand|visual/i)
    action = 'build'
    reason = agent ? `Routing to ${agent.name} — a design task.` : ''
  } else if (wantsWeb) {
    agent = roleAgent(uid, 'max') ?? byRole(list, /research|analyst|fact|find|investigat/i)
    action = 'research'
    reason = agent ? `Routing to ${agent.name} — this needs research.` : ''
  } else if (wantsData) {
    agent =
      roleAgent(uid, 'nova') ??
      byRole(list, /analy|data|metric|forecast|spreadsheet/i)
    action = 'research'
    reason = agent ? `Routing to ${agent.name} — a data/analysis task.` : ''
  } else if (wantsWrite) {
    agent = roleAgent(uid, 'vera') ?? byRole(list, /writ|copy|content|market/i)
    action = 'write'
    reason = agent ? `Routing to ${agent.name} — this is a writing task.` : ''
  }

  // Does the goal clearly span more than one discipline? If so, suggest the team.
  const disciplines = [wantsCode, wantsDesign, wantsWeb || wantsData, wantsWrite].filter(Boolean).length
  const teamSuggested = disciplines >= 2

  // 5. Fall back to a lead/coordinator, then the first agent.
  if (!agent) {
    agent = byRole(list, /lead|coordinat|manage|chief|bob/i) ?? list[0]
    action = isSmalltalk(t) ? 'chat' : action
    reason = `Routing to ${agent.name}.`
  }

  // Also-relevant specialists (for delegation suggestions on the home screen).
  const also = teamSuggested
    ? list.filter((x) => x.id !== agent!.id && byRole([x], /engineer|design|research|analy|writ|market/i)).slice(0, 2)
    : []

  return { agent, also, action, reason, teamSuggested }
}

/** Map a goal to a coarse action label (used when an agent is pre-targeted). */
function actionFor(text: string): GoalAction {
  if (isCodeBuild(text)) return 'build'
  if (needsWeb(text)) return 'research'
  if (/\b(write|draft|email|copy|blog|post|article|report|content)\b/i.test(text)) return 'write'
  return isSmalltalk(text) ? 'chat' : 'build'
}

/**
 * Hand a goal off to a 1-on-1 chat with the chosen agent. Stashes the agent so
 * the next freshly-opened chat becomes a chat with them (reuses the existing
 * `setPendingAgentChat` handoff). The caller navigates to '/' afterwards.
 */
export function handoffToAgent(agent: Agent): void {
  setPendingAgentChat(agent)
}

/* ──────────────────────────────────────────────────────────────────────────
 * Team setup wizard + hiring
 * ────────────────────────────────────────────────────────────────────────── */

/** A starter pack the Chief of Staff can recommend for a kind of work. */
export interface StarterPack {
  id: string
  label: string
  emoji: string
  blurb: string
  /** Template ids (from agentTemplates.ts) that make up the pack. */
  templateIds: string[]
}

/** Curated starter packs surfaced by the team-setup wizard. */
export const STARTER_PACKS: StarterPack[] = [
  {
    id: 'founder',
    label: 'Solo founder',
    emoji: '🚀',
    blurb: 'Build, research and write — everything to ship a product alone.',
    templateIds: ['builder', 'researcher', 'writer'],
  },
  {
    id: 'content',
    label: 'Content studio',
    emoji: '✍️',
    blurb: 'Long-form, social and SEO working as one editorial team.',
    templateIds: ['writer', 'social', 'seo'],
  },
  {
    id: 'growth',
    label: 'Growth team',
    emoji: '📈',
    blurb: 'Marketing, sales and SEO to drive demand and conversions.',
    templateIds: ['marketer', 'sales', 'seo'],
  },
  {
    id: 'product',
    label: 'Product squad',
    emoji: '🛠️',
    blurb: 'PM, engineer and designer to spec, build and polish features.',
    templateIds: ['pm', 'builder', 'designer'],
  },
  {
    id: 'ops',
    label: 'Back office',
    emoji: '⚙️',
    blurb: 'Operations, support and a legal assistant to run the business.',
    templateIds: ['ops', 'support', 'legal'],
  },
]

/**
 * Hire (instantiate + persist) an agent from a template for this user, logging
 * the activity so it appears in the home feed. Returns the created agent. Skips
 * persistence cleanly when uid is missing.
 */
export function hireFromTemplate(uid: string, template: AgentTemplate): Agent {
  const agent = instantiate(template)
  if (uid) {
    upsertAgent(uid, agent)
    logActivity(uid, agent.id, agent.name, 'created', `${agent.name} joined as your ${agent.role}`, {
      detail: template.tagline,
    })
  }
  return agent
}

/**
 * Apply a starter pack: hire every template in it that the user doesn't already
 * have (matched by role to avoid near-duplicates). Returns the agents created.
 */
export function applyStarterPack(uid: string, pack: StarterPack): Agent[] {
  if (!uid) return []
  const existingRoles = new Set(loadAgents(uid).map((a) => a.role.toLowerCase()))
  const created: Agent[] = []
  for (const id of pack.templateIds) {
    const tpl = getTemplate(id)
    if (!tpl || existingRoles.has(tpl.role.toLowerCase())) continue
    created.push(hireFromTemplate(uid, tpl))
    existingRoles.add(tpl.role.toLowerCase())
  }
  return created
}

/**
 * Suggest who else on the roster could help with a goal — the "delegation
 * suggestions" shown under the composer. Returns up to 3 agents (excluding the
 * primary one already chosen by routeGoal).
 */
export function delegationSuggestions(uid: string, text: string, excludeId?: string): Agent[] {
  const list = loadAgents(uid).filter((a) => a.id !== excludeId)
  const t = (text || '').toLowerCase()
  const scored = list
    .map((a) => {
      const hay = `${a.role} ${a.personality} ${(a.skills ?? []).join(' ')}`.toLowerCase()
      const words = t.split(/\W+/).filter((w) => w.length > 3)
      let score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0)
      // Light topical boosts so an obvious specialist surfaces even with few word hits.
      if (isCodeBuild(t) && /engineer|build|code/.test(hay)) score += 2
      if (needsWeb(t) && /research|analy|fact/.test(hay)) score += 2
      if (/write|copy|content|email|post/.test(t) && /writ|copy|content|market|social/.test(hay)) score += 2
      return { a, score }
    })
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score)
  return scored.slice(0, 3).map((s) => s.a)
}
