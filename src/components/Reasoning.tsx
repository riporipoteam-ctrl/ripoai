import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, ChevronDown } from 'lucide-react'

export default function Reasoning({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div className="mb-2.5 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-transparent">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3 py-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg accent-gradient-bg text-white">
          <Brain size={13} className={live ? 'animate-pulse' : ''} />
        </span>
        <span className="flex-1 text-left text-sm font-semibold">
          {live ? (
            <span className="bg-gradient-to-r from-accent via-ink to-accent bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">
              Thinking…
            </span>
          ) : (
            'Thought process'
          )}
        </span>
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="max-h-72 overflow-y-auto whitespace-pre-wrap border-t border-white/5 px-3 py-2.5 font-mono text-xs leading-relaxed text-muted"
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
