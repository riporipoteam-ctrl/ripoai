// Multi-agent orchestration with smart routing. A router first decides whether
// the message is casual chat or a real build/task, and which agents should
// answer (one, some, or all). For chat, only the best-fit agent(s) reply in
// character. For a task, the lead plans & delegates, specialists work (seeing
// each other's output), and the lead assembles the final deliverable. Everything
// streams so the Team room shows the agents talking live.
import { streamChat, complete } from './groq'
import { CODER_MODEL, COMPOUND_MODEL } from './models'
import type { Agent } from './agents'
import type { Attachment } from './db'

export type Phase = 'plan' | 'work' | 'final' | 'system' | 'chat' | 'user'

export interface TeamEvent {
  id: string
  agentId: string
  name: string
  emoji: string
  /** AI-generated avatar image — shown instead of the emoji when present. */
  avatar?: string
  color: string
  role: string
  phase: Phase
  text: string
  done: boolean
  to?: string
  /** Files/images the user attached to this turn (user events only). */
  attachments?: Attachment[]
}

export interface RunTeamArgs {
  task: string
  agents: Agent[]
  lead: Agent
  signal?: AbortSignal
  onEvent: (ev: TeamEvent) => void
  /** Optional pre-selected agents (e.g. from @mentions). */
  preselected?: Agent[]
  /** Earlier conversation in this team room (previous tasks + deliverable),
   * so follow-ups like "make it darker" work on the existing result. */
  context?: string
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
    avatar: agent.avatar,
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

/** Pure small-talk: greetings, thanks, one-liners — these just get a friendly
 * reply, never a work session. Everything else is treated as a real task. */
export function isSmalltalk(text: string): boolean {
  const t = (text || '').trim().toLowerCase()
  if (t.length < 14 && !/\?/.test(t)) return true
  return /^(hi|hey+|hello|yo|sup|wassup|thanks|thank you|ty|ok(ay)?|cool|nice|lol|haha|gm|gn|good (morning|afternoon|evening|night)|how(\s+are|'?re) (you|u|ya)|who are you|what'?s up)\b/.test(
    t,
  )
}

/** Does the deliverable need real code/files (website, app, script, game)? */
export function isCodeBuild(text: string): boolean {
  return /\b(website|web ?app|webpage|web ?page|landing|portfolio site|app|game|code|coding|script|component|function|api|program|html|css|javascript|react|python script|dashboard|widget|chrome extension)\b/i.test(
    text || '',
  )
}

/** Does the task need fresh, real-world info best answered with live web search? */
export function needsWeb(text: string): boolean {
  return /\b(cheapest|best|price|cost|book|hotel|flight|deal|near|today|current|latest|news|weather|score|who (is|won)|when (is|does)|where|find me|look up|research|compare|reviews?|buy|stock|menu|hours|open now|address|phone)\b/i.test(
    text || '',
  )
}

/** Ask a fast model to route the message: who answers, and how many. Defaults
 * to ONE agent doing the work — only a genuinely multi-discipline build pulls
 * in several. Small-talk is detected up front, so here we choose the workers. */
async function routeMessage(task: string, agents: Agent[], lead: Agent): Promise<Route> {
  // Smalltalk never spins up a work session.
  if (isSmalltalk(task)) return { mode: 'chat', lead: lead.name, agents: [lead.name] }
  const fallback: Route = { mode: 'build', lead: lead.name, agents: [lead.name] }
  try {
    const out = await complete(
      'llama-3.3-70b-versatile',
      [
        {
          role: 'system',
          content:
            'You assign a user task to the RIGHT agents on a team. Reply with ONLY compact JSON, no prose.\n' +
            'Team:\n' +
            agentList(agents) +
            '\n\nRules:\n' +
            '- Pick the FEWEST agents that can do the job. Default to exactly ONE best-fit agent.\n' +
            '- Only pick multiple agents when the task genuinely spans different disciplines (e.g. "design AND build AND write copy for a website"). A simple ask (find info, answer a question, write one thing, research something) = ONE agent.\n' +
            '- "lead": the agent who answers/coordinates (must be in "agents").\n' +
            'Reply exactly like: {"lead":"Ada","agents":["Ada"]}',
        },
        { role: 'user', content: `Task: "${task}"` },
      ],
      { temperature: 0, maxTokens: 160 },
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
    return { mode: 'build', lead: leadName, agents: valid.map((a) => a.name) }
  } catch {
    return fallback
  }
}

// What kind of output the task wants — shapes the rules every agent gets.
function taskGuidance(task: string): string {
  if (isCodeBuild(task)) {
    return 'This task needs real, runnable code. Output COMPLETE files, each in its own fenced block whose info string is the file path (```html /index.html```, ```css /styles.css```, ```js /script.js```). No placeholders, no "rest here".'
  }
  return 'This is NOT a coding task. Do NOT write any code, scripts, Python, or pseudo-code — just give the actual answer/result in clear prose (and lists/tables only if they genuinely help). Be direct and concise.'
}

export async function runTeam(args: RunTeamArgs): Promise<{ deliverable: string; mode: Route['mode'] }> {
  const { task, agents, lead, signal, onEvent, preselected, context } = args
  const ctxBlock = context
    ? `\n\nEarlier in this conversation (continue from here — treat follow-ups as changes to this existing work, do NOT start from scratch):\n${context}`
    : ''

  // If the user picked specific agents (@mentions), honor EXACTLY those — never
  // expand the roster. Otherwise the router chooses the fewest needed.
  const route: Route = preselected?.length
    ? {
        mode: isSmalltalk(task) ? 'chat' : 'build',
        lead: preselected[0].name,
        agents: preselected.map((a) => a.name),
      }
    : await routeMessage(task, agents, lead)
  if (signal?.aborted) return { deliverable: '', mode: route.mode }

  const chosen = route.agents
    .map((n) => agents.find((a) => a.name === n))
    .filter((a): a is Agent => !!a)
  const theLead = agents.find((a) => a.name === route.lead) ?? chosen[0] ?? lead
  const codeBuild = isCodeBuild(task)
  const web = !codeBuild && needsWeb(task)
  const guidance = taskGuidance(task)

  // ---- SMALL TALK: one friendly, short reply in character -----------------
  if (route.mode === 'chat') {
    const a = chosen[0] ?? theLead
    const system = `You are ${a.name}, the ${a.role} on the AskAI team. ${a.personality}
Reply in first person, warm and BRIEF (1-2 sentences). This is small talk — do not build anything or write code.`
    const last = await streamAgent(a, 'chat', system, `The user says: "${task}"${ctxBlock}\n\nReply briefly.`, onEvent, signal, {
      maxTokens: 220,
    })
    return { deliverable: last, mode: 'chat' }
  }

  // ---- SINGLE AGENT: do the task immediately, no plan, no chatter ----------
  if (chosen.length <= 1) {
    const a = chosen[0] ?? theLead
    const system = `You are ${a.name}, the ${a.role} on the AskAI team. ${a.personality}
You are working SOLO on this task. Do the actual work and deliver the finished result directly — no preamble, no "let me", no status updates, no asking to continue. ${guidance}${
      web ? ' You have live web access — use it to get current, real information and cite source links inline.' : ''
    }`
    const text = await streamAgent(
      a,
      'final',
      system,
      `Task: "${task}"${ctxBlock}\n\nDeliver the finished result now.`,
      onEvent,
      signal,
      { model: codeBuild ? CODER_MODEL : web ? COMPOUND_MODEL : 'openai/gpt-oss-120b', maxTokens: codeBuild ? 6000 : 1600 },
    )
    return { deliverable: text, mode: 'build' }
  }

  // ---- MULTIPLE AGENTS: brief plan → work → assemble ----------------------
  const specialists = chosen.filter((a) => a.id !== theLead.id)
  const roster = agentList(chosen)

  const planSystem = `You are ${theLead.name}, the team lead. ${theLead.personality}
Your team for THIS task:
${roster}
Speak in first person. Be VERY brief.`
  const plan = await streamAgent(
    theLead,
    'plan',
    planSystem,
    `The user's goal:\n"${task}"${ctxBlock}\n\nIn 1-2 short lines, assign each teammate ONE concrete part. No fluff.`,
    onEvent,
    signal,
    { maxTokens: 280 },
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
    const system = `You are ${a.name}, the ${a.role} on a team led by ${theLead.name}. ${a.personality}
Speak in first person. Do your actual part fully and concisely — no status updates or filler. ${guidance}`
    const useCode = codeBuild && isEngineer
    const text = await streamAgent(
      a,
      'work',
      system,
      `Team goal: "${task}"${ctxBlock}\n\n${theLead.name}'s plan:\n${plan}${prior}\n\nDo YOUR part now.`,
      onEvent,
      signal,
      {
        model: useCode ? CODER_MODEL : web ? COMPOUND_MODEL : 'llama-3.3-70b-versatile',
        maxTokens: useCode ? 6000 : 1200,
        to: theLead.name,
      },
    )
    contributions.push({ agent: a, text })
  }
  if (signal?.aborted) return { deliverable: '', mode: 'build' }

  const finalSystem = `You are ${theLead.name}, the team lead. ${theLead.personality}
Assemble the team's work into ONE finished deliverable. ${guidance}
No meta-talk — just the result.`
  const finalText = await streamAgent(
    theLead,
    'final',
    finalSystem,
    `Team goal: "${task}"${ctxBlock}\n\nContributions:\n${contributions
      .map((c) => `### ${c.agent.name} (${c.agent.role})\n${c.text}`)
      .join('\n\n')}\n\nAssemble the FINAL result now — a one-line summary, then the finished deliverable.`,
    onEvent,
    signal,
    { model: codeBuild ? CODER_MODEL : 'openai/gpt-oss-120b', maxTokens: codeBuild ? 8000 : 2200 },
  )

  return { deliverable: finalText, mode: 'build' }
}

/** Back-compat: does this message clearly want something built/done? */
export function detectBuild(text: string): boolean {
  return !isSmalltalk(text)
}
