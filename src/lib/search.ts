import { COMPOUND_MODEL } from './models'

// Web Search + Agent modes are powered by Groq's `compound` model, which has
// built-in web search and runs tool calls server-side. We route through it and
// surface its executed tools as a live trace.

const SEARCH_HINTS = [
  /\b(latest|today|tonight|right now|currently|current|recent|news)\b/i,
  /\b(price|stock|weather|score|who won|release date|version)\b/i,
  /\b(20(2[4-9]|3\d))\b/, // recent/future years
  /https?:\/\/\S+/i, // explicit URL the user wants read
  /\bwho is\b|\bwhat happened\b|\bwhen (is|was|will)\b/i,
]

/** Heuristic: should we auto-search even when Web Search mode is off? */
export function shouldAutoSearch(text: string): boolean {
  return SEARCH_HINTS.some((re) => re.test(text))
}

/** The Groq model to use when search/agent tooling is required. */
export function searchModel(): string {
  return COMPOUND_MODEL
}

// Optional, keyless page reader (Jina). Used to pull readable text from an
// explicit URL the user pastes, as a complement to compound's own search.
export async function readUrl(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain' },
    })
    if (!res.ok) return ''
    const text = await res.text()
    return text.slice(0, 6000)
  } catch {
    return ''
  }
}
