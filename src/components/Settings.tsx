import { useEffect, useRef, useState } from 'react'
import Avatar from './ui/Avatar'
import {
  Palette,
  User as UserIcon,
  Brain,
  Database,
  Info,
  Trash2,
  Monitor,
  Moon,
  Sun,
  Volume2,
  Play,
  Plug,
  Mail,
} from 'lucide-react'
import { useStore } from '../store'
import { useT } from '../lib/i18n'
import Modal from './ui/Modal'
import Button from './ui/Button'
import { MODEL_LIST } from '../lib/models'
import { LANGUAGES } from '../lib/languages'
import { clearAllChats, clearMemories, deleteMemory } from '../lib/db'
import { listVoices, getVoicePrefs, setVoicePrefs, isSpeechSupported } from '../hooks/useSpeech'
import { speakHQ, stopVoice } from '../lib/voice'
import { isGmailConnected, connectGmail, disconnectGmail } from '../lib/gmail'
import { isCalendarConnected, connectCalendar, disconnectCalendar } from '../lib/calendar'
import { Calendar as CalIcon, Cloud, Map as MapIcon, Bitcoin, Globe, Wand2 } from 'lucide-react'
import { loadSkills, deleteSkill, installSkillFromUrl, type Skill } from '../lib/skills'
import { loadAgents, upsertAgent, deleteAgent, newAgent, setPendingAgentChat, type Agent } from '../lib/agents'
import { Bot, Plus as PlusIcon, MessageSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const ACCENTS = ['#10a37f', '#4ea8ff', '#36e0c0', '#7c5cff', '#ff6b6b', '#ffa94d', '#f06595']
const TABS = [
  { id: 'general', label: 'General', icon: Palette },
  { id: 'personal', label: 'Personalization', icon: UserIcon },
  { id: 'voice', label: 'Voice', icon: Volume2 },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'skills', label: 'Skills', icon: Wand2 },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'data', label: 'Data controls', icon: Database },
  { id: 'about', label: 'About', icon: Info },
] as const

export default function Settings() {
  const {
    settingsOpen,
    closeSettings,
    settings,
    updateSettings,
    memories,
    setMemories,
    user,
    synced,
    syncError,
    syncing,
    resync,
  } = useStore()
  const tr = useT()
  const navigate = useNavigate()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('general')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [vp, setVp] = useState(getVoicePrefs())
  const [gmail, setGmail] = useState(isGmailConnected())
  const [gmailErr, setGmailErr] = useState('')
  const [cal, setCal] = useState(isCalendarConnected())
  const [calErr, setCalErr] = useState('')
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillUrl, setSkillUrl] = useState('')
  const [skillBusy, setSkillBusy] = useState(false)
  const [skillErr, setSkillErr] = useState('')
  const [agents, setAgents] = useState<Agent[]>([])
  const [editing, setEditing] = useState<Agent | null>(null)
  const [aiDesc, setAiDesc] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  function startChatWithAgent(agent: Agent) {
    // Hand the agent off to a fresh chat, then close Settings and open it.
    setPendingAgentChat(agent)
    closeSettings()
    navigate('/')
  }

  async function createAgentWithAI() {
    if (!user || !aiDesc.trim() || aiBusy) return
    setAiBusy(true)
    try {
      const { aiDesignAgent } = await import('../lib/agents')
      const agent = await aiDesignAgent(aiDesc.trim())
      upsertAgent(user.uid, agent)
      setAgents(loadAgents(user.uid))
      setAiDesc('')
    } catch {
      /* ignore */
    } finally {
      setAiBusy(false)
    }
  }
  const avatarInput = useRef<HTMLInputElement>(null)
  async function handleAvatar(file?: File) {
    if (!file) return
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const size = 256
        const c = document.createElement('canvas')
        c.width = size
        c.height = size
        const ctx = c.getContext('2d')!
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        resolve(c.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = reject
      const fr = new FileReader()
      fr.onload = () => (img.src = fr.result as string)
      fr.onerror = reject
      fr.readAsDataURL(file)
    })
    updateSettings({ avatar: dataUrl })
  }
  useEffect(() => {
    if (settingsOpen && user) {
      setSkills(loadSkills(user.uid))
      setAgents(loadAgents(user.uid))
    }
  }, [settingsOpen, tab, user])

  function saveAgent(a: Agent) {
    if (!user || !a.name.trim()) return
    upsertAgent(user.uid, { ...a, name: a.name.trim() })
    setAgents(loadAgents(user.uid))
    setEditing(null)
  }
  function removeAgent(id: string) {
    if (!user) return
    deleteAgent(user.uid, id)
    setAgents(loadAgents(user.uid))
  }
  async function installSkill() {
    if (!user || !skillUrl.trim()) return
    setSkillBusy(true)
    setSkillErr('')
    try {
      await installSkillFromUrl(user.uid, skillUrl.trim())
      setSkillUrl('')
      setSkills(loadSkills(user.uid))
    } catch (e: any) {
      setSkillErr(e?.message ?? 'Install failed.')
    } finally {
      setSkillBusy(false)
    }
  }

  useEffect(() => {
    if (!isSpeechSupported()) return
    const load = () => setVoices(listVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  function updateVoice(patch: Partial<ReturnType<typeof getVoicePrefs>>) {
    const next = { ...vp, ...patch }
    setVp(next)
    setVoicePrefs(next)
  }

  return (
    <Modal open={settingsOpen} onClose={closeSettings} title="Settings" wide>
      <div className="flex flex-col gap-0 sm:flex-row">
        {/* Tabs */}
        <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/10 p-3 sm:w-52 sm:flex-col sm:border-b-0 sm:border-r">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pressable flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                tab === t.id
                  ? 'bg-[rgb(var(--accent)/0.14)] text-ink'
                  : 'text-muted hover:bg-white/[0.06] hover:text-ink'
              }`}
            >
              <t.icon size={16} className={tab === t.id ? 'text-accent' : ''} /> {tr(t.label)}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div className="min-h-[340px] flex-1 space-y-6 p-5">
          {tab === 'general' && (
            <>
              <Field label="Profile picture">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={settings.displayName || user?.displayName}
                    photoURL={settings.avatar || user?.photoURL}
                    size={56}
                  />
                  <input
                    ref={avatarInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleAvatar(e.target.files?.[0])}
                  />
                  <button
                    onClick={() => avatarInput.current?.click()}
                    className="rounded-2xl border border-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/5"
                  >
                    Change photo
                  </button>
                  {settings.avatar && (
                    <button
                      onClick={() => updateSettings({ avatar: '' })}
                      className="text-sm font-semibold text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </Field>

              <Field label="Theme style">
                <div className="flex gap-2">
                  {[
                    { v: 'chatgpt', label: 'Black & White', sw: ['#ffffff', '#0d0d0d'] },
                    { v: 'claude', label: 'Orange', sw: ['#f4f2eb', '#d97757'] },
                  ].map((o) => (
                    <button
                      key={o.v}
                      onClick={() => updateSettings({ uiTheme: o.v as any })}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition ${
                        (settings.uiTheme ?? 'chatgpt') === o.v
                          ? 'border-accent bg-accent/10 text-ink'
                          : 'border-white/10 text-muted hover:bg-white/5'
                      }`}
                    >
                      <span className="flex">
                        <span className="h-4 w-4 rounded-l-full border border-black/10" style={{ background: o.sw[0] }} />
                        <span className="h-4 w-4 rounded-r-full" style={{ background: o.sw[1] }} />
                      </span>
                      {o.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Appearance">
                <div className="flex gap-2">
                  {[
                    { v: 'light', icon: Sun, label: 'Light' },
                    { v: 'dark', icon: Moon, label: 'Dark' },
                    { v: 'system', icon: Monitor, label: 'System' },
                  ].map((o) => (
                    <button
                      key={o.v}
                      onClick={() => updateSettings({ theme: o.v as any })}
                      className={`flex flex-1 flex-col items-center gap-1 rounded-2xl border py-3 text-xs font-semibold transition ${
                        settings.theme === o.v
                          ? 'border-accent bg-accent/10 text-ink'
                          : 'border-white/10 text-muted hover:bg-white/5'
                      }`}
                    >
                      <o.icon size={18} /> {o.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Accent color">
                <div className="flex flex-wrap gap-2">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateSettings({ accent: c })}
                      className={`h-9 w-9 rounded-full transition ${
                        settings.accent === c ? 'ring-2 ring-offset-2 ring-offset-transparent' : ''
                      }`}
                      style={{ background: c, boxShadow: settings.accent === c ? `0 0 0 2px ${c}` : 'none' }}
                    />
                  ))}
                </div>
              </Field>

              <Field label={`Liquid glass intensity (${settings.glassIntensity}px blur)`}>
                <input
                  type="range"
                  min={4}
                  max={40}
                  value={settings.glassIntensity}
                  onChange={(e) => updateSettings({ glassIntensity: Number(e.target.value) })}
                  className="w-full accent-accent"
                />
              </Field>

              <Field label={`Text size (${Math.round((settings.fontScale ?? 1) * 100)}%)`}>
                <input
                  type="range"
                  min={0.85}
                  max={1.25}
                  step={0.05}
                  value={settings.fontScale ?? 1}
                  onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })}
                  className="w-full accent-accent"
                />
              </Field>

              <Field label="Default model">
                <select
                  value={settings.defaultModel}
                  onChange={(e) => updateSettings({ defaultModel: e.target.value as any })}
                  className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 outline-none focus:border-accent"
                >
                  {MODEL_LIST.map((m) => (
                    <option key={m.id} value={m.id} className="bg-surface text-ink">
                      {m.name} — {m.tagline}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Language">
                <select
                  value={settings.language ?? 'auto'}
                  onChange={(e) => updateSettings({ language: e.target.value })}
                  className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 outline-none focus:border-accent"
                >
                  <option value="auto" className="bg-surface text-ink">
                    Auto (device language)
                  </option>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code} className="bg-surface text-ink">
                      {l.native} — {l.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-muted">AskAI replies in this language.</p>
              </Field>
            </>
          )}

          {tab === 'personal' && (
            <>
              <Field label="Your name">
                <input
                  value={settings.displayName ?? ''}
                  onChange={(e) => updateSettings({ displayName: e.target.value })}
                  placeholder="What should AskAI call you?"
                  className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 outline-none focus:border-accent"
                />
              </Field>

              <Field label="Response length">
                <Segmented
                  value={settings.verbosity ?? 'balanced'}
                  onChange={(v) => updateSettings({ verbosity: v as any })}
                  options={[
                    { id: 'concise', label: 'Concise' },
                    { id: 'balanced', label: 'Balanced' },
                    { id: 'detailed', label: 'Detailed' },
                  ]}
                />
              </Field>
              <Field label="Tone">
                <Segmented
                  value={settings.tone ?? 'friendly'}
                  onChange={(v) => updateSettings({ tone: v as any })}
                  options={[
                    { id: 'professional', label: 'Professional' },
                    { id: 'friendly', label: 'Friendly' },
                    { id: 'playful', label: 'Playful' },
                    { id: 'direct', label: 'Direct' },
                  ]}
                />
              </Field>
              <Field label="Emojis">
                <Segmented
                  value={settings.emoji ?? 'some'}
                  onChange={(v) => updateSettings({ emoji: v as any })}
                  options={[
                    { id: 'none', label: 'None' },
                    { id: 'some', label: 'Some' },
                    { id: 'lots', label: 'Lots 🎉' },
                  ]}
                />
              </Field>
              <Field label="What should AskAI know about you?">
                <textarea
                  value={settings.aboutYou}
                  onChange={(e) => updateSettings({ aboutYou: e.target.value })}
                  rows={4}
                  placeholder="Your role, interests, the tools you use, anything that helps AskAI tailor answers."
                  className="w-full resize-none rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 outline-none focus:border-accent"
                />
              </Field>
              <Field label="How should AskAI respond?">
                <textarea
                  value={settings.responseStyle}
                  onChange={(e) => updateSettings({ responseStyle: e.target.value })}
                  rows={4}
                  placeholder="e.g. Be concise. Use examples. Prefer TypeScript. Don't over-explain."
                  className="w-full resize-none rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 outline-none focus:border-accent"
                />
              </Field>
              <p className="text-xs text-muted">Custom instructions are applied to every new message.</p>
            </>
          )}

          {tab === 'voice' && (
            <>
              {!isSpeechSupported() ? (
                <p className="rounded-2xl border border-white/10 px-4 py-6 text-center text-sm text-muted">
                  Speech isn't supported in this browser.
                </p>
              ) : (
                <>
                  <Field label="Voice">
                    <select
                      value={vp.voiceURI ?? ''}
                      onChange={(e) => updateVoice({ voiceURI: e.target.value || undefined })}
                      className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 outline-none focus:border-accent"
                    >
                      <option value="" className="bg-surface text-ink">
                        Auto (best available)
                      </option>
                      {voices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI} className="bg-surface text-ink">
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label={`Speed — ${vp.rate.toFixed(2)}×`}>
                    <input
                      type="range" min={0.6} max={1.6} step={0.05}
                      value={vp.rate}
                      onChange={(e) => updateVoice({ rate: Number(e.target.value) })}
                      className="w-full accent-accent"
                    />
                  </Field>
                  <Field label={`Pitch — ${vp.pitch.toFixed(2)}`}>
                    <input
                      type="range" min={0.5} max={1.6} step={0.05}
                      value={vp.pitch}
                      onChange={(e) => updateVoice({ pitch: Number(e.target.value) })}
                      className="w-full accent-accent"
                    />
                  </Field>

                  <div className="flex gap-2">
                    <Button
                      variant="glass"
                      onClick={() => speakHQ("Hi, I'm AskAI. This is how I sound — pick the voice you like best.")}
                    >
                      <Play size={15} /> Preview
                    </Button>
                    <Button variant="ghost" onClick={stopVoice}>
                      Stop
                    </Button>
                  </div>

                  <p className="text-xs text-muted">
                    Tip: for the most realistic voices, download the “Enhanced/Premium” voices on
                    your device (iOS: Settings → Accessibility → Spoken Content → Voices; they then
                    appear in this list).
                  </p>
                </>
              )}
            </>
          )}

          {tab === 'memory' && (
            <>
              <label className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
                <div>
                  <div className="font-semibold">Memory</div>
                  <div className="text-xs text-muted">Let AskAI remember details across chats.</div>
                </div>
                <Toggle
                  on={settings.memoryEnabled}
                  onClick={() => updateSettings({ memoryEnabled: !settings.memoryEnabled })}
                />
              </label>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Saved memories ({memories.length})</span>
                  {memories.length > 0 && (
                    <button
                      onClick={async () => {
                        if (user && confirm('Clear all memories?')) {
                          await clearMemories(user.uid)
                          setMemories([])
                        }
                      }}
                      className="text-xs font-semibold text-red-400 hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {memories.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 px-4 py-6 text-center text-sm text-muted">
                    Nothing remembered yet. As you chat, AskAI will save useful details here.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {memories.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-start gap-2 rounded-2xl border border-white/10 px-3 py-2 text-sm"
                      >
                        <span className="flex-1">{m.text}</span>
                        <button
                          onClick={async () => {
                            if (user) {
                              await deleteMemory(user.uid, m.id)
                              setMemories(memories.filter((x) => x.id !== m.id))
                            }
                          }}
                          className="rounded-lg p-1 text-muted hover:bg-white/10 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {tab === 'skills' && (
            <>
              <div>
                <div className="font-semibold">Skills</div>
                <p className="mt-1 text-xs text-muted">
                  Skills are instruction packs AskAI can follow. Type <code className="rounded bg-white/10 px-1">/</code> in
                  chat to use one, try <code className="rounded bg-white/10 px-1">/skill-creator</code> to build your own,
                  or in chat say <code className="rounded bg-white/10 px-1">install this skill: &lt;url&gt;</code>.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">Install from a URL</label>
                <div className="flex gap-2">
                  <input
                    value={skillUrl}
                    onChange={(e) => setSkillUrl(e.target.value)}
                    placeholder="https://… (GitHub raw / markdown)"
                    className="field flex-1 text-sm"
                  />
                  <button
                    onClick={installSkill}
                    disabled={skillBusy || !skillUrl.trim()}
                    className="accent-gradient-bg rounded-2xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {skillBusy ? 'Installing…' : 'Install'}
                  </button>
                </div>
                {skillErr && <p className="mt-1 text-xs text-red-400">{skillErr}</p>}
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold">Installed skills ({skills.length})</div>
                <ul className="space-y-2">
                  {skills.map((s) => (
                    <li key={s.id} className="flex items-start gap-3 rounded-2xl border border-white/10 px-3 py-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                        <Wand2 size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">
                          {s.name} <span className="font-normal text-muted">/{s.slug}</span>
                          {s.source === 'builtin' && (
                            <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-px text-[9px] font-bold uppercase text-muted">
                              built-in
                            </span>
                          )}
                        </div>
                        {s.description && <div className="truncate text-xs text-muted">{s.description}</div>}
                      </div>
                      {s.source !== 'builtin' && (
                        <button
                          onClick={() => {
                            if (user) {
                              deleteSkill(user.uid, s.id)
                              setSkills(loadSkills(user.uid))
                            }
                          }}
                          className="rounded-lg p-1 text-muted hover:bg-white/10 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {tab === 'agents' && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold">Your agents</h3>
                  <p className="text-xs text-muted">
                    Give each agent a name and personality. Select or @mention them in chat, or dispatch the whole team.
                  </p>
                </div>
                <button
                  onClick={() => setEditing(newAgent())}
                  className="accent-gradient-bg pressable flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-white"
                >
                  <PlusIcon size={14} /> New
                </button>
              </div>

              {/* Create an agent with AI — designs persona/skills + a real profile pic. */}
              <div className="mb-3 rounded-2xl border border-accent/30 bg-accent/5 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                  <Wand2 size={14} className="text-accent" /> Create an agent with AI
                </div>
                <div className="flex gap-2">
                  <input
                    value={aiDesc}
                    onChange={(e) => setAiDesc(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createAgentWithAI()
                    }}
                    placeholder='e.g. "make an agent named Leon that researches things for me"'
                    className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  <button
                    onClick={createAgentWithAI}
                    disabled={aiBusy || !aiDesc.trim()}
                    className="accent-gradient-bg pressable flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {aiBusy ? 'Creating…' : 'Create'}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  AskAI designs the agent's name, personality and skills, and paints a profile picture.
                </p>
              </div>

              {editing && (
                <div className="mb-3 space-y-2 rounded-2xl border border-accent/30 bg-accent/5 p-3">
                  <div className="flex gap-2">
                    <input
                      value={editing.emoji}
                      onChange={(e) => setEditing({ ...editing, emoji: e.target.value.slice(0, 2) })}
                      className="w-12 rounded-xl border border-white/15 bg-white/5 px-2 py-2 text-center text-lg outline-none"
                      title="Emoji"
                    />
                    <input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value.replace(/\s+/g, '') })}
                      placeholder="Name (e.g. Bob)"
                      className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none"
                    />
                    <input
                      type="color"
                      value={editing.color}
                      onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                      className="h-10 w-10 shrink-0 cursor-pointer rounded-xl border border-white/15 bg-transparent"
                      title="Color"
                    />
                  </div>
                  <input
                    value={editing.role}
                    onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                    placeholder="Role (e.g. Engineer, Designer, Team Lead)"
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none"
                  />
                  <textarea
                    value={editing.personality}
                    onChange={(e) => setEditing({ ...editing, personality: e.target.value })}
                    placeholder="Personality & instructions — how should this agent think, talk and work?"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveAgent(editing)}
                      disabled={!editing.name.trim()}
                      className="accent-gradient-bg pressable flex-1 rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                    >
                      Save agent
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="pressable rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {agents.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-white/10 p-3">
                    {a.avatar ? (
                      <img
                        src={a.avatar}
                        alt={a.name}
                        className="h-10 w-10 shrink-0 rounded-xl object-cover"
                        style={{ boxShadow: `0 0 0 1px ${a.color}55` }}
                      />
                    ) : (
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                        style={{ background: a.color + '2a', boxShadow: `0 0 0 1px ${a.color}55` }}
                      >
                        {a.emoji}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {a.name} <span className="text-xs font-normal text-muted">{a.role}</span>
                      </div>
                      <div className="truncate text-xs text-muted">{a.personality}</div>
                    </div>
                    <button
                      onClick={() => startChatWithAgent(a)}
                      className="pressable flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:bg-white/10"
                      title={`Chat 1-on-1 with ${a.name}`}
                    >
                      <MessageSquare size={13} /> Chat
                    </button>
                    <button onClick={() => setEditing(a)} className="pressable rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:bg-white/10">
                      Edit
                    </button>
                    <button onClick={() => removeAgent(a.id)} className="pressable rounded-lg p-1 text-muted hover:bg-white/10 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'data' && (
            <>
              <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${synced ? 'bg-emerald-400' : syncError ? 'bg-red-400' : 'bg-amber-400'}`}
                  />
                  <span className="text-sm font-semibold">
                    {synced ? 'Synced to your account' : syncError ? 'Not syncing' : 'Connecting…'}
                  </span>
                  <button
                    onClick={() => resync()}
                    disabled={syncing}
                    className="pressable ml-auto rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-50"
                  >
                    {syncing ? 'Syncing…' : 'Sync now'}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {synced
                    ? 'Your chats, projects and personalizations are backed up and sync across every device you sign in on.'
                    : syncError
                      ? syncError
                      : 'Setting up cloud sync… if this stays here, tap “Sync now”. Your data is always saved on this device meanwhile.'}
                </p>
              </div>
              <Row
                title="Clear all chats"
                desc="Permanently delete your entire chat history."
                action={
                  <Button
                    variant="danger"
                    onClick={async () => {
                      if (user && confirm('Delete ALL chats? This cannot be undone.')) {
                        await clearAllChats(user.uid)
                      }
                    }}
                  >
                    Clear chats
                  </Button>
                }
              />
              <p className="text-xs text-muted">
                Your data is stored in your private Firebase account and only visible to you.
              </p>
            </>
          )}

          {tab === 'about' && (
            <div className="space-y-3 text-sm leading-relaxed text-muted">
              <div className="text-2xl font-extrabold brand-gradient">AskAI</div>
              <p>
                AskAI is your intelligent workspace for chatting, researching the live web, and
                building apps with a real in-browser preview.
              </p>
              <p>
                Models: AskAI 1o instant & 2o instant for speed, 1o Pro & 2o Pro for the deepest
                reasoning and best designs. Web Search and Agent modes browse the live web.
              </p>
              <p className="text-xs">
                Signed in as <span className="font-semibold text-ink">{user?.email}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">{label}</div>
      {children}
    </div>
  )
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { id: string; label: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-2xl bg-white/5 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`pressable flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${
            value === o.id ? 'accent-gradient-bg text-white' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Row({ title, desc, action }: { title: string; desc: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      {action}
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-7 w-12 rounded-full transition ${on ? 'accent-gradient-bg' : 'bg-white/15'}`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
          on ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  )
}
