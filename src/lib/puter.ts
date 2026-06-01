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

  // Sign in once if needed (single popup; Puter caches the session afterwards).
  if (p.auth?.isSignedIn && !p.auth.isSignedIn()) {
    const ok = await puterSignIn()
    if (!ok) throw new Error('Connect a free Puter account to use RipoAI 3o models.')
  }

  let content = ''
  let finishReason: string | undefined
  try {
    const resp = await p.ai.chat(opts.messages, { model: opts.model, stream: true })
    for await (const part of resp) {
      if (opts.signal?.aborted) break
      const t: string = part?.text ?? part?.message?.content ?? ''
      if (t) {
        content += t
        opts.onToken?.(t)
      }
      if (part?.finish_reason) finishReason = part.finish_reason
    }
  } catch (e: any) {
    if (content) return { content, finishReason: 'error' }
    throw new Error(e?.message || 'Puter request failed.')
  }
  return { content, finishReason }
}
