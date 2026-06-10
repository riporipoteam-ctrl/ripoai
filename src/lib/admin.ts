// Admin + moderation. Only the owner email can see the Admin page. Every signed-in
// user is registered into the Firestore `users` collection so the admin can list
// them, ban them (with duration + reason), and cap their daily AI messages.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from '../firebase'

export const ADMIN_EMAIL = 'ripo.ripoteam@gmail.com'

export function isAdmin(user: User | null): boolean {
  return (user?.email || '').toLowerCase() === ADMIN_EMAIL
}

export interface Ban {
  until: number // epoch ms; 0 = permanent
  reason: string
  at: number
}

export interface PlusGrant {
  until: number // epoch ms; 0 = permanent
  grantedAt: number
  grantedBy: string
}

export interface AdminUser {
  uid: string
  email: string
  displayName: string
  photoURL?: string
  createdAt: number
  lastSeen: number
  ban?: Ban | null
  msgLimit?: number // 0/undefined = unlimited
  plusGrant?: PlusGrant | null
}

const tsMs = (v: unknown): number =>
  v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0

// Write identity into users/{uid} on every login so the admin registry stays current.
export async function registerUser(user: User | null): Promise<void> {
  if (!user) return
  try {
    const ref = doc(db, 'users', user.uid)
    const snap = await getDoc(ref)
    const patch: Record<string, unknown> = {
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      lastSeen: serverTimestamp(),
    }
    if (!snap.exists() || !snap.data()?.createdAt) patch.createdAt = serverTimestamp()
    await setDoc(ref, patch, { merge: true })
  } catch {
    /* offline / rules — ignore */
  }
}

export async function listUsers(): Promise<AdminUser[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs
    .map((d) => {
      const x = d.data() as any
      return {
        uid: d.id,
        email: x.email || '',
        displayName: x.displayName || '',
        photoURL: x.photoURL || '',
        createdAt: tsMs(x.createdAt),
        lastSeen: tsMs(x.lastSeen),
        ban: x.ban || null,
        msgLimit: x.msgLimit || 0,
        plusGrant: x.plusGrant
          ? { until: tsMs(x.plusGrant.until) || x.plusGrant.until || 0, grantedAt: tsMs(x.plusGrant.grantedAt), grantedBy: x.plusGrant.grantedBy || '' }
          : null,
      } as AdminUser
    })
    .sort((a, b) => (b.createdAt || b.lastSeen) - (a.createdAt || a.lastSeen))
}

/** Grant AskAI+ to a user remotely. untilMs = expiry (0 = permanent). Their
 * app reads this on next load and applies it to their local AskAI+ state. */
export async function grantPlus(uid: string, untilMs: number): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    { plusGrant: { until: untilMs, grantedAt: Date.now(), grantedBy: ADMIN_EMAIL } },
    { merge: true },
  )
}

export async function revokePlus(uid: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { plusGrant: null }, { merge: true })
}

export async function banUser(uid: string, durationMs: number, reason: string): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    { ban: { until: durationMs > 0 ? Date.now() + durationMs : 0, reason: reason || 'Violation of terms', at: Date.now() } },
    { merge: true },
  )
}

export async function unbanUser(uid: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { ban: null }, { merge: true })
}

export async function setUserMsgLimit(uid: string, limit: number): Promise<void> {
  await setDoc(doc(db, 'users', uid), { msgLimit: Math.max(0, limit) }, { merge: true })
}

// The current user's own restriction state (ban / message cap).
export interface MyStatus {
  ban?: Ban | null
  msgLimit?: number
  plusGrant?: PlusGrant | null
}
export async function getMyStatus(uid: string): Promise<MyStatus> {
  try {
    const s = await getDoc(doc(db, 'users', uid))
    const x = (s.data() as any) || {}
    return {
      ban: x.ban || null,
      msgLimit: x.msgLimit || 0,
      plusGrant: x.plusGrant
        ? { until: tsMs(x.plusGrant.until) || x.plusGrant.until || 0, grantedAt: tsMs(x.plusGrant.grantedAt), grantedBy: x.plusGrant.grantedBy || '' }
        : null,
    }
  } catch {
    return {}
  }
}

export function banActive(ban?: Ban | null): boolean {
  if (!ban) return false
  return ban.until === 0 || ban.until > Date.now()
}

// Daily message counter (client-side) for the per-user cap.
export function todaysMessageCount(uid: string): number {
  try {
    const key = `ripoai:${uid}:msgcount`
    const raw = JSON.parse(localStorage.getItem(key) || '{}')
    const today = new Date().toISOString().slice(0, 10)
    return raw.date === today ? raw.count || 0 : 0
  } catch {
    return 0
  }
}
export function bumpMessageCount(uid: string): void {
  try {
    const key = `ripoai:${uid}:msgcount`
    const today = new Date().toISOString().slice(0, 10)
    const raw = JSON.parse(localStorage.getItem(key) || '{}')
    const count = raw.date === today ? (raw.count || 0) + 1 : 1
    localStorage.setItem(key, JSON.stringify({ date: today, count }))
  } catch {
    /* ignore */
  }
}
