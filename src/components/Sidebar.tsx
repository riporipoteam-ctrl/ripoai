import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PenSquare,
  Search,
  Settings as SettingsIcon,
  LogOut,
  Trash2,
  Pencil,
  MoreHorizontal,
  FolderGit2,
  Plus,
  PanelLeftClose,
  MessageSquare,
  Pin,
  Download,
  Bookmark,
  ShieldCheck,
} from 'lucide-react'
import { signOut } from 'firebase/auth'
import BookmarksView from './BookmarksView'
import AdminPanel from './AdminPanel'
import { isAdmin } from '../lib/admin'
import { auth } from '../firebase'
import { useStore } from '../store'
import Avatar from './ui/Avatar'
import {
  deleteChat,
  renameChat,
  togglePinChat,
  loadChat,
  saveProject,
  deleteProject,
  chatContentMatches,
  type ChatMeta,
} from '../lib/db'
import { newReactProject } from '../lib/templates'
import Logo from './Logo'

function groupByDate(chats: ChatMeta[]) {
  const now = Date.now()
  const day = 86400000
  const groups: Record<string, ChatMeta[]> = { '📌 Pinned': [], Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] }
  for (const c of chats) {
    if (c.pinned) {
      groups['📌 Pinned'].push(c)
      continue
    }
    const age = now - c.updatedAt
    if (age < day) groups['Today'].push(c)
    else if (age < 2 * day) groups['Yesterday'].push(c)
    else if (age < 7 * day) groups['Previous 7 days'].push(c)
    else groups['Older'].push(c)
  }
  return Object.entries(groups).filter(([, v]) => v.length)
}

export default function Sidebar() {
  const navigate = useNavigate()
  const { chatId, projectId } = useParams()
  const { user, settings, chats, projects, sidebarOpen, setSidebar, openSettings, unreadChats } = useStore()
  const [search, setSearch] = useState('')
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return chats
    return chats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (user ? chatContentMatches(user.uid, c.id, q) : false),
    )
  }, [chats, search, user])
  const groups = useMemo(() => groupByDate(filtered), [filtered])

  async function createProject() {
    if (!user) return
    const name = prompt('Project name', 'My App')
    if (!name) return
    const p = newReactProject(name)
    await saveProject(user.uid, p)
    navigate(`/project/${p.id}`)
  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/signin')
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && isMobile && (
          <motion.div
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebar(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -300, width: 0 }}
            animate={{ x: 0, width: 288 }}
            exit={{ x: -300, width: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="glass z-40 flex h-full shrink-0 flex-col overflow-hidden max-md:fixed max-md:left-0 max-md:top-0"
            style={{ width: 288 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2 px-1">
                <Logo size={26} />
                <span className="text-xl font-extrabold brand-gradient">RipoAI</span>
              </div>
              <button
                onClick={() => setSidebar(false)}
                className="pressable rounded-xl p-2 text-muted hover:bg-white/10 hover:text-ink"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={18} />
              </button>
            </div>

            <div className="space-y-1 px-3">
              <button
                onClick={() => {
                  navigate('/')
                  if (isMobile) setSidebar(false)
                }}
                className="pressable flex w-full items-center gap-2 rounded-2xl border border-white/10 px-3 py-2.5 text-sm font-semibold transition hover:bg-white/10"
              >
                <PenSquare size={17} className="text-accent" /> New chat
              </button>
              <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2">
                <Search size={16} className="text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search chats & messages"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                />
              </div>
              <button
                onClick={() => setBookmarksOpen(true)}
                className="pressable flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-muted transition hover:bg-white/10 hover:text-ink"
              >
                <Bookmark size={16} className="text-accent" /> Saved messages
              </button>
            </div>

            {/* Scroll area */}
            <div className="mt-2 flex-1 overflow-y-auto px-2">
              {/* Projects */}
              <div className="mb-1 flex items-center justify-between px-2 pt-1">
                <span className="text-xs font-bold uppercase tracking-wide text-muted">Projects</span>
                <button
                  onClick={createProject}
                  className="pressable rounded-lg p-1 text-muted hover:bg-white/10 hover:text-ink"
                  title="New project"
                >
                  <Plus size={16} />
                </button>
              </div>
              {projects.length === 0 && (
                <p className="px-2 pb-2 text-xs text-muted">Create a coding project with live preview.</p>
              )}
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`group flex items-center gap-2 rounded-xl px-2 py-2 text-sm transition hover:bg-white/10 ${
                    projectId === p.id ? 'bg-white/10' : ''
                  }`}
                >
                  <button
                    onClick={() => {
                      navigate(`/project/${p.id}`)
                      if (isMobile) setSidebar(false)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <FolderGit2 size={15} className="shrink-0 text-accent" />
                    <span className="truncate">{p.name}</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (user && confirm(`Delete project "${p.name}"?`)) {
                        await deleteProject(user.uid, p.id)
                        if (projectId === p.id) navigate('/')
                      }
                    }}
                    className="rounded-lg p-1 text-muted opacity-0 transition hover:bg-white/10 hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {/* Chats */}
              <div className="mt-3">
                {groups.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-muted">No chats yet.</p>
                )}
                {groups.map(([label, items]) => (
                  <div key={label} className="mb-2">
                    <div className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-muted">
                      {label}
                    </div>
                    {items.map((c) => (
                      <div
                        key={c.id}
                        className={`group relative flex items-center gap-2 rounded-xl px-2 py-2 text-sm transition hover:bg-white/10 ${
                          chatId === c.id ? 'bg-white/10' : ''
                        }`}
                      >
                        {renaming === c.id ? (
                          <input
                            autoFocus
                            value={renameVal}
                            onChange={(e) => setRenameVal(e.target.value)}
                            onBlur={async () => {
                              if (user && renameVal.trim()) await renameChat(user.uid, c.id, renameVal.trim())
                              setRenaming(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                              if (e.key === 'Escape') setRenaming(null)
                            }}
                            className="w-full rounded-lg bg-white/10 px-2 py-1 outline-none"
                          />
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                navigate(`/c/${c.id}`)
                                if (isMobile) setSidebar(false)
                              }}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              {c.pinned ? (
                                <Pin size={14} className="shrink-0 rotate-45 text-accent" />
                              ) : (
                                <MessageSquare size={15} className="shrink-0 text-muted" />
                              )}
                              <span className="truncate">{c.title}</span>
                              {unreadChats.includes(c.id) && (
                                <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" title="New reply" />
                              )}
                            </button>
                            <button
                              onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                              className="rounded-lg p-1 text-muted opacity-0 transition hover:bg-white/10 hover:text-ink group-hover:opacity-100"
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            <AnimatePresence>
                              {menuFor === c.id && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  className="glass-strong absolute right-2 top-9 z-50 w-44 overflow-hidden rounded-2xl p-1"
                                  onMouseLeave={() => setMenuFor(null)}
                                >
                                  <button
                                    onClick={async () => {
                                      setMenuFor(null)
                                      if (user) await togglePinChat(user.uid, c.id)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-white/10"
                                  >
                                    <Pin size={14} /> {c.pinned ? 'Unpin' : 'Pin'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRenaming(c.id)
                                      setRenameVal(c.title)
                                      setMenuFor(null)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-white/10"
                                  >
                                    <Pencil size={14} /> Rename
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setMenuFor(null)
                                      if (!user) return
                                      const full = await loadChat(user.uid, c.id)
                                      if (!full) return
                                      const md = `# ${full.title}\n\n${full.messages
                                        .map((m) => `**${m.role === 'user' ? 'You' : 'RipoAI'}:** ${m.content}`)
                                        .join('\n\n')}`
                                      navigator.clipboard.writeText(md)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-white/10"
                                  >
                                    <Download size={14} /> Copy as text
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setMenuFor(null)
                                      if (user) await deleteChat(user.uid, c.id)
                                      if (chatId === c.id) navigate('/')
                                    }}
                                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-400 hover:bg-white/10"
                                  >
                                    <Trash2 size={14} /> Delete
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Profile */}
            <div className="border-t border-white/10 p-2">
              <div className="flex items-center gap-2 rounded-2xl px-2 py-2 hover:bg-white/5">
                <Avatar name={settings.displayName || user?.displayName} photoURL={settings.avatar || user?.photoURL} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {settings.displayName || user?.displayName || 'Account'}
                  </div>
                  <div className="truncate text-xs text-muted">{user?.email}</div>
                </div>
                {isAdmin(user) && (
                  <button
                    onClick={() => setAdminOpen(true)}
                    className="pressable rounded-xl p-2 text-muted hover:bg-white/10 hover:text-ink"
                    title="Admin"
                  >
                    <ShieldCheck size={18} />
                  </button>
                )}
                <button
                  onClick={openSettings}
                  className="pressable rounded-xl p-2 text-muted hover:bg-white/10 hover:text-ink"
                  title="Settings"
                >
                  <SettingsIcon size={18} />
                </button>
                <button
                  onClick={handleSignOut}
                  className="pressable rounded-xl p-2 text-muted hover:bg-white/10 hover:text-ink"
                  title="Sign out"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      <BookmarksView open={bookmarksOpen} onClose={() => setBookmarksOpen(false)} />
      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
    </>
  )
}
