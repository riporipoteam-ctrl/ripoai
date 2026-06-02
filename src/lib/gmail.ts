import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '../firebase'

// Gmail (read-only) connection via the user's Google account. Requires the
// Gmail API enabled in the Firebase project's Google Cloud, and the
// gmail.readonly scope on the OAuth consent screen. The access token lives in
// the browser only and is used directly against the Gmail REST API (CORS-ok).

const TOKEN_KEY = 'ripoai-gmail-token'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

export function isGmailConnected(): boolean {
  try {
    return !!localStorage.getItem(TOKEN_KEY)
  } catch {
    return false
  }
}

export function disconnectGmail() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export async function connectGmail(): Promise<{ ok: boolean; error?: string }> {
  const provider = new GoogleAuthProvider()
  provider.addScope(GMAIL_SCOPE)
  provider.setCustomParameters({ prompt: 'consent' })
  try {
    const res = await signInWithPopup(auth, provider)
    const cred = GoogleAuthProvider.credentialFromResult(res)
    const token = cred?.accessToken
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
      return { ok: true }
    }
    return { ok: false, error: 'No access token returned.' }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Sign-in failed.' }
  }
}

/** True if the user's message is asking about their email. */
export function wantsEmail(text: string): boolean {
  return /\b(email|emails|e-mail|inbox|gmail|unread|my mail|messages? from|latest mail)\b/i.test(text)
}

/** Returns a compact text summary of recent emails (subject/from/snippet). */
export async function readRecentEmails(max = 8): Promise<string> {
  let token: string | null = null
  try {
    token = localStorage.getItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
  if (!token) return ''
  const auth1 = { Authorization: `Bearer ${token}` }
  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=in:inbox`,
      { headers: auth1 },
    )
    if (!listRes.ok) {
      if (listRes.status === 401) disconnectGmail()
      return ''
    }
    const { messages } = await listRes.json()
    if (!messages?.length) return '(No recent emails found.)'
    const out: string[] = []
    for (const m of messages.slice(0, max)) {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: auth1 },
      )
      if (!r.ok) continue
      const d = await r.json()
      const h = (n: string) => d.payload?.headers?.find((x: any) => x.name === n)?.value || ''
      out.push(`• From: ${h('From')}\n  Subject: ${h('Subject')}\n  Date: ${h('Date')}\n  ${d.snippet || ''}`)
    }
    return out.join('\n\n')
  } catch {
    return ''
  }
}
