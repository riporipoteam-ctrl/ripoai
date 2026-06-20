import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, ChevronDown, Check, Loader2, AlertCircle } from 'lucide-react'

export interface SubagentItem {
  name: string
  task: string
  status: 'thinking' | 'done' | 'error'
}

// Shows the silent subagents AskAI spun up for a larger task. Their individual
// outputs are never displayed — just a compact, live "thinking…" trace, like
// "Created subagent: Researcher".
export default function SubagentTrace({
  subagents,
  live,
}: {
  subagents: SubagentItem[]
  live?: boolean
}) {
  const [open, setOpen] = useState(false)
  if (!subagents.length) return null

  const working = subagents.some((s) => s.status === 'thinking')
  const done = subagents.filter((s) => s.status === 'done').length

  return (
    <div className="subagent-trace mb-2.5 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-transparent">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-lg accent-gradient-bg text-white">
          <Users size={13} className={working && live ? 'animate-pulse' : ''} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            {working && live ? (
              <span className="bg-gradient-to-r from-accent via-ink to-accent bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">
                Working with subagents…
              </span>
            ) : (
              <>
                <Check size={13} className="text-emerald-400" />
                <span>Used {subagents.length} subagent{subagents.length === 1 ? '' : 's'}</span>
                {done < subagents.length && <span className="text-muted">· {done} done</span>}
              </>
            )}
          </div>
          {!open && (
            <div className="mt-1 flex flex-wrap gap-1">
              {subagents.slice(0, 4).map((s, i) => (
                <span key={i} className="flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-muted">
                  {s.status === 'thinking' ? (
                    <Loader2 size={9} className="animate-spin text-accent" />
                  ) : s.status === 'error' ? (
                    <AlertCircle size={9} className="text-amber-400" />
                  ) : (
                    <Check size={9} className="text-emerald-400" />
                  )}
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-1.5 border-t border-white/5 px-3 py-2.5 text-xs text-muted"
          >
            {subagents.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  {s.status === 'thinking' ? (
                    <Loader2 size={11} className="animate-spin text-accent" />
                  ) : s.status === 'error' ? (
                    <AlertCircle size={11} className="text-amber-400" />
                  ) : (
                    <Check size={11} className="text-emerald-400" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink/80">
                    {s.status === 'thinking' ? 'Created subagent: ' : ''}
                    {s.name}
                  </span>
                  {s.task && <span className="ml-1 break-words">{s.task}</span>}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
