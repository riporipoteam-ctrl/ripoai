// Friends + real-time direct messages, on Firestore. No extra backend or OAuth
// needed: reuses the app's existing `users` collection and onSnapshot live
// updates. @askai inside a DM gets a real AI reply via `complete()`.
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { complete, type ChatMessage } from './groq'

export interface UserProfile {
  uid: string
  name: string
  handle: string // lowercased, searchable
  photoURL?: string
}

export interface FriendRequest extends UserProfile {
  ts?: number
}

export interface DMMessage {
  id: string
  from: string
  fromName?: string
  text: string
  ts: number
  kind?: 'text' | 'image' | 'file' | 'ai'
  url?: string
  name?: string
}

export interface Conversation {
  id: string
  participants: string[]
  last?: string
  lastFrom?: string
  ts: number
  other?: UserProfile
}

const handleOf = (name?: string, email?: string) =>
  (name || email || 'user').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30) || 'user'

/** Publish/refresh the signed-in user's public profile so others can find them. */
export async function publishProfile(u: {
  uid: string
  displayName?: string | null
  email?: string | null
  photoURL?: string | null
}): Promise<void> {
  const name = u.displayName || (u.email ? u.email.split('@')[0] : 'User')
  await setDoc(
    doc(db, 'users', u.uid),
    {
      profile: {
        uid: u.uid,
        name,
        handle: handleOf(u.displayName || undefined, u.email || undefined),
        photoURL: u.photoURL || null,
        updatedAt: serverTimestamp(),
      },
    },
    { merge: true },
  )
}

function toProfile(data: any, uid: string): UserProfile | null {
  const p = data?.profile
  if (p && (p.name || p.handle)) {
    return { uid, name: p.name || 'User', handle: p.handle || '', photoURL: p.photoURL || undefined }
  }
  // Fallback: many accounts have a `settings` doc but never published a
  // `profile` (e.g. signed up before profiles existed). Any signed-in user can
  // read another user's doc (see firestore.rules), so synthesize a profile from
  // their settings — this is what makes EVERY AskAI account discoverable.
  const s = data?.settings
  if (s && (s.displayName || s.avatar)) {
    const name = (s.displayName || '').trim() || 'AskAI user'
    return {
      uid,
      name,
      handle: name.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30) || uid.slice(0, 8).toLowerCase(),
      photoURL: s.avatar || undefined,
    }
  }
  // Last resort: a real account doc with no name yet — still show it so nobody
  // is invisible in search/suggestions.
  if (data && (data.settings || data.updatedAt || data.profile)) {
    return { uid, name: 'AskAI user', handle: uid.slice(0, 8).toLowerCase() }
  }
  return null
}

/** Fetch every published user profile (excluding self). This is the source of
 *  truth for BOTH search and suggestions, so the friends UI reliably shows
 *  everyone who has an AskAI account — no fragile prefix queries or composite
 *  indexes that silently return nothing. */
export async function fetchAllProfiles(selfUid: string, max = 300): Promise<UserProfile[]> {
  const out: UserProfile[] = []
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(max)))
    snap.forEach((d) => {
      const p = toProfile(d.data(), d.id)
      if (p && p.uid !== selfUid) out.push(p)
    })
  } catch {
    /* rules/network not ready */
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Search users by name OR handle (substring, case-insensitive). Returns every
 *  matching account — done client-side over the full list so partial names work
 *  (a plain Firestore prefix query only matched an exact handle start). */
export async function searchUsers(term: string, selfUid: string): Promise<UserProfile[]> {
  const t = term.trim().toLowerCase()
  if (!t) return []
  const all = await fetchAllProfiles(selfUid)
  return all
    .filter((p) => p.name.toLowerCase().includes(t) || p.handle.toLowerCase().includes(t))
    .slice(0, 30)
}

export async function sendFriendRequest(me: UserProfile, target: UserProfile): Promise<void> {
  await setDoc(doc(db, 'users', target.uid, 'requests', me.uid), { ...me, ts: Date.now() })
}

export function watchRequests(uid: string, cb: (reqs: FriendRequest[]) => void): () => void {
  return onSnapshot(collection(db, 'users', uid, 'requests'), (snap) => {
    cb(snap.docs.map((d) => ({ ...(d.data() as FriendRequest), uid: d.id })))
  })
}

export async function acceptRequest(me: UserProfile, from: FriendRequest): Promise<void> {
  await Promise.all([
    setDoc(doc(db, 'users', me.uid, 'friends', from.uid), { ...from, ts: Date.now() }),
    setDoc(doc(db, 'users', from.uid, 'friends', me.uid), { ...me, ts: Date.now() }),
    deleteDoc(doc(db, 'users', me.uid, 'requests', from.uid)),
  ])
}

export async function declineRequest(myUid: string, fromUid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', myUid, 'requests', fromUid))
}

export function watchFriends(uid: string, cb: (friends: UserProfile[]) => void): () => void {
  return onSnapshot(collection(db, 'users', uid, 'friends'), (snap) => {
    cb(snap.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id })))
  })
}

export async function removeFriend(myUid: string, friendUid: string): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, 'users', myUid, 'friends', friendUid)),
    deleteDoc(doc(db, 'users', friendUid, 'friends', myUid)),
  ])
}

export const convId = (a: string, b: string) => [a, b].sort().join('__')

export async function sendMessage(
  cid: string,
  me: UserProfile,
  otherUid: string,
  msg: { text: string; kind?: DMMessage['kind']; url?: string; name?: string },
): Promise<void> {
  await setDoc(
    doc(db, 'dms', cid),
    { participants: [me.uid, otherUid], last: msg.text || msg.name || 'Attachment', lastFrom: me.uid, ts: Date.now() },
    { merge: true },
  )
  await addDoc(collection(db, 'dms', cid, 'messages'), {
    from: me.uid,
    fromName: me.name,
    text: msg.text,
    kind: msg.kind || 'text',
    url: msg.url || null,
    name: msg.name || null,
    ts: Date.now(),
  })
}

export function watchMessages(cid: string, cb: (msgs: DMMessage[]) => void): () => void {
  const q = query(collection(db, 'dms', cid, 'messages'), orderBy('ts', 'asc'), limit(200))
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DMMessage, 'id'>) })))
  })
}

export function watchConversations(uid: string, cb: (convs: Conversation[]) => void): () => void {
  const q = query(collection(db, 'dms'), where('participants', 'array-contains', uid))
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Conversation, 'id'>) }))
        .sort((a, b) => (b.ts || 0) - (a.ts || 0)),
    )
  })
}

/** If a DM message @-mentions askai, generate a real AI reply posted as "AskAI". */
export async function maybeAskAI(cid: string, history: DMMessage[], text: string): Promise<void> {
  if (!/@askai\b/i.test(text)) return
  try {
    const prompt = text.replace(/@askai/gi, '').trim()
    const msgs: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are AskAI, a friendly, concise assistant chatting inside a friends DM. Keep replies short and helpful.',
      },
      ...history.slice(-8).map((m) => ({
        role: (m.kind === 'ai' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.text || '',
      })),
      { role: 'user', content: prompt },
    ]
    const reply = await complete('ripoai-2o-instant', msgs, { maxTokens: 400 })
    await addDoc(collection(db, 'dms', cid, 'messages'), {
      from: 'askai',
      fromName: 'AskAI',
      text: reply.trim(),
      kind: 'ai',
      ts: Date.now(),
    })
    await setDoc(doc(db, 'dms', cid), { last: '🤖 ' + reply.slice(0, 40), lastFrom: 'askai', ts: Date.now() }, { merge: true })
  } catch {
    /* ignore */
  }
}

/** A handful of people to suggest adding (recent profiles, excluding self). */
export async function suggestedUsers(selfUid: string, exclude: string[] = []): Promise<UserProfile[]> {
  const all = await fetchAllProfiles(selfUid)
  return all.filter((p) => !exclude.includes(p.uid)).slice(0, 20)
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  try {
    const s = await getDoc(doc(db, 'users', uid))
    return toProfile(s.data(), uid)
  } catch {
    return null
  }
}
