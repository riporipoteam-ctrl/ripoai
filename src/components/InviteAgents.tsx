// "Invite agents" control for an agent chat — pulls other agents into the
// conversation so the lead delegates to them (engine in lib/chatParticipants +
// useChat). Self-contained: renders a + button, a picker sheet, and the invited
// avatars. Shown next to the agent header pill in ChatView.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { UserPlus, X, Check } from 'lucide-react'
import { loadAgents, type Agent } from '../lib/agents'
import { useStore } from '../store'
import { haptic } from '../lib/native'
import {
  getInvitedAgents,
  inviteAgent,
  removeInvitedAgent,
  onParticipantsChanged,
  setInvitedScope,
} from '../lib/chatParticipants'

export default function InviteAgents({ lead }: { lead: Agent }) {
  const uid = useStore((s) => s.user?.uid)
  const [open, setOpen] = useState(false)
  const [invited, setInvited] = useState<Agent[]>([])
  const [roster, setRoster] = useState<Agent[]>([])

  useEffect(() => {
    setInvitedScope(lead.id)
    setInvited(getInvitedAgents())
    return onParticipantsChanged(() => setInvited(getInvitedAgents()))
  }, [lead.id])

  useEffect(() => {
    if (uid) setRoster(loadAgents(uid).filter((a) => a.id !== lead.id))
  }, [uid, lead.id])

  return (
    <div className="pointer-events-auto flex items-center gap-1.5">
      {/* invited avatars */}
      {invited.slice(0, 3).map((a) => (
        <span
          key={a.id}
          title={a.name}
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs ring-2 ring-[rgb(var(--surface))]"
          style={{ background: a.color + '2a' }}
        >
          {a.emoji}
        </span>
      ))}
      <button
        onClick={() => {
          haptic('light')
          setOpen(true)
        }}
        className="glass-strong pressable flex h-9 w-9 items-center justify-center rounded-full text-ink shadow-sm"
        title="Invite agents to this chat"
        aria-label="Invite agents"
      >
        <UserPlus size={16} />
      </button>

      {open &&
        createPortal(
          <AnimatePresence>
            <motion.div
              className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setOpen(false)} />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 360, damping: 34 }}
                className="glass-strong relative w-full max-w-md rounded-t-[28px] p-3 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl sm:rounded-[28px]"
              >
                <div className="mb-2 flex items-center justify-between px-2">
                  <span className="text-base font-bold text-ink">Invite agents</span>
                  <button onClick={() => setOpen(false)} className="pressable text-muted">
                    <X size={18} />
                  </button>
                </div>
                <p className="mb-2 px-2 text-xs text-muted">
                  {lead.name} will delegate parts of the task to whoever you add.
                </p>
                <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
                  {roster.map((a) => {
                    const on = invited.some((x) => x.id === a.id)
                    return (
                      <button
                        key={a.id}
                        onClick={() => {
                          haptic('select')
                          on ? removeInvitedAgent(a.id) : inviteAgent(a)
                        }}
                        className={`pressable flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${
                          on ? 'border-accent/50 bg-accent/10' : 'border-line'
                        }`}
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full text-base" style={{ background: a.color + '2a' }}>
                          {a.emoji}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-ink">{a.name}</span>
                          <span className="block truncate text-xs text-muted">{a.role}</span>
                        </span>
                        {on && <Check size={18} className="text-accent" />}
                      </button>
                    )
                  })}
                  {roster.length === 0 && <p className="py-6 text-center text-sm text-muted">No other agents yet.</p>}
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
