// JobEditor — a glass bottom-sheet to create or edit a scheduled Job (Nebula's
// Jobs tab). Pick the agent that runs it, write the prompt it runs each time,
// choose a cadence and toggle it on/off. Save persists via upsertJob and
// recomputes nextRunAt; "Run now" hands the job's prompt to a fresh 1-on-1 chat.
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Zap, Trash2, Play, ChevronDown, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { loadAgents, getAgent, setPendingAgentChat } from '../lib/agents'
import {
  CADENCE_LABEL,
  advance,
  upsertJob,
  deleteJob,
  newJob,
  type Job,
  type JobCadence,
} from '../lib/jobs'

const CADENCES: JobCadence[] = ['once', 'hourly', 'daily', 'weekly', 'monthly']

interface Props {
  uid: string
  /** The job to edit, or null/undefined to create a brand new one. */
  job: Job | null
  open: boolean
  onClose: () => void
  /** Called after a save or delete so the list can refresh. */
  onSaved: () => void
}

export default function JobEditor({ uid, job, open, onClose, onSaved }: Props) {
  const navigate = useNavigate()
  const agents = useMemo(() => loadAgents(uid), [uid, open])

  // Seed local state from the job (edit) or sensible defaults (create). Keyed by
  // job id below so the sheet re-seeds whenever a different job is opened.
  const seed = job ?? newJob(uid, agents[0]?.id ?? '')
  const [title, setTitle] = useState(seed.title === 'New job' ? '' : seed.title)
  const [agentId, setAgentId] = useState(seed.agentId || agents[0]?.id || '')
  const [prompt, setPrompt] = useState(seed.prompt)
  const [cadence, setCadence] = useState<JobCadence>(seed.cadence)
  const [enabled, setEnabled] = useState(seed.enabled)
  const [pickerOpen, setPickerOpen] = useState(false)

  const isNew = !job
  const selectedAgent = agents.find((a) => a.id === agentId)

  function buildJob(): Job {
    const base = job ?? newJob(uid, agentId, { cadence })
    const agent = getAgent(uid, agentId)
    return {
      ...base,
      title: title.trim() || 'Untitled job',
      agentId,
      agentRole: agent?.role,
      prompt: prompt.trim(),
      cadence,
      enabled,
      // Recompute the next run from now whenever cadence changes or it's new.
      nextRunAt:
        isNew || base.cadence !== cadence ? advance(cadence) : base.nextRunAt,
    }
  }

  function save() {
    if (!agentId) return
    upsertJob(uid, buildJob())
    onSaved()
    onClose()
  }

  function remove() {
    if (job) deleteJob(uid, job.id)
    onSaved()
    onClose()
  }

  // Persist the latest edits, then hand the prompt off to a 1-on-1 agent chat.
  function runNow() {
    if (!agentId) return
    const saved = buildJob()
    saved.lastRunAt = Date.now()
    upsertJob(uid, saved)
    const agent = getAgent(uid, agentId)
    if (agent) setPendingAgentChat(agent)
    onSaved()
    onClose()
    navigate('/')
    // Drop the job prompt into the composer once the new chat has mounted.
    if (saved.prompt) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('askai-prefill', { detail: saved.prompt }))
      }, 300)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />

          <motion.div
            key={job?.id ?? 'new'}
            className="glass-strong relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-4xl sm:rounded-4xl"
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line/60 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl accent-gradient-bg text-white shadow-[0_6px_16px_-8px_rgb(var(--ink)/0.6)]">
                  <Zap size={17} strokeWidth={2.4} />
                </span>
                <h2 className="text-lg font-bold text-ink">{isNew ? 'New job' : 'Edit job'}</h2>
              </div>
              <button
                onClick={onClose}
                className="pressable flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-white/10 hover:text-ink"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {/* Title */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Daily Morning Digest"
                  className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                />
              </label>

              {/* Agent picker */}
              <div className="relative">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">Assigned agent</span>
                <button
                  onClick={() => setPickerOpen((o) => !o)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-left transition focus:border-accent"
                >
                  {selectedAgent ? (
                    <>
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl text-base"
                        style={{ background: (selectedAgent.color || '#888') + '2a' }}
                      >
                        {selectedAgent.avatar ? (
                          <img src={selectedAgent.avatar} alt="" className="h-full w-full object-cover" />
                        ) : (
                          selectedAgent.emoji
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{selectedAgent.name}</span>
                        <span className="block truncate text-xs text-muted">{selectedAgent.role}</span>
                      </span>
                    </>
                  ) : (
                    <span className="flex-1 text-sm text-muted">Choose an agent…</span>
                  )}
                  <ChevronDown size={18} className={`shrink-0 text-muted transition ${pickerOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {pickerOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="glass-strong absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-line p-1.5 shadow-xl"
                    >
                      {agents.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            setAgentId(a.id)
                            setPickerOpen(false)
                          }}
                          className="pressable flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/10"
                        >
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl text-base"
                            style={{ background: (a.color || '#888') + '2a' }}
                          >
                            {a.avatar ? <img src={a.avatar} alt="" className="h-full w-full object-cover" /> : a.emoji}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">{a.name}</span>
                            <span className="block truncate text-xs text-muted">{a.role}</span>
                          </span>
                          {a.id === agentId && <Check size={16} className="shrink-0 text-accent" />}
                        </button>
                      ))}
                      {!agents.length && (
                        <p className="px-3 py-4 text-center text-sm text-muted">No agents yet — create one first.</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Prompt */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">What to do each run</span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="e.g. Summarize my unread emails and top 3 industry headlines as a short morning digest."
                  className="w-full resize-none rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-relaxed text-ink outline-none transition focus:border-accent"
                />
              </label>

              {/* Cadence */}
              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">Cadence</span>
                <div className="flex flex-wrap gap-2">
                  {CADENCES.map((c) => {
                    const active = c === cadence
                    return (
                      <button
                        key={c}
                        onClick={() => setCadence(c)}
                        className={`pressable rounded-full px-4 py-2 text-sm font-semibold transition ${
                          active
                            ? 'accent-gradient-bg text-white shadow-[0_6px_16px_-8px_rgb(var(--ink)/0.6)]'
                            : 'border border-line text-muted hover:text-ink'
                        }`}
                      >
                        {CADENCE_LABEL[c]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Enabled toggle */}
              <button
                onClick={() => setEnabled((e) => !e)}
                className="flex w-full items-center justify-between rounded-2xl border border-line bg-card px-4 py-3 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold text-ink">Enabled</span>
                  <span className="block text-xs text-muted">Disabled jobs stay scheduled but won't run or show as upcoming.</span>
                </span>
                <span
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? 'accent-gradient-bg' : 'bg-white/15'}`}
                >
                  <motion.span
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                    className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
                    style={{ left: enabled ? 'calc(100% - 1.25rem - 0.25rem)' : '0.25rem' }}
                  />
                </span>
              </button>
            </div>

            {/* Footer actions */}
            <div className="flex items-center gap-2 border-t border-line/60 px-5 py-4">
              {!isNew && (
                <button
                  onClick={remove}
                  className="pressable flex h-11 w-11 items-center justify-center rounded-2xl text-red-400 transition hover:bg-red-500/10"
                  title="Delete job"
                  aria-label="Delete job"
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button
                onClick={runNow}
                disabled={!agentId}
                className="pressable flex h-11 items-center gap-1.5 rounded-2xl border border-line px-4 text-sm font-semibold text-ink transition hover:bg-white/10 disabled:opacity-40"
                title="Run this job now"
              >
                <Play size={16} /> Run now
              </button>
              <button
                onClick={save}
                disabled={!agentId}
                className="pressable accent-gradient-bg ml-auto flex h-11 items-center justify-center rounded-2xl px-7 text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgb(var(--ink)/0.6)] disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
