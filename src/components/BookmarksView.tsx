import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Bookmark, X } from 'lucide-react'
import { listBookmarks, type BookmarkEntry } from '../lib/db'
import { useStore } from '../store'

// A "Saved" browser — lists every bookmarked message across all chats and lets
// you jump straight to its conversation.
export default function BookmarksView({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setSidebar } = useStore()
  const navigate = useNavigate()
  const [items, setItems] = useState<BookmarkEntry[]>([])

  useEffect(() => {
    if (open && user) setItems(listBookmarks(user.uid))
  }, [open, user])

  function go(chatId: string) {
    navigate(`/c/${chatId}`)
    onClose()
    if (typeof window !== 'undefined' && window.innerWidth < 768) setSidebar(false)
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="glass-strong relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-[28px] p-4 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl sm:rounded-[28px]"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[rgb(var(--muted)/0.4)] sm:hidden" />
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-bold">
                <Bookmark size={18} className="text-accent" /> Saved messages
              </div>
              <button onClick={onClose} className="pressable rounded-full p-1.5 text-muted hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {items.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                  No saved messages yet. Tap <span className="font-medium text-ink">Save</span> under any answer.
                </p>
              ) : (
                items.map((b) => (
                  <button
                    key={b.messageId}
                    onClick={() => go(b.chatId)}
                    className="pressable block w-full rounded-2xl border border-[rgb(var(--ink)/0.08)] bg-[rgb(var(--surface-raised)/0.6)] p-3 text-left hover:border-accent/40 hover:bg-accent/5"
                  >
                    <div className="truncate text-xs font-semibold text-accent">{b.chatTitle}</div>
                    <div className="mt-0.5 line-clamp-2 text-sm text-ink/90">{b.snippet}</div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
