import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, ChevronDown, Loader2 } from 'lucide-react'

interface Step {
  type: string
  detail?: string
}

export default function AgentTrace({ steps, live }: { steps: Step[]; live?: boolean }) {
  const [open, setOpen] = useState(true)
  if (!steps.length && !live) return null

  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted hover:text-ink"
      >
        {live ? (
          <Loader2 size={14} className="animate-spin text-accent" />
        ) : (
          <Globe size={14} className="text-accent" />
        )}
        <span>{live ? 'Searching the web…' : `Web research · ${steps.length} step${steps.length === 1 ? '' : 's'}`}</span>
        <ChevronDown
          size={14}
          className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && steps.length > 0 && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-1 px-3 pb-2.5 text-xs text-muted"
          >
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 text-accent">›</span>
                <span className="truncate">
                  <span className="font-medium text-ink/80">{s.type}</span>
                  {s.detail ? ` — ${String(s.detail).slice(0, 120)}` : ''}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
