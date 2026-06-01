// Slash commands and a small prompt library surfaced in the composer.

export interface SlashCommand {
  cmd: string
  title: string
  description: string
  /** Template; {input} is replaced with whatever the user typed after the command. */
  template: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    cmd: '/summarize',
    title: 'Summarize',
    description: 'Summarize text or a topic concisely',
    template: 'Summarize the following clearly with key points:\n\n{input}',
  },
  {
    cmd: '/explain',
    title: 'Explain simply',
    description: 'Explain a concept like I am five',
    template: 'Explain this simply, with an analogy and a short example:\n\n{input}',
  },
  {
    cmd: '/code',
    title: 'Write code',
    description: 'Generate clean, complete code',
    template: 'Write clean, complete, well-commented code for:\n\n{input}',
  },
  {
    cmd: '/improve',
    title: 'Improve writing',
    description: 'Polish and proofread text',
    template: 'Improve the clarity, grammar and flow of this text, keeping my voice:\n\n{input}',
  },
  {
    cmd: '/translate',
    title: 'Translate',
    description: 'Translate to another language',
    template: 'Translate the following (auto-detect source language) into English. If it is already English, translate to Spanish:\n\n{input}',
  },
  {
    cmd: '/brainstorm',
    title: 'Brainstorm',
    description: 'Generate creative ideas',
    template: 'Brainstorm 10 creative, distinct ideas for:\n\n{input}',
  },
  {
    cmd: '/plan',
    title: 'Make a plan',
    description: 'Create a step-by-step plan',
    template: 'Create a clear, actionable step-by-step plan for:\n\n{input}',
  },
]

export function applySlash(text: string): string {
  const trimmed = text.trimStart()
  for (const c of SLASH_COMMANDS) {
    if (trimmed === c.cmd || trimmed.startsWith(c.cmd + ' ')) {
      const input = trimmed.slice(c.cmd.length).trim()
      return c.template.replace('{input}', input || '(see attached/below)')
    }
  }
  return text
}
