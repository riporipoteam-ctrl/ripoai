import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Coins, Check, Flame, Sparkles, PanelLeftOpen } from 'lucide-react'
import { usePlus } from '../hooks/usePlus'
import { useStore } from '../store'
import { DAILY_TASKS, claimTask } from '../lib/plus'

export default function TasksPage() {
  const navigate = useNavigate()
  const { sidebarOpen, toggleSidebar } = useStore()
  const { uid, state, refresh } = usePlus()
  const [flash, setFlash] = useState('')

  if (!state || !uid) return null

  // A task is "ready" once the user has actually done the underlying action today.
  const ready: Record<string, boolean> = {
    checkin: true,
    chat3: state.msgsToday >= 3,
    image: state.imageGenToday >= 1,
    search: false, // surfaced as ready after a web-search turn (tracked separately below)
    project: false,
  }
  // Web-search / project readiness piggybacks on simple local flags.
  try {
    ready.search = localStorage.getItem(`askai:did-search:${state.day}`) === '1'
    ready.project = localStorage.getItem(`askai:did-project:${state.day}`) === '1'
  } catch {
    /* ignore */
  }

  const doneCount = state.tasksDone.length
  const total = DAILY_TASKS.length

  function claim(id: string) {
    if (!uid) return
    const reward = claimTask(uid, id)
    if (reward > 0) {
      setFlash(`+${reward} coins!`)
      setTimeout(() => setFlash(''), 1500)
    }
    refresh()
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-5">
        <div className="mb-5 flex items-center gap-2">
          {!sidebarOpen && (
            <button onClick={toggleSidebar} className="glass pressable rounded-xl p-2" title="Open sidebar">
              <PanelLeftOpen size={18} />
            </button>
          )}
          <button
            onClick={() => navigate('/')}
            className="pressable flex items-center gap-1.5 rounded-xl px-2 py-2 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft size={18} /> Back
          </button>
          <div className="ml-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-bold">
            <Coins size={15} className="text-amber-400" /> {state.coins}
          </div>
        </div>

        <div className="mb-4 text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl accent-gradient-bg text-white shadow-lg">
            <Flame size={26} />
          </div>
          <h1 className="text-2xl font-extrabold">Daily tasks</h1>
          <p className="mt-1 text-sm text-muted">
            {doneCount}/{total} done today · resets at midnight
          </p>
          {state.streak > 0 && (
            <div className="mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-500">
              <Flame size={14} /> {state.streak}-day streak
            </div>
          )}
          <div className="mx-auto mt-3 h-2 w-48 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full accent-gradient-bg"
              initial={{ width: 0 }}
              animate={{ width: `${(doneCount / total) * 100}%` }}
            />
          </div>
        </div>

        {flash && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 rounded-xl bg-emerald-500/15 px-4 py-2 text-center text-sm font-bold text-emerald-400"
          >
            {flash}
          </motion.div>
        )}

        <div className="space-y-2">
          {DAILY_TASKS.map((t, i) => {
            const claimed = state.tasksDone.includes(t.id)
            const canClaim = ready[t.id] && !claimed
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`lift-card glass flex items-center gap-3 rounded-2xl p-3.5 ${claimed ? 'opacity-60' : ''}`}
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${claimed ? 'bg-emerald-500/20 text-emerald-400' : 'accent-gradient-bg shadow-[0_6px_16px_-8px_rgb(var(--ink)/0.6)]'}`}>
                  {claimed ? <Check size={18} /> : <Sparkles size={18} strokeWidth={2.4} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{t.title}</div>
                  <div className="truncate text-xs text-muted">{t.desc}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-sm font-bold text-amber-400">
                  <Coins size={14} /> {t.reward}
                </div>
                <button
                  onClick={() => claim(t.id)}
                  disabled={!canClaim}
                  className={`pressable shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${
                    claimed
                      ? 'text-muted'
                      : canClaim
                        ? 'accent-gradient-bg text-white'
                        : 'border border-white/15 text-muted'
                  }`}
                >
                  {claimed ? 'Claimed' : canClaim ? 'Claim' : 'Locked'}
                </button>
              </motion.div>
            )
          })}
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          Plus you earn coins automatically every time you chat with AskAI.
        </p>
      </div>
    </div>
  )
}
