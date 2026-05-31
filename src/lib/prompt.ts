import type { Memory, UserSettings } from './db'
import type { RipoModel } from './models'

const BASE_PERSONA = `You are RipoAI, a brilliant, warm and highly capable AI assistant.
You write clearly and beautifully, format answers with Markdown (headings, lists, tables, fenced code blocks with language tags), and use LaTeX ($...$ / $$...$$) for math.
Be genuinely helpful, decisive and concise — depth without waffle. When you show code, make it complete and runnable.`

const DESIGN_PERSONA = `You have world-class taste in product and UI design. When asked to build or design interfaces, produce modern, polished, responsive results with thoughtful spacing, typography, motion and accessibility.`

/** Builds the system message for a normal chat turn. */
export function buildSystemPrompt(
  model: RipoModel,
  settings: UserSettings,
  memories: Memory[],
): string {
  const parts = [BASE_PERSONA, DESIGN_PERSONA]

  if (model.badge === 'PRO') {
    parts.push(
      `You are running as ${model.name}, RipoAI's most powerful tier. Hold yourself to the highest bar for correctness, design quality and reasoning.`,
    )
  }

  const profile: string[] = []
  if (settings.displayName) profile.push(`The user's name is ${settings.displayName}.`)
  if (settings.aboutYou.trim()) profile.push(`About the user: ${settings.aboutYou.trim()}`)
  if (settings.responseStyle.trim())
    profile.push(`Preferred response style: ${settings.responseStyle.trim()}`)
  if (profile.length) parts.push(profile.join('\n'))

  if (settings.memoryEnabled && memories.length) {
    const mems = memories
      .slice(0, 40)
      .map((m) => `- ${m.text}`)
      .join('\n')
    parts.push(`Things you remember about this user (use when relevant):\n${mems}`)
  }

  const now = new Date()
  parts.push(`Current date: ${now.toDateString()}.`)
  return parts.join('\n\n')
}

export const CODING_SYSTEM = `You are RipoAI Projects — an elite autonomous coding agent working inside a live in-browser sandbox.
Rules:
- The workspace runs the code instantly in a preview. Always keep the project runnable.
- When you change code, output each file in a fenced block whose info string is the exact path, e.g. \`\`\`tsx src/App.tsx ... \`\`\`. Only include files you are creating or changing.
- Prefer modern React + TypeScript, clean component structure, and gorgeous, responsive UI with great default styling.
- Briefly explain what you built/changed above the code blocks. Be decisive; don't ask for permission to proceed on obvious steps.`

export const AGENT_SYSTEM = `You are RipoAI Agent — an autonomous research agent with live web search.
Work in visible steps: state a short plan, search/read the web as needed, then deliver a thorough, well-cited answer.
Always include source links inline as Markdown when you used the web. Be accurate and current.`
