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
  /** Set when this is an image-generation result. */
  image?: { prompt: string; url: string }
  /** Set when this message includes a places/map result. */
  map?: { center: [number, number]; places: { name: string; address: string; lat: number; lng: number; category?: string }[]; label: string }
  /** Set when this message includes a weather result. */
  weather?: any
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
  pinned?: boolean
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
  fontScale: number
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
  fontScale: 1,
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
  try {
    Promise.race([fn(), new Promise((r) => setTimeout(r, 8000))]).catch((e) =>
      console.warn(`${label} (background):`, (e as Error)?.message ?? e),
    )
  } catch (e) {
    // setDoc validates synchronously and can throw (e.g. undefined fields).
    console.warn(`${label} (background):`, (e as Error)?.message ?? e)
  }
}

// Firestore rejects `undefined`; round-trip drops undefined fields.
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

const tsMs = (v: unknown): number =>
  v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : Date.now()

// Time-bounded so a hung Firestore call never blocks loads.
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))])
}

/* ----------------------------- Settings ----------------------------- */

export async function loadSettings(uid: string): Promise<UserSettings> {
  const local = { ...DEFAULT_SETTINGS, ...read<Partial<UserSettings>>(uid, 'settings', {}) }
  // Prefer the cloud copy (cross-device sync) when reachable.
  const snap = await withTimeout(getDoc(doc(db, 'users', uid)), 6000, null as any)
  if (snap?.exists?.() && snap.data()?.settings) {
    const cloud = { ...DEFAULT_SETTINGS, ...snap.data().settings }
    write(uid, 'settings', cloud)
    return cloud
  }
  return local
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
  const snap = await withTimeout(getDocs(collection(db, 'users', uid, 'memories')), 6000, null as any)
  if (snap && !snap.empty) {
    const mems = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Omit<Memory, 'id'>) }))
    write(uid, 'memories', mems)
    return mems.sort((a: Memory, b: Memory) => b.createdAt - a.createdAt)
  }
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
  return read<ChatMeta[]>(uid, 'chats', []).sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
}

export async function togglePinChat(uid: string, chatId: string) {
  const metas = read<ChatMeta[]>(uid, 'chats', [])
  const next = metas.map((c) => (c.id === chatId ? { ...c, pinned: !c.pinned } : c))
  write(uid, 'chats', next)
  emit()
  const pinned = next.find((c) => c.id === chatId)?.pinned ?? false
  bgWrite('togglePin', () => updateDoc(doc(db, 'users', uid, 'chats', chatId), { pinned }))
}

export function watchChats(uid: string, cb: (chats: ChatMeta[]) => void) {
  // Instant from local cache, then live from the cloud (cross-device sync).
  cb(chatMetaList(uid))
  const localUnsub = onLocalChange(() => cb(chatMetaList(uid)))
  let fsUnsub = () => {}
  try {
    const q = query(collection(db, 'users', uid, 'chats'), orderBy('updatedAt', 'desc'))
    fsUnsub = onSnapshot(
      q,
      (snap) => {
        const metas: ChatMeta[] = snap.docs.map((d) => {
          const data = d.data()
          return { id: d.id, title: data.title ?? 'New chat', updatedAt: tsMs(data.updatedAt), projectId: data.projectId ?? undefined, pinned: !!data.pinned }
        })
        // Cache full chats + meta locally so reloads/offline still work.
        snap.docs.forEach((d) => {
          const data = d.data()
          if (data.messages)
            write(uid, `chat:${d.id}`, {
              id: d.id,
              title: data.title ?? 'New chat',
              model: data.model,
              messages: data.messages,
              projectId: data.projectId ?? undefined,
              updatedAt: tsMs(data.updatedAt),
              createdAt: tsMs(data.createdAt),
            })
        })
        write(uid, 'chats', metas)
        cb(
          [...metas].sort((a, b) => (!!a.pinned !== !!b.pinned ? (a.pinned ? -1 : 1) : b.updatedAt - a.updatedAt)),
        )
      },
      () => {
        /* rules/offline — local fallback already active */
      },
    )
  } catch {
    /* ignore */
  }
  return () => {
    localUnsub()
    fsUnsub()
  }
}

export async function loadChat(uid: string, chatId: string): Promise<Chat | null> {
  const local = read<Chat | null>(uid, `chat:${chatId}`, null)
  const snap = await withTimeout(getDoc(doc(db, 'users', uid, 'chats', chatId)), 5000, null as any)
  if (snap?.exists?.()) {
    const data = snap.data()
    const chat: Chat = {
      id: chatId,
      title: data.title ?? 'New chat',
      model: data.model,
      messages: data.messages ?? [],
      projectId: data.projectId ?? undefined,
      updatedAt: tsMs(data.updatedAt),
      createdAt: tsMs(data.createdAt),
    }
    write(uid, `chat:${chatId}`, chat)
    return chat
  }
  return local
}

export async function saveChat(uid: string, chat: Chat) {
  write(uid, `chat:${chat.id}`, chat)
  const prev = read<ChatMeta[]>(uid, 'chats', [])
  const wasPinned = prev.find((c) => c.id === chat.id)?.pinned
  const metas = prev.filter((c) => c.id !== chat.id)
  metas.push({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt, projectId: chat.projectId, pinned: wasPinned })
  write(uid, 'chats', metas)
  emit()
  bgWrite('saveChat', () =>
    setDoc(doc(db, 'users', uid, 'chats', chat.id), {
      title: chat.title,
      model: chat.model,
      messages: clean(chat.messages),
      projectId: chat.projectId ?? null,
      pinned: !!wasPinned,
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
  const localUnsub = onLocalChange(() => cb(projectList(uid)))
  let fsUnsub = () => {}
  try {
    const q = query(collection(db, 'users', uid, 'projects'), orderBy('updatedAt', 'desc'))
    fsUnsub = onSnapshot(
      q,
      (snap) => {
        const projects: Project[] = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            name: data.name ?? 'Project',
            description: data.description,
            files: data.files ?? {},
            template: data.template ?? 'static',
            updatedAt: tsMs(data.updatedAt),
            createdAt: tsMs(data.createdAt),
          }
        })
        write(uid, 'projects', projects)
        cb(projects)
      },
      () => {},
    )
  } catch {
    /* ignore */
  }
  return () => {
    localUnsub()
    fsUnsub()
  }
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
      files: clean(project.files),
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
