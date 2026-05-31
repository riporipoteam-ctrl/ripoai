import { useState } from 'react'
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
} from 'lucide-react'
import { useStore } from '../store'
import Modal from './ui/Modal'
import Button from './ui/Button'
import { MODEL_LIST } from '../lib/models'
import { clearAllChats, clearMemories, deleteMemory } from '../lib/db'

const ACCENTS = ['#7c5cff', '#4ea8ff', '#36e0c0', '#ff6b6b', '#ffa94d', '#f06595']
const TABS = [
  { id: 'general', label: 'General', icon: Palette },
  { id: 'personal', label: 'Personalization', icon: UserIcon },
  { id: 'memory', label: 'Memory', icon: Brain },
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
  } = useStore()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('general')

  return (
    <Modal open={settingsOpen} onClose={closeSettings} title="Settings" wide>
      <div className="flex flex-col gap-0 sm:flex-row">
        {/* Tabs */}
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-3 sm:w-48 sm:flex-col sm:border-b-0 sm:border-r">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${
                tab === t.id ? 'bg-white/10 text-ink' : 'text-muted hover:bg-white/5'
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div className="min-h-[340px] flex-1 space-y-6 p-5">
          {tab === 'general' && (
            <>
              <Field label="Theme">
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
            </>
          )}

          {tab === 'personal' && (
            <>
              <Field label="Your name">
                <input
                  value={settings.displayName ?? ''}
                  onChange={(e) => updateSettings({ displayName: e.target.value })}
                  placeholder="What should RipoAI call you?"
                  className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 outline-none focus:border-accent"
                />
              </Field>
              <Field label="What should RipoAI know about you?">
                <textarea
                  value={settings.aboutYou}
                  onChange={(e) => updateSettings({ aboutYou: e.target.value })}
                  rows={4}
                  placeholder="Your role, interests, the tools you use, anything that helps RipoAI tailor answers."
                  className="w-full resize-none rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 outline-none focus:border-accent"
                />
              </Field>
              <Field label="How should RipoAI respond?">
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

          {tab === 'memory' && (
            <>
              <label className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
                <div>
                  <div className="font-semibold">Memory</div>
                  <div className="text-xs text-muted">Let RipoAI remember details across chats.</div>
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
                    Nothing remembered yet. As you chat, RipoAI will save useful details here.
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

          {tab === 'data' && (
            <>
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
              <div className="text-2xl font-extrabold brand-gradient">RipoAI</div>
              <p>
                RipoAI is your intelligent workspace for chatting, researching the live web, and
                building apps with a real in-browser preview.
              </p>
              <p>
                Models: RipoAI 1o instant & 2o instant for speed, 1o Pro & 2o Pro for the deepest
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
