// First-run onboarding for the Agents page (Nebula-style). The user picks what
// they want agents for; the Chief of Staff then HIRES a tailored starting team
// with a creation animation, and opens a welcome chat where AskAI greets the
// user and each new agent introduces itself.
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Check, Sparkles, ArrowRight, Loader2 } from 'lucide-react'
import { ONBOARDING_USECASES, createTeamForUseCases } from '../lib/orchestrator'
import { ASKAI_LEAD, setPendingAgentChat, setPendingAgentPrompt, type Agent } from '../lib/agents'
import { setInvitedScope, clearInvited, inviteAgent } from '../lib/chatParticipants'
import { haptic } from '../lib/native'

const ONBOARDED = (uid: string) => `askai:agents:onboarded:${uid}`
export const hasOnboarded = (uid: string) => {
  try {
    return !!localStorage.getItem(ONBOARDED(uid))
  } catch {
    return true
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function AgentsOnboarding({ uid, onClose }: { uid: string; onClose: () => void }) {
  const navigate = useNavigate()
  const [picked, setPicked] = useState<string[]>([])
  const [phase, setPhase] = useState<'pick' | 'creating'>('pick')
  const [created, setCreated] = useState<Agent[]>([])
  const [revealed, setRevealed] = useState(0)

  function toggle(id: string) {
    haptic('select')
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  function finish() {
    try {
      localStorage.setItem(ONBOARDED(uid), '1')
    } catch {
      /* ignore */
    }
    onClose()
  }

  async function go() {
    haptic('medium')
    const team = createTeamForUseCases(uid, picked)
    setCreated(team)
    setPhase('creating')
    window.dispatchEvent(new Event('askai-agents-changed'))
    // Reveal the created agents one-by-one for the "hiring" animation.
    for (let i = 0; i < team.length; i++) {
      await sleep(650)
      setRevealed(i + 1)
    }
    await sleep(600)

    // Hand off to a fresh AskAI-led chat and AUTO-SEND a welcome request — this
    // reuses the proven live pipeline: AskAI greets the user, then each newly
    // hired teammate (invited below) takes over and introduces itself in its own
    // bubble. No fragile pre-seeded chat.
    setPendingAgentChat({ ...ASKAI_LEAD })
    setInvitedScope(ASKAI_LEAD.id)
    clearInvited()
    team.forEach((a) => inviteAgent(a))

    const labels = ONBOARDING_USECASES.filter((u) => picked.includes(u.id)).map((u) => u.label.toLowerCase())
    const want = labels.length ? labels.join(', ') : 'get things done'
    const names = team.length ? team.map((t) => t.name).join(', ') : ''
    setPendingAgentPrompt(
      team.length
        ? `I just set up my AskAI workspace — I want help to ${want}. Welcome me to my new team, and have each of my new teammates (${names}) introduce themselves in one short line.`
        : `I just set up my AskAI workspace — I want help to ${want}. Welcome me and tell me how you'll help and how I can put you to work.`,
    )

    finish()
    navigate('/chat')
  }

  return (
    <motion.div
      className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="glass-strong relative flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] sm:rounded-[28px]"
      >
        {phase === 'pick' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-6 pt-7 text-center">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl accent-gradient-bg text-white shadow-lg">
                <Sparkles size={26} />
              </span>
              <h1 className="font-display text-2xl font-bold text-ink">Welcome to Agents</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
                Agents are AI teammates that work for you — they research the live web, write, build,
                analyze and run tasks on a schedule. AskAI, your Chief of Staff, coordinates them.
              </p>
              <p className="mt-4 text-sm font-semibold text-ink">What do you want your agents to help with?</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-2.5">
                {ONBOARDING_USECASES.map((u) => {
                  const on = picked.includes(u.id)
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggle(u.id)}
                      className={`pressable flex items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                        on ? 'border-accent bg-accent/10' : 'border-line hover:bg-card'
                      }`}
                    >
                      <span className="text-2xl">{u.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-ink">{u.label}</span>
                        <span className="block truncate text-xs text-muted">{u.blurb}</span>
                      </span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                          on ? 'border-accent bg-accent text-white' : 'border-line'
                        }`}
                      >
                        {on && <Check size={14} strokeWidth={3} />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-line px-5 py-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
              <button onClick={finish} className="pressable text-sm font-semibold text-muted hover:text-ink">
                Skip
              </button>
              <button
                onClick={go}
                disabled={!picked.length}
                className="accent-gradient-bg pressable ml-auto flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                Build my team <ArrowRight size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-10">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl accent-gradient-bg text-white shadow-lg">
              <Loader2 size={26} className="animate-spin" />
            </span>
            <h2 className="font-display text-xl font-bold text-ink">AskAI is hiring your team…</h2>
            <p className="mt-1 text-sm text-muted">Setting up your specialists</p>
            <div className="mt-6 w-full space-y-2.5">
              <AnimatePresence>
                {created.slice(0, revealed).map((a, i) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 14, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 22 }}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3"
                  >
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
                      style={{ background: `linear-gradient(135deg, ${a.color}3a, ${a.color}14)` }}
                    >
                      {a.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-ink">{a.name}</span>
                      <span className="block text-xs text-muted">{a.role}</span>
                    </span>
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-1 text-xs font-semibold text-emerald-500"
                    >
                      <Check size={14} strokeWidth={3} /> Hired
                    </motion.span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
