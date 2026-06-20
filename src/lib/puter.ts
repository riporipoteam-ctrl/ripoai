// Puter.js client — free, "user-pays" frontier models (incl. Claude Fable 5)
// loaded from https://js.puter.com/v2/ in index.html. Powers the website-only
// "AskAI 5o Pro" tier.
//
// IMPORTANT — no surprise popups: Puter's free runtime requires a Puter account
// (it shows a "Setting up your Puter.com account…" dialog on the first AI call).
// We NEVER trigger that automatically. By default 5o Pro runs on a free frontier
// fallback (no popup, no auth). Real Fable 5 via Puter is strictly OPT-IN: the
// user flips a one-time switch (which performs the Puter setup on a click), and
// only then do we route 5o Pro through Puter.

const FABLE_OPT_IN_KEY = 'ripoai:puter-fable-enabled'

function P(): any {
  return (window as any).puter
}

export function isPuterLoaded(): boolean {
  return typeof window !== 'undefined' && !!P()?.ai?.chat
}

/** Has the user opted in to real Fable 5 via Puter (accepting the one-time
 *  Puter account setup)? Off by default → no popup, ever. */
export function isPuterFableEnabled(): boolean {
  try {
    return localStorage.getItem(FABLE_OPT_IN_KEY) === '1'
  } catch {
    return false
  }
}

/** Is a Puter session already established (so AI calls won't pop a dialog)? */
export function isPuterSignedIn(): boolean {
  try {
    const p = P()
    return !!(p?.auth?.isSignedIn && p.auth.isSignedIn())
  } catch {
    return false
  }
}

/** Opt in to real Fable 5. MUST be called from a user gesture (e.g. a click) so
 *  the browser allows Puter's one-time setup popup. Resolves true once a Puter
 *  session exists. Turning it off just clears the preference. */
export async function setPuterFableEnabled(on: boolean): Promise<boolean> {
  try {
    if (!on) {
      localStorage.removeItem(FABLE_OPT_IN_KEY)
      return false
    }
    const p = P()
    if (!p?.ai?.chat) throw new Error('Puter is still loading — try again in a moment.')
    // Establish the Puter session now, while we have a user gesture, so later
    // chats never surface an unexpected popup.
    if (!isPuterSignedIn() && typeof p.auth?.signIn === 'function') {
      await p.auth.signIn()
    }
    localStorage.setItem(FABLE_OPT_IN_KEY, '1')
    return isPuterSignedIn()
  } catch (e) {
    // Setup dismissed/failed — leave the preference off so we stay popup-free.
    try {
      localStorage.removeItem(FABLE_OPT_IN_KEY)
    } catch {
      /* ignore */
    }
    throw e
  }
}

/** Should 5o Pro actually use Puter Fable 5 this turn? Only when the user opted
 *  in AND a session already exists — guaranteeing we never trigger a popup mid-
 *  chat. Otherwise the caller falls back to the free frontier model. */
export function shouldUsePuterFable(): boolean {
  return isPuterLoaded() && isPuterFableEnabled() && isPuterSignedIn()
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
  // Never trigger Puter's account popup from a chat turn: only proceed when a
  // session is already established (the user opted in earlier via a click).
  if (!isPuterSignedIn()) throw new Error('puter-not-signed-in')

  let content = ''
  // Puter accepts a bare model id ("claude-fable-5") or the vendor-qualified one
  // ("anthropic/claude-fable-5"); pass it straight through.
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
