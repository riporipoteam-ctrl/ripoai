import { useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useT } from '../lib/i18n'
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
  Sparkles,
  Coins,
  ListChecks,
  Users,
  Bot,
  Zap,
  LayoutGrid,
} from 'lucide-react'
import { signOut } from 'firebase/auth'
import BookmarksView from './BookmarksView'
import { isAdmin } from '../lib/admin'
import { usePlus } from '../hooks/usePlus'
import { effectivePlan } from '../lib/plus'
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
  const location = useLocation()
  const path = location.pathname
  const { user, settings, chats, projects, sidebarOpen, setSidebar, openSettings, unreadChats } = useStore()
  const t = useT()
  const [search, setSearch] = useState('')
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const { state: plus } = usePlus()
  const isPlus = plus ? effectivePlan(plus) === 'plus' : false

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
    try {
      localStorage.setItem(`askai:did-project:${new Date().toISOString().slice(0, 10)}`, '1')
    } catch {
      /* ignore */
    }
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
            className="askai-sidebar cg-sidebar z-40 flex h-full shrink-0 flex-col overflow-hidden max-md:fixed max-md:left-0 max-md:top-0"
            style={{ width: 288 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 pb-2 pt-3">
              <div className="flex items-center gap-2">
                <div className="overflow-hidden rounded-lg">
                  <Logo size={28} variant="icon" />
                </div>
                <span className="text-[1.05rem] font-semibold tracking-tight">AskAI</span>
              </div>
              <button
                onClick={() => setSidebar(false)}
                className="cg-iconbtn pressable"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={18} />
              </button>
            </div>

            <div className="space-y-2 px-2.5">
              {/* Primary action */}
              <button
                onClick={() => {
                  navigate('/')
                  if (isMobile) setSidebar(false)
                }}
                className="cg-newchat pressable"
              >
                <PenSquare size={16} /> {t('New chat')}
              </button>

              {/* Search */}
              <div className="cg-search">
                <Search size={16} className="text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('Search chats')}
                />
              </div>

              {/* Navigation cluster */}
              <div className="space-y-0.5">
                {(() => {
                  const NavItem = ({
                    icon,
                    label,
                    to,
                    onClick,
                    active,
                    trailing,
                  }: {
                    icon: React.ReactNode
                    label: React.ReactNode
                    to?: string
                    onClick?: () => void
                    active?: boolean
                    trailing?: React.ReactNode
                  }) => (
                    <button
                      onClick={() => {
                        if (onClick) onClick()
                        else if (to) navigate(to)
                        if (isMobile) setSidebar(false)
                      }}
                      className={`cg-row pressable ${active ? 'is-active' : ''}`}
                    >
                      <span className="cg-row-icon">{icon}</span>
                      <span className="flex-1 text-left">{label}</span>
                      {trailing}
                    </button>
                  )
                  return (
                    <>
                      <NavItem
                        icon={<Sparkles size={17} />}
                        label={<span className="font-semibold">AskAI<span className="brand-gradient">+</span></span>}
                        to="/plus"
                        active={path === '/plus'}
                        trailing={
                          isPlus ? (
                            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                              Active
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-bold text-amber-400">
                              <Coins size={12} /> {plus?.coins ?? 0}
                            </span>
                          )
                        }
                      />
                      <NavItem
                        icon={<Bot size={17} />}
                        label={t('Agents')}
                        to="/agents"
                        active={path === '/agents' || path.startsWith('/agent/') || path === '/team'}
                      />
                      <NavItem
                        icon={<Zap size={17} />}
                        label={t('Jobs')}
                        to="/jobs"
                        active={path === '/jobs'}
                      />
                      <NavItem
                        icon={<LayoutGrid size={17} />}
                        label={t('Apps')}
                        to="/apps"
                        active={path === '/apps'}
                      />
                      <NavItem
                        icon={<ListChecks size={17} />}
                        label={t('Daily tasks')}
                        to="/tasks"
                        active={path === '/tasks'}
                        trailing={
                          plus && plus.tasksDone.length < 5 ? (
                            <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" title="Tasks available" />
                          ) : undefined
                        }
                      />
                      <NavItem icon={<Bookmark size={17} />} label={t('Saved messages')} onClick={() => setBookmarksOpen(true)} />
                    </>
                  )
                })()}
              </div>
            </div>

            {/* Scroll area */}
            <div className="mt-2 flex-1 overflow-y-auto px-2.5">
              {/* Projects */}
              <div className="flex items-center justify-between pt-1">
                <span className="cg-section-label">{t('Projects')}</span>
                <button
                  onClick={createProject}
                  className="cg-iconbtn pressable !h-8 !min-w-8"
                  title="New project"
                >
                  <Plus size={16} />
                </button>
              </div>
              {projects.length === 0 && (
                <p className="px-2.5 pb-2 text-xs text-muted">Create a coding project with live preview.</p>
              )}
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`cg-row group ${projectId === p.id ? 'is-active' : ''}`}
                >
                  <button
                    onClick={() => {
                      navigate(`/project/${p.id}`)
                      if (isMobile) setSidebar(false)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <FolderGit2 size={15} className="shrink-0 text-muted" />
                    <span className="truncate">{p.name}</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (user && confirm(`Delete project "${p.name}"?`)) {
                        await deleteProject(user.uid, p.id)
                        if (projectId === p.id) navigate('/')
                      }
                    }}
                    className="rounded-md p-1 text-muted opacity-0 transition hover:bg-[rgb(var(--ink)/0.08)] hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {/* Chats */}
              <div className="mt-2">
                {groups.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-muted">No chats yet.</p>
                )}
                {groups.map(([label, items]) => (
                  <div key={label} className="mb-1">
                    <div className="cg-section-label">{label}</div>
                    {items.map((c) => (
                      <div
                        key={c.id}
                        className={`cg-row group relative ${chatId === c.id ? 'is-active' : ''}`}
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
                            className="w-full rounded-lg bg-[rgb(var(--ink)/0.08)] px-2 py-1 outline-none"
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
                                <Pin size={14} className="shrink-0 rotate-45 text-muted" />
                              ) : c.agentId || c.agentName ? (
                                <span className="shrink-0 text-sm leading-none" title={`Chat with ${c.agentName ?? 'agent'}`}>
                                  {c.agentEmoji || '🤖'}
                                </span>
                              ) : (
                                <MessageSquare size={15} className="shrink-0 text-muted" />
                              )}
                              <span className="truncate">{c.title}</span>
                              {(c.agentId || c.agentName) && (
                                <span className="shrink-0 rounded-full bg-[rgb(var(--ink)/0.08)] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-muted">
                                  Agent
                                </span>
                              )}
                              {unreadChats.includes(c.id) && (
                                <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-accent" title="New reply" />
                              )}
                            </button>
                            <button
                              onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                              className="rounded-md p-1 text-muted opacity-0 transition hover:bg-[rgb(var(--ink)/0.08)] hover:text-ink group-hover:opacity-100"
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            <AnimatePresence>
                              {menuFor === c.id && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  className="absolute right-2 top-9 z-50 w-44 overflow-hidden rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))] p-1 shadow-lg dark:bg-[rgb(var(--surface-raised))]"
                                  onMouseLeave={() => setMenuFor(null)}
                                >
                                  <button
                                    onClick={async () => {
                                      setMenuFor(null)
                                      if (user) await togglePinChat(user.uid, c.id)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[rgb(var(--ink)/0.07)]"
                                  >
                                    <Pin size={14} /> {c.pinned ? 'Unpin' : 'Pin'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRenaming(c.id)
                                      setRenameVal(c.title)
                                      setMenuFor(null)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[rgb(var(--ink)/0.07)]"
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
                                        .map((m) => `**${m.role === 'user' ? 'You' : 'AskAI'}:** ${m.content}`)
                                        .join('\n\n')}`
                                      navigator.clipboard.writeText(md)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[rgb(var(--ink)/0.07)]"
                                  >
                                    <Download size={14} /> Copy as text
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setMenuFor(null)
                                      if (user) await deleteChat(user.uid, c.id)
                                      if (chatId === c.id) navigate('/')
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-[rgb(var(--ink)/0.07)]"
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
            <div className="border-t border-[rgb(var(--line))] p-2">
              <div className="cg-account">
                <Avatar name={settings.displayName || user?.displayName} photoURL={settings.avatar || user?.photoURL} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {settings.displayName || user?.displayName || 'Account'}
                  </div>
                  <div className="truncate text-xs text-muted">{user?.email}</div>
                </div>
                {isAdmin(user) && (
                  <button
                    onClick={() => navigate('/admin')}
                    className="cg-iconbtn pressable !h-9 !min-w-9 text-muted"
                    title="Admin"
                  >
                    <ShieldCheck size={18} />
                  </button>
                )}
                <button
                  onClick={openSettings}
                  className="cg-iconbtn pressable !h-9 !min-w-9 text-muted"
                  title="Settings"
                >
                  <SettingsIcon size={18} />
                </button>
                <button
                  onClick={handleSignOut}
                  className="cg-iconbtn pressable !h-9 !min-w-9 text-muted"
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
    </>
  )
}
