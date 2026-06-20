// Agent-built apps — the gallery behind the "Apps" tab.
//
// Each AgentApp is a small website/app/component that one of the user's agents
// built for them: a bundle of source files (React + TypeScript + Vite-style,
// Tailwind via CDN) that Sandpack runs live in the preview. Everything is
// stored locally per-user (localStorage); there is no backend in this
// client-only build, so created apps live in the browser. The same
// streamChat/parseCodeFiles helpers ProjectsView uses power the "have an agent
// build me an app" composer (see AppsPage).

import { streamChat, complete } from './groq'
import { CODER_MODEL } from './models'
import { parseCodeFiles } from './parseCode'

export type AgentAppKind = 'website' | 'app' | 'component'

export interface AgentApp {
  id: string
  title: string
  description: string
  /** Id of the agent that built it (free-form; "askai" for the default builder). */
  agentId: string
  /** Friendly display name of the building agent, cached for the gallery. */
  agentName: string
  kind: AgentAppKind
  /** Source files keyed by path (e.g. "/App.tsx"), Sandpack-style. */
  files: Record<string, string>
  /** Entry file rendered by the preview (e.g. "/App.tsx"). */
  entry: string
  /** Optional one-line build prompt the user originally asked for. */
  prompt?: string
  createdAt: number
  updatedAt: number
}

const KEY = (uid: string) => `askai:agent-apps:${uid}`
const SEEDED = (uid: string) => `askai:agent-apps:seeded:${uid}`
const CHANGED_EVENT = 'askai-agent-apps-changed'

export function newAppId(): string {
  return 'app_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** Subscribe to store changes (returns an unsubscribe fn). */
export function onAgentAppsChanged(fn: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, fn)
  return () => window.removeEventListener(CHANGED_EVENT, fn)
}

function emitChanged() {
  try {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

function read(uid: string): AgentApp[] {
  try {
    const raw = localStorage.getItem(KEY(uid))
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? (list as AgentApp[]) : []
  } catch {
    return []
  }
}

function write(uid: string, apps: AgentApp[]) {
  try {
    localStorage.setItem(KEY(uid), JSON.stringify(apps))
  } catch {
    /* ignore quota */
  }
  emitChanged()
}

/** All apps for a user, newest first. Seeds realistic examples on first use. */
export function loadAgentApps(uid: string): AgentApp[] {
  let apps = read(uid)
  if (!apps.length && !localStorage.getItem(SEEDED(uid))) {
    apps = seedApps()
    try {
      localStorage.setItem(SEEDED(uid), '1')
    } catch {
      /* ignore */
    }
    write(uid, apps)
  }
  return [...apps].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getAgentApp(uid: string, id: string): AgentApp | null {
  return read(uid).find((a) => a.id === id) ?? null
}

/** Create a fresh, empty app skeleton (not yet persisted unless you saveApp). */
export function newApp(partial: Partial<AgentApp> = {}): AgentApp {
  const now = Date.now()
  return {
    id: partial.id ?? newAppId(),
    title: partial.title ?? 'Untitled app',
    description: partial.description ?? '',
    agentId: partial.agentId ?? 'askai',
    agentName: partial.agentName ?? 'AskAI Builder',
    kind: partial.kind ?? 'app',
    files: partial.files ?? { ...STARTER_FILES },
    entry: partial.entry ?? '/App.tsx',
    prompt: partial.prompt,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  }
}

/** Insert or update an app (upsert by id). */
export function saveApp(uid: string, app: AgentApp): AgentApp {
  const apps = read(uid)
  const idx = apps.findIndex((a) => a.id === app.id)
  const next: AgentApp = { ...app, updatedAt: Date.now() }
  if (idx === -1) apps.push(next)
  else apps[idx] = next
  write(uid, apps)
  return next
}

/** Shallow-update specific fields of an app. */
export function updateApp(
  uid: string,
  id: string,
  patch: Partial<Omit<AgentApp, 'id' | 'createdAt'>>,
): AgentApp | null {
  const apps = read(uid)
  const idx = apps.findIndex((a) => a.id === id)
  if (idx === -1) return null
  apps[idx] = { ...apps[idx], ...patch, updatedAt: Date.now() }
  write(uid, apps)
  return apps[idx]
}

export function deleteApp(uid: string, id: string) {
  write(
    uid,
    read(uid).filter((a) => a.id !== id),
  )
}

/** Does this message ask an agent to BUILD an app/site/component? If so the
 *  chat should create a real AgentApp (Apps page) instead of coding inline. */
export function wantsAppBuild(text: string): boolean {
  const t = (text || '').toLowerCase().trim()
  if (!t) return false
  // Skip questions / fixes / explanations — those stay in chat.
  if (/^\s*(how|what|why|when|where|who|explain|fix|debug|error|review|why is)\b/.test(t)) return false
  return /\b(build|make|create|design|generate|develop|code|whip up|put together|spin up)\b[^.?!]{0,60}\b(web ?site|web ?app|web ?page|landing(\s*page)?|home ?page|app|application|component|dashboard|portfolio|micro ?site|site|tool|game|clone|ui|widget|form|calculator)\b/.test(
    t,
  )
}

/** Guess the best kind from a free-form build prompt. */
export function guessKind(prompt: string): AgentAppKind {
  const t = prompt.toLowerCase()
  if (/\b(landing|website|web ?site|marketing|portfolio|homepage|one ?pager|splash)\b/.test(t))
    return 'website'
  if (/\b(component|button|card|widget|badge|chart|navbar|modal|input|form field)\b/.test(t))
    return 'component'
  return 'app'
}

// ── Sandpack-friendly starter (react-ts template, Tailwind via CDN) ──
// Sandpack's "react-ts" template provides index.html + index.tsx that mount
// <App/>; we supply App.tsx and styles. We add Tailwind's Play CDN in App so
// utility classes work without a build config.

const TAILWIND_BOOT = `// Loads Tailwind's Play CDN once so utility classes work in the preview.
export function useTailwindCDN() {
  if (typeof document === 'undefined') return
  if (document.getElementById('twcdn')) return
  const s = document.createElement('script')
  s.id = 'twcdn'
  s.src = 'https://cdn.tailwindcss.com'
  document.head.appendChild(s)
}
`

const STARTER_APP = `import { useTailwindCDN } from './tailwind'

export default function App() {
  useTailwindCDN()
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Your new app</h1>
        <p className="mt-2 text-slate-400">
          Ask the agent to build something and it appears right here, live.
        </p>
      </div>
    </div>
  )
}
`

export const STARTER_FILES: Record<string, string> = {
  '/App.tsx': STARTER_APP,
  '/tailwind.ts': TAILWIND_BOOT,
}

// ── Seed apps: a real landing page + a working todo app ──
function seedApps(): AgentApp[] {
  const now = Date.now()
  return [
    {
      id: 'seed_landing',
      title: 'Nimbus — SaaS landing page',
      description:
        'A responsive marketing landing page with hero, feature grid, pricing and footer.',
      agentId: 'askai',
      agentName: 'Pixel (Designer)',
      kind: 'website',
      entry: '/App.tsx',
      prompt: 'Build a clean SaaS landing page for a product called Nimbus',
      createdAt: now - 1000 * 60 * 60 * 26,
      updatedAt: now - 1000 * 60 * 60 * 26,
      files: {
        '/tailwind.ts': TAILWIND_BOOT,
        '/App.tsx': LANDING_APP,
      },
    },
    {
      id: 'seed_todo',
      title: 'Focus — todo app',
      description:
        'A keyboard-friendly todo list with add, complete, filter and clear, persisted in state.',
      agentId: 'askai',
      agentName: 'Forge (Engineer)',
      kind: 'app',
      entry: '/App.tsx',
      prompt: 'Build a minimal todo app with filters',
      createdAt: now - 1000 * 60 * 60 * 3,
      updatedAt: now - 1000 * 60 * 60 * 3,
      files: {
        '/tailwind.ts': TAILWIND_BOOT,
        '/App.tsx': TODO_APP,
      },
    },
  ]
}

const LANDING_APP = `import { useTailwindCDN } from './tailwind'

const features = [
  { title: 'Realtime sync', body: 'Changes propagate to every device instantly.' },
  { title: 'Private by default', body: 'End-to-end encrypted. Your data stays yours.' },
  { title: 'Built for teams', body: 'Shared spaces, roles and granular permissions.' },
]

const tiers = [
  { name: 'Free', price: '$0', perks: ['1 workspace', 'Up to 3 members', 'Community support'] },
  { name: 'Pro', price: '$12', perks: ['Unlimited workspaces', 'Up to 25 members', 'Priority support'], featured: true },
  { name: 'Scale', price: '$39', perks: ['SSO & audit logs', 'Unlimited members', 'Dedicated support'] },
]

export default function App() {
  useTailwindCDN()
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">N</span>
            Nimbus
          </div>
          <nav className="hidden gap-6 text-sm text-slate-600 sm:flex">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#pricing" className="hover:text-slate-900">Pricing</a>
          </nav>
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            Get started
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
          New · Workspaces 2.0
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
          The calm workspace your team will actually use
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600">
          Nimbus keeps docs, tasks and chat in one tidy place — fast, private, and beautifully simple.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <button className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500">
            Start free
          </button>
          <button className="rounded-lg border border-slate-300 px-6 py-3 font-semibold hover:bg-slate-50">
            Book a demo
          </button>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 p-6">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold">Simple, fair pricing</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={
                'rounded-2xl border p-6 ' +
                (t.featured ? 'border-indigo-600 ring-1 ring-indigo-600' : 'border-slate-200')
              }
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{t.name}</h3>
                {t.featured && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600">
                    Popular
                  </span>
                )}
              </div>
              <p className="mt-4 text-3xl font-extrabold">
                {t.price}
                <span className="text-base font-medium text-slate-500">/mo</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {t.perks.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
              <button className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500">
                Choose {t.name}
              </button>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-10 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Nimbus. Built by an agent.
      </footer>
    </div>
  )
}
`

const TODO_APP = `import { useMemo, useState } from 'react'
import { useTailwindCDN } from './tailwind'

interface Todo {
  id: number
  text: string
  done: boolean
}

type Filter = 'all' | 'active' | 'done'

export default function App() {
  useTailwindCDN()
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: 'Ship the Apps gallery', done: true },
    { id: 2, text: 'Review the agent build', done: false },
    { id: 3, text: 'Celebrate', done: false },
  ])
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const visible = useMemo(
    () =>
      todos.filter((t) =>
        filter === 'all' ? true : filter === 'active' ? !t.done : t.done,
      ),
    [todos, filter],
  )
  const remaining = todos.filter((t) => !t.done).length

  function add() {
    const value = text.trim()
    if (!value) return
    setTodos((ts) => [...ts, { id: Date.now(), text: value, done: false }])
    setText('')
  }

  function toggle(id: number) {
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  function remove(id: number) {
    setTodos((ts) => ts.filter((t) => t.id !== id))
  }

  return (
    <div className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto max-w-md px-4">
        <h1 className="text-2xl font-bold text-slate-900">Focus</h1>
        <p className="text-sm text-slate-500">{remaining} task{remaining === 1 ? '' : 's'} left</p>

        <div className="mt-4 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="What needs doing?"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
          />
          <button
            onClick={add}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
          >
            Add
          </button>
        </div>

        <div className="mt-4 flex gap-2 text-sm">
          {(['all', 'active', 'done'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                'rounded-full px-3 py-1 capitalize ' +
                (filter === f ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600')
              }
            >
              {f}
            </button>
          ))}
        </div>

        <ul className="mt-4 space-y-2">
          {visible.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 shadow-sm"
            >
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggle(t.id)}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className={'flex-1 ' + (t.done ? 'text-slate-400 line-through' : 'text-slate-800')}>
                {t.text}
              </span>
              <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-red-500">
                ✕
              </button>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="rounded-lg bg-white px-3 py-6 text-center text-sm text-slate-400">
              Nothing here.
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
`

// ── Agent codegen — reuses the same streamChat + parseCodeFiles pipeline that
// ProjectsView uses, but targets a React + TypeScript app (Sandpack react-ts).

const REACT_CODING_SYSTEM = `You are AskAI App Builder — a world-class React + TypeScript front-end engineer.
You build small, self-contained apps/websites/components that run in a Sandpack "react-ts" sandbox.
START CODING IMMEDIATELY. No questions, no plans, minimal preamble.

HARD RULES:
- Stack: React 18 + TypeScript. Style with Tailwind utility classes ONLY.
- Tailwind is provided via a CDN helper. Your App MUST import { useTailwindCDN } from './tailwind' and call useTailwindCDN() at the top of the component so classes work.
- Always include a file /tailwind.ts with EXACTLY this content:
\`\`\`ts /tailwind.ts
export function useTailwindCDN() {
  if (typeof document === 'undefined') return
  if (document.getElementById('twcdn')) return
  const s = document.createElement('script')
  s.id = 'twcdn'
  s.src = 'https://cdn.tailwindcss.com'
  document.head.appendChild(s)
}
\`\`\`
- The entry component is /App.tsx and MUST be the default export (export default function App()).
- Do NOT use external npm packages beyond react/react-dom. No CSS files, no index.html, no index.tsx — Sandpack supplies the mount. Just the source files.
- Make it complete, polished, responsive and runnable. Real content, no Lorem-only placeholders, no "// rest of code" elisions.

Output format (strict) — output EACH file as its own fenced block whose info string is the file path, e.g.:
\`\`\`tsx /App.tsx
import { useTailwindCDN } from './tailwind'
export default function App() { ... }
\`\`\`
Then any extra components as /Foo.tsx, helpers as /lib.ts, etc.`

export interface BuildOptions {
  /** Existing files when asking the agent to change an app; omit for a new build. */
  files?: Record<string, string>
  /** Token-by-token callback so the UI can show it coding live. */
  onToken?: (full: string) => void
  signal?: AbortSignal
  /** Model id (Groq-compatible). Defaults to the coder model. */
  model?: string
}

export interface BuildResult {
  /** Full raw model output. */
  text: string
  /** Parsed files keyed by path. */
  files: Record<string, string>
}

function looksTruncated(text: string, finish: string): boolean {
  if (finish === 'length') return true
  const fences = (text.match(/```/g) || []).length
  return fences % 2 === 1
}

/**
 * Ask the building agent to generate (or change) a React+TS app from a prompt.
 * Mirrors ProjectsView's stream + auto-continue + parseCodeFiles flow, but for
 * the react-ts target. Returns the merged file map.
 */
export async function buildAppFiles(prompt: string, opts: BuildOptions = {}): Promise<BuildResult> {
  const model = opts.model || CODER_MODEL
  const existing = opts.files
  const fileContext = existing
    ? Object.entries(existing)
        .map(([path, code]) => `--- ${path} ---\n${code}`)
        .join('\n\n')
        .slice(0, 7000)
    : ''

  const sys = {
    role: 'system' as const,
    content:
      REACT_CODING_SYSTEM +
      (fileContext
        ? `\n\nYou are MODIFYING an existing app. Current files:\n${fileContext}\n\nApply the requested change and re-output every file that changes (full file contents).`
        : ''),
  }

  let full = ''
  const ac = opts.signal
  const push = (d: string) => {
    full += d
    opts.onToken?.(full)
  }

  async function runOnce(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]) {
    const r = await streamChat({
      model,
      messages,
      temperature: 0.5,
      maxTokens: 8000,
      topP: 1,
      signal: ac,
      onToken: push,
    })
    return r.finishReason || ''
  }

  let messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    sys,
    { role: 'user', content: prompt },
  ]
  let finish = await runOnce(messages)
  let guard = 0
  while (!ac?.aborted && looksTruncated(full, finish) && guard < 7) {
    guard++
    messages = [
      sys,
      { role: 'user', content: prompt },
      { role: 'assistant', content: full },
      {
        role: 'user',
        content:
          'Continue exactly where you left off. Output only the remaining code. Do not repeat anything already written.',
      },
    ]
    try {
      finish = await runOnce(messages)
    } catch {
      break
    }
  }

  // Parse fenced file blocks. A file streamed across continuation passes shows
  // up as multiple blocks for the same path — concatenate those in order so a
  // truncated file is stitched back together (mirrors ProjectsView).
  const parsed = parseCodeFiles(full)
  const fresh: Record<string, string> = {}
  for (const f of parsed) {
    fresh[f.path] = fresh[f.path] ? fresh[f.path] + '\n' + f.code : f.code
  }
  // Overlay the freshly written files onto any existing ones (a re-output of an
  // existing file replaces it; untouched files are preserved).
  const byPath: Record<string, string> = { ...(existing ?? {}), ...fresh }

  // Guarantee a runnable scaffold even if the model under-delivered.
  if (!byPath['/tailwind.ts']) byPath['/tailwind.ts'] = STARTER_FILES['/tailwind.ts']
  if (!byPath['/App.tsx']) byPath['/App.tsx'] = STARTER_FILES['/App.tsx']

  return { text: full, files: byPath }
}

/** A short, friendly title for a freshly built app, derived from its prompt. */
export async function titleFor(prompt: string, model?: string): Promise<string> {
  try {
    const t = await complete(
      model || CODER_MODEL,
      [
        {
          role: 'user',
          content: `Give a 2-4 word product-style title (no quotes, no punctuation) for an app built from this request: "${prompt.slice(0, 200)}"`,
        },
      ],
      { maxTokens: 16 },
    )
    const clean = (t || '').replace(/["'.\n]/g, '').trim()
    if (clean) return clean.slice(0, 48)
  } catch {
    /* fall through */
  }
  return prompt.trim().slice(0, 48) || 'New app'
}
