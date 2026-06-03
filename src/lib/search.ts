import { COMPOUND_MODEL } from './models'

// Web Search + Agent modes are powered by Groq's `compound` model, which has
// built-in web search and runs tool calls server-side. We route through it and
// surface its executed tools as a live trace.

const SEARCH_HINTS = [
  /\b(latest|today|tonight|right now|currently|current|recent|recently|news|update|updates|new|just|now|nowadays|these days)\b/i,
  /\b(price|prices|pricing|cost|costs|stock|stocks|crypto|weather|forecast|score|scores|who won|release date|released|launch|launched|version|rating|ratings|reviews?|deals?|specs?|salary|population|gdp|standings?)\b/i,
  /\b(20(1\d|2[0-9]|3\d))\b/, // any explicit year
  /https?:\/\/\S+/i, // explicit URL the user wants read
  /\b(who|what|which|when|where|why|how)\b.*\?/i, // any wh-question
  /\b(who|what|which|when|where)('s| is| are| was| were| will)\b/i,
  /\bhow (much|many|old|tall|long|far|big)\b/i,
  /\b(is|are|was|were|does|do|did|has|have|can)\b.*\b(still|alive|open|out|available|real|true|legit|released|launched|won|died|happened)\b/i,
  /\b(near me|nearby|directions|schedule|hours|open now|trending|viral|live|near by)\b/i,
  /\b(compare|comparison|vs\.?|versus|difference between|best|top \d+|cheapest|fastest|biggest|largest)\b/i,
  /\b(find|look up|lookup|search( for)?|google|tell me about|info on|information (on|about)|what'?s the|who'?s the)\b/i,
  /\b(define|definition of|meaning of|what does .* mean)\b/i,
]

// Things that should NOT trigger a (slow) web search — coding, math, writing,
// and personal/assistant requests the model handles directly.
const NO_SEARCH = [
  /\b(write|create|generate|make|build|code|fix|debug|refactor|implement|design)\b.*\b(code|function|component|app|script|program|class|html|css|website|page)\b/i,
  /\b(translate|rewrite|summarize this|paraphrase|proofread|fix the grammar|continue (the|this))\b/i,
  /\b(poem|story|essay|email|message|joke|song|lyrics|caption)\b/i,
  /^\s*(hi|hey|hello|yo|sup|thanks|thank you|ok|okay|cool|nice|lol|haha|good morning|good night)\b/i,
]

/** Heuristic: should we auto-search even when Web Search mode is off? */
export function shouldAutoSearch(text: string): boolean {
  const t = text.trim()
  // Don't auto-search trivial chit-chat / very short greetings.
  if (t.length < 6) return false
  if (NO_SEARCH.some((re) => re.test(t))) return false
  if (SEARCH_HINTS.some((re) => re.test(t))) return true
  // Otherwise: a question that names a proper noun (a capitalised word that
  // isn't the first word) usually needs facts about the world → search.
  if (/\?/.test(t) && /\s[A-Z][a-zA-Z]{2,}/.test(t)) return true
  return false
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
