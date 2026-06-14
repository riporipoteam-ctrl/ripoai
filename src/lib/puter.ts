// Puter.js client — free, "user-pays" frontier models (incl. Claude Fable 5)
// loaded from https://js.puter.com/v2/ in index.html. Powers the website-only
// "AskAI 5o Pro" tier.
//
// Goal: real Fable 5 answers with NO credits and NO forced sign-up wall. Puter
// auto-provisions a lightweight anonymous "temp user" the first time the page
// touches its runtime, so for AI calls we DON'T pre-block on isSignedIn() — we
// let Puter onboard silently and only fall back to Groq if it genuinely errors.
// (The older, popup-shy behavior is still available via allowAuth: false.)

function P(): any {
  return (window as any).puter
}

export function isPuterLoaded(): boolean {
  return typeof window !== 'undefined' && !!P()?.ai?.chat
}

/** Best-effort: make sure Puter has *some* identity (a silent temp user) before
 *  an AI call, so the first message doesn't surface an interactive popup. Never
 *  throws — if Puter has no quiet onboarding path we just proceed and let the
 *  chat call itself decide. */
async function ensurePuterUser(p: any): Promise<void> {
  try {
    if (p?.auth?.isSignedIn?.()) return
    // Newer Puter builds expose a quiet, popup-free temp-user onboarding. Try the
    // known entry points; ignore anything that isn't present.
    if (typeof p?.auth?.getUser === 'function') {
      await Promise.resolve(p.auth.getUser()).catch(() => {})
    }
  } catch {
    /* ignore — proceed and let ai.chat provision on demand */
  }
}

export interface PuterStreamOpts {
  model: string
  messages: { role: string; content: any }[]
  signal?: AbortSignal
  onToken?: (delta: string) => void
  /** When true (the 5o Pro tier), allow Puter to silently onboard a temp user
   *  instead of throwing when not signed in. */
  allowAuth?: boolean
}

export async function streamPuter(opts: PuterStreamOpts): Promise<{ content: string }> {
  const p = P()
  if (!p?.ai?.chat) throw new Error('Puter not loaded')

  if (opts.allowAuth) {
    await ensurePuterUser(p)
  } else if (p.auth?.isSignedIn && !p.auth.isSignedIn()) {
    // Legacy popup-averse path: only use Puter when already signed in.
    throw new Error('puter-not-signed-in')
  }

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
