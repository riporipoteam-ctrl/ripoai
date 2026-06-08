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

const EMOJIS = ['🤖', '🧠', '⚡', '🚀', '✨', '🦾', '🎯', '🛠️', '📐', '🧪', '🎬', '📊']
const COLORS = ['#6366f1', '#10b981', '#ec4899', '#f59e0b', '#06b6d4', '#a855f7', '#ef4444', '#14b8a6']

export function randomEmoji() {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
}
export function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}

const key = (uid: string) => `askai:agents:${uid}`

export function loadAgents(uid: string): Agent[] {
  try {
    const raw = localStorage.getItem(key(uid))
    if (!raw) return [...DEFAULT_AGENTS]
    const list = JSON.parse(raw) as Agent[]
    return Array.isArray(list) && list.length ? list : [...DEFAULT_AGENTS]
  } catch {
    return [...DEFAULT_AGENTS]
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

/** Does this message ask to dispatch / mobilize the team of agents? */
export function wantsTeamDispatch(text: string): boolean {
  return /\b(dispatch|mobiliz|assemble|the (whole|hole|entire) team|all (the )?agents|whole team|team of agents|get the team|whole squad)\b/i.test(
    text,
  )
}
