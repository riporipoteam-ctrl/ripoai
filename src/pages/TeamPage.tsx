import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Users,
  Loader2,
  Sparkles,
  FolderGit2,
  Square,
  PanelLeftOpen,
  Send,
  Plus,
  Trash2,
  MessageSquare,
} from 'lucide-react'
import { useStore } from '../store'
import { loadAgents, mentionedAgents, type Agent } from '../lib/agents'
import { runTeam, type TeamEvent } from '../lib/agentTeam'
import {
  loadTeamSessions,
  getTeamSession,
  saveTeamSession,
  deleteTeamSession,
  type TeamSession,
} from '../lib/teamSessions'
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

const uid4 = () => Math.random().toString(36).slice(2)

export default function TeamPage() {
  const navigate = useNavigate()
  const { user, sidebarOpen, toggleSidebar } = useStore()
  const [draft, setDraft] = useState('')
  const [events, setEvents] = useState<TeamEvent[]>([])
  const [running, setRunning] = useState(false)
  const [deliverable, setDeliverable] = useState('')
  const [sessionId, setSessionId] = useState(() => uid4())
  const [history, setHistory] = useState<TeamSession[]>([])
  const acRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Refs mirror state so persist() sees fresh values inside async runs.
  const eventsRef = useRef<TeamEvent[]>([])
  const deliverableRef = useRef('')

  const agents = user ? loadAgents(user.uid) : []

  useEffect(() => {
    if (user) setHistory(loadTeamSessions(user.uid))
  }, [user])

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

  function setEventsTracked(updater: (prev: TeamEvent[]) => TeamEvent[]) {
    setEvents((prev) => {
      const next = updater(prev)
      eventsRef.current = next
      return next
    })
  }

  function persist() {
    if (!user) return
    const evs = eventsRef.current
    if (!evs.some((e) => e.phase === 'user')) return
    const firstUser = evs.find((e) => e.phase === 'user')
    const session: TeamSession = {
      id: sessionId,
      title: (firstUser?.text ?? 'Team chat').slice(0, 60),
      events: evs,
      deliverable: deliverableRef.current,
      createdAt: history.find((s) => s.id === sessionId)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }
    saveTeamSession(user.uid, session)
    setHistory(loadTeamSessions(user.uid))
  }

  /** Conversation context for follow-up turns: prior asks + last deliverable. */
  function buildContext(evs: TeamEvent[], lastDeliverable: string): string | undefined {
    const userTurns = evs.filter((e) => e.phase === 'user').map((e) => `- ${e.text.slice(0, 280)}`)
    if (!userTurns.length) return undefined
    const parts = [`Previous requests:\n${userTurns.join('\n')}`]
    if (lastDeliverable.trim())
      parts.push(`The team's latest deliverable:\n${lastDeliverable.slice(0, 6000)}`)
    return parts.join('\n\n')
  }

  async function start(t: string, leadId?: string) {
    if (!user || !t.trim() || running) return
    const list = loadAgents(user.uid)
    if (!list.length) return
    // Honor @mentions for the lead; otherwise the natural lead.
    const mentioned = mentionedAgents(user.uid, t)
    const lead = mentioned[0] ?? pickLead(list, leadId)
    const cleanTask = t.replace(/@[a-z0-9_-]+/gi, '').trim() || t

    const context = buildContext(eventsRef.current, deliverableRef.current)

    setRunning(true)
    const ac = new AbortController()
    acRef.current = ac

    setEventsTracked((prev) => [
      ...prev,
      {
        id: uid4(),
        agentId: 'user',
        name: 'You',
        emoji: '🫵',
        color: '#888',
        role: 'user',
        phase: 'user',
        text: cleanTask,
        done: true,
      },
      {
        id: 'sys-' + uid4(),
        agentId: 'system',
        name: 'AskAI',
        emoji: '✨',
        color: '#888',
        role: 'system',
        phase: 'system',
        text: mentioned.length
          ? `Routing to ${mentioned.map((a) => a.name).join(', ')}…`
          : context
            ? `The team is picking up where they left off…`
            : `The team is reading your message…`,
        done: true,
      },
    ])

    try {
      const { deliverable: d } = await runTeam({
        task: cleanTask,
        agents: list,
        lead,
        context,
        preselected: mentioned.length ? mentioned : undefined,
        signal: ac.signal,
        onEvent: (ev) =>
          setEventsTracked((prev) => {
            const i = prev.findIndex((p) => p.id === ev.id)
            if (i === -1) return [...prev, ev]
            const next = [...prev]
            next[i] = ev
            return next
          }),
      })
      if (d) {
        setDeliverable(d)
        deliverableRef.current = d
      }
    } catch {
      /* surfaced inline */
    } finally {
      setRunning(false)
      persist()
    }
  }

  function stop() {
    acRef.current?.abort()
    setRunning(false)
    persist()
  }

  function newSession() {
    acRef.current?.abort()
    setRunning(false)
    setEventsTracked(() => [])
    setDeliverable('')
    deliverableRef.current = ''
    setSessionId(uid4())
  }

  function openSession(s: TeamSession) {
    acRef.current?.abort()
    setRunning(false)
    setSessionId(s.id)
    setEventsTracked(() => s.events)
    setDeliverable(s.deliverable)
    deliverableRef.current = s.deliverable
  }

  function removeSession(id: string) {
    if (!user) return
    deleteTeamSession(user.uid, id)
    setHistory(loadTeamSessions(user.uid))
    if (id === sessionId) newSession()
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
    const firstUser = events.find((e) => e.phase === 'user')
    await saveProject(user.uid, {
      id,
      name: (firstUser?.text ?? 'Team build').slice(0, 40),
      description: 'Built by the agent team',
      template: 'static',
      files: fileMap,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    navigate(`/project/${id}`)
  }

  const hasCode = useMemo(() => parseCodeFiles(deliverable).length > 0, [deliverable])

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
        <div className="flex items-center gap-2 font-display font-bold">
          <Users size={18} className="text-accent" /> Agent Team
        </div>
        <div className="ml-auto flex -space-x-2">
          {agents.slice(0, 8).map((a) => (
            <button
              key={a.id}
              onClick={() => setDraft((d) => (d.includes(`@${a.name}`) ? d : `@${a.name} ${d}`))}
              className="pressable flex h-7 w-7 items-center justify-center rounded-full border-2 border-[rgb(var(--surface))] text-sm transition hover:z-10 hover:scale-110"
              style={{ background: a.color + '33' }}
              title={`Message ${a.name} (${a.role}) directly`}
            >
              {a.emoji}
            </button>
          ))}
        </div>
        {events.length > 0 && !running && (
          <button
            onClick={newSession}
            className="pressable ml-2 flex items-center gap-1.5 rounded-xl border border-[rgb(var(--ink)/0.1)] px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
            title="New team chat"
          >
            <Plus size={13} /> New
          </button>
        )}
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
            <div className="flex h-full flex-col items-center justify-center py-12 text-center">
              <Logo size={52} glow variant="icon" />
              <h2 className="mt-4 font-display text-xl font-bold">The team room</h2>
              <p className="mt-1 max-w-md text-sm text-muted">
                Give your agents a goal and watch them plan, split the work, talk to each other, and deliver a finished result. Conversations are saved — follow up anytime.
              </p>

              {history.length > 0 && (
                <div className="mt-8 w-full max-w-md text-left">
                  <div className="sidebar-section-label mb-2 px-1 text-xs font-bold uppercase text-muted">
                    Recent team chats
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {history.slice(0, 6).map((s) => (
                      <div key={s.id} className="group flex items-center gap-1">
                        <button
                          onClick={() => openSession(s)}
                          className="glass lift-card pressable flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left"
                        >
                          <MessageSquare size={15} className="shrink-0 text-accent" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{s.title}</span>
                            <span className="block text-[11px] text-muted">
                              {new Date(s.updatedAt).toLocaleDateString()} · {s.events.filter((e) => e.phase === 'user').length} message{s.events.filter((e) => e.phase === 'user').length === 1 ? '' : 's'}
                            </span>
                          </span>
                        </button>
                        <button
                          onClick={() => removeSession(s.id)}
                          className="pressable shrink-0 rounded-xl p-2 text-muted opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <AnimatePresence initial={false}>
            {events.map((ev) => (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-4 flex gap-3 ${ev.phase === 'system' ? 'justify-center' : ''} ${ev.phase === 'user' ? 'justify-end' : ''}`}
              >
                {ev.phase === 'system' ? (
                  <div className="rounded-full bg-white/5 px-3 py-1 text-xs text-muted">{ev.text}</div>
                ) : ev.phase === 'user' ? (
                  <div className="user-bubble max-w-[82%] whitespace-pre-wrap rounded-[22px] rounded-tr-md bg-gradient-to-br from-[rgb(var(--accent))] to-[rgb(var(--accent)/0.82)] px-4 py-2.5 text-sm font-medium text-[rgb(var(--accent-ink))] shadow-[0_8px_22px_-12px_rgb(var(--ink)/0.5)]">
                    {ev.text}
                  </div>
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
              placeholder={
                events.length
                  ? 'Follow up — e.g. make it darker, add a pricing page…'
                  : 'Give the team a goal — e.g. build a portfolio site for my dad…'
              }
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
          <Sparkles size={11} className="mr-1 inline" /> Tip: @mention an agent to make them the lead. Chats save automatically.
        </p>
      </div>
    </div>
  )
}
