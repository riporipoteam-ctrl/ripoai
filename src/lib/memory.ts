import { complete } from './groq'
import { COMPOUND_MINI_MODEL } from './models'
import { addMemory, type Memory } from './db'

// After an exchange, ask a small model to extract durable, useful facts worth
// remembering long-term (preferences, identity, ongoing projects) — never
// transient chit-chat. Returns the memories that were newly stored.
export async function extractMemories(
  uid: string,
  userText: string,
  assistantText: string,
  existing: Memory[],
): Promise<Memory[]> {
  const known = existing.map((m) => m.text).join('\n')
  const prompt = `From the exchange below, extract 0-3 durable facts about the USER worth remembering for future conversations (stable preferences, identity, goals, ongoing projects, important context).
Ignore one-off questions, the assistant's content, and anything already known.
Return ONLY a JSON array of short strings. Empty array if nothing is worth saving.

Already known:
${known || '(none)'}

User: ${userText.slice(0, 1500)}
Assistant: ${assistantText.slice(0, 800)}`

  let raw: string
  try {
    raw = await complete(
      'llama-3.1-8b-instant',
      [{ role: 'user', content: prompt }],
      { temperature: 0, maxTokens: 256 },
    )
  } catch {
    return []
  }

  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []
  let items: string[] = []
  try {
    items = JSON.parse(match[0])
  } catch {
    return []
  }

  const lowerKnown = new Set(existing.map((m) => m.text.toLowerCase().trim()))
  const created: Memory[] = []
  for (const item of items) {
    const text = String(item).trim()
    if (!text || text.length > 240) continue
    if (lowerKnown.has(text.toLowerCase())) continue
    try {
      created.push(await addMemory(uid, text))
    } catch {
      /* ignore */
    }
  }
  return created
}

// Exposed for potential future use (kept distinct from COMPOUND for clarity).
export { COMPOUND_MINI_MODEL }
