// Puter.js client — free access to frontier models (incl. Claude / Opus) via
// Puter's "User Pays" model. The end user signs in to their own free Puter
// account once; usage is billed to them, nothing server-side for us.
//
// Puter is loaded from https://js.puter.com/v2/ in index.html.

type PuterMsg = { role: string; content: any }

function P(): any {
  return (window as any).puter
}

export function isPuterLoaded(): boolean {
  return typeof window !== 'undefined' && !!P()?.ai?.chat
}

export function isPuterSignedIn(): boolean {
  try {
    return !!P()?.auth?.isSignedIn?.()
  } catch {
    return false
  }
}

/** Triggers the Puter sign-in popup once. Subsequent calls are cached. */
export async function puterSignIn(): Promise<boolean> {
  try {
    if (!isPuterLoaded()) return false
    if (isPuterSignedIn()) return true
    await P().auth.signIn()
    return isPuterSignedIn()
  } catch {
    return false
  }
}

export function puterSignOut() {
  try {
    P()?.auth?.signOut?.()
  } catch {
    /* ignore */
  }
}

export interface PuterStreamOpts {
  model: string
  messages: PuterMsg[]
  signal?: AbortSignal
  onToken?: (delta: string) => void
}

export interface PuterResult {
  content: string
  finishReason?: string
}

export async function streamPuter(opts: PuterStreamOpts): Promise<PuterResult> {
  const p = P()
  if (!p?.ai?.chat) throw new Error('Puter is still loading — try again in a moment.')

  // NEVER trigger a sign-in popup automatically. Callers must only use Puter
  // when isPuterSignedIn() is already true (connected via Settings).
  if (p.auth?.isSignedIn && !p.auth.isSignedIn()) {
    throw new Error('not-connected')
  }

  let content = ''
  let finishReason: string | undefined
  try {
    const resp = await p.ai.chat(opts.messages, { model: opts.model, stream: true })
    for await (const part of resp) {
      if (opts.signal?.aborted) break
      // Surface explicit error parts so the caller can fall back.
      if (part?.error || part?.code === 'error') {
        throw new Error(part?.error?.message || part?.message || 'puter-error')
      }
      const t: string = part?.text ?? part?.message?.content ?? ''
      if (t) {
        content += t
        opts.onToken?.(t)
      }
      if (part?.finish_reason) finishReason = part.finish_reason
    }
  } catch (e: any) {
    // Quota / usage / permission problems → signal failure so we fall back.
    throw new Error(e?.message || 'Puter request failed.')
  }
  // Some failures arrive as a short text blob instead of throwing — treat
  // usage/permission messages as a failure so we fall back to Groq.
  if (
    content.length < 320 &&
    /(no usage|usage limit|out of (usage|credit)|quota|insufficient|permission denied|not allowed|delinquent|limit reached|please sign|upgrade your)/i.test(content)
  ) {
    throw new Error('puter-usage')
  }
  if (!content.trim()) throw new Error('puter-empty')
  return { content, finishReason }
}
