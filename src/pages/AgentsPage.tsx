// Agents home — a Nebula-style command center for the user's AI agents.
//
// Layout (top → bottom):
//  1. Header ("Agents") with a notification bell.
//  2. "What should your agents do?" composer — submitting routes the goal to the
//     Chief-of-Staff orchestrator, which picks the right agent and hands off to a
//     1-on-1 chat.
//  3. Chief of Staff intro card — the AskAI orchestrator that set up the team.
//  4. Threads / "My stuff" — recent agent work derived from the user's chats.
//  5. Agent roster — every agent, tapping one opens /agent/{id}. Plus a
//     "+ New agent" action.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bell,
  ArrowUp,
  Paperclip,
  Sparkles,
  Plus,
  ChevronRight,
  Loader2,
  MessageSquare,
} from 'lucide-react'
import { useStore } from '../store'
import {
  loadAgents,
  newAgent,
  aiDesignAgent,
  upsertAgent,
  type Agent,
} from '../lib/agents'
import {
  ensureStartingTeam,
  chiefOfStaffIntro,
  routeGoal,
  handoffToAgent,
  CHIEF,
} from '../lib/orchestrator'
import { haptic } from '../lib/native'

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

/** Avatar bubble shared by roster + thread cards (image with emoji fallback). */
function AgentBubble({ agent, size = 40 }: { agent: Agent; size?: number }) {
  const px = `${size}px`
  return agent.avatar ? (
    <img
      src={agent.avatar}
      alt={agent.name}
      className="shrink-0 rounded-xl object-cover"
      style={{ width: px, height: px, boxShadow: `0 0 0 1px ${agent.color}55` }}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl"
      style={{
        width: px,
        height: px,
        fontSize: size * 0.45,
        background: agent.color + '22',
        boxShadow: `0 0 0 1px ${agent.color}33`,
      }}
    >
      {agent.emoji}
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

export default function AgentsPage() {
  const navigate = useNavigate()
  const uid = useStore((s) => s.user?.uid)
  const chats = useStore((s) => s.chats)
  const [agents, setAgents] = useState<Agent[]>([])
  const [draft, setDraft] = useState('')
  const [routing, setRouting] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const intro = useMemo(() => chiefOfStaffIntro(), [])

  // Seed the starting team (idempotent) then load the roster.
  useEffect(() => {
    if (!uid) return
    ensureStartingTeam(uid)
    setAgents(loadAgents(uid))
  }, [uid])

  // Keep the roster fresh if agents change elsewhere in the app.
  useEffect(() => {
    if (!uid) return
    const onChange = () => setAgents(loadAgents(uid))
    window.addEventListener('askai-agents-changed', onChange)
    return () => window.removeEventListener('askai-agents-changed', onChange)
  }, [uid])

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
        return {
          id: c.id,
          agent,
          title,
          snippet,
          updatedAt: c.updatedAt,
        } satisfies Thread
      })
      .filter((t): t is Thread => !!t)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8)
  }, [chats, agents])

  /** Route a goal through the Chief of Staff and hand off to the chosen agent. */
  function submitGoal() {
    const text = draft.trim()
    if (!uid || !text || routing) return
    haptic('medium')
    const route = routeGoal(uid, text)
    if (!route) return
    setRouting(route.reason)
    // Hand the goal to a 1-on-1 chat with the chosen agent.
    handoffToAgent(route.agent)
    setDraft('')
    // Brief beat so the user sees the routing decision, then navigate.
    setTimeout(() => navigate('/'), 450)
  }

  /** Create a new agent and open its detail page. */
  async function createAgent() {
    if (!uid || creating) return
    setCreating(true)
    haptic('light')
    try {
      let agent: Agent
      if (draft.trim().length > 8) {
        // If the composer has a description, design a tailored agent from it.
        agent = await aiDesignAgent(draft.trim())
        setDraft('')
      } else {
        agent = newAgent()
        agent.name = 'New Agent'
        agent.role = 'Specialist'
        agent.personality = 'A capable, friendly AI specialist ready to help.'
      }
      upsertAgent(uid, agent)
      setAgents(loadAgents(uid))
      navigate(`/agent/${agent.id}`)
    } finally {
      setCreating(false)
    }
  }

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05 } },
  }
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0 },
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5 sm:pt-6">
      {/* 1. Header */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Agents</h1>
        <button
          className="glass pressable flex h-10 w-10 items-center justify-center rounded-full text-muted hover:text-ink"
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
        className="composer-shell glass relative rounded-[24px] border border-white/[0.12] p-2 backdrop-blur-2xl"
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
          className="no-scrollbar max-h-[140px] w-full resize-none bg-transparent px-3 py-2 text-[0.975rem] outline-none placeholder:text-muted"
        />
        <div className="flex items-center gap-1.5 px-1">
          <button
            className="pressable flex h-9 items-center gap-1.5 rounded-full border border-white/12 px-3 text-xs font-semibold text-muted hover:text-ink"
            title="Model"
            type="button"
          >
            <Sparkles size={14} className="text-accent" /> Auto
          </button>
          <button
            className="pressable flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-white/10 hover:text-ink"
            title="Attach"
            type="button"
          >
            <Paperclip size={18} />
          </button>
          <div className="ml-auto">
            <button
              onClick={submitGoal}
              disabled={!draft.trim() || !!routing}
              className="pressable accent-gradient-bg flex h-10 w-10 items-center justify-center rounded-full text-white shadow-[0_8px_20px_-8px_rgb(var(--ink)/0.6)] disabled:opacity-30"
              title="Send to your agents"
              aria-label="Send"
            >
              {routing ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={20} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </motion.div>
      {routing && (
        <p className="mt-2 flex items-center gap-1.5 px-1 text-xs text-accent">
          <Sparkles size={12} /> {routing}
        </p>
      )}

      {/* 3. Chief of Staff intro card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass-strong mt-5 overflow-hidden rounded-[24px]"
      >
        <div
          className="flex items-start gap-3 px-4 pb-3 pt-4"
          style={{ background: `linear-gradient(160deg, ${CHIEF.color}1f, transparent 70%)` }}
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
            style={{ background: CHIEF.color + '2a', boxShadow: `0 0 0 1px ${CHIEF.color}55` }}
          >
            {intro.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-ink">{intro.name}</span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: CHIEF.color + '22', color: CHIEF.color }}
              >
                {intro.role}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-ink">{intro.headline}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted">{intro.body}</p>
          </div>
        </div>
        <div className="border-t border-white/8 px-4 py-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">
            Your starting team
          </div>
          <div className="flex flex-col gap-2">
            {intro.team.map((role) => (
              <div key={role.agentId} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base"
                  style={{ background: role.color + '22', boxShadow: `0 0 0 1px ${role.color}33` }}
                >
                  {role.emoji}
                </span>
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-ink">{role.label}</span>
                  <span className="block text-xs leading-snug text-muted">{role.blurb}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* 4. Threads / "My stuff" */}
      <div className="mb-2 mt-7 flex items-center justify-between px-1">
        <h2 className="text-base font-bold text-ink">My stuff</h2>
        <span className="text-xs text-muted">{threads.length ? 'Recent agent work' : ''}</span>
      </div>
      {threads.length ? (
        <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-2">
          {threads.map((t) => (
            <motion.button
              key={t.id}
              variants={item}
              onClick={() => navigate(`/c/${t.id}`)}
              className="glass lift-card pressable flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left"
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
        <div className="glass flex flex-col items-center gap-1.5 rounded-2xl px-4 py-8 text-center">
          <MessageSquare size={22} className="text-muted" />
          <p className="text-sm font-semibold text-ink">No agent work yet</p>
          <p className="max-w-xs text-xs text-muted">
            Give your agents a goal above and their threads will show up here.
          </p>
        </div>
      )}

      {/* 5. Agent roster */}
      <div className="mb-2 mt-7 flex items-center justify-between px-1">
        <h2 className="text-base font-bold text-ink">Your agents</h2>
        <button
          onClick={createAgent}
          disabled={creating}
          className="pressable flex items-center gap-1 rounded-full border border-white/12 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-white/5 disabled:opacity-50"
        >
          {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} New agent
        </button>
      </div>
      <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-2">
        {agents.map((a) => (
          <motion.button
            key={a.id}
            variants={item}
            onClick={() => navigate(`/agent/${a.id}`)}
            className="glass lift-card pressable flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left"
          >
            <AgentBubble agent={a} size={42} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{a.name}</span>
              <span className="block truncate text-sm text-muted">{a.role}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}
