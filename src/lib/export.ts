import type { StoredMessage } from './db'
import { MODELS } from './models'

// Render a conversation to Markdown and offer download / clipboard / share.

export function chatToMarkdown(title: string, messages: StoredMessage[]): string {
  const lines = [`# ${title}`, '', `_Exported from RipoAI · ${new Date().toLocaleString()}_`, '']
  for (const m of messages) {
    if (m.role === 'user') {
      lines.push(`**You:**`, '', m.content, '')
    } else {
      const name = m.model ? MODELS[m.model]?.name ?? 'RipoAI' : 'RipoAI'
      lines.push(`**${name}:**`, '', m.content, '')
    }
  }
  return lines.join('\n')
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function shareChat(title: string, text: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return true
    } catch {
      return false
    }
  }
  await navigator.clipboard.writeText(text)
  return true
}
