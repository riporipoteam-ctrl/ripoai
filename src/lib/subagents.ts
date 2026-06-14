// Subagents — AskAI can break a large task into a few focused specialist
// "subagents", run them, and fold their findings into one unified answer.
//
// Crucially, the subagents work SILENTLY: the user never sees their individual
// messages. The chat only shows lightweight status pills ("Created subagent:
// Researcher", "thinking…", then a check), and the head model writes the final
// reply using their combined findings.

import { complete } from './groq'

export interface SubagentStatus {
  name: string
  task: string
  status: 'thinking' | 'done' | 'error'
}

/** Should this turn be handled by a small team of subagents? True only for
 *  genuinely large / multi-part asks — simple chats stay instant and direct. */
export function wantsSubagents(text: string): boolean {
  const t = (text || '').trim()
  if (t.length < 60) return false
  // Explicit opt-in / opt-out.
  if (/\b(no subagents|don'?t use subagents|single answer|just answer)\b/i.test(t)) return false
  if (/\b(use subagents|spin up subagents|with subagents|delegate|use a team|dispatch (?:a )?team)\b/i.test(t)) return true
  // Multi-part / heavy-deliverable phrasing.
  const multipart =
    /\b(comprehensive|in[- ]depth|detailed (?:plan|report|guide|analysis)|step[- ]by[- ]step|research and (?:write|build|plan)|plan and build|end[- ]to[- ]end|business plan|go[- ]to[- ]market|marketing plan|roadmap|from scratch|complete guide|full (?:report|plan|guide|breakdown)|several (?:steps|parts|sections|aspects)|multiple (?:steps|parts|sections|angles)|break (?:this|it) down|each (?:of|section))\b/i.test(
      t,
    ) || /\bthen\b[\s\S]{0,120}\bthen\b/i.test(t)
  return (multipart && t.length > 90) || t.length > 280
}

interface Plan {
  name: string
  task: string
}

async function plan(task: string, signal?: AbortSignal): Promise<Plan[]> {
  try {
    const out = await complete(
      'llama-3.3-70b-versatile',
      [
        {
          role: 'system',
          content:
            'You are a project lead. Break the user\'s request into 2-4 focused subtasks, each handled by one specialist subagent. Reply with ONLY compact JSON, no prose: {"subagents":[{"name":"<2-3 word specialist title, e.g. Researcher / Outline Writer / Code Builder>","task":"<one clear sentence describing exactly what this subagent should produce>"}]}. Use the FEWEST subagents that genuinely help (2-3 is ideal). Do not include a final "synthesis" subagent — the lead combines the work.',
        },
        { role: 'user', content: task.slice(0, 1500) },
      ],
      { temperature: 0.3, maxTokens: 320 },
    )
    if (signal?.aborted) return []
    const a = out.indexOf('{')
    const b = out.lastIndexOf('}')
    if (a < 0 || b < 0) return []
    const obj = JSON.parse(out.slice(a, b + 1))
    const list = Array.isArray(obj?.subagents) ? obj.subagents : []
    return list
      .map((s: any) => ({ name: String(s?.name || '').trim().slice(0, 40), task: String(s?.task || '').trim().slice(0, 300) }))
      .filter((s: Plan) => s.name && s.task)
      .slice(0, 4)
  } catch {
    return []
  }
}

async function runOne(p: Plan, task: string, signal?: AbortSignal): Promise<string> {
  try {
    const out = await complete(
      'llama-3.3-70b-versatile',
      [
        {
          role: 'system',
          content: `You are the "${p.name}" subagent on a small AI team. Your single job: ${p.task}\nProduce ONLY your part — concrete, accurate, well-organized findings the team lead can use. Be specific (names, numbers, steps, code). Do not write the final user-facing answer or any greeting/sign-off. Keep it under ~350 words unless code is required.`,
        },
        { role: 'user', content: `Overall request:\n${task.slice(0, 1500)}\n\nDeliver your part now.` },
      ],
      { temperature: 0.5, maxTokens: 900 },
    )
    if (signal?.aborted) return ''
    return out.trim()
  } catch {
    return ''
  }
}

/** Plan + run the subagents. Calls onUpdate as statuses change so the UI can
 *  show the live "thinking…" pills. Returns null when no team is warranted (the
 *  caller then just answers normally). */
export async function runSubagents(opts: {
  task: string
  signal?: AbortSignal
  onUpdate: (subs: SubagentStatus[]) => void
}): Promise<{ subagents: SubagentStatus[]; findings: string } | null> {
  const plans = await plan(opts.task, opts.signal)
  if (opts.signal?.aborted || plans.length < 2) return null

  const statuses: SubagentStatus[] = plans.map((p) => ({ name: p.name, task: p.task, status: 'thinking' }))
  opts.onUpdate(statuses.map((s) => ({ ...s })))

  // Run the subagents in parallel; flip each pill to ✓ as it lands.
  const results = await Promise.all(
    plans.map(async (p, i) => {
      const text = await runOne(p, opts.task, opts.signal)
      statuses[i].status = text ? 'done' : 'error'
      opts.onUpdate(statuses.map((s) => ({ ...s })))
      return { p, text }
    }),
  )
  if (opts.signal?.aborted) return null

  const usable = results.filter((r) => r.text)
  if (!usable.length) return null

  const findings = usable
    .map((r) => `### ${r.p.name} — ${r.p.task}\n${r.text}`)
    .join('\n\n')

  return { subagents: statuses, findings }
}
