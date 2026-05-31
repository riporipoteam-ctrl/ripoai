import {
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { ModelTier } from './models'

export interface Attachment {
  kind: 'image' | 'file'
  name: string
  /** data URL for images, extracted text for files. */
  url?: string
  text?: string
  mime?: string
}

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  model?: ModelTier
  attachments?: Attachment[]
  /** Tool/search steps surfaced during generation. */
  steps?: { type: string; detail?: string }[]
  createdAt: number
}

export interface Chat {
  id: string
  title: string
  model: ModelTier
  messages: StoredMessage[]
  projectId?: string
  updatedAt: number
  createdAt: number
}

export interface ChatMeta {
  id: string
  title: string
  updatedAt: number
  projectId?: string
}

export interface ProjectFile {
  code: string
}

export interface Project {
  id: string
  name: string
  description?: string
  files: Record<string, string>
  template: 'react' | 'vanilla' | 'static'
  updatedAt: number
  createdAt: number
}

export interface Memory {
  id: string
  text: string
  createdAt: number
}

export interface UserSettings {
  displayName?: string
  theme: 'light' | 'dark' | 'system'
  accent: string
  glassIntensity: number
  defaultModel: ModelTier
  aboutYou: string
  responseStyle: string
  memoryEnabled: boolean
  onboarded: boolean
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  accent: '#7c5cff',
  glassIntensity: 22,
  defaultModel: 'ripoai-2o-pro',
  aboutYou: '',
  responseStyle: '',
  memoryEnabled: true,
  onboarded: false,
}

const ts = (v: unknown): number =>
  v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : Date.now()

// Firestore writes must never break the UI. If a write is rejected (rules deny,
// database not provisioned, offline), we log and continue — the app keeps
// working in-session even if persistence is unavailable.
async function safeWrite(label: string, fn: () => Promise<unknown>) {
  try {
    // Cap every write so a hung connection can never block a caller that awaits.
    await Promise.race([
      fn(),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ])
  } catch (e) {
    console.warn(`${label}:`, (e as Error)?.message ?? e)
  }
}

/* ----------------------------- Settings ----------------------------- */

export async function loadSettings(uid: string): Promise<UserSettings> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...(snap.data().settings ?? {}) }
}

export async function saveSettings(uid: string, settings: Partial<UserSettings>) {
  await safeWrite('saveSettings', () =>
    setDoc(doc(db, 'users', uid), { settings, updatedAt: serverTimestamp() }, { merge: true }),
  )
}

/* ----------------------------- Memories ----------------------------- */

export async function loadMemories(uid: string): Promise<Memory[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'memories'))
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Memory, 'id'>) }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function addMemory(uid: string, text: string): Promise<Memory> {
  const id = crypto.randomUUID()
  const mem: Memory = { id, text, createdAt: Date.now() }
  await safeWrite('addMemory', () => setDoc(doc(db, 'users', uid, 'memories', id), mem))
  return mem
}

export async function deleteMemory(uid: string, id: string) {
  await safeWrite('deleteMemory', () => deleteDoc(doc(db, 'users', uid, 'memories', id)))
}

export async function clearMemories(uid: string) {
  await safeWrite('clearMemories', async () => {
    const snap = await getDocs(collection(db, 'users', uid, 'memories'))
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
  })
}

/* ------------------------------- Chats ------------------------------- */

export function watchChats(uid: string, cb: (chats: ChatMeta[]) => void) {
  const q = query(collection(db, 'users', uid, 'chats'), orderBy('updatedAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            title: data.title ?? 'New chat',
            updatedAt: ts(data.updatedAt),
            projectId: data.projectId,
          }
        }),
      )
    },
    (err) => {
      // e.g. Firestore not enabled or rules deny — degrade gracefully.
      console.warn('watchChats:', err.message)
      cb([])
    },
  )
}

export async function loadChat(uid: string, chatId: string): Promise<Chat | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'chats', chatId))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    id: chatId,
    title: data.title ?? 'New chat',
    model: data.model,
    messages: data.messages ?? [],
    projectId: data.projectId,
    updatedAt: ts(data.updatedAt),
    createdAt: ts(data.createdAt),
  }
}

export async function saveChat(uid: string, chat: Chat) {
  await safeWrite('saveChat', () =>
    setDoc(doc(db, 'users', uid, 'chats', chat.id), {
      title: chat.title,
      model: chat.model,
      messages: chat.messages,
      projectId: chat.projectId ?? null,
      updatedAt: serverTimestamp(),
      createdAt: chat.createdAt || Date.now(),
    }),
  )
}

export async function renameChat(uid: string, chatId: string, title: string) {
  await safeWrite('renameChat', () =>
    updateDoc(doc(db, 'users', uid, 'chats', chatId), { title }),
  )
}

export async function deleteChat(uid: string, chatId: string) {
  await safeWrite('deleteChat', () => deleteDoc(doc(db, 'users', uid, 'chats', chatId)))
}

export async function clearAllChats(uid: string) {
  await safeWrite('clearAllChats', async () => {
    const snap = await getDocs(collection(db, 'users', uid, 'chats'))
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
  })
}

/* ------------------------------ Projects ----------------------------- */

export function watchProjects(uid: string, cb: (projects: Project[]) => void) {
  const q = query(collection(db, 'users', uid, 'projects'), orderBy('updatedAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            name: data.name ?? 'Project',
            description: data.description,
            files: data.files ?? {},
            template: data.template ?? 'react',
            updatedAt: ts(data.updatedAt),
            createdAt: ts(data.createdAt),
          }
        }),
      )
    },
    (err) => {
      console.warn('watchProjects:', err.message)
      cb([])
    },
  )
}

export async function saveProject(uid: string, project: Project) {
  await safeWrite('saveProject', () =>
    setDoc(doc(db, 'users', uid, 'projects', project.id), {
      name: project.name,
      description: project.description ?? '',
      files: project.files,
      template: project.template,
      updatedAt: serverTimestamp(),
      createdAt: project.createdAt || Date.now(),
    }),
  )
}

export async function deleteProject(uid: string, projectId: string) {
  await safeWrite('deleteProject', () =>
    deleteDoc(doc(db, 'users', uid, 'projects', projectId)),
  )
}
