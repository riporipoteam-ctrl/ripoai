import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Users, Loader2, Sparkles, FolderGit2, Square, PanelLeftOpen, Send } from 'lucide-react'
import { useStore } from '../store'
import { loadAgents, mentionedAgents, type Agent } from '../lib/agents'
import { runTeam, type TeamEvent } from '../lib/agentTeam'
import { parseCodeFiles } from '../lib/parseCode'
import { saveProject } from '../lib/db'
import { Markdown } from '../components/Markdown'
import Logo from '../components/Logo'

const PENDING_KEY = 'askai:team:pending'

/** Queue a task for the Team room (called from chat dispatch). */
export function dispatchTeam(task: string, leadId?: string) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ task, leadId, at: Date.now() }))
  } catch {
    /* ignore */
  }
}

export default function TeamPage() {
  const navigate = useNavigate()
  const { user, sidebarOpen, toggleSidebar } = useStore()
  const [task, setTask] = useState('')
  const [draft, setDraft] = useState('')
  const [events, setEvents] = useState<TeamEvent[]>([])
  const [running, setRunning] = useState(false)
  const [deliverable, setDeliverable] = useState('')
  const acRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const agents = user ? loadAgents(user.uid) : []

  // Pick up a queued dispatch from chat on mount.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY)
      if (raw) {
        const { task: t, leadId } = JSON.parse(raw)
        sessionStorage.removeItem(PENDING_KEY)
        if (t) start(t, leadId)
      }
    } catch {
      /* ignore */
    }
    return () => acRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll as agents talk.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [events, deliverable])

  function pickLead(list: Agent[], leadId?: string): Agent {
    if (leadId) {
      const m = list.find((a) => a.id === leadId)
      if (m) return m
    }
    return list.find((a) => /lead|coordinat|manage|bob/i.test(a.role + a.name)) ?? list[0]
  }

  async function start(t: string, leadId?: string) {
    if (!user || !t.trim()) return
    const list = loadAgents(user.uid)
    if (!list.length) return
    // Honor @mentions for the lead; otherwise the natural lead.
    const mentioned = mentionedAgents(user.uid, t)
    const lead = mentioned[0] ?? pickLead(list, leadId)
    const cleanTask = t.replace(/@[a-z0-9_-]+/gi, '').trim() || t

    setTask(cleanTask)
    setEvents([])
    setDeliverable('')
    setRunning(true)
    const ac = new AbortController()
    acRef.current = ac

    setEvents([
      {
        id: 'sys',
        agentId: 'system',
        name: 'AskAI',
        emoji: '✨',
        color: '#888',
        role: 'system',
        phase: 'system',
        text: mentioned.length
          ? `Routing to ${mentioned.map((a) => a.name).join(', ')}…`
          : `The team is reading your message…`,
        done: true,
      },
    ])

    try {
      const { deliverable: d } = await runTeam({
        task: cleanTask,
        agents: list,
        lead,
        preselected: mentioned.length ? mentioned : undefined,
        signal: ac.signal,
        onEvent: (ev) =>
          setEvents((prev) => {
            const i = prev.findIndex((p) => p.id === ev.id)
            if (i === -1) return [...prev, ev]
            const next = [...prev]
            next[i] = ev
            return next
          }),
      })
      setDeliverable(d)
    } catch {
      /* surfaced inline */
    } finally {
      setRunning(false)
    }
  }

  function stop() {
    acRef.current?.abort()
    setRunning(false)
  }

  async function openAsProject() {
    if (!user) return
    const files = parseCodeFiles(deliverable)
    if (!files.length) return
    const id = crypto.randomUUID()
    const fileMap: Record<string, string> = {}
    for (const f of files) fileMap[f.path] = f.code
    if (!fileMap['/index.html']) {
      const first = Object.keys(fileMap)[0]
      if (first) fileMap['/index.html'] = fileMap[first]
    }
    await saveProject(user.uid, {
      id,
      name: task.slice(0, 40) || 'Team build',
      description: 'Built by the agent team',
      template: 'static',
      files: fileMap,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    navigate(`/project/${id}`)
  }

  const hasCode = useMemo(() => parseCodeFiles(deliverable).length > 0, [deliverable])

  const phaseLabel: Record<string, string> = {
    plan: 'is planning',
    work: 'is working',
    final: 'is wrapping up',
    system: '',
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        {!sidebarOpen && (
          <button onClick={toggleSidebar} className="glass pressable rounded-xl p-2" title="Open sidebar">
            <PanelLeftOpen size={18} />
          </button>
        )}
        <button onClick={() => navigate('/')} className="pressable flex items-center gap-1.5 rounded-xl px-2 py-2 text-sm text-muted hover:text-ink">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2 font-bold">
          <Users size={18} className="text-accent" /> Agent Team
        </div>
        <div className="ml-auto flex -space-x-2">
          {agents.slice(0, 6).map((a) => (
            <span
              key={a.id}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[rgb(var(--surface))] text-sm"
              style={{ background: a.color + '33' }}
              title={`${a.name} · ${a.role}`}
            >
              {a.emoji}
            </span>
          ))}
        </div>
        {running && (
          <button onClick={stop} className="pressable ml-2 flex items-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-surface">
            <Square size={12} fill="currentColor" /> Stop
          </button>
        )}
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl">
          {events.length === 0 && !running && (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center">
              <Logo size={52} glow variant="icon" />
              <h2 className="mt-4 text-xl font-extrabold">The team room</h2>
              <p className="mt-1 max-w-md text-sm text-muted">
                Give your agents a goal and watch them plan, split the work, talk to each other, and deliver a finished result.
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {events.map((ev) => (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-4 flex gap-3 ${ev.phase === 'system' ? 'justify-center' : ''}`}
              >
                {ev.phase === 'system' ? (
                  <div className="rounded-full bg-white/5 px-3 py-1 text-xs text-muted">{ev.text}</div>
                ) : (
                  <>
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg"
                      style={{ background: ev.color + '2a', boxShadow: `0 0 0 1px ${ev.color}55` }}
                    >
                      {ev.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2 text-sm">
                        <span className="font-bold" style={{ color: ev.color }}>
                          {ev.name}
                        </span>
                        <span className="text-xs text-muted">{ev.role}</span>
                        {!ev.done && <Loader2 size={12} className="animate-spin text-muted" />}
                        {ev.phase === 'final' && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">
                            Deliverable
                          </span>
                        )}
                      </div>
                      <div className="glass rounded-2xl rounded-tl-sm p-3 text-sm leading-relaxed">
                        {ev.text ? <Markdown>{ev.text}</Markdown> : <span className="text-muted">…</span>}
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {hasCode && !running && (
            <div className="mb-6 flex justify-center">
              <button
                onClick={openAsProject}
                className="accent-gradient-bg pressable flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-lg"
              >
                <FolderGit2 size={16} /> Open the build in Projects
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-white/10 p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <div className="composer-shell flex flex-1 items-end gap-2 rounded-[24px] border border-white/[0.12] p-2 pl-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (!running && draft.trim()) {
                    start(draft)
                    setDraft('')
                  }
                }
              }}
              rows={1}
              placeholder="Give the team a goal — e.g. build a portfolio site for my dad…"
              className="no-scrollbar max-h-32 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted"
            />
            <button
              onClick={() => {
                if (!running && draft.trim()) {
                  start(draft)
                  setDraft('')
                }
              }}
              disabled={running || !draft.trim()}
              className="accent-gradient-bg pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
            >
              {running ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
            </button>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          <Sparkles size={11} className="mr-1 inline" /> Tip: @mention an agent to make them the lead. Manage agents in Settings.
        </p>
      </div>
    </div>
  )
}
