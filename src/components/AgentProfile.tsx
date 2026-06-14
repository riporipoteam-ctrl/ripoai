import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Globe2, MessageSquare, Pencil, Sparkles, X, Brain, Wand2 } from 'lucide-react'
import { useStore } from '../store'
import { ensureAgentAvatar, agentCanBrowse, type Agent } from '../lib/agents'

/** Large agent avatar with a soft colored ring — reuses the same emoji/image
 *  fallback logic used across the app. */
function BigAvatar({ agent }: { agent: Agent }) {
  return agent.avatar ? (
    <img
      src={agent.avatar}
      alt={agent.name}
      className="h-24 w-24 rounded-3xl object-cover"
      style={{ boxShadow: `0 0 0 2px ${agent.color}66, 0 18px 40px -18px ${agent.color}` }}
    />
  ) : (
    <span
      className="flex h-24 w-24 items-center justify-center rounded-3xl text-5xl"
      style={{ background: agent.color + '2a', boxShadow: `0 0 0 2px ${agent.color}66` }}
    >
      {agent.emoji}
    </span>
  )
}

interface Props {
  open: boolean
  agent: Agent | null
  onClose: () => void
  /** Start (or jump back to) a 1-on-1 chat with this agent. */
  onChat?: (agent: Agent) => void
  /** Open the editor for this agent (Settings). */
  onEdit?: (agent: Agent) => void
}

/** A polished, viewable agent profile: big avatar, name, role, persona, skill
 *  chips, and a capabilities section that surfaces OpenClaw web browsing. */
export default function AgentProfile({ open, agent, onClose, onChat, onEdit }: Props) {
  const { user } = useStore()
  const [live, setLive] = useState<Agent | null>(agent)

  useEffect(() => {
    setLive(agent)
  }, [agent])

  // Lazily paint a real avatar if this agent still only has an emoji.
  useEffect(() => {
    if (!open || !agent || agent.avatar || !user) return
    let cancelled = false
    ensureAgentAvatar(user.uid, agent).then((updated) => {
      if (!cancelled && updated.avatar) setLive(updated)
    })
    return () => {
      cancelled = true
    }
  }, [open, agent, user])

  if (!open || !live) return null
  const a = live
  const canBrowse = agentCanBrowse(a)

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="glass-strong relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px]"
      >
        {/* Header banner tinted with the agent's color */}
        <div
          className="relative px-6 pb-5 pt-7"
          style={{ background: `linear-gradient(160deg, ${a.color}22, transparent 70%)` }}
        >
          <button
            onClick={onClose}
            className="pressable absolute right-3 top-3 rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-ink"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <div className="flex flex-col items-center text-center">
            <BigAvatar agent={a} />
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight">{a.name}</h2>
            {a.role && (
              <span
                className="mt-1 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
                style={{ background: a.color + '22', color: a.color }}
              >
                {a.role}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-5 px-6 pb-6">
          {/* Persona */}
          {a.personality && (
            <section>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted">
                <Brain size={13} /> Persona
              </div>
              <p className="text-sm leading-relaxed text-ink/85">{a.personality}</p>
            </section>
          )}

          {/* Skills */}
          {!!a.skills?.length && (
            <section>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted">
                <Sparkles size={13} /> Skills
              </div>
              <div className="flex flex-wrap gap-1.5">
                {a.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-xs font-semibold text-ink/85"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Capabilities */}
          <section>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted">
              <Wand2 size={13} /> Capabilities
            </div>
            <div
              className={`flex items-center gap-3 rounded-2xl border p-3 ${
                canBrowse ? 'border-orange-500/30 bg-orange-500/10' : 'border-white/10 bg-white/5'
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  canBrowse ? 'bg-orange-500/20 text-orange-500' : 'bg-white/10 text-muted'
                }`}
              >
                <Globe2 size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-bold">
                  Web browsing
                  <span className="rounded-full bg-orange-500/15 px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wide text-orange-500">
                    🐾 OpenClaw
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {canBrowse
                    ? 'Can search, open and read live web pages, then answer with sources.'
                    : 'Disabled — turn it on in the agent editor to let this agent browse.'}
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  canBrowse ? 'bg-emerald-400/15 text-emerald-400' : 'bg-white/10 text-muted'
                }`}
              >
                {canBrowse ? 'ON' : 'OFF'}
              </span>
            </div>
          </section>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {onChat && (
              <button
                onClick={() => onChat(a)}
                className="accent-gradient-bg pressable flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white"
              >
                <MessageSquare size={16} /> Chat
              </button>
            )}
            {onEdit && (
              <button
                onClick={() => onEdit(a)}
                className="pressable flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold hover:bg-white/5"
              >
                <Pencil size={16} /> Edit
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
