import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '../firebase'

// Google Calendar (read-only) connection. Like Gmail, needs the Calendar API
// enabled + the calendar.readonly scope on the OAuth consent screen.

const TOKEN_KEY = 'ripoai-gcal-token'
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

export function isCalendarConnected(): boolean {
  try {
    return !!localStorage.getItem(TOKEN_KEY)
  } catch {
    return false
  }
}

export function disconnectCalendar() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export async function connectCalendar(): Promise<{ ok: boolean; error?: string }> {
  const provider = new GoogleAuthProvider()
  provider.addScope(SCOPE)
  provider.setCustomParameters({ prompt: 'consent' })
  try {
    const res = await signInWithPopup(auth, provider)
    const token = GoogleAuthProvider.credentialFromResult(res)?.accessToken
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
      return { ok: true }
    }
    return { ok: false, error: 'No access token returned.' }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Sign-in failed.' }
  }
}

export function wantsCalendar(text: string): boolean {
  return /\b(calendar|schedule|my (events?|meetings?|agenda)|what('?s| is) (on|coming up)|upcoming (events?|meetings?)|free time|busy|appointments?)\b/i.test(
    text,
  )
}

export async function readUpcomingEvents(max = 10): Promise<string> {
  let token: string | null = null
  try {
    token = localStorage.getItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
  if (!token) return ''
  try {
    const timeMin = new Date().toISOString()
    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${max}&orderBy=startTime&singleEvents=true&timeMin=${encodeURIComponent(timeMin)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!r.ok) {
      if (r.status === 401) disconnectCalendar()
      return ''
    }
    const d = await r.json()
    const items = d.items ?? []
    if (!items.length) return '(No upcoming events.)'
    return items
      .map((e: any) => {
        const start = e.start?.dateTime || e.start?.date || ''
        return `• ${e.summary || '(no title)'} — ${start}${e.location ? ` @ ${e.location}` : ''}`
      })
      .join('\n')
  } catch {
    return ''
  }
}
