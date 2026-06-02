import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  setDoc,
  serverTimestamp,
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
  /** Set when this is an image-generation result. */
  image?: { prompt: string; url: string }
  /** Set when this message includes a places/map result. */
  map?: { center: [number, number]; places: { name: string; address: string; lat: number; lng: number; category?: string }[]; label: string }
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
  verbosity: 'concise' | 'balanced' | 'detailed'
  tone: 'professional' | 'friendly' | 'playful' | 'direct'
  emoji: 'none' | 'some' | 'lots'
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
  verbosity: 'balanced',
  tone: 'friendly',
  emoji: 'some',
  memoryEnabled: true,
  onboarded: false,
}

/* =====================================================================
   Local-first persistence.
   localStorage is the source of truth (instant, reliable, works with zero
   Firebase setup). Firestore is mirrored best-effort in the background so
   data can sync across devices once a Firestore database is provisioned.
   ===================================================================== */

const k = (uid: string, key: string) => `ripoai:${uid}:${key}`

function read<T>(uid: string, key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k(uid, key))
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

function write(uid: string, key: string, value: unknown) {
  try {
    localStorage.setItem(k(uid, key), JSON.stringify(value))
  } catch (e) {
    // Most likely quota exceeded — trim oldest chats and retry once.
    console.warn('localStorage write failed:', (e as Error)?.message)
  }
}

// Simple pub/sub so the sidebar live-updates when chats/projects change.
const listeners = new Set<() => void>()
export function onLocalChange(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit() {
  listeners.forEach((fn) => fn())
}

// Best-effort Firestore write that can never throw or hang (8s cap).
function bgWrite(label: string, fn: () => Promise<unknown>) {
  Promise.race([fn(), new Promise((r) => setTimeout(r, 8000))]).catch((e) =>
    console.warn(`${label} (background):`, (e as Error)?.message ?? e),
  )
}

/* ----------------------------- Settings ----------------------------- */

export async function loadSettings(uid: string): Promise<UserSettings> {
  return { ...DEFAULT_SETTINGS, ...read<Partial<UserSettings>>(uid, 'settings', {}) }
}

export async function saveSettings(uid: string, patch: Partial<UserSettings>) {
  const next = { ...DEFAULT_SETTINGS, ...read<Partial<UserSettings>>(uid, 'settings', {}), ...patch }
  write(uid, 'settings', next)
  bgWrite('saveSettings', () =>
    setDoc(doc(db, 'users', uid), { settings: next, updatedAt: serverTimestamp() }, { merge: true }),
  )
}

/* ----------------------------- Memories ----------------------------- */

export async function loadMemories(uid: string): Promise<Memory[]> {
  return read<Memory[]>(uid, 'memories', []).sort((a, b) => b.createdAt - a.createdAt)
}

export async function addMemory(uid: string, text: string): Promise<Memory> {
  const mem: Memory = { id: crypto.randomUUID(), text, createdAt: Date.now() }
  const all = read<Memory[]>(uid, 'memories', [])
  all.push(mem)
  write(uid, 'memories', all)
  bgWrite('addMemory', () => setDoc(doc(db, 'users', uid, 'memories', mem.id), mem))
  return mem
}

export async function deleteMemory(uid: string, id: string) {
  write(
    uid,
    'memories',
    read<Memory[]>(uid, 'memories', []).filter((m) => m.id !== id),
  )
  bgWrite('deleteMemory', () => deleteDoc(doc(db, 'users', uid, 'memories', id)))
}

export async function clearMemories(uid: string) {
  write(uid, 'memories', [])
  bgWrite('clearMemories', async () => {
    const snap = await getDocs(collection(db, 'users', uid, 'memories'))
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
  })
}

/* ------------------------------- Chats ------------------------------- */

function chatMetaList(uid: string): ChatMeta[] {
  return read<ChatMeta[]>(uid, 'chats', []).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function watchChats(uid: string, cb: (chats: ChatMeta[]) => void) {
  cb(chatMetaList(uid))
  return onLocalChange(() => cb(chatMetaList(uid)))
}

export async function loadChat(uid: string, chatId: string): Promise<Chat | null> {
  return read<Chat | null>(uid, `chat:${chatId}`, null)
}

export async function saveChat(uid: string, chat: Chat) {
  write(uid, `chat:${chat.id}`, chat)
  const metas = read<ChatMeta[]>(uid, 'chats', []).filter((c) => c.id !== chat.id)
  metas.push({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt, projectId: chat.projectId })
  write(uid, 'chats', metas)
  emit()
  bgWrite('saveChat', () =>
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
  const metas = read<ChatMeta[]>(uid, 'chats', []).map((c) => (c.id === chatId ? { ...c, title } : c))
  write(uid, 'chats', metas)
  const full = read<Chat | null>(uid, `chat:${chatId}`, null)
  if (full) write(uid, `chat:${chatId}`, { ...full, title })
  emit()
  bgWrite('renameChat', () => setDoc(doc(db, 'users', uid, 'chats', chatId), { title }, { merge: true }))
}

export async function deleteChat(uid: string, chatId: string) {
  write(
    uid,
    'chats',
    read<ChatMeta[]>(uid, 'chats', []).filter((c) => c.id !== chatId),
  )
  try {
    localStorage.removeItem(k(uid, `chat:${chatId}`))
  } catch {
    /* ignore */
  }
  emit()
  bgWrite('deleteChat', () => deleteDoc(doc(db, 'users', uid, 'chats', chatId)))
}

export async function clearAllChats(uid: string) {
  const metas = read<ChatMeta[]>(uid, 'chats', [])
  for (const m of metas) {
    try {
      localStorage.removeItem(k(uid, `chat:${m.id}`))
    } catch {
      /* ignore */
    }
  }
  write(uid, 'chats', [])
  emit()
  bgWrite('clearAllChats', async () => {
    const snap = await getDocs(collection(db, 'users', uid, 'chats'))
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
  })
}

/* ------------------------------ Projects ----------------------------- */

function projectList(uid: string): Project[] {
  return read<Project[]>(uid, 'projects', []).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function watchProjects(uid: string, cb: (projects: Project[]) => void) {
  cb(projectList(uid))
  return onLocalChange(() => cb(projectList(uid)))
}

export async function saveProject(uid: string, project: Project) {
  const all = read<Project[]>(uid, 'projects', []).filter((p) => p.id !== project.id)
  all.push(project)
  write(uid, 'projects', all)
  emit()
  bgWrite('saveProject', () =>
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
  write(
    uid,
    'projects',
    read<Project[]>(uid, 'projects', []).filter((p) => p.id !== projectId),
  )
  emit()
  bgWrite('deleteProject', () => deleteDoc(doc(db, 'users', uid, 'projects', projectId)))
}
