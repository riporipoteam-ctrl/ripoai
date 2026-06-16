// Agent detail — the full Nebula-style profile for a single agent:
// header (avatar + edit badge, inline-editable name, "Ready to work" status,
// per-agent model selector), then a segmented Info / Tools / Triggers / Prompt
// editor with Visibility, Device, About, Goals, the tool catalog, triggers and
// the system prompt. Every edit persists immediately via upsertAgent.
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Globe,
  Image as ImageIcon,
  Code,
  FileText,
  Brain,
  Mail,
  Eye,
  Lock,
  Users,
  Cpu,
  Cloud,
  Server,
  Clock,
  Zap,
  AtSign,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import {
  getAgent,
  upsertAgent,
  ensureAgentAvatar,
  normalizeAgent,
  statusMeta,
  setPendingAgentChat,
  type Agent,
  type AgentTool,
  type AgentTrigger,
  type AgentGoal,
  type AgentVisibility,
  type AgentDevice,
} from '../lib/agents'
import { MODEL_LIST, type ModelTier } from '../lib/models'
import { haptic } from '../lib/native'
import { useStore } from '../store'
import { loadJobs, untilLabel, CADENCE_LABEL, type Job } from '../lib/jobs'
import {
  agentActivity,
  logActivity,
  activityKindLabel,
  activityWhen,
  ACTIVITY_CHANGED,
  type ActivityEvent,
} from '../lib/agentActivity'
import '../styles/agents-detail.css'
import '../styles/agents.css'

const uid4 = () => Math.random().toString(36).slice(2)

type Tab = 'info' | 'tools' | 'triggers' | 'prompt'
const TABS: { id: Tab; label: string }[] = [
  { id: 'info', label: 'Info' },
  { id: 'tools', label: 'Tools' },
  { id: 'triggers', label: 'Triggers' },
  { id: 'prompt', label: 'Prompt' },
]

// Map the tool catalog's icon names to real lucide components.
const TOOL_ICONS: Record<string, LucideIcon> = {
  Globe,
  Image: ImageIcon,
  Code,
  FileText,
  Brain,
  Mail,
}

const VISIBILITY: { id: AgentVisibility; label: string; desc: string; icon: LucideIcon }[] = [
  { id: 'private', label: 'Private', desc: 'Only you can see and use this agent.', icon: Lock },
  { id: 'workspace', label: 'Workspace', desc: 'Everyone in your workspace can use it.', icon: Users },
  { id: 'public', label: 'Public', desc: 'Anyone with the link can use it.', icon: Eye },
]

const DEVICES: { id: AgentDevice; label: string; desc: string; icon: LucideIcon }[] = [
  { id: 'automatic', label: 'Automatic', desc: 'AskAI picks where to run.', icon: Cpu },
  { id: 'cloud', label: 'Cloud', desc: 'Always run in the cloud.', icon: Cloud },
  { id: 'local', label: 'On device', desc: 'Run locally when possible.', icon: Server },
]

const TRIGGER_TYPES: { id: AgentTrigger['type']; label: string; icon: LucideIcon; cadence?: string }[] = [
  { id: 'schedule', label: 'Schedule', icon: Clock, cadence: 'daily 9am' },
  { id: 'event', label: 'Event', icon: Zap },
  { id: 'mention', label: 'Mention', icon: AtSign },
]

/** A polished toggle switch matching the app's accent system. */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        haptic('select')
        onChange(!on)
      }}
      className={`pressable relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? 'accent-gradient-bg' : 'bg-white/15'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

/** A compact bottom-sheet single-select used for the model / visibility / device
 *  dropdowns. Mirrors ModelSelector's portal + spring sheet pattern. */
function SheetSelect<T extends string>({
  open,
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  open: boolean
  title: string
  options: { id: T; label: string; desc?: string; icon?: LucideIcon; badge?: string }[]
  value: T
  onPick: (id: T) => void
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="glass-strong relative w-full max-w-lg rounded-t-[28px] p-3 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl sm:rounded-[28px]"
          >
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[rgb(var(--muted)/0.4)] sm:hidden" />
            <div className="px-2 pb-2 text-base font-bold">{title}</div>
            <div className="max-h-[68vh] space-y-1.5 overflow-y-auto">
              {options.map((o) => {
                const Icon = o.icon
                const selected = o.id === value
                return (
                  <button
                    key={o.id}
                    onClick={() => {
                      haptic('select')
                      onPick(o.id)
                      onClose()
                    }}
                    className={`pressable flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      selected ? 'border-accent/50 bg-accent/10' : 'border-white/10 hover:bg-white/5'
                    }`}
                  >
                    {Icon && (
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          selected ? 'accent-gradient-bg text-white' : 'bg-white/10 text-accent'
                        }`}
                      >
                        <Icon size={18} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{o.label}</span>
                        {o.badge && (
                          <span className="rounded-full bg-accent/15 px-1.5 py-px text-[9px] font-bold uppercase text-accent">
                            {o.badge}
                          </span>
                        )}
                      </span>
                      {o.desc && <span className="block truncate text-xs text-muted">{o.desc}</span>}
                    </span>
                    {selected && <Check size={18} className="shrink-0 text-accent" />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** A labeled pill that opens a SheetSelect. */
function SelectPill({
  label,
  value,
  icon: Icon,
  onClick,
}: {
  label: string
  value: string
  icon?: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="pressable glass flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
    >
      {Icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-accent">
          <Icon size={17} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="block truncate text-sm font-semibold text-ink">{value}</span>
      </span>
      <ChevronDown size={16} className="shrink-0 text-muted" />
    </button>
  )
}

export default function AgentDetailPage() {
  const navigate = useNavigate()
  const { agentId } = useParams()
  const uid = useStore((s) => s.user?.uid)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [tab, setTab] = useState<Tab>('info')

  // Editing state for the inline name pencil.
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  // Which bottom-sheet dropdown is open.
  const [sheet, setSheet] = useState<null | 'model' | 'visibility' | 'device' | 'trigger'>(null)

  const [regenning, setRegenning] = useState(false)
  const avatarFileRef = useRef<HTMLInputElement>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])

  useEffect(() => {
    if (uid && agentId) setAgent(getAgent(uid, agentId))
  }, [uid, agentId])

  // The agent's scheduled jobs + run history, refreshed when either changes.
  useEffect(() => {
    if (!uid || !agentId) return
    const refresh = () => {
      setJobs(loadJobs(uid).filter((j) => j.agentId === agentId))
      setActivity(agentActivity(uid, agentId))
    }
    refresh()
    window.addEventListener(ACTIVITY_CHANGED, refresh)
    return () => window.removeEventListener(ACTIVITY_CHANGED, refresh)
  }, [uid, agentId])

  // Lazily paint a real avatar if this agent still only has an emoji.
  useEffect(() => {
    if (!uid || !agent || agent.avatar) return
    let cancelled = false
    ensureAgentAvatar(uid, agent).then((updated) => {
      if (!cancelled && updated.avatar) setAgent(updated)
    })
    return () => {
      cancelled = true
    }
  }, [uid, agent])

  // Normalized view of the agent (fills Nebula defaults). Recomputed on change.
  const a = useMemo(() => (agent ? normalizeAgent(agent) : null), [agent])

  if (!agent || !a) return <div className="p-8 text-center text-muted">Agent not found.</div>

  const status = statusMeta(a.status)
  const currentModel = MODEL_LIST.find((m) => m.id === a.model) ?? null

  /** Persist a partial change immediately and keep local state in sync. */
  function patch(changes: Partial<Agent>) {
    if (!uid || !agent) return
    const next = { ...agent, ...changes }
    setAgent(next)
    upsertAgent(uid, next)
  }

  function saveName() {
    const v = nameDraft.trim()
    setEditingName(false)
    if (v && v !== a!.name) patch({ name: v })
  }

  async function regenerateAvatar() {
    if (!uid || regenning) return
    setRegenning(true)
    haptic('medium')
    try {
      const { generateImage } = await import('../lib/imagegen')
      const persona = (a!.personality || a!.about || '').replace(/\s+/g, ' ').slice(0, 200)
      const url = await generateImage(
        `A friendly, realistic professional portrait avatar of ${a!.name}, a ${
          a!.role || 'specialist'
        }. ${persona} Warm approachable expression, soft studio lighting, clean background, centered head-and-shoulders, high-quality avatar portrait.`,
        { w: 512, h: 512 },
      )
      patch({ avatar: url })
    } catch {
      /* keep the existing avatar/emoji on failure */
    } finally {
      setRegenning(false)
    }
  }

  function chatWithAgent() {
    haptic('medium')
    if (uid && agent) logActivity(uid, agent.id, agent.name, 'chat', `Started a chat with ${agent.name}`)
    setPendingAgentChat(agent!)
    navigate('/')
  }

  /** Upload a photo from the device as the agent's avatar. */
  function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => patch({ avatar: String(reader.result) })
    reader.readAsDataURL(f)
    e.target.value = ''
  }

  // ── Tools ──
  function toggleTool(id: string, enabled: boolean) {
    patch({ tools: a!.tools.map((t) => (t.id === id ? { ...t, enabled } : t)) })
  }

  function addCustomTool(label: string, description: string) {
    const name = label.trim()
    if (!name) return
    const tool: AgentTool = {
      id: 'custom_' + Math.random().toString(36).slice(2, 8),
      label: name,
      description: description.trim() || 'Custom capability',
      icon: 'Sparkles',
      enabled: true,
    }
    patch({ tools: [...a!.tools, tool] })
  }

  function removeTool(id: string) {
    patch({ tools: a!.tools.filter((t) => t.id !== id) })
  }

  // ── Triggers ──
  function addTrigger(type: AgentTrigger['type']) {
    const meta = TRIGGER_TYPES.find((t) => t.id === type)
    const trigger: AgentTrigger = {
      id: uid4(),
      type,
      label:
        type === 'schedule' ? 'Scheduled run' : type === 'event' ? 'On event' : 'When @mentioned',
      cadence: meta?.cadence,
      enabled: true,
    }
    patch({ triggers: [...a!.triggers, trigger] })
  }
  function updateTrigger(id: string, changes: Partial<AgentTrigger>) {
    patch({ triggers: a!.triggers.map((t) => (t.id === id ? { ...t, ...changes } : t)) })
  }
  function removeTrigger(id: string) {
    patch({ triggers: a!.triggers.filter((t) => t.id !== id) })
  }

  // ── Goals ──
  function addGoal(text: string) {
    const v = text.trim()
    if (!v) return
    const goal: AgentGoal = { id: uid4(), text: v, done: false }
    patch({ goals: [...a!.goals, goal] })
  }
  function toggleGoal(id: string) {
    patch({ goals: a!.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)) })
  }
  function removeGoal(id: string) {
    patch({ goals: a!.goals.filter((g) => g.id !== id) })
  }

  const visMeta = VISIBILITY.find((v) => v.id === a.visibility)!
  const devMeta = DEVICES.find((d) => d.id === a.device)!

  return (
    <div className="agent-detail mx-auto w-full max-w-2xl px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+7rem)]">
      {/* Header bar */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => navigate(-1)}
          className="pressable -ml-2 flex h-11 items-center gap-1 rounded-xl px-2 text-muted hover:text-ink"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="font-display text-base font-bold text-ink">Agent</span>
      </div>

      {/* Identity */}
      <div className="mt-2 flex flex-col items-center text-center">
        <div className="relative">
          {a.avatar ? (
            <img
              src={a.avatar}
              alt={a.name}
              className="h-24 w-24 rounded-3xl object-cover"
              style={{ boxShadow: `0 0 0 2px ${a.color}66, 0 18px 40px -18px ${a.color}` }}
            />
          ) : (
            <span
              className="flex h-24 w-24 items-center justify-center rounded-3xl text-5xl"
              style={{ background: a.color + '2a', boxShadow: `0 0 0 2px ${a.color}66` }}
            >
              {a.emoji}
            </span>
          )}
          <button
            onClick={regenerateAvatar}
            disabled={regenning}
            aria-label="Regenerate avatar with AI"
            title="Regenerate with AI"
            className="pressable accent-gradient-bg absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg ring-2 ring-[rgb(var(--surface))] disabled:opacity-70"
          >
            {regenning ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
          </button>
          <button
            onClick={() => avatarFileRef.current?.click()}
            aria-label="Upload photo"
            title="Upload a photo"
            className="pressable absolute -bottom-1 -left-1 flex h-9 w-9 items-center justify-center rounded-full bg-card text-ink shadow-lg ring-2 ring-[rgb(var(--surface))]"
          >
            <Upload size={15} />
          </button>
          <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarFile} />
        </div>

        {/* Name + inline edit pencil */}
        <div className="mt-3 flex items-center gap-1.5">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') setEditingName(false)
              }}
              className="w-48 rounded-xl border border-white/15 bg-white/5 px-3 py-1 text-center text-xl font-bold text-ink outline-none focus:border-accent/60"
            />
          ) : (
            <>
              <h1 className="text-xl font-bold text-ink">{a.name || 'Unnamed agent'}</h1>
              <button
                onClick={() => {
                  setNameDraft(a.name)
                  setEditingName(true)
                }}
                aria-label="Edit name"
                className="pressable rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-ink"
              >
                <Pencil size={15} />
              </button>
            </>
          )}
        </div>

        {/* Status line */}
        <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold" style={{ color: status.color }}>
          <span className="h-2 w-2 rounded-full" style={{ background: status.color }} />
          {status.label}
        </span>

        {/* Model selector pill */}
        <button
          onClick={() => setSheet('model')}
          className="pressable glass mt-3 flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold text-ink"
        >
          <Sparkles size={15} className="text-accent" />
          <span className="truncate">{currentModel ? currentModel.name : 'Default model'}</span>
          <ChevronDown size={15} className="text-muted" />
        </button>

        {/* Primary chat CTA */}
        <button
          onClick={chatWithAgent}
          className="accent-gradient-bg pressable mt-4 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-lg"
        >
          <MessageSquare size={17} /> Chat with {a.name || 'agent'}
        </button>
      </div>

      {/* Segmented tabs */}
      <div className="agent-seg mt-6 flex rounded-2xl bg-white/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pressable relative flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
              tab === t.id ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {tab === t.id && (
              <motion.span
                layoutId="agent-seg-active"
                className="glass-strong absolute inset-0 rounded-xl"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {tab === 'info' && (
              <div className="space-y-5">
                {/* Visibility + Device */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectPill
                    label="Visibility"
                    value={visMeta.label}
                    icon={visMeta.icon}
                    onClick={() => setSheet('visibility')}
                  />
                  <SelectPill
                    label="Device"
                    value={devMeta.label}
                    icon={devMeta.icon}
                    onClick={() => setSheet('device')}
                  />
                </div>

                {/* About */}
                <section>
                  <h2 className="mb-1.5 px-1 text-xs font-bold uppercase tracking-widest text-muted">About</h2>
                  <textarea
                    value={a.about}
                    onChange={(e) => patch({ about: e.target.value })}
                    rows={4}
                    placeholder="Describe what this agent does…"
                    className="w-full resize-y rounded-2xl border border-white/10 bg-white/5 p-3.5 text-sm leading-relaxed text-ink outline-none placeholder:text-muted focus:border-accent/50"
                  />
                </section>

                {/* Goals */}
                <GoalsSection
                  goals={a.goals}
                  onAdd={addGoal}
                  onToggle={toggleGoal}
                  onRemove={removeGoal}
                />

                {/* Scheduled jobs */}
                <ScheduledJobs jobs={jobs} onOpen={() => navigate('/jobs')} />

                {/* Activity / run history */}
                <ActivityTimeline activity={activity} onOpen={(href) => navigate(href)} />
              </div>
            )}

            {tab === 'tools' && (
              <div className="space-y-2">
                {a.tools.map((t) => (
                  <ToolRow
                    key={t.id}
                    tool={t}
                    onToggle={(v) => toggleTool(t.id, v)}
                    onRemove={t.id.startsWith('custom_') ? () => removeTool(t.id) : undefined}
                  />
                ))}
                <CustomToolAdder onAdd={addCustomTool} />
                <p className="px-1 pt-2 text-xs text-muted">
                  Tools let {a.name || 'this agent'} take real actions. Toggle the ones it should use, or add your own.
                </p>
              </div>
            )}

            {tab === 'triggers' && (
              <TriggersTab
                triggers={a.triggers}
                onAdd={() => setSheet('trigger')}
                onUpdate={updateTrigger}
                onRemove={removeTrigger}
              />
            )}

            {tab === 'prompt' && (
              <section>
                <h2 className="mb-1.5 px-1 text-xs font-bold uppercase tracking-widest text-muted">
                  System prompt
                </h2>
                <textarea
                  value={a.systemPrompt}
                  onChange={(e) => patch({ systemPrompt: e.target.value })}
                  rows={14}
                  placeholder="You are…"
                  className="w-full resize-y rounded-2xl border border-white/10 bg-white/5 p-3.5 font-mono text-[13px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-accent/50"
                />
                <p className="px-1 pt-2 text-xs text-muted">
                  This prompt shapes how the agent thinks and replies in every chat.
                </p>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dropdowns */}
      <SheetSelect<ModelTier>
        open={sheet === 'model'}
        title="Choose a model"
        value={(a.model as ModelTier) ?? ('' as ModelTier)}
        options={MODEL_LIST.map((m) => ({
          id: m.id,
          label: m.name,
          desc: m.tagline,
          icon: Sparkles,
          badge: m.badge,
        }))}
        onPick={(id) => patch({ model: id })}
        onClose={() => setSheet(null)}
      />
      <SheetSelect<AgentVisibility>
        open={sheet === 'visibility'}
        title="Visibility"
        value={a.visibility}
        options={VISIBILITY.map((v) => ({ id: v.id, label: v.label, desc: v.desc, icon: v.icon }))}
        onPick={(id) => patch({ visibility: id })}
        onClose={() => setSheet(null)}
      />
      <SheetSelect<AgentDevice>
        open={sheet === 'device'}
        title="Device"
        value={a.device}
        options={DEVICES.map((d) => ({ id: d.id, label: d.label, desc: d.desc, icon: d.icon }))}
        onPick={(id) => patch({ device: id })}
        onClose={() => setSheet(null)}
      />
      <SheetSelect<AgentTrigger['type']>
        open={sheet === 'trigger'}
        title="Add a trigger"
        value={'' as AgentTrigger['type']}
        options={TRIGGER_TYPES.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))}
        onPick={(id) => addTrigger(id)}
        onClose={() => setSheet(null)}
      />
    </div>
  )
}

function ToolRow({ tool, onToggle, onRemove }: { tool: AgentTool; onToggle: (v: boolean) => void; onRemove?: () => void }) {
  const Icon = (tool.icon && TOOL_ICONS[tool.icon]) || Sparkles
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-3.5">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          tool.enabled ? 'accent-gradient-bg text-white' : 'bg-white/10 text-muted'
        }`}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">{tool.label}</div>
        {tool.description && <div className="truncate text-xs text-muted">{tool.description}</div>}
      </div>
      {onRemove && (
        <button onClick={onRemove} className="pressable text-muted hover:text-red-500" aria-label="Remove tool">
          <Trash2 size={16} />
        </button>
      )}
      <Toggle on={tool.enabled} onChange={onToggle} />
    </div>
  )
}

/** Inline form to add a custom tool (name + description). */
function CustomToolAdder({ onAdd }: { onAdd: (label: string, desc: string) => void }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [desc, setDesc] = useState('')
  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="pressable flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-3 text-sm font-semibold text-muted hover:text-ink"
      >
        <Plus size={16} /> Add custom tool
      </button>
    )
  return (
    <div className="glass space-y-2 rounded-2xl p-3.5">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Tool name (e.g. Send Slack message)"
        className="w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-muted"
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="What it does (optional)"
        className="w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-muted"
      />
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="pressable rounded-full px-3 py-1.5 text-sm font-semibold text-muted">
          Cancel
        </button>
        <button
          onClick={() => {
            onAdd(label, desc)
            setLabel('')
            setDesc('')
            setOpen(false)
          }}
          disabled={!label.trim()}
          className="accent-gradient-bg pressable rounded-full px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  )
}

function GoalsSection({
  goals,
  onAdd,
  onToggle,
  onRemove,
}: {
  goals: AgentGoal[]
  onAdd: (text: string) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}) {
  const [draft, setDraft] = useState('')
  function submit() {
    if (!draft.trim()) return
    onAdd(draft)
    setDraft('')
  }
  return (
    <section>
      <h2 className="mb-1.5 px-1 text-xs font-bold uppercase tracking-widest text-muted">Goals</h2>
      {goals.length === 0 ? (
        <div className="glass rounded-2xl px-4 py-6 text-center text-sm text-muted">No goals configured</div>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => (
            <div key={g.id} className="glass flex items-center gap-3 rounded-2xl p-3">
              <button
                onClick={() => onToggle(g.id)}
                aria-label="Toggle goal"
                className={`pressable flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
                  g.done ? 'accent-gradient-bg border-transparent text-white' : 'border-white/25 text-transparent'
                }`}
              >
                <Check size={14} />
              </button>
              <span className={`min-w-0 flex-1 text-sm ${g.done ? 'text-muted line-through' : 'text-ink'}`}>
                {g.text}
              </span>
              <button
                onClick={() => onRemove(g.id)}
                aria-label="Remove goal"
                className="pressable shrink-0 rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add a goal */}
      <div className="mt-2 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="Add a goal…"
          className="min-h-[44px] flex-1 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent/50"
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          aria-label="Add goal"
          className="pressable accent-gradient-bg flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white disabled:opacity-30"
        >
          <Plus size={20} />
        </button>
      </div>
    </section>
  )
}

function TriggersTab({
  triggers,
  onAdd,
  onUpdate,
  onRemove,
}: {
  triggers: AgentTrigger[]
  onAdd: () => void
  onUpdate: (id: string, changes: Partial<AgentTrigger>) => void
  onRemove: (id: string) => void
}) {
  if (triggers.length === 0) {
    return (
      <div className="glass flex flex-col items-center rounded-2xl px-4 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-accent">
          <Zap size={22} />
        </span>
        <p className="mt-3 text-sm font-semibold text-ink">No triggers yet</p>
        <p className="mt-1 max-w-xs text-xs text-muted">
          Add a schedule, event or mention trigger to start this agent automatically.
        </p>
        <button
          onClick={onAdd}
          className="accent-gradient-bg pressable mt-4 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus size={16} /> Add trigger
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {triggers.map((t) => {
        const meta = TRIGGER_TYPES.find((x) => x.id === t.type)
        const Icon = meta?.icon ?? Zap
        return (
          <div key={t.id} className="glass rounded-2xl p-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-accent">
                <Icon size={18} />
              </span>
              <input
                value={t.label}
                onChange={(e) => onUpdate(t.id, { label: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none"
              />
              <Toggle on={t.enabled} onChange={(v) => onUpdate(t.id, { enabled: v })} />
              <button
                onClick={() => onRemove(t.id)}
                aria-label="Remove trigger"
                className="pressable shrink-0 rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 size={15} />
              </button>
            </div>
            {t.type === 'schedule' && (
              <input
                value={t.cadence ?? ''}
                onChange={(e) => onUpdate(t.id, { cadence: e.target.value })}
                placeholder="Cadence — e.g. daily 9am, weekly mon"
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-ink outline-none placeholder:text-muted focus:border-accent/50"
              />
            )}
          </div>
        )
      })}
      <button
        onClick={onAdd}
        className="pressable glass flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-ink"
      >
        <Plus size={16} /> Add trigger
      </button>
    </div>
  )
}

/** The scheduled jobs assigned to this agent (links to the Jobs tab). */
function ScheduledJobs({ jobs, onOpen }: { jobs: Job[]; onOpen: () => void }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Scheduled jobs</h2>
        <button onClick={onOpen} className="pressable text-xs font-semibold text-accent">
          Manage
        </button>
      </div>
      {jobs.length === 0 ? (
        <button
          onClick={onOpen}
          className="glass pressable flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Clock size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">No scheduled jobs</span>
            <span className="block text-xs text-muted">Schedule a recurring job for this agent.</span>
          </span>
          <Plus size={16} className="shrink-0 text-muted" />
        </button>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => (
            <button
              key={j.id}
              onClick={onOpen}
              className="glass pressable flex items-center gap-3 rounded-2xl px-4 py-3 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Zap size={18} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{j.title}</span>
                <span className="block truncate text-xs text-muted">
                  {CADENCE_LABEL[j.cadence]}
                  {j.enabled ? '' : ' · paused'}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-muted">
                {j.enabled ? untilLabel(j.nextRunAt) : '—'}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/** The agent's run history / activity timeline. */
function ActivityTimeline({
  activity,
  onOpen,
}: {
  activity: ActivityEvent[]
  onOpen: (href: string) => void
}) {
  if (activity.length === 0) {
    return (
      <section>
        <h2 className="mb-1.5 px-1 text-xs font-bold uppercase tracking-widest text-muted">Activity</h2>
        <div className="glass rounded-2xl px-4 py-6 text-center text-sm text-muted">
          No runs yet — this agent's activity will show up here.
        </div>
      </section>
    )
  }
  return (
    <section>
      <h2 className="mb-2.5 px-1 text-xs font-bold uppercase tracking-widest text-muted">Activity</h2>
      <div className="ag-timeline flex flex-col gap-3">
        {activity.slice(0, 20).map((e) => (
          <div key={e.id} className="relative">
            <span className="ag-timeline-node" />
            <button
              onClick={() => e.href && onOpen(e.href)}
              disabled={!e.href}
              className={`block w-full text-left ${e.href ? 'pressable' : 'cursor-default'}`}
            >
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {activityKindLabel(e.kind)}
                <span className="ml-auto normal-case tracking-normal">{activityWhen(e.at)}</span>
              </span>
              <span className="mt-0.5 block text-sm font-medium text-ink">{e.title}</span>
              {e.detail && <span className="block text-xs text-muted">{e.detail}</span>}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
