// Apps — a gallery of the websites/apps your AGENTS BUILD for you.
//
// (Service integrations that used to live here moved to Settings.) Each card is
// an AgentApp: a small React + TypeScript app an agent generated, with a live
// preview and its source. A prominent composer at the top lets you ask an agent
// to build a new website/app/component; it reuses the same streaming codegen
// pipeline ProjectsView uses (see lib/agentApps.ts → buildAppFiles). Tapping a
// card opens it in AppPreview (live preview + code, edit, ask-to-change,
// open-in-new-tab, download).

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  ArrowUp,
  Square,
  LayoutGrid,
  Globe,
  Boxes,
  Component as ComponentIcon,
  Wand2,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useStore } from '../store'
import { haptic, isNative } from '../lib/native'
import {
  loadAgentApps,
  onAgentAppsChanged,
  newApp,
  saveApp,
  deleteApp,
  buildAppFiles,
  titleFor,
  guessKind,
  type AgentApp,
  type AgentAppKind,
} from '../lib/agentApps'
import { loadAgents, type Agent } from '../lib/agents'
import AppPreview from '../components/AppPreview'
import '../styles/apps.css'

const KIND_META: Record<AgentAppKind, { label: string; icon: LucideIcon; tint: string }> = {
  website: { label: 'Website', icon: Globe, tint: '#6366f1' },
  app: { label: 'App', icon: Boxes, tint: '#10b981' },
  component: { label: 'Component', icon: ComponentIcon, tint: '#f59e0b' },
}

const SUGGESTIONS = [
  'A SaaS landing page for an AI note-taking app',
  'A pomodoro timer app with start, pause and reset',
  'A pricing table component with three tiers',
]

function relativeTime(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return days < 7 ? `${days}d ago` : new Date(ts).toLocaleDateString()
}

export default function AppsPage() {
  const uid = useStore((s) => s.user?.uid)
  const [apps, setApps] = useState<AgentApp[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [building, setBuilding] = useState(false)

  useEffect(() => {
    if (!uid) return
    setApps(loadAgentApps(uid))
    setAgents(loadAgents(uid))
    return onAgentAppsChanged(() => setApps(loadAgentApps(uid)))
  }, [uid])

  const openApp = useMemo(() => apps.find((a) => a.id === openId) ?? null, [apps, openId])

  async function build() {
    const text = prompt.trim()
    if (!text || building || !uid) return
    haptic('medium')
    setBuilding(true)
    setPrompt('')

    // Pick a builder agent — prefer one whose role hints at building.
    const builder =
      agents.find((a) => /engineer|developer|builder|design|code|web/i.test(`${a.role} ${a.name}`)) ??
      agents[0]
    const agentId = builder?.id ?? 'askai'
    const agentName = builder
      ? `${builder.name}${builder.role ? ` (${builder.role})` : ''}`
      : 'AskAI Builder'
    const kind = guessKind(text)

    // Create the card immediately (empty scaffold) so the user sees progress,
    // then fill it in once the agent finishes.
    const draft = newApp({
      title: text.length > 40 ? text.slice(0, 40) + '…' : text,
      description: text,
      agentId,
      agentName,
      kind,
      prompt: text,
    })
    saveApp(uid, draft)

    try {
      const [{ files }, title] = await Promise.all([buildAppFiles(text), titleFor(text)])
      saveApp(uid, {
        ...draft,
        title: title || draft.title,
        files,
      })
    } catch {
      // Keep the scaffold card; the user can retry via "ask the agent to change".
    } finally {
      setBuilding(false)
    }
  }

  function remove(id: string) {
    if (!uid) return
    haptic('light')
    deleteApp(uid, id)
  }

  // ── Detail view ──
  if (openApp && uid) {
    return (
      <AppPreview
        app={openApp}
        uid={uid}
        onBack={() => setOpenId(null)}
        onChange={() => setApps(loadAgentApps(uid))}
      />
    )
  }

  // ── Gallery ──
  return (
    <div className={`mx-auto w-full max-w-4xl px-4 py-6 ${isNative ? 'pb-32' : 'pb-12'}`}>
      {/* Header */}
      <div className="mb-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="accent-gradient-bg flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm">
            <LayoutGrid size={18} />
          </span>
          <h1 className="text-2xl font-bold text-ink">Apps</h1>
          {apps.length > 0 && (
            <span className="ml-auto rounded-full bg-accent/15 px-2.5 py-1 text-xs font-bold text-accent">
              {apps.length} built
            </span>
          )}
        </div>
        <p className="text-sm text-muted">
          Websites and apps your agents build for you — each one runs live with editable source.
        </p>
      </div>

      {/* Composer */}
      <div className="glass mb-6 rounded-2xl border border-line/60 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <Wand2 size={16} className="text-accent" />
          Have an agent build me a website or app
        </div>
        <div className="glass-strong flex items-end gap-2 rounded-xl border border-line/60 p-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                build()
              }
            }}
            rows={2}
            placeholder="Describe what you want built — e.g. a landing page for my coffee shop…"
            className="no-scrollbar max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted"
          />
          {building ? (
            <button
              disabled
              className="pressable flex h-11 w-11 items-center justify-center rounded-full bg-ink text-bg opacity-70"
              aria-label="Building"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={build}
              disabled={!prompt.trim()}
              className="accent-gradient-bg pressable flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-40"
              aria-label="Build"
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
        {building && (
          <div className="mt-2 flex items-center gap-2 text-xs font-medium text-muted">
            <span className="bg-gradient-to-r from-accent via-ink to-accent bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">
              An agent is building your app…
            </span>
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.2s]" />
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.4s]" />
            </span>
          </div>
        )}
        {!building && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setPrompt(s)}
                className="pressable rounded-full border border-line/60 px-2.5 py-1 text-xs text-muted hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Gallery grid: 1 col mobile, 2 col ≥sm */}
      {apps.length === 0 ? (
        <div className="glass rounded-2xl border border-line/60 px-4 py-12 text-center">
          <Sparkles size={28} className="mx-auto text-accent" />
          <p className="mt-3 font-semibold text-ink">No apps yet</p>
          <p className="mt-1 text-sm text-muted">
            Ask an agent above to build your first website or app.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {apps.map((a, i) => (
              <AppCard
                key={a.id}
                app={a}
                index={i}
                onOpen={() => {
                  haptic('select')
                  setOpenId(a.id)
                }}
                onDelete={() => remove(a.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function AppCard({
  app,
  index,
  onOpen,
  onDelete,
}: {
  app: AgentApp
  index: number
  onOpen: () => void
  onDelete: () => void
}) {
  const meta = KIND_META[app.kind]
  const KindIcon = meta.icon
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{
        delay: Math.min(index * 0.04, 0.3),
        type: 'spring',
        stiffness: 260,
        damping: 26,
      }}
      className="glass group flex flex-col overflow-hidden rounded-2xl border border-line/60"
    >
      {/* Thumbnail: a styled banner derived from the app kind/title. */}
      <button
        onClick={onOpen}
        className="pressable apps-thumb relative flex h-32 w-full items-center justify-center overflow-hidden text-left"
        style={{ ['--thumb' as string]: meta.tint }}
        aria-label={`Open ${app.title}`}
      >
        <span className="apps-thumb-mark text-4xl font-black opacity-90">
          {app.title.trim().charAt(0).toUpperCase() || 'A'}
        </span>
        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur">
          <KindIcon size={11} /> {meta.label}
        </span>
      </button>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col p-3.5">
        <button onClick={onOpen} className="min-w-0 text-left">
          <h3 className="truncate font-semibold text-ink">{app.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">
            {app.description || 'No description'}
          </p>
        </button>

        <div className="mt-auto flex items-center gap-2 pt-3">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <Wand2 size={12} className="shrink-0 text-accent" />
            <span className="truncate">{app.agentName}</span>
          </span>
          <span className="ml-auto shrink-0 text-[11px] text-muted">
            {relativeTime(app.updatedAt)}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onOpen}
            className="accent-gradient-bg pressable flex min-h-[44px] flex-1 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
          >
            Open
          </button>
          <button
            onClick={onDelete}
            className="pressable flex min-h-[44px] w-11 items-center justify-center rounded-xl border border-line/60 text-muted hover:text-red-400"
            aria-label={`Delete ${app.title}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
