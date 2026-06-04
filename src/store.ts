import { create } from 'zustand'
import type { User } from 'firebase/auth'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  loadMemories,
  watchChats,
  watchProjects,
  onSyncStatus,
  migrateLocalToCloud,
  type ChatMeta,
  type Memory,
  type Project,
  type UserSettings,
} from './lib/db'

function hexToRgb(hex: string): string {
  const m = hex.replace('#', '')
  const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

/** Applies theme, accent and glass intensity to the document root. */
export function applyAppearance(s: UserSettings) {
  const root = document.documentElement
  const dark =
    s.theme === 'dark' ||
    (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
  try {
    localStorage.setItem('ripoai-theme', s.theme)
  } catch {
    /* ignore */
  }
  // Visual palette: ChatGPT (mono black/white, default) vs Claude (warm clay).
  const ui = s.uiTheme ?? 'chatgpt'
  root.classList.toggle('ui-claude', ui === 'claude')
  let accent: string
  let accentInk: string
  if (ui === 'claude') {
    accent = '#d97757'
    accentInk = '#ffffff'
  } else {
    // Black & white: accent flips with light/dark so buttons/links stay mono.
    accent = dark ? '#f2f2f2' : '#1a1a1a'
    accentInk = dark ? '#1a1a1a' : '#ffffff'
  }
  root.style.setProperty('--accent', hexToRgb(accent))
  root.style.setProperty('--accent-soft', hexToRgb(accent))
  root.style.setProperty('--accent-ink', hexToRgb(accentInk))
  root.style.setProperty('--glass-blur', `${s.glassIntensity}px`)
  root.style.fontSize = `${Math.round(16 * (s.fontScale || 1))}px`
}

interface AppState {
  user: User | null
  authReady: boolean
  settings: UserSettings
  memories: Memory[]
  chats: ChatMeta[]
  projects: Project[]
  dataReady: boolean
  sidebarOpen: boolean
  settingsOpen: boolean
  synced: boolean
  banStatus: import('./lib/admin').MyStatus | null
  unreadChats: string[]

  _unsub: Array<() => void>

  setUser: (u: User | null) => void
  setAuthReady: (v: boolean) => void
  initUserData: (uid: string) => Promise<void>
  markUnread: (id: string) => void
  clearUnread: (id: string) => void
  setBanStatus: (b: import('./lib/admin').MyStatus | null) => void
  teardown: () => void
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>
  refreshMemories: () => Promise<void>
  setMemories: (m: Memory[]) => void
  toggleSidebar: () => void
  setSidebar: (v: boolean) => void
  openSettings: () => void
  closeSettings: () => void
}

export const useStore = create<AppState>((set, get) => ({
  user: null,
  authReady: false,
  settings: { ...DEFAULT_SETTINGS },
  memories: [],
  chats: [],
  projects: [],
  dataReady: false,
  sidebarOpen: true,
  settingsOpen: false,
  synced: false,
  banStatus: null,
  unreadChats: [],
  _unsub: [],

  markUnread: (id: string) =>
    set((s) => (s.unreadChats.includes(id) ? s : { unreadChats: [...s.unreadChats, id] })),
  clearUnread: (id: string) => set((s) => ({ unreadChats: s.unreadChats.filter((x) => x !== id) })),
  setBanStatus: (b: import('./lib/admin').MyStatus | null) => set({ banStatus: b }),

  setUser: (u) => set({ user: u }),
  setAuthReady: (v) => set({ authReady: v }),

  initUserData: async (uid) => {
    get().teardown()

    // Never let Firestore reads block app entry. If the database isn't reachable
    // or rules deny reads, fall back to defaults so the user still gets in.
    const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
      Promise.race([
        p.catch(() => fallback),
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
      ])

    const [settings, memories] = await Promise.all([
      withTimeout(loadSettings(uid), 7000, { ...DEFAULT_SETTINGS }),
      withTimeout(loadMemories(uid), 7000, [] as Memory[]),
    ])
    applyAppearance(settings)

    let unsubChats = () => {}
    let unsubProjects = () => {}
    let unsubSync = () => {}
    try {
      unsubChats = watchChats(uid, (chats) => set({ chats }))
      unsubProjects = watchProjects(uid, (projects) => set({ projects }))
      unsubSync = onSyncStatus((b) => set({ synced: b }))
    } catch {
      /* listeners optional — app still works without history */
    }

    set({
      settings,
      memories,
      dataReady: true,
      _unsub: [unsubChats, unsubProjects, unsubSync],
      sidebarOpen: window.innerWidth >= 768,
    })

    // Load moderation status (ban / message cap) in the background.
    import('./lib/admin').then(({ getMyStatus }) =>
      getMyStatus(uid).then((banStatus) => set({ banStatus })).catch(() => {}),
    )

    // Push any existing local data to the cloud (one-time), in the background.
    void migrateLocalToCloud(uid)
  },

  teardown: () => {
    get()._unsub.forEach((fn) => fn())
    set({ _unsub: [], chats: [], projects: [], memories: [], dataReady: false })
  },

  updateSettings: async (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    applyAppearance(next)
    const uid = get().user?.uid
    // Persist in the background; never let a slow/hanging write block callers.
    if (uid) void saveSettings(uid, patch)
  },

  refreshMemories: async () => {
    const uid = get().user?.uid
    if (!uid) return
    set({ memories: await loadMemories(uid) })
  },

  setMemories: (m) => set({ memories: m }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebar: (v) => set({ sidebarOpen: v }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}))
