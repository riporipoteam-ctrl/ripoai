// Multi-agent orchestration. A lead agent plans and delegates, each specialist
// works in character (and can see what others produced), then the lead
// assembles the final deliverable. Everything streams as events so the Team
// room can show the agents "talking" to each other in real time.
import { streamChat } from './groq'
import { CODER_MODEL } from './models'
import type { Agent } from './agents'

export type Phase = 'plan' | 'work' | 'final' | 'system'

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
  /** True if the task is about building a site/app/code → ask for real files. */
  buildy?: boolean
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
      temperature: 0.8,
      maxTokens: opts.maxTokens ?? 1600,
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

export async function runTeam(args: RunTeamArgs): Promise<{ deliverable: string }> {
  const { task, agents, lead, signal, onEvent, buildy } = args
  const specialists = agents.filter((a) => a.id !== lead.id)
  const roster = agentList(agents)

  // ---- Phase 1: the lead plans & delegates -----------------------------
  const planSystem = `You are ${lead.name}, the team lead. ${lead.personality}
Your team:
${roster}
Speak in first person as ${lead.name}. Keep it tight and energetic — you are rallying the team.`
  const plan = await streamAgent(
    lead,
    'plan',
    planSystem,
    `The user's goal:\n"${task}"\n\nRestate the goal in one line, then assign ONE concrete task to each teammate by name (e.g. "Ada: build …", "Iris: design …"). Be brief — a few lines total. End by telling the team to start.`,
    onEvent,
    signal,
    { maxTokens: 700 },
  )
  if (signal?.aborted) return { deliverable: '' }

  // ---- Phase 2: specialists work, each seeing prior contributions ------
  const contributions: { agent: Agent; text: string }[] = []
  for (const a of specialists) {
    if (signal?.aborted) break
    const prior = contributions.length
      ? `\n\nWhat teammates have produced so far:\n${contributions
          .map((c) => `### ${c.agent.name} (${c.agent.role})\n${c.text.slice(0, 1800)}`)
          .join('\n\n')}`
      : ''
    const buildHint =
      buildy && /engineer|develop|code|build|full[- ]?stack/i.test(a.role + a.personality)
        ? '\nOutput COMPLETE, runnable files. For a website, output each file in its own fenced block whose info string is the path, e.g. ```html /index.html ... ```, ```css /styles.css ... ```, ```js /script.js ... ```. No placeholders, finish every file.'
        : ''
    const system = `You are ${a.name}, the ${a.role} on a team led by ${lead.name}. ${a.personality}
Speak in first person as ${a.name}. Address the lead and teammates naturally when useful. Deliver your part fully — do your actual job, don't just describe it.${buildHint}`
    const text = await streamAgent(
      a,
      'work',
      system,
      `Team goal: "${task}"\n\n${lead.name}'s plan:\n${plan}${prior}\n\nNow do YOUR part completely.`,
      onEvent,
      signal,
      {
        model: buildHint ? CODER_MODEL : 'llama-3.3-70b-versatile',
        maxTokens: buildHint ? 6000 : 1600,
        to: lead.name,
      },
    )
    contributions.push({ agent: a, text })
  }
  if (signal?.aborted) return { deliverable: '' }

  // ---- Phase 3: the lead assembles the final deliverable ---------------
  const finalSystem = `You are ${lead.name}, the team lead. ${lead.personality}
You are assembling the team's work into ONE finished deliverable for the user.${
    buildy
      ? ' If this is a website/app, output the COMPLETE multi-file result: each file in its own fenced block whose info string is its path (```html /index.html```, ```css /styles.css```, ```js /script.js```). Ship finished, runnable files with no placeholders.'
      : ''
  }
Do NOT give up early or write "rest of code here". Finish everything.`
  const finalText = await streamAgent(
    lead,
    'final',
    finalSystem,
    `Team goal: "${task}"\n\nThe team's contributions:\n${contributions
      .map((c) => `### ${c.agent.name} (${c.agent.role})\n${c.text}`)
      .join('\n\n')}\n\nAssemble the FINAL, complete deliverable now. Start with a one-line summary, then the finished result.`,
    onEvent,
    signal,
    { model: buildy ? CODER_MODEL : 'openai/gpt-oss-120b', maxTokens: 8000 },
  )

  return { deliverable: finalText }
}
