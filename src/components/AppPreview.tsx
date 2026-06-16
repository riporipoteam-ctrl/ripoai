// AppPreview — opens a single agent-built app with a live preview + code view,
// reusing the same Sandpack setup ProjectsView uses (template "react-ts",
// theme synced to the app's dark mode, file explorer + editor). It adds the
// per-app actions the gallery promises: edit (in the editor), ask the agent to
// change it, open the preview in a new tab, and download the source as files.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
  SandpackFileExplorer,
  useSandpack,
} from '@codesandbox/sandpack-react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Eye,
  Code2,
  Wand2,
  ExternalLink,
  Download,
  ArrowUp,
  Square,
  Sparkles,
} from 'lucide-react'
import { haptic, isNative } from '../lib/native'
import {
  buildAppFiles,
  saveApp,
  type AgentApp,
} from '../lib/agentApps'

type Tab = 'preview' | 'code'

export default function AppPreview({
  app,
  uid,
  onBack,
  onChange,
}: {
  app: AgentApp
  uid: string
  onBack: () => void
  /** Called with the updated app after edits/agent changes persist. */
  onChange: (app: AgentApp) => void
}) {
  const [files, setFiles] = useState<Record<string, string>>(app.files)
  const [tab, setTab] = useState<Tab>('preview')
  const [bundlerKey, setBundlerKey] = useState(0)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [liveText, setLiveText] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Hide the file explorer on phones so the editor isn't squeezed unusable.
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  )
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Reset local state when the opened app changes.
  useEffect(() => {
    setFiles(app.files)
    setBundlerKey((k) => k + 1)
    setTab('preview')
  }, [app.id])

  const sandpackFiles = useMemo(
    () => Object.fromEntries(Object.entries(files).map(([k, v]) => [k, { code: v }])),
    [files],
  )
  const dark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  function persist(nextFiles: Record<string, string>) {
    const saved = saveApp(uid, { ...app, files: nextFiles })
    onChange(saved)
  }

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  async function ask() {
    const prompt = input.trim()
    if (!prompt || streaming) return
    haptic('medium')
    setInput('')
    setStreaming(true)
    setLiveText('')
    setTab('code')
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const { files: next } = await buildAppFiles(prompt, {
        files,
        signal: ac.signal,
        onToken: setLiveText,
      })
      setFiles(next)
      setBundlerKey((k) => k + 1)
      persist(next)
      setTab('preview')
    } catch {
      /* aborted or failed — keep current files */
    } finally {
      setStreaming(false)
      abortRef.current = null
      setLiveText('')
    }
  }

  function openInNewTab() {
    haptic('light')
    // Build a standalone HTML doc that mounts the app via esm.sh + Babel so the
    // generated TSX runs in a plain browser tab. Tailwind comes from the CDN
    // the app already loads.
    const entry = files[app.entry] ?? files['/App.tsx'] ?? ''
    const helpers = Object.entries(files)
      .filter(([p]) => p !== app.entry && p !== '/App.tsx')
      .map(([p, c]) => `// ${p}\n${stripImports(c)}`)
      .join('\n\n')
    const html = standaloneHtml(app.title, helpers, stripImports(entry))
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  function download() {
    haptic('light')
    // No zip dep available — download each source file individually.
    for (const [path, code] of Object.entries(files)) {
      const blob = new Blob([code], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = path.replace(/^\//, '').replace(/\//g, '__')
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }
  }

  return (
    <div className={`flex h-full flex-col ${isNative ? 'pb-24' : ''}`}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line/60 px-3 py-2.5">
        <button
          onClick={onBack}
          className="pressable flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-ink/5 hover:text-ink"
          aria-label="Back to gallery"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-ink">{app.title}</div>
          <div className="truncate text-xs text-muted">Built by {app.agentName}</div>
        </div>
        <button
          onClick={openInNewTab}
          className="pressable flex h-11 items-center gap-1.5 rounded-xl border border-line/60 bg-card px-3 text-sm font-semibold text-ink"
          title="Open in new tab"
        >
          <ExternalLink size={16} /> <span className="hidden sm:inline">Open</span>
        </button>
        <button
          onClick={download}
          className="pressable flex h-11 items-center gap-1.5 rounded-xl border border-line/60 bg-card px-3 text-sm font-semibold text-ink"
          title="Download source"
        >
          <Download size={16} /> <span className="hidden sm:inline">Download</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 items-center gap-1 px-3 py-2">
        {(
          [
            { id: 'preview', label: 'Preview', icon: Eye },
            { id: 'code', label: 'Code', icon: Code2 },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pressable flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition ${
              tab === t.id ? 'accent-gradient-bg text-white' : 'text-muted hover:bg-ink/5'
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1 text-xs text-muted">
          <Sparkles size={12} className="text-accent" /> Live
        </span>
      </div>

      {/* Workspace */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-0 flex-1 px-3 pb-3"
      >
        {streaming ? (
          <LiveCodePanel text={liveText} />
        ) : (
          <SandpackProvider
            key={bundlerKey}
            template="react-ts"
            theme={dark ? 'dark' : 'light'}
            files={sandpackFiles}
            options={{ recompileMode: 'delayed', recompileDelay: 400, activeFile: app.entry }}
            style={{ height: '100%' }}
          >
            <SandpackLayout
              style={{ height: '100%', borderRadius: 18, border: '1px solid rgb(var(--line))' }}
            >
              {tab === 'code' && (
                <>
                  {!narrow && <SandpackFileExplorer style={{ height: '100%' }} />}
                  <SandpackCodeEditor
                    showLineNumbers
                    showInlineErrors
                    showTabs={narrow}
                    style={{ height: '100%', minWidth: 0, flex: 1 }}
                  />
                </>
              )}
              {tab === 'preview' && (
                <SandpackPreview showOpenInCodeSandbox={false} style={{ height: '100%' }} />
              )}
            </SandpackLayout>
            {tab === 'code' && <CodeSync onFiles={(f) => { setFiles(f); persist(f) }} />}
          </SandpackProvider>
        )}
      </motion.div>

      {/* Ask-the-agent composer */}
      <div className="shrink-0 px-3 pb-3">
        <div className="glass-strong flex items-end gap-2 rounded-2xl border border-line/60 p-2">
          <Wand2 size={18} className="mb-2 ml-1 shrink-0 text-accent" />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ask()
              }
            }}
            rows={1}
            placeholder="Ask the agent to change this app…"
            className="no-scrollbar max-h-28 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-ink outline-none placeholder:text-muted"
          />
          {streaming ? (
            <button
              onClick={stop}
              className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-ink text-bg"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={ask}
              disabled={!input.trim()}
              className="pressable accent-gradient-bg flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40"
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Keeps our file state in sync with edits the user makes inside Sandpack's
// editor so "edit" persists and Download/Open use the latest source.
function CodeSync({ onFiles }: { onFiles: (f: Record<string, string>) => void }) {
  const { sandpack } = useSandpack()
  const ref = useRef<string>('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const next: Record<string, string> = {}
    for (const [path, file] of Object.entries(sandpack.files)) {
      // Skip Sandpack's own hidden template files (index.html/index.tsx).
      if (path === '/index.html' || path === '/index.tsx' || path === '/public/index.html') continue
      next[path] = (file as { code: string }).code
    }
    const sig = JSON.stringify(next)
    if (sig === ref.current) return
    ref.current = sig
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onFiles(next), 800)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [sandpack.files, onFiles])
  return null
}

// ── Live "watch it code" panel while the agent streams (mirrors ProjectsView) ──
function LiveCodePanel({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [text])
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[18px] border border-line/60 bg-card">
      <div className="flex items-center gap-2 border-b border-line/60 px-3 py-2 text-xs">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
        </span>
        <span className="font-mono text-muted">building…</span>
        <span className="ml-auto flex items-center gap-1 text-accent">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> live
        </span>
      </div>
      <div
        ref={ref}
        className="no-scrollbar flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed text-ink/85"
      >
        <pre className="whitespace-pre-wrap break-words">
          {text || 'Thinking…'}
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />
        </pre>
      </div>
    </div>
  )
}

// ── Standalone HTML for "open in new tab" — runs the TSX via Babel + esm.sh ──
function stripImports(code: string): string {
  // Remove ESM import/export lines; we re-expose React globally and inline the
  // local modules instead, so the in-browser Babel transform can run flat.
  return code
    .replace(/^\s*import[^\n]*\n/gm, '')
    .replace(/^\s*export\s+default\s+function/m, 'function')
    .replace(/^\s*export\s+default\s+/m, 'const __default = ')
    .replace(/^\s*export\s+/gm, '')
}

function standaloneHtml(title: string, helpers: string, entry: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title.replace(/</g, '&lt;')}</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react,typescript" data-type="module">
const { useState, useEffect, useMemo, useRef, useCallback } = React
function useTailwindCDN() {}
${helpers}
${entry}
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
</script>
</body>
</html>`
}
