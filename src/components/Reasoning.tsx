import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, ChevronDown } from 'lucide-react'

export default function Reasoning({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted hover:text-ink"
      >
        <Brain size={14} className={live ? 'animate-pulse text-accent' : 'text-accent'} />
        <span>{live ? 'Thinking…' : 'Reasoning'}</span>
        <ChevronDown size={14} className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="whitespace-pre-wrap px-3 pb-3 font-mono text-xs leading-relaxed text-muted"
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
