import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Monitor, Check, X, Loader2, Play, Terminal, FolderCog } from 'lucide-react'
import { isDesktop, runPcAction, type PcAction, type PcActionResult } from '../lib/desktop'

// Renders the PC actions AskAI proposed (parsed from a message) when running in
// the AskAI desktop app. Safe file ops run automatically; the desktop shell
// prompts the user to confirm risky ops / commands. On the website it's inert.
export default function DesktopActionCard({ actions, messageId }: { actions: PcAction[]; messageId: string }) {
  const [results, setResults] = useState<(PcActionResult | 'running' | null)[]>(actions.map(() => null))
  const ran = useRef(false)

  async function runAll() {
    const next: (PcActionResult | 'running' | null)[] = actions.map(() => null)
    for (let i = 0; i < actions.length; i++) {
      next[i] = 'running'
      setResults([...next])
      next[i] = await runPcAction(actions[i])
      setResults([...next])
    }
  }

  useEffect(() => {
    if (ran.current || !isDesktop() || !actions.length) return
    ran.current = true
    void runAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId])

  if (!actions.length) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-2 overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.07]"
    >
      <div className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg accent-gradient-bg text-white">
          <Monitor size={13} />
        </span>
        PC actions
        {isDesktop() ? (
          <button
            onClick={() => void runAll()}
            className="ml-auto flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/20"
          >
            <Play size={11} /> Run again
          </button>
        ) : (
          <span className="ml-auto text-[11px] font-normal text-muted">Open the AskAI desktop app to run these</span>
        )}
      </div>
      <ul className="space-y-1.5 border-t border-white/5 px-3 py-2.5 text-xs">
        {actions.map((a, i) => {
          const r = results[i]
          const label = a.label || (a.kind === 'exec' ? a.command : `${a.op} ${a.from || a.path || ''}${a.to ? ' → ' + a.to : ''}`)
          return (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                {r === 'running' ? (
                  <Loader2 size={12} className="animate-spin text-accent" />
                ) : r && r.ok ? (
                  <Check size={12} className="text-emerald-400" />
                ) : r && !r.ok ? (
                  <X size={12} className="text-red-400" />
                ) : a.kind === 'exec' ? (
                  <Terminal size={12} className="text-muted" />
                ) : (
                  <FolderCog size={12} className="text-muted" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="break-words font-medium text-ink/85">{label}</span>
                {r && r !== 'running' && (r.detail || r.error) && (
                  <span className={`ml-1 break-words ${r.ok ? 'text-muted' : 'text-red-400'}`}>
                    — {(r.error || r.detail || '').slice(0, 200)}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </motion.div>
  )
}
