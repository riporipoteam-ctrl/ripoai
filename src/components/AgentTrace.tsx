import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, ChevronDown, Search, FileText, Check } from 'lucide-react'

interface Step {
  type: string
  detail?: string
}

function hostOf(s?: string): string | null {
  if (!s) return null
  const m = s.match(/https?:\/\/([^/\s"']+)/i)
  return m ? m[1].replace(/^www\./, '') : null
}

export default function AgentTrace({ steps, live }: { steps: Step[]; live?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!steps.length && !live) return null

  const hosts = Array.from(
    new Set(steps.map((s) => hostOf(s.detail)).filter(Boolean) as string[]),
  ).slice(0, 6)

  return (
    <div className="mb-2.5 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-transparent">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-lg accent-gradient-bg text-white">
          {live ? <Search size={13} className="animate-pulse" /> : <Globe size={13} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            {live ? (
              <span className="bg-gradient-to-r from-accent via-ink to-accent bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">
                Searching the web…
              </span>
            ) : (
              <>
                <Check size={13} className="text-emerald-400" />
                <span>Searched the web</span>
                <span className="text-muted">· {steps.length} step{steps.length === 1 ? '' : 's'}</span>
              </>
            )}
          </div>
          {!!hosts.length && (
            <div className="mt-1 flex flex-wrap gap-1">
              {hosts.map((h) => (
                <span key={h} className="flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-muted">
                  <img src={`https://www.google.com/s2/favicons?domain=${h}&sz=32`} alt="" className="h-3 w-3 rounded-sm" />
                  {h}
                </span>
              ))}
            </div>
          )}
        </div>
        <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && steps.length > 0 && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-1.5 border-t border-white/5 px-3 py-2.5 text-xs text-muted"
          >
            {steps.map((s, i) => {
              const host = hostOf(s.detail)
              const url = s.detail?.match(/https?:\/\/[^\s"']+/)?.[0]
              return (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-white/8 text-[9px] text-accent">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-ink/80">{s.type}</span>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="ml-1 break-all text-accent hover:underline">
                        {host || url.slice(0, 60)}
                      </a>
                    ) : s.detail ? (
                      <span className="ml-1 break-words">{String(s.detail).slice(0, 120)}</span>
                    ) : null}
                  </span>
                  <FileText size={11} className="mt-0.5 shrink-0 opacity-50" />
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
