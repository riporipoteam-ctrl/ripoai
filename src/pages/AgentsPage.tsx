// Agents home — a Nebula-style command center for the user's AI agents, themed
// to the neutral ChatGPT palette.
//
// Layout (top → bottom):
//  1. Header ("Agents") with a notification bell.
//  2. "What should your agents do?" composer — submitting routes the goal to the
//     Chief-of-Staff orchestrator, which picks the right agent (and suggests who
//     else could help) then hands off to a 1-on-1 chat.
//  3. Chief of Staff intro card — the AskAI orchestrator + a team-setup wizard
//     (starter packs) so a new user can staff up in one tap.
//  4. Segmented "My stuff" / "Activity" — recent threads + the real run history.
//  5. Agent roster — every agent with a Ready-to-work pill; "+ New agent" opens
//     a template marketplace / describe-your-own picker.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  ArrowUp,
  Sparkles,
  Plus,
  ChevronRight,
  Loader2,
  MessageSquare,
  Activity as ActivityIcon,
  Users,
  Check,
  X,
  Search,
  Wand2,
  Trash2,
} from 'lucide-react'
import { useStore } from '../store'
import {
  loadAgents,
  getAgent,
  aiDesignAgent,
  upsertAgent,
  statusMeta,
  setPendingAgentPrompt,
  type Agent,
} from '../lib/agents'
import { setInvitedScope, inviteAgent, clearInvited } from '../lib/chatParticipants'
import {
  ensureStartingTeam,
  chiefOfStaffIntro,
  routeGoal,
  handoffToAgent,
  delegationSuggestions,
  hireFromTemplate,
  applyStarterPack,
  scheduleFromGoal,
  STARTER_PACKS,
  CHIEF,
} from '../lib/orchestrator'
import { untilLabel } from '../lib/jobs'
import {
  loadActivity,
  logActivity,
  activityKindLabel,
  activityWhen,
  clearActivity,
  ACTIVITY_CHANGED,
  type ActivityEvent,
} from '../lib/agentActivity'
import {
  AGENT_TEMPLATES,
  AGENT_CATEGORIES,
  templatesByCategory,
  type AgentTemplate,
  type AgentCategory,
} from '../lib/agentTemplates'
import { haptic } from '../lib/native'
import AgentsOnboarding, { hasOnboarded } from '../components/AgentsOnboarding'
import '../styles/agents.css'

/** Relative timestamp ("just now", "3h ago", "2d ago"). */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ts).toLocaleDateString()
}

/** Avatar bubble shared by roster + thread cards — a Nebula-style emoji mark on
 *  a soft gradient of the agent's colour (no human-portrait photos). */
function AgentBubble({ agent, size = 40 }: { agent: Pick<Agent, 'avatar' | 'emoji' | 'color' | 'name'>; size?: number }) {
  const px = `${size}px`
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[14px]"
      style={{
        width: px,
        height: px,
        fontSize: size * 0.45,
        background: `linear-gradient(135deg, ${agent.color}45, ${agent.color}14)`,
        boxShadow: `0 0 0 1px ${agent.color}38, inset 0 1px 0 ${agent.color}22`,
      }}
    >
      {agent.emoji}
    </span>
  )
}

/** "Ready to work" status pill. */
function StatusPill({ status }: { status?: Agent['status'] }) {
  const meta = statusMeta(status)
  return (
    <span className="ag-status" style={{ background: meta.color + '1f', color: meta.color }}>
      <span className="ag-status-dot" style={{ background: meta.color }} />
      {meta.label}
    </span>
  )
}

interface Thread {
  id: string
  agent: Agent
  title: string
  snippet: string
  updatedAt: number
}

type FeedTab = 'mine' | 'activity'

export default function AgentsPage() {
  const navigate = useNavigate()
  const uid = useStore((s) => s.user?.uid)
  const chats = useStore((s) => s.chats)
  const [agents, setAgents] = useState<Agent[]>([])
  const [draft, setDraft] = useState('')
  const [routing, setRouting] = useState<string | null>(null)
  const [suggested, setSuggested] = useState<Agent[]>([])
  const [feedTab, setFeedTab] = useState<FeedTab>('mine')
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [rosterQuery, setRosterQuery] = useState('')
  const [onboarding, setOnboarding] = useState(false)

  const intro = useMemo(() => chiefOfStaffIntro(), [])

  // Load the roster + activity; first-time visitors get the onboarding flow
  // (which hires their tailored team) instead of a pre-seeded roster.
  useEffect(() => {
    if (!uid) return
    ensureStartingTeam(uid)
    setAgents(loadAgents(uid))
    setActivity(loadActivity(uid))
    if (!hasOnboarded(uid)) setOnboarding(true)
  }, [uid])

  // Keep the roster + activity fresh when they change elsewhere in the app.
  useEffect(() => {
    if (!uid) return
    const onAgents = () => setAgents(loadAgents(uid))
    const onActivity = () => setActivity(loadActivity(uid))
    window.addEventListener('askai-agents-changed', onAgents)
    window.addEventListener(ACTIVITY_CHANGED, onActivity)
    return () => {
      window.removeEventListener('askai-agents-changed', onAgents)
      window.removeEventListener(ACTIVITY_CHANGED, onActivity)
    }
  }, [uid])

  // Live delegation suggestions as the user types a goal.
  useEffect(() => {
    if (!uid || draft.trim().length < 4) {
      setSuggested([])
      return
    }
    const route = routeGoal(uid, draft.trim())
    setSuggested(route ? delegationSuggestions(uid, draft.trim(), route.agent.id) : [])
  }, [draft, uid])

  // "My stuff": recent agent work threads, derived from real agent-tagged chats.
  const threads = useMemo<Thread[]>(() => {
    if (!agents.length) return []
    const byId = new Map(agents.map((a) => [a.id, a]))
    const byName = new Map(agents.map((a) => [a.name.toLowerCase(), a]))
    return chats
      .filter((c) => c.agentId || c.agentName)
      .map((c) => {
        const agent =
          (c.agentId && byId.get(c.agentId)) ||
          (c.agentName && byName.get(c.agentName.toLowerCase())) ||
          null
        if (!agent) return null
        const title = c.title?.trim() || `Chat with ${agent.name}`
        const snippet = agent.role
          ? `${agent.name} worked on this as your ${agent.role.toLowerCase()}`
          : `${agent.name} worked on this`
        return { id: c.id, agent, title, snippet, updatedAt: c.updatedAt } satisfies Thread
      })
      .filter((t): t is Thread => !!t)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8)
  }, [chats, agents])

  /** Route a goal through the Chief of Staff and hand off to the chosen agent. */
  function submitGoal(prefill?: string, forceAgent?: Agent) {
    const text = (prefill ?? draft).trim()
    if (!uid || !text || routing) return
    haptic('medium')

    // If the goal asks for something LATER ("tomorrow", "every morning"…),
    // schedule it as a job for the right agent instead of running it now.
    if (!forceAgent) {
      const scheduled = scheduleFromGoal(uid, text)
      if (scheduled) {
        setDraft('')
        setSuggested([])
        setRouting(`Scheduled for ${scheduled.agent.name} · ${untilLabel(scheduled.job.nextRunAt)}`)
        try {
          window.dispatchEvent(
            new CustomEvent('askai-notify', {
              detail: { kind: 'job', title: 'Job scheduled', body: `${scheduled.job.title} · ${untilLabel(scheduled.job.nextRunAt)}`, to: '/jobs' },
            }),
          )
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          setRouting(null)
          navigate('/jobs')
        }, 800)
        return
      }
    }

    // Everything goes to ONE general AskAI-led room (like Nebula). AskAI (Chief
    // of Staff) is always the lead who responds first; the routed specialist(s)
    // — or the agent whose "could also help" chip was tapped — are pulled INTO
    // that same thread for AskAI to delegate to. No more one-chat-per-agent.
    const route = routeGoal(uid, text)
    const lead = getAgent(uid, 'bob') ?? route?.agent ?? forceAgent
    if (!lead) return
    const specialists = (forceAgent ? [forceAgent] : [route?.agent, ...(route?.also ?? [])]).filter(
      (a): a is Agent => !!a && a.id !== lead.id,
    )
    setRouting(specialists.length ? `AskAI is bringing in ${specialists.map((s) => s.name).join(', ')}…` : 'AskAI is on it…')
    logActivity(uid, lead.id, lead.name, 'goal', text.length > 70 ? text.slice(0, 67) + '…' : text, {
      detail: specialists.length ? `Delegating to ${specialists.map((s) => s.role).join(', ')}` : undefined,
    })
    // Scope invites to the lead (AskAI) — matches InviteAgents in the chat so
    // the picked specialists survive into the room and the lead delegates.
    setInvitedScope(lead.id)
    clearInvited()
    specialists.forEach(inviteAgent)
    handoffToAgent(lead)

    setDraft('')
    setSuggested([])
    // Stash the goal so the new chat AUTO-SENDS it once AskAI is applied as the
    // lead (ChatView consumes this only after the agent handoff lands, so the
    // reply is agent-led and delegates). A fresh chat each time — no piling into
    // one old thread.
    setPendingAgentPrompt(text)
    setTimeout(() => {
      navigate('/chat')
      setRouting(null)
    }, 420)
  }

  /** Apply a starter pack (team-setup wizard). */
  function staffUp(packId: string) {
    if (!uid) return
    const pack = STARTER_PACKS.find((p) => p.id === packId)
    if (!pack) return
    haptic('medium')
    applyStarterPack(uid, pack)
    setAgents(loadAgents(uid))
  }

  /** Create an agent from a template, then open its detail page. */
  function createFromTemplate(t: AgentTemplate) {
    if (!uid) return
    haptic('medium')
    const agent = hireFromTemplate(uid, t)
    setAgents(loadAgents(uid))
    setPickerOpen(false)
    navigate(`/agent/${agent.id}`)
  }

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
  const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }

  return (
    <div className="ag-page nb-page mx-auto h-full w-full max-w-2xl overflow-y-auto px-4 pt-5 sm:pt-6">
      {/* 1. Header / hero */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="nebula-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            Your <span className="nb-grad-text">agents</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            A team of AI specialists, ready to take on whatever you throw at them.
          </p>
        </div>
        <button
          className="glass pressable nb-pop flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:text-accent"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell size={18} />
        </button>
      </div>

      {/* 2. Composer — "What should your agents do?" */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="composer-shell glass relative rounded-[24px] p-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submitGoal()
            }
          }}
          rows={2}
          placeholder="What should your agents do?"
          className="no-scrollbar max-h-[140px] w-full resize-none bg-transparent px-3 py-2 text-[0.975rem] text-ink outline-none placeholder:text-muted"
        />
        <div className="flex items-center gap-1.5 px-1">
          <span className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-muted">
            <Sparkles size={14} className="text-accent" /> Auto-routed
          </span>
          <div className="ml-auto">
            <button
              onClick={() => submitGoal()}
              disabled={!draft.trim() || !!routing}
              className="pressable accent-gradient-bg flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-30"
              title="Send to your agents"
              aria-label="Send"
            >
              {routing ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={20} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </motion.div>
      {routing && (
        <p className="mt-2 flex items-center gap-1.5 px-1 text-xs font-medium text-accent">
          <Sparkles size={12} /> {routing}
        </p>
      )}

      {/* Delegation suggestions */}
      {!routing && suggested.length > 0 && (
        <div className="mt-2 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Could also help</span>
          <div className="nb-stagger mt-1.5 flex flex-wrap gap-1.5">
            {suggested.map((s) => (
              <button
                key={s.id}
                onClick={() => submitGoal(undefined, s)}
                className="ag-chip pressable gap-1.5"
                title={`Hand this to ${s.name}`}
              >
                <span className="h-2 w-2 rounded-full animate-pulse-dot" style={{ background: s.color }} />
                {s.name} · {s.role}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Chief of Staff intro card + team-setup wizard */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass-strong mt-5 overflow-hidden rounded-[24px]"
      >
        <div className="flex items-start gap-3 px-4 pb-3 pt-4">
          <span
            className="nb-breathe flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
            style={{
              background: `linear-gradient(135deg, ${CHIEF.color}3a, ${CHIEF.color}12)`,
              boxShadow: `0 0 0 1px ${CHIEF.color}38, inset 0 1px 0 ${CHIEF.color}22`,
            }}
          >
            {intro.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-ink">{intro.name}</span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: CHIEF.color + '1f', color: CHIEF.color }}
              >
                {intro.role}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-ink">{intro.headline}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted">{intro.body}</p>
          </div>
        </div>
        <div className="border-t border-line px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
            <Users size={12} /> Set up a team
          </div>
          <div className="nb-stagger -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
            {STARTER_PACKS.map((p) => (
              <button
                key={p.id}
                onClick={() => staffUp(p.id)}
                className="ag-card pressable w-[200px] shrink-0 rounded-2xl border border-line bg-card p-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{p.emoji}</span>
                  <span className="text-sm font-bold text-ink">{p.label}</span>
                </div>
                <p className="mt-1 text-xs leading-snug text-muted">{p.blurb}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                  <Plus size={11} /> Hire team
                </span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* 4. Feed — My stuff / Activity */}
      <div className="mb-2.5 mt-7 flex items-center justify-between px-1">
        <div className="ag-seg">
          {(
            [
              ['mine', 'My stuff'],
              ['activity', 'Activity'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              data-active={feedTab === id}
              onClick={() => setFeedTab(id)}
              className="ag-seg-btn pressable"
            >
              {feedTab === id && <motion.span layoutId="ag-feed-pill" className="ag-seg-pill" />}
              <span className="ag-seg-label">{label}</span>
            </button>
          ))}
        </div>
        {feedTab === 'activity' && activity.length > 0 && (
          <button
            onClick={() => uid && clearActivity(uid)}
            className="pressable flex items-center gap-1 text-xs text-muted hover:text-ink"
          >
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      {feedTab === 'mine' ? (
        threads.length ? (
          <motion.div variants={container} initial="hidden" animate="show" className="nb-stagger flex flex-col gap-2">
            {threads.map((t) => (
              <motion.button
                key={t.id}
                variants={item}
                onClick={() => navigate(`/c/${t.id}`)}
                className="glass ag-card pressable flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left"
              >
                <AgentBubble agent={t.agent} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.agent.color }} />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {t.agent.role || t.agent.name}
                    </span>
                  </span>
                  <span className="block truncate text-sm font-semibold text-ink">{t.title}</span>
                  <span className="block truncate text-xs text-muted">{t.snippet}</span>
                </span>
                <span className="shrink-0 text-[11px] text-muted">{relativeTime(t.updatedAt)}</span>
              </motion.button>
            ))}
          </motion.div>
        ) : (
          <EmptyFeed
            icon={<MessageSquare size={22} className="text-muted" />}
            title="No agent work yet"
            body="Give your agents a goal above and their threads will show up here."
          />
        )
      ) : activity.length ? (
        <div className="ag-timeline flex flex-col gap-3">
          {activity.slice(0, 30).map((e) => (
            <div key={e.id} className="relative">
              <span className="ag-timeline-node" />
              <button
                onClick={() => e.href && navigate(e.href)}
                disabled={!e.href}
                className={`block w-full text-left ${e.href ? 'pressable' : 'cursor-default'}`}
              >
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {e.agentName} · {activityKindLabel(e.kind)}
                  <span className="ml-auto normal-case tracking-normal">{activityWhen(e.at)}</span>
                </span>
                <span className="mt-0.5 block text-sm font-medium text-ink">{e.title}</span>
                {e.detail && <span className="block text-xs text-muted">{e.detail}</span>}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyFeed
          icon={<ActivityIcon size={22} className="text-muted" />}
          title="No activity yet"
          body="As your agents pick up goals and run jobs, you'll see a live timeline here."
        />
      )}

      {/* 5. Agent roster */}
      <div className="mb-2 mt-7 flex items-center justify-between px-1">
        <h2 className="nebula-display text-lg font-bold text-ink">Your roster</h2>
        <button
          onClick={() => {
            haptic('light')
            setPickerOpen(true)
          }}
          className="pressable accent-gradient-bg flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold"
        >
          <Plus size={14} strokeWidth={2.5} /> New agent
        </button>
      </div>
      {agents.length > 4 && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-line bg-card px-3 py-2">
          <Search size={15} className="text-muted" />
          <input
            value={rosterQuery}
            onChange={(e) => setRosterQuery(e.target.value)}
            placeholder="Search your agents…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted"
          />
        </div>
      )}
      <motion.div variants={container} initial="hidden" animate="show" className="nb-stagger flex flex-col gap-2">
        {agents
          .filter((a) =>
            `${a.name} ${a.role}`.toLowerCase().includes(rosterQuery.trim().toLowerCase()),
          )
          .map((a) => (
          <motion.button
            key={a.id}
            variants={item}
            onClick={() => navigate(`/agent/${a.id}`)}
            className="glass ag-card pressable flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left"
          >
            <AgentBubble agent={a} size={42} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="nebula-display truncate font-bold text-ink">{a.name}</span>
                <StatusPill status={a.status} />
              </span>
              <span className="block truncate text-sm text-muted">{a.role}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
          </motion.button>
        ))}
      </motion.div>

      <NewAgentSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPickTemplate={createFromTemplate}
        onDescribe={async (desc) => {
          if (!uid) return
          const agent = await aiDesignAgent(desc)
          upsertAgent(uid, agent)
          logActivity(uid, agent.id, agent.name, 'created', `${agent.name} joined as your ${agent.role}`, {
            detail: 'Designed from your description',
          })
          setAgents(loadAgents(uid))
          setPickerOpen(false)
          navigate(`/agent/${agent.id}`)
        }}
      />

      <AnimatePresence>
        {onboarding && uid && (
          <AgentsOnboarding
            uid={uid}
            onClose={() => {
              setOnboarding(false)
              setAgents(loadAgents(uid))
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function EmptyFeed({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="glass nb-in flex flex-col items-center gap-2 rounded-2xl px-4 py-9 text-center">
      <span className="nb-float flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
        {icon}
      </span>
      <p className="nebula-display text-sm font-bold text-ink">{title}</p>
      <p className="max-w-xs text-xs text-muted">{body}</p>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * New-agent picker — a bottom sheet with two paths:
 *   • Browse the template marketplace (filter by category, search).
 *   • Describe-your-own → aiDesignAgent.
 * ────────────────────────────────────────────────────────────────────────── */
function NewAgentSheet({
  open,
  onClose,
  onPickTemplate,
  onDescribe,
}: {
  open: boolean
  onClose: () => void
  onPickTemplate: (t: AgentTemplate) => void
  onDescribe: (description: string) => Promise<void>
}) {
  const [mode, setMode] = useState<'browse' | 'describe'>('browse')
  const [category, setCategory] = useState<AgentCategory | null>(null)
  const [query, setQuery] = useState('')
  const [desc, setDesc] = useState('')
  const [designing, setDesigning] = useState(false)

  useEffect(() => {
    if (!open) return
    setMode('browse')
    setCategory(null)
    setQuery('')
    setDesc('')
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const results = useMemo(() => {
    const base = templatesByCategory(category ?? undefined)
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter((t) =>
      `${t.name} ${t.role} ${t.tagline} ${t.skills.join(' ')}`.toLowerCase().includes(q),
    )
  }, [category, query])

  async function design() {
    const text = desc.trim()
    if (!text || designing) return
    setDesigning(true)
    try {
      await onDescribe(text)
    } finally {
      setDesigning(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className="glass-strong relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] sm:rounded-[28px]"
          >
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-[rgb(var(--muted)/0.4)] sm:hidden" />
            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 pt-3">
              <h2 className="nebula-display text-lg font-bold text-ink">New agent</h2>
              <button
                onClick={onClose}
                className="pressable flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-card hover:text-ink"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Mode tabs */}
            <div className="px-5">
              <div className="ag-seg w-full">
                {(
                  [
                    ['browse', 'From template'],
                    ['describe', 'Describe your own'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    data-active={mode === id}
                    onClick={() => setMode(id)}
                    className="ag-seg-btn pressable flex-1"
                  >
                    {mode === id && <motion.span layoutId="ag-mode-pill" className="ag-seg-pill" />}
                    <span className="ag-seg-label">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {mode === 'browse' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                {/* Search + categories */}
                <div className="px-5 pt-3">
                  <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2.5">
                    <Search size={16} className="shrink-0 text-muted" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search agents…"
                      className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                    />
                  </div>
                  <div className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar">
                    <CatChip label="All" active={category === null} onClick={() => setCategory(null)} />
                    {AGENT_CATEGORIES.map((c) => (
                      <CatChip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
                    ))}
                  </div>
                </div>
                {/* Template grid */}
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
                  <div className="ag-tpl-grid nb-stagger">
                    {results.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onPickTemplate(t)}
                        className="ag-card pressable rounded-2xl border border-line bg-card p-3.5 text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-lg"
                            style={{
                              background: `linear-gradient(135deg, ${t.color}3a, ${t.color}12)`,
                              boxShadow: `0 0 0 1px ${t.color}38, inset 0 1px 0 ${t.color}22`,
                            }}
                          >
                            {t.emoji}
                          </span>
                          <div className="min-w-0">
                            <div className="nebula-display truncate text-sm font-bold text-ink">{t.name}</div>
                            <div className="truncate text-xs text-muted">{t.role}</div>
                          </div>
                        </div>
                        <p className="mt-2 text-xs leading-snug text-muted">{t.tagline}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.skills.slice(0, 3).map((s) => (
                            <span
                              key={s}
                              className="rounded-full border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                  {results.length === 0 && (
                    <p className="py-10 text-center text-sm text-muted">No matching agents.</p>
                  )}
                  <p className="pt-3 text-center text-[11px] text-muted">
                    {AGENT_TEMPLATES.length} prebuilt agents · tap one to hire
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-4">
                <p className="text-sm text-muted">
                  Describe the agent you want and AskAI will design its persona, prompt and a portrait.
                </p>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={5}
                  placeholder="e.g. A friendly fitness coach who builds weekly workout plans and keeps me accountable."
                  className="mt-3 w-full resize-none rounded-2xl border border-line bg-card p-3.5 text-sm leading-relaxed text-ink outline-none placeholder:text-muted focus:border-accent/60"
                />
                <button
                  onClick={design}
                  disabled={!desc.trim() || designing}
                  className="accent-gradient-bg pressable mt-4 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold disabled:opacity-40"
                >
                  {designing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Designing…
                    </>
                  ) : (
                    <>
                      <Wand2 size={16} /> Create agent
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className={`pressable shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active ? 'accent-gradient-bg border-transparent' : 'border-line text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}
