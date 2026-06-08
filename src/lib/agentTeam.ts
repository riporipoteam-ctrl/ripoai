// Multi-agent orchestration with smart routing. A router first decides whether
// the message is casual chat or a real build/task, and which agents should
// answer (one, some, or all). For chat, only the best-fit agent(s) reply in
// character. For a task, the lead plans & delegates, specialists work (seeing
// each other's output), and the lead assembles the final deliverable. Everything
// streams so the Team room shows the agents talking live.
import { streamChat, complete } from './groq'
import { CODER_MODEL } from './models'
import type { Agent } from './agents'

export type Phase = 'plan' | 'work' | 'final' | 'system' | 'chat'

export interface TeamEvent {
  id: string
  agentId: string
  name: string
  emoji: string
  color: string
  role: string
  phase: Phase
  text: string
  done: boolean
  to?: string
}

export interface RunTeamArgs {
  task: string
  agents: Agent[]
  lead: Agent
  signal?: AbortSignal
  onEvent: (ev: TeamEvent) => void
  /** Optional pre-selected agents (e.g. from @mentions). */
  preselected?: Agent[]
}

const uid = () => Math.random().toString(36).slice(2)

function agentList(agents: Agent[]): string {
  return agents.map((a) => `- ${a.name} (${a.role}): ${a.personality}`).join('\n')
}

async function streamAgent(
  agent: Agent,
  phase: Phase,
  system: string,
  userMsg: string,
  onEvent: (ev: TeamEvent) => void,
  signal?: AbortSignal,
  opts: { model?: string; maxTokens?: number; to?: string } = {},
): Promise<string> {
  const ev: TeamEvent = {
    id: uid(),
    agentId: agent.id,
    name: agent.name,
    emoji: agent.emoji,
    color: agent.color,
    role: agent.role,
    phase,
    text: '',
    done: false,
    to: opts.to,
  }
  onEvent({ ...ev })
  let text = ''
  try {
    const res = await streamChat({
      provider: 'groq',
      model: opts.model ?? 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.85,
      maxTokens: opts.maxTokens ?? 1400,
      signal,
      onToken: (d) => {
        text += d
        onEvent({ ...ev, text, done: false })
      },
    })
    text = res.content || text
  } catch (e: any) {
    text = text || `(${agent.name} couldn't respond: ${e?.message ?? 'error'})`
  }
  onEvent({ ...ev, text, done: true })
  return text
}

interface Route {
  mode: 'chat' | 'build'
  lead: string
  agents: string[]
}

/** Ask a fast model to route the message: casual chat vs build, and who answers. */
async function routeMessage(task: string, agents: Agent[], lead: Agent): Promise<Route> {
  const fallback: Route = { mode: 'chat', lead: lead.name, agents: [lead.name] }
  try {
    const out = await complete(
      'llama-3.3-70b-versatile',
      [
        {
          role: 'system',
          content:
            'You route a user message to a team of AI agents. Reply with ONLY compact JSON, no prose.\n' +
            'Team:\n' +
            agentList(agents) +
            '\n\nDecide:\n' +
            '- "mode": "chat" for greetings, small talk, simple questions, or anything that does NOT require building/producing a real deliverable. "build" ONLY when the user clearly wants something created (a website, app, code, design, document, plan, research report, etc).\n' +
            '- "agents": which agents should respond. For "chat" pick the SINGLE best-fit agent (or 1–2 if a greeting to the whole team). For "build" pick ALL relevant agents.\n' +
            '- "lead": the agent who coordinates/answers (must be one of "agents").\n' +
            'Reply exactly like: {"mode":"chat","lead":"Bob","agents":["Bob"]}',
        },
        { role: 'user', content: `User message: "${task}"` },
      ],
      { temperature: 0, maxTokens: 200 },
    )
    const m = out.match(/\{[\s\S]*\}/)
    if (!m) return fallback
    const parsed = JSON.parse(m[0])
    const names: string[] = Array.isArray(parsed.agents) ? parsed.agents : []
    const valid = names
      .map((n) => agents.find((a) => a.name.toLowerCase() === String(n).toLowerCase()))
      .filter((a): a is Agent => !!a)
    if (!valid.length) return fallback
    const leadName =
      agents.find((a) => a.name.toLowerCase() === String(parsed.lead || '').toLowerCase())?.name ||
      valid[0].name
    return {
      mode: parsed.mode === 'build' ? 'build' : 'chat',
      lead: leadName,
      agents: valid.map((a) => a.name),
    }
  } catch {
    return fallback
  }
}

export async function runTeam(args: RunTeamArgs): Promise<{ deliverable: string; mode: Route['mode'] }> {
  const { task, agents, lead, signal, onEvent, preselected } = args

  // Route: who answers, and is this chat or a build?
  const route = preselected?.length
    ? { mode: detectBuild(task) ? ('build' as const) : ('chat' as const), lead: preselected[0].name, agents: preselected.map((a) => a.name) }
    : await routeMessage(task, agents, lead)
  if (signal?.aborted) return { deliverable: '', mode: route.mode }

  const chosen = route.agents
    .map((n) => agents.find((a) => a.name === n))
    .filter((a): a is Agent => !!a)
  const theLead = agents.find((a) => a.name === route.lead) ?? chosen[0] ?? lead

  // ---- CHAT MODE: agents just reply in character, no build ----------------
  if (route.mode === 'chat') {
    const speakers = chosen.length ? chosen : [theLead]
    let last = ''
    for (const a of speakers) {
      if (signal?.aborted) break
      const system = `You are ${a.name}, the ${a.role} on the AskAI team. ${a.personality}
Reply to the user naturally and briefly, in first person and in character. This is casual conversation — do NOT build anything, write code, or produce a deliverable unless explicitly asked. Just chat like a friendly teammate.`
      last = await streamAgent(a, 'chat', system, `The user says: "${task}"\n\nReply briefly in character.`, onEvent, signal, {
        maxTokens: 500,
      })
    }
    return { deliverable: last, mode: 'chat' }
  }

  // ---- BUILD MODE: plan → work → assemble ---------------------------------
  const specialists = chosen.filter((a) => a.id !== theLead.id)
  const roster = agentList(chosen.length ? chosen : agents)
  const buildy = detectBuild(task)

  const planSystem = `You are ${theLead.name}, the team lead. ${theLead.personality}
Your team:
${roster}
Speak in first person as ${theLead.name}. Keep it tight and energetic — you're rallying the team.`
  const plan = await streamAgent(
    theLead,
    'plan',
    planSystem,
    `The user's goal:\n"${task}"\n\nRestate the goal in one line, then assign ONE concrete task to each teammate by name. Be brief — a few lines. End by telling the team to start.`,
    onEvent,
    signal,
    { maxTokens: 600 },
  )
  if (signal?.aborted) return { deliverable: '', mode: 'build' }

  const contributions: { agent: Agent; text: string }[] = []
  for (const a of specialists) {
    if (signal?.aborted) break
    const prior = contributions.length
      ? `\n\nWhat teammates produced so far:\n${contributions
          .map((c) => `### ${c.agent.name} (${c.agent.role})\n${c.text.slice(0, 1600)}`)
          .join('\n\n')}`
      : ''
    const isEngineer = /engineer|develop|code|build|full[- ]?stack/i.test(a.role + a.personality)
    const buildHint =
      buildy && isEngineer
        ? '\nOutput COMPLETE, runnable files. For a website, output each file in its own fenced block whose info string is the path, e.g. ```html /index.html ... ```, ```css /styles.css ... ```, ```js /script.js ... ```. No placeholders.'
        : ''
    const system = `You are ${a.name}, the ${a.role} on a team led by ${theLead.name}. ${a.personality}
Speak in first person as ${a.name}. Do your actual job fully — don't just describe it.${buildHint}`
    const text = await streamAgent(
      a,
      'work',
      system,
      `Team goal: "${task}"\n\n${theLead.name}'s plan:\n${plan}${prior}\n\nNow do YOUR part completely.`,
      onEvent,
      signal,
      { model: buildHint ? CODER_MODEL : 'llama-3.3-70b-versatile', maxTokens: buildHint ? 6000 : 1400, to: theLead.name },
    )
    contributions.push({ agent: a, text })
  }
  if (signal?.aborted) return { deliverable: '', mode: 'build' }

  const finalSystem = `You are ${theLead.name}, the team lead. ${theLead.personality}
Assemble the team's work into ONE finished deliverable for the user.${
    buildy
      ? ' If this is a website/app, output the COMPLETE multi-file result: each file in its own fenced block whose info string is its path (```html /index.html```, ```css /styles.css```, ```js /script.js```). Ship finished, runnable files with no placeholders.'
      : ''
  }
Do NOT give up early or write "rest of code here". Finish everything.`
  const finalText = await streamAgent(
    theLead,
    'final',
    finalSystem,
    `Team goal: "${task}"\n\nContributions:\n${contributions
      .map((c) => `### ${c.agent.name} (${c.agent.role})\n${c.text}`)
      .join('\n\n')}\n\nAssemble the FINAL, complete deliverable now. One-line summary, then the finished result.`,
    onEvent,
    signal,
    { model: buildy ? CODER_MODEL : 'openai/gpt-oss-120b', maxTokens: 8000 },
  )

  return { deliverable: finalText, mode: 'build' }
}

/** Heuristic: does this message clearly want something built? */
export function detectBuild(text: string): boolean {
  return /\b(build|make|create|code|develop|design|website|web ?app|landing|app|game|tool|script|component|api|dashboard|portfolio|store|shop|write (me )?(a|an|the)|generate|plan|research|report|document|presentation|deck)\b/i.test(
    text,
  )
}
