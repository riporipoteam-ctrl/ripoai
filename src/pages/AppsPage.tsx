// Apps / Integrations — connect external services (GitHub, Slack, Gmail,
// Notion …) that your agents can act on, mirroring Nebula's Apps tab.
//
// Connections here are SIMULATED (preview): real OAuth needs a backend this
// client-only build doesn't have, so "Connect (preview)" only records the link
// locally. Once connected, you can choose which agents may use the service —
// that integration↔agent wiring lives in lib/integrations.ts (we never mutate
// the agents.ts schema). See the `// TODO: real OAuth` seam in integrations.ts.

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Github,
  Slack,
  Mail,
  FileText,
  Calendar,
  Trello,
  Webhook,
  Plug,
  Check,
  Bot,
  ChevronDown,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useStore } from '../store'
import { loadAgents, type Agent } from '../lib/agents'
import {
  loadIntegrations,
  connect,
  disconnect,
  toggleAgent,
  onIntegrationsChanged,
  CATEGORY_LABEL,
  type Integration,
} from '../lib/integrations'
import { haptic, isNative } from '../lib/native'

/** Map the catalog's icon name to a lucide component. */
const ICONS: Record<string, LucideIcon> = {
  Github,
  Slack,
  Mail,
  FileText,
  Calendar,
  Trello,
  Webhook,
}

function relativeTime(ts?: number): string {
  if (!ts) return ''
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(ts).toLocaleDateString()
}

export default function AppsPage() {
  const uid = useStore((s) => s.user?.uid)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return
    setIntegrations(loadIntegrations(uid))
    setAgents(loadAgents(uid))
    return onIntegrationsChanged(() => setIntegrations(loadIntegrations(uid)))
  }, [uid])

  const connectedTotal = useMemo(
    () => integrations.filter((i) => i.connected).length,
    [integrations],
  )

  function handleConnect(id: string) {
    if (!uid) return
    haptic('medium')
    connect(uid, id)
    setExpanded(id)
  }

  function handleDisconnect(id: string) {
    if (!uid) return
    haptic('light')
    disconnect(uid, id)
    setExpanded((e) => (e === id ? null : e))
  }

  function handleToggleAgent(id: string, agentId: string) {
    if (!uid) return
    haptic('select')
    toggleAgent(uid, id, agentId)
  }

  return (
    <div
      className={`mx-auto w-full max-w-2xl px-4 py-6 ${isNative ? 'pb-32' : 'pb-12'}`}
    >
      {/* Header */}
      <div className="mb-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="accent-gradient-bg flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm">
            <Plug size={18} />
          </span>
          <h1 className="text-2xl font-bold text-ink">Apps</h1>
          {connectedTotal > 0 && (
            <span className="ml-auto rounded-full bg-accent/15 px-2.5 py-1 text-xs font-bold text-accent">
              {connectedTotal} connected
            </span>
          )}
        </div>
        <p className="text-sm text-muted">
          Connect services so your agents can act on them — read your repos, send
          email, post to Slack and more.
        </p>
        {/* Honest preview disclaimer */}
        <div className="glass mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs text-muted">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent" />
          <span>
            <span className="font-semibold text-ink">Preview connections.</span>{' '}
            Real OAuth needs a backend that isn't wired up yet, so connecting here
            simulates the link locally — no external account is actually accessed.
          </span>
        </div>
      </div>

      {/* Grid: 1 col mobile, 2 col ≥sm */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {integrations.map((i, idx) => (
          <IntegrationCard
            key={i.id}
            integration={i}
            agents={agents}
            index={idx}
            expanded={expanded === i.id}
            onToggleExpanded={() =>
              setExpanded((e) => (e === i.id ? null : i.id))
            }
            onConnect={() => handleConnect(i.id)}
            onDisconnect={() => handleDisconnect(i.id)}
            onToggleAgent={(agentId) => handleToggleAgent(i.id, agentId)}
          />
        ))}
      </div>
    </div>
  )
}

function IntegrationCard({
  integration: i,
  agents,
  index,
  expanded,
  onToggleExpanded,
  onConnect,
  onDisconnect,
  onToggleAgent,
}: {
  integration: Integration
  agents: Agent[]
  index: number
  expanded: boolean
  onToggleExpanded: () => void
  onConnect: () => void
  onDisconnect: () => void
  onToggleAgent: (agentId: string) => void
}) {
  const Icon = ICONS[i.icon] ?? Plug

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), type: 'spring', stiffness: 260, damping: 26 }}
      whileHover={{ y: -2 }}
      className="glass flex flex-col rounded-2xl border border-line/50 p-4"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: i.color + '22', boxShadow: `inset 0 0 0 1px ${i.color}33` }}
        >
          <Icon size={20} style={{ color: i.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-ink">{i.label}</h3>
            {i.connected && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-500">
                <Check size={10} strokeWidth={3} /> On
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">{i.description}</p>
          <span className="mt-1 inline-block rounded-md bg-ink/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {CATEGORY_LABEL[i.category]}
          </span>
        </div>
      </div>

      {/* Scopes */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {i.scopes.map((s) => (
          <span
            key={s}
            className="rounded-full border border-line/60 px-2 py-0.5 text-[11px] text-muted"
          >
            {s}
          </span>
        ))}
      </div>

      {/* Action row — 44px+ touch targets */}
      <div className="mt-4 flex items-center gap-2">
        {i.connected ? (
          <>
            <button
              onClick={onToggleExpanded}
              className="pressable flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-line/60 bg-card px-3 text-sm font-semibold text-ink"
            >
              <Bot size={15} className="text-accent" />
              {i.agentIds.length
                ? `${i.agentIds.length} agent${i.agentIds.length === 1 ? '' : 's'}`
                : 'Assign agents'}
              <ChevronDown
                size={15}
                className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
            <button
              onClick={onDisconnect}
              className="pressable flex min-h-[44px] items-center justify-center rounded-xl border border-line/60 px-3 text-sm font-semibold text-muted hover:text-red-400"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            className="accent-gradient-bg pressable flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold text-white shadow-sm"
          >
            <Plug size={15} /> Connect <span className="opacity-70">(preview)</span>
          </button>
        )}
      </div>

      {/* Per-agent wiring (only when connected & expanded) */}
      <AnimatePresence initial={false}>
        {i.connected && expanded && (
          <motion.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-line/50 pt-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <Sparkles size={12} className="text-accent" />
                Which agents can use {i.label}?
              </p>
              {agents.length === 0 ? (
                <p className="text-xs text-muted">No agents yet.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {agents.map((a) => {
                    const on = i.agentIds.includes(a.id)
                    // Read-only hint from the agent's own tools (agents.ts schema)
                    // — does this agent already have a tool this service powers?
                    const relevant = (a.tools ?? []).some(
                      (t) => t.enabled && i.agentTools.includes(t.id),
                    )
                    return (
                      <button
                        key={a.id}
                        onClick={() => onToggleAgent(a.id)}
                        className={`pressable flex min-h-[44px] items-center gap-2.5 rounded-xl px-2.5 text-left transition ${
                          on ? 'bg-accent/10' : 'hover:bg-ink/5'
                        }`}
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-base"
                          style={{ background: a.color + '22' }}
                        >
                          {a.avatar ? (
                            <img src={a.avatar} alt="" className="h-8 w-8 rounded-lg object-cover" />
                          ) : (
                            a.emoji
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {a.name}
                          </span>
                          <span className="block truncate text-[11px] text-muted">
                            {a.role}
                            {relevant && (
                              <span className="ml-1 text-accent">· has matching tool</span>
                            )}
                          </span>
                        </span>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                            on
                              ? 'border-accent bg-accent text-[rgb(var(--accent-ink))]'
                              : 'border-line'
                          }`}
                        >
                          {on && <Check size={13} strokeWidth={3} />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {i.connectedAt && (
                <p className="mt-2 text-[11px] text-muted">
                  Connected {relativeTime(i.connectedAt)} · preview
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
