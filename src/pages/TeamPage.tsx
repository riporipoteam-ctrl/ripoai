import { useEffect, useRef, useState, useMemo, type DragEvent } from 'react'
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
  ArrowUp,
  Plus,
  Trash2,
  MessageSquare,
  ImageIcon,
  Paperclip,
  FileText,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import { loadAgents, mentionedAgents, targetedAgent, ensureAgentAvatar, type Agent } from '../lib/agents'
import { runTeam, type TeamEvent } from '../lib/agentTeam'
import {
  loadTeamSessions,
  getTeamSession,
  saveTeamSession,
  deleteTeamSession,
  type TeamSession,
} from '../lib/teamSessions'
import { parseCodeFiles } from '../lib/parseCode'
import { saveProject, type Attachment } from '../lib/db'
import { fileToAttachment, MAX_IMAGES_PER_MESSAGE } from '../lib/files'
import { haptic } from '../lib/native'
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
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachBusy, setAttachBusy] = useState(false)
  const [attachErr, setAttachErr] = useState('')
  const [dragging, setDragging] = useState(false)
  const [events, setEvents] = useState<TeamEvent[]>([])
  const [running, setRunning] = useState(false)
  const [deliverable, setDeliverable] = useState('')
  const [sessionId, setSessionId] = useState(() => uid4())
  const [history, setHistory] = useState<TeamSession[]>([])
  const acRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const imgInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  // Refs mirror state so persist() sees fresh values inside async runs.
  const eventsRef = useRef<TeamEvent[]>([])
  const deliverableRef = useRef('')

  const [agents, setAgents] = useState<Agent[]>(() => (user ? loadAgents(user.uid) : []))

  useEffect(() => {
    if (user) {
      setHistory(loadTeamSessions(user.uid))
      setAgents(loadAgents(user.uid))
    }
  }, [user])

  // Lazily paint a real AI avatar for any agent that still only has an emoji, so
  // the team room (and its @mention picker) shows generated pictures, not emojis.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const uid = user.uid
    const missing = agents.filter((a) => !a.avatar)
    if (!missing.length) return
    ;(async () => {
      for (const a of missing) {
        const updated = await ensureAgentAvatar(uid, a)
        if (cancelled) return
        if (updated.avatar) setAgents(loadAgents(uid))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, agents])

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

  /** Fold attached files/images into the task text the agents receive. The team
   * agents run on text models, so file text is inlined and images are noted by
   * name (the user bubble still shows the real thumbnails). */
  function withAttachments(task: string, atts: Attachment[]): string {
    if (!atts.length) return task
    const parts: string[] = [task]
    const files = atts.filter((a) => a.kind === 'file' && a.text?.trim())
    const images = atts.filter((a) => a.kind === 'image')
    for (const f of files) {
      parts.push(`\n\nAttached file "${f.name}":\n${f.text!.slice(0, 8000)}`)
    }
    if (images.length) {
      parts.push(`\n\n(The user also attached ${images.length} image${images.length === 1 ? '' : 's'}: ${images.map((i) => i.name).join(', ')}.)`)
    }
    return parts.join('')
  }

  async function start(t: string, leadId?: string, atts: Attachment[] = []) {
    if (!user || (!t.trim() && !atts.length) || running) return
    const list = loadAgents(user.uid)
    if (!list.length) return
    // Honor @mentions for the lead; otherwise, if the message clearly addresses
    // ONE agent by name (e.g. "Leon, do X" or "hi Leon"), route to just them so
    // other agents don't butt in. Falls through to the normal lead/router.
    const mentioned = mentionedAgents(user.uid, t)
    const directlyAddressed = mentioned.length ? null : targetedAgent(user.uid, t)
    // The single set of responders we force, if the user targeted someone.
    const targeted = mentioned.length ? mentioned : directlyAddressed ? [directlyAddressed] : []
    const lead = targeted[0] ?? pickLead(list, leadId)
    const cleanTask = t.replace(/@[a-z0-9_-]+/gi, '').trim() || t
    const taskForTeam = withAttachments(cleanTask, atts)

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
        attachments: atts.length ? atts : undefined,
      },
      {
        id: 'sys-' + uid4(),
        agentId: 'system',
        name: 'AskAI',
        emoji: '✨',
        color: '#888',
        role: 'system',
        phase: 'system',
        text: targeted.length
          ? `Routing to ${targeted.map((a) => a.name).join(', ')}…`
          : context
            ? `The team is picking up where they left off…`
            : `The team is reading your message…`,
        done: true,
      },
    ])

    try {
      const { deliverable: d } = await runTeam({
        task: taskForTeam,
        agents: list,
        lead,
        context,
        preselected: targeted.length ? targeted : undefined,
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

  function autosize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setAttachErr('')
    setAttachBusy(true)
    try {
      const next: Attachment[] = []
      let imagesSoFar = attachments.filter((a) => a.kind === 'image').length
      let dropped = 0
      for (const f of Array.from(files)) {
        const att = await fileToAttachment(f)
        if (att.kind === 'image') {
          if (imagesSoFar >= MAX_IMAGES_PER_MESSAGE) {
            dropped++
            continue
          }
          imagesSoFar++
        }
        next.push(att)
      }
      setAttachments((a) => [...a, ...next])
      if (dropped > 0)
        setAttachErr(`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message — extra ${dropped === 1 ? 'image was' : 'images were'} skipped.`)
    } catch (e: any) {
      setAttachErr(e?.message ?? 'Could not read that file.')
    } finally {
      setAttachBusy(false)
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    void handleFiles(e.dataTransfer.files)
  }

  /** Send the current draft + attachments to the team and clear the composer. */
  function sendDraft() {
    if (running || attachBusy) return
    if (!draft.trim() && !attachments.length) return
    haptic('medium')
    start(draft, undefined, attachments)
    setDraft('')
    setAttachments([])
    if (taRef.current) taRef.current.style.height = 'auto'
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
              className="pressable flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-[rgb(var(--surface))] text-sm transition hover:z-10 hover:scale-110"
              style={{ background: a.color + '33' }}
              title={`Message ${a.name} (${a.role}) directly`}
            >
              {a.avatar ? (
                <img src={a.avatar} alt={a.name} className="h-full w-full rounded-full object-cover" />
              ) : (
                a.emoji
              )}
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
                  <div className="glass rounded-full px-3.5 py-1.5 text-xs font-medium text-muted">{ev.text}</div>
                ) : ev.phase === 'user' ? (
                  <div className="flex max-w-[82%] flex-col items-end gap-2">
                    {!!ev.attachments?.length && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {ev.attachments.map((a, i) =>
                          a.kind === 'image' && a.url ? (
                            <img
                              key={i}
                              src={a.url}
                              alt={a.name}
                              className="h-24 w-24 rounded-2xl border border-white/15 object-cover"
                            />
                          ) : (
                            <div key={i} className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-xs">
                              <FileText size={14} className="text-accent" />
                              <span className="max-w-[160px] truncate">{a.name}</span>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                    {ev.text && (
                      <div className="user-bubble whitespace-pre-wrap rounded-[22px] rounded-tr-md bg-gradient-to-br from-[rgb(var(--accent))] to-[rgb(var(--accent)/0.82)] px-4 py-2.5 text-sm font-medium text-[rgb(var(--accent-ink))] shadow-[0_8px_22px_-12px_rgb(var(--ink)/0.5)]">
                        {ev.text}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <span
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg shadow-[0_4px_12px_-6px_rgb(var(--ink)/0.5)]"
                      style={{ background: ev.color + '2a', boxShadow: `0 0 0 1px ${ev.color}55` }}
                    >
                      {ev.avatar ? (
                        <img src={ev.avatar} alt={ev.name} className="h-full w-full object-cover" />
                      ) : (
                        ev.emoji
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-2 text-sm">
                        <span className="font-display font-bold tracking-tight" style={{ color: ev.color }}>
                          {ev.name}
                        </span>
                        <span className="rounded-full border border-[rgb(var(--ink)/0.08)] bg-[rgb(var(--ink)/0.04)] px-2 py-0.5 text-[10px] font-semibold text-muted">
                          {ev.role}
                        </span>
                        {!ev.done && <Loader2 size={12} className="animate-spin text-muted" />}
                        {ev.phase === 'final' && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">
                            Deliverable
                          </span>
                        )}
                      </div>
                      <div
                        className={`glass-strong rounded-[20px] rounded-tl-md p-3.5 text-sm leading-relaxed ${
                          ev.phase === 'final' ? 'ring-1 ring-accent/30' : ''
                        }`}
                      >
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
        <div className="mx-auto w-full max-w-3xl">
          {attachErr && <p className="mb-2 px-2 text-xs text-red-400">{attachErr}</p>}

          {/* Attachment previews */}
          {!!attachments.length && (
            <motion.div layout className="mb-2 flex flex-wrap gap-2 px-1">
              {attachments.map((a, i) => (
                <motion.div
                  key={i}
                  layout
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  className="glass relative flex items-center gap-2 rounded-2xl p-1.5 pr-7"
                >
                  {a.kind === 'image' && a.url ? (
                    <img src={a.url} alt={a.name} className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
                      <FileText size={16} className="text-accent" />
                      <span className="max-w-[140px] truncate">{a.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                    className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
                  >
                    <X size={12} />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}

          <motion.div
            layout
            className={`composer-shell floating-composer relative z-20 rounded-[28px] border border-white/[0.12] p-2 backdrop-blur-2xl ${dragging ? 'composer-drop-hot' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
            }}
            onDrop={handleDrop}
          >
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                autosize()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendDraft()
                }
              }}
              rows={1}
              placeholder={
                events.length
                  ? 'Follow up — e.g. make it darker, add a pricing page…'
                  : 'Give the team a goal — e.g. build a portfolio site for my dad…'
              }
              className="no-scrollbar max-h-[160px] w-full resize-none bg-transparent px-3 py-2 text-[0.975rem] outline-none placeholder:text-muted"
            />

            <div className="flex items-center gap-1.5 px-1">
              <button
                onClick={() => imgInput.current?.click()}
                disabled={attachBusy}
                className="pressable flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-white/10 hover:text-ink disabled:opacity-40"
                title="Upload image"
              >
                {attachBusy ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
              </button>
              <button
                onClick={() => fileInput.current?.click()}
                disabled={attachBusy}
                className="pressable flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-white/10 hover:text-ink disabled:opacity-40"
                title="Upload file"
              >
                <Paperclip size={18} />
              </button>

              <div className="ml-auto flex items-center gap-1.5">
                {running ? (
                  <button
                    onClick={stop}
                    className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-ink text-surface"
                    title="Stop"
                  >
                    <Square size={15} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={sendDraft}
                    disabled={attachBusy || (!draft.trim() && !attachments.length)}
                    className="pressable accent-gradient-bg flex h-10 w-10 items-center justify-center rounded-full text-white shadow-[0_8px_20px_-8px_rgb(var(--ink)/0.6)] disabled:opacity-30"
                    title="Send"
                  >
                    <ArrowUp size={20} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          <Sparkles size={11} className="mr-1 inline" /> Tip: @mention an agent to make them the lead. Chats save automatically.
        </p>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imgInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css,.pdf,text/*"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
