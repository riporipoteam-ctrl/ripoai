import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, PenSquare, FolderGit2, Settings as SettingsIcon, Sun, Moon, MessageSquare, Sparkles } from 'lucide-react'
import { useStore } from '../store'
import { saveProject } from '../lib/db'
import { newReactProject } from '../lib/templates'

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const navigate = useNavigate()
  const { chats, user, settings, updateSettings, openSettings, setSidebar } = useStore()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setQ('')
        setIdx(0)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const actions = useMemo(
    () => [
      { id: 'new', label: 'New chat', icon: PenSquare, run: () => navigate('/') },
      {
        id: 'project',
        label: 'New project',
        icon: FolderGit2,
        run: async () => {
          if (!user) return
          const p = newReactProject('My App')
          await saveProject(user.uid, p)
          navigate(`/project/${p.id}`)
        },
      },
      { id: 'settings', label: 'Open settings', icon: SettingsIcon, run: () => openSettings() },
      {
        id: 'theme',
        label: settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: settings.theme === 'dark' ? Sun : Moon,
        run: () => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.theme, user],
  )

  const filteredActions = actions.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()))
  const filteredChats = q
    ? chats.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : chats.slice(0, 5)
  const items = [
    ...filteredActions.map((a) => ({ kind: 'action' as const, ...a })),
    ...filteredChats.map((c) => ({ kind: 'chat' as const, id: c.id, label: c.title, icon: MessageSquare, run: () => navigate(`/c/${c.id}`) })),
  ]

  function exec(i: number) {
    const it = items[i]
    if (!it) return
    it.run()
    setOpen(false)
    setSidebar(window.innerWidth >= 768)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="glass-strong relative z-10 w-full max-w-lg overflow-hidden rounded-3xl"
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <Search size={18} className="text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setIdx(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
                  if (e.key === 'Enter') { e.preventDefault(); exec(idx) }
                }}
                placeholder="Search commands and chats…"
                className="flex-1 bg-transparent text-base outline-none placeholder:text-muted"
              />
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-muted">ESC</span>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {items.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted">No results</div>}
              {items.map((it, i) => (
                <button
                  key={it.kind + it.id}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => exec(i)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                    i === idx ? 'bg-white/10' : ''
                  }`}
                >
                  <it.icon size={16} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.kind === 'chat' && <span className="text-[10px] text-muted">chat</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2 text-[11px] text-muted">
              <Sparkles size={12} className="text-accent" /> Tip: press ⌘K / Ctrl+K anytime
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
