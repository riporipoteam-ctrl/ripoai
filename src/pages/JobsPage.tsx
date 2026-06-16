// Jobs — scheduled recurring tasks assigned to agents (Nebula's Jobs tab).
// A "My jobs" / "All jobs" filter, an Upcoming list sorted by soonest run, and a
// tap-to-edit sheet (JobEditor). A small client-side runner checks for due jobs
// on mount/interval and hands each one's prompt to its agent, then advances it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Plus, Bell, ChevronRight } from 'lucide-react'
import { useStore } from '../store'
import { loadAgents, getAgent, setPendingAgentChat } from '../lib/agents'
import {
  loadJobs,
  upsertJob,
  advance,
  untilLabel,
  newJob,
  type Job,
} from '../lib/jobs'
import { isNative } from '../lib/native'
import JobEditor from '../components/JobEditor'

type Filter = 'mine' | 'all'

// One-time seed of the three reference example jobs so the tab isn't empty on a
// fresh account — mirrors Nebula's defaults. Uses only the public jobs API.
function seedExampleJobs(uid: string) {
  const SEED_KEY = `askai:jobs:seeded-v1:${uid}`
  try {
    if (localStorage.getItem(SEED_KEY)) return
    localStorage.setItem(SEED_KEY, '1')
    if (loadJobs(uid).length) return
    const agents = loadAgents(uid)
    if (!agents.length) return
    const byRole = (role: string) =>
      agents.find((a) => a.role.toLowerCase() === role.toLowerCase())?.id ?? agents[0]?.id
    const DAY = 24 * 60 * 60 * 1000
    const examples: Array<[string, string, string, Job['cadence'], number]> = [
      ['Daily Morning Digest', 'Writer', 'Write a short morning digest of my unread email and the top headlines.', 'daily', 20 * 60 * 60 * 1000],
      ['Weekly Market Intelligence Scan', 'Researcher', 'Research notable moves in my market this week and summarize the key signals.', 'weekly', 5 * DAY],
      ['Weekly Sandbox Health Report', 'Builder', 'Check the sandbox projects and report on build health, errors and TODOs.', 'weekly', 5 * DAY],
    ]
    for (const [title, role, prompt, cadence, inMs] of examples) {
      const agentId = byRole(role)
      if (!agentId) continue
      const agent = getAgent(uid, agentId)
      upsertJob(
        uid,
        newJob(uid, agentId, {
          title,
          agentRole: agent?.role ?? role,
          prompt,
          cadence,
          nextRunAt: Date.now() + inMs,
        }),
      )
    }
  } catch {
    /* ignore */
  }
}

export default function JobsPage() {
  const navigate = useNavigate()
  const uid = useStore((s) => s.user?.uid)
  const [jobs, setJobs] = useState<Job[]>([])
  const [filter, setFilter] = useState<Filter>('mine')
  const [editing, setEditing] = useState<Job | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const ranRef = useRef(false)

  const refresh = useCallback(() => {
    if (!uid) return
    setJobs(loadJobs(uid))
  }, [uid])

  useEffect(() => {
    if (!uid) return
    seedExampleJobs(uid)
    refresh()
  }, [uid, refresh])

  // Resolve the display role for a job, falling back to a live agent lookup.
  const roleFor = useCallback(
    (j: Job) => j.agentRole || (uid ? getAgent(uid, j.agentId)?.role : '') || 'Agent',
    [uid],
  )

  // ── Client-side runner ────────────────────────────────────────────────
  // On mount and every minute, find enabled jobs whose nextRunAt has passed.
  // To stay safe and non-spammy we advance nextRunAt FIRST (so a job can't fire
  // twice), only run the single soonest-due job per tick, and require it to have
  // been due for under a day (skip stale backlog). The agent's prompt is queued
  // to a fresh 1-on-1 chat via setPendingAgentChat.
  const runDue = useCallback(() => {
    if (!uid) return
    const now = Date.now()
    const due = loadJobs(uid)
      .filter((j) => j.enabled && j.nextRunAt <= now && now - j.nextRunAt < 24 * 60 * 60 * 1000)
      .sort((a, b) => a.nextRunAt - b.nextRunAt)
    const job = due[0]
    if (!job) return
    // Advance + mark run BEFORE dispatching so we never double-fire.
    upsertJob(uid, { ...job, lastRunAt: now, nextRunAt: advance(job.cadence, now) })
    refresh()
    const agent = getAgent(uid, job.agentId)
    if (agent && job.prompt) {
      setPendingAgentChat(agent)
      navigate('/')
      // Let the chat + composer mount, then drop the job prompt into the composer.
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('askai-prefill', { detail: job.prompt }))
      }, 300)
    }
  }, [uid, refresh, navigate])

  useEffect(() => {
    if (!uid || ranRef.current) return
    ranRef.current = true
    runDue()
    const id = window.setInterval(runDue, 60_000)
    return () => window.clearInterval(id)
  }, [uid, runDue])

  // ── Derived lists ─────────────────────────────────────────────────────
  const mine = jobs.filter((j) => j.owner === uid)
  const visible = (filter === 'mine' ? mine : jobs).filter((j) => j.enabled)
  const upcoming = [...visible].sort((a, b) => a.nextRunAt - b.nextRunAt)

  function openNew() {
    setEditing(null)
    setEditorOpen(true)
  }
  function openEdit(j: Job) {
    setEditing(j)
    setEditorOpen(true)
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className={`mx-auto w-full max-w-2xl px-4 py-6 ${isNative ? 'pb-32' : 'pb-12'}`}>
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl accent-gradient-bg text-white shadow-[0_8px_20px_-8px_rgb(var(--ink)/0.6)]">
            <Zap size={20} strokeWidth={2.4} />
          </span>
          <h1 className="text-2xl font-bold text-ink">Jobs</h1>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              className="pressable flex h-11 w-11 items-center justify-center rounded-2xl text-muted transition hover:bg-white/10 hover:text-ink"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell size={20} />
            </button>
            <button
              onClick={openNew}
              className="pressable accent-gradient-bg flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-[0_8px_20px_-8px_rgb(var(--ink)/0.6)]"
              title="Create job"
              aria-label="Create job"
            >
              <Plus size={22} strokeWidth={2.6} />
            </button>
          </div>
        </div>

        {/* Filter pills */}
        <div className="mb-6 flex items-center gap-2">
          {(
            [
              ['mine', 'My jobs', mine.filter((j) => j.enabled).length],
              ['all', 'All jobs', jobs.filter((j) => j.enabled).length],
            ] as const
          ).map(([key, label, count]) => {
            const active = filter === key
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`pressable flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? 'accent-gradient-bg text-white shadow-[0_6px_16px_-8px_rgb(var(--ink)/0.6)]'
                    : 'border border-line text-muted hover:text-ink'
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                    active ? 'bg-white/25' : 'bg-white/10 text-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Upcoming */}
        <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">
          Upcoming · {upcoming.length}
        </h2>

        {upcoming.length ? (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {upcoming.map((j, i) => (
                <motion.button
                  key={j.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ delay: Math.min(i * 0.04, 0.2) }}
                  onClick={() => openEdit(j)}
                  className="glass lift-card pressable flex min-h-[60px] items-center gap-3 rounded-2xl px-4 py-3 text-left"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                    <Zap size={18} strokeWidth={2.4} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{j.title}</span>
                    <span className="block truncate text-sm text-muted">{roleFor(j)}</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-muted">{untilLabel(j.nextRunAt)}</span>
                  <ChevronRight size={16} className="shrink-0 text-muted/60" />
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="glass mt-2 flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl accent-gradient-bg text-white shadow-lg">
              <Zap size={26} />
            </span>
            <div>
              <p className="font-semibold text-ink">No jobs scheduled yet</p>
              <p className="mt-1 text-sm text-muted">
                Create a recurring job and assign it to an agent to run on a schedule.
              </p>
            </div>
            <button
              onClick={openNew}
              className="pressable accent-gradient-bg mt-1 flex items-center gap-1.5 rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-lg"
            >
              <Plus size={16} /> New job
            </button>
          </div>
        )}
      </div>

      {uid && (
        <JobEditor
          uid={uid}
          job={editing}
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
