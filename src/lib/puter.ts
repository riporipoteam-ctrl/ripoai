// Puter.js client — free frontier models (incl. Claude) via Puter's "user-pays"
// model. Used by the experimental AskAI 4o Pro tier. Loaded from
// https://js.puter.com/v2/ in index.html. Sign-in popup appears once.

function P(): any {
  return (window as any).puter
}

export function isPuterLoaded(): boolean {
  return typeof window !== 'undefined' && !!P()?.ai?.chat
}

export interface PuterStreamOpts {
  model: string
  messages: { role: string; content: any }[]
  signal?: AbortSignal
  onToken?: (delta: string) => void
}

export async function streamPuter(opts: PuterStreamOpts): Promise<{ content: string }> {
  const p = P()
  if (!p?.ai?.chat) throw new Error('Puter not loaded')
  // NEVER trigger a sign-in popup. Use Puter only if already signed in;
  // otherwise throw so the caller falls back to Groq.
  if (p.auth?.isSignedIn && !p.auth.isSignedIn()) {
    throw new Error('puter-not-signed-in')
  }
  let content = ''
  const resp = await p.ai.chat(opts.messages, { model: opts.model, stream: true })
  for await (const part of resp) {
    if (opts.signal?.aborted) break
    if (part?.error) throw new Error(part?.error?.message || 'puter-error')
    const t: string = part?.text ?? part?.message?.content ?? ''
    if (t) {
      content += t
      opts.onToken?.(t)
    }
  }
  if (
    content.length < 320 &&
    /(usage|quota|insufficient|permission|not allowed|delinquent|limit reached|sign in|upgrade)/i.test(content)
  ) {
    throw new Error('puter-usage')
  }
  if (!content.trim()) throw new Error('puter-empty')
  return { content }
}
