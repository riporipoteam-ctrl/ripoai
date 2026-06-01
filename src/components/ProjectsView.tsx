import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
  SandpackFileExplorer,
  SandpackConsole,
} from '@codesandbox/sandpack-react'
import { motion } from 'framer-motion'
import { Eye, Code2, Terminal, ArrowUp, Square, Sparkles, Wand2 } from 'lucide-react'
import { useStore } from '../store'
import { streamChat } from '../lib/groq'
import { streamPuter, isPuterSignedIn } from '../lib/puter'
import { haptic } from '../hooks/useSpeech'
import { CODER_MODEL, PUTER_CODER_MODEL } from '../lib/models'
import { CODING_SYSTEM } from '../lib/prompt'
import { parseCodeFiles } from '../lib/parseCode'
import { saveProject, type Project } from '../lib/db'
import { Markdown } from './Markdown'
import Spinner from './ui/Spinner'

interface CodeMsg {
  role: 'user' | 'assistant'
  content: string
}

type RightTab = 'preview' | 'code' | 'console'

export default function ProjectsView() {
  const { projectId } = useParams()
  const { user, projects, settings } = useStore()
  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId])

  const [files, setFiles] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<RightTab>('preview')
  const [bundlerKey, setBundlerKey] = useState(0)
  const [messages, setMessages] = useState<CodeMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [liveText, setLiveText] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const chatBottom = useRef<HTMLDivElement>(null)
  const loadedRef = useRef<string | undefined>(undefined)

  // Load project files when switching projects.
  useEffect(() => {
    if (!project || loadedRef.current === project.id) return
    loadedRef.current = project.id
    setFiles(project.files)
    setMessages([])
    setBundlerKey((k) => k + 1)
  }, [project])

  useEffect(() => {
    chatBottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, liveText])

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-muted">Project not found.</div>
    )
  }

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  async function applyAndSave(text: string, newFiles: Record<string, string>) {
    const parsed = parseCodeFiles(text)
    let updated = { ...newFiles }
    if (parsed.length) {
      for (const f of parsed) updated[f.path] = f.code
      setFiles(updated)
      setBundlerKey((k) => k + 1)
      setTab('preview')
    }
    if (user && project) {
      const next: Project = { ...project, files: updated, updatedAt: Date.now() }
      await saveProject(user.uid, next)
    }
  }

  async function send() {
    if (!input.trim() || streaming || !user || !project) return
    const userMsg: CodeMsg = { role: 'user', content: input.trim() }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setStreaming(true)
    setLiveText('')

    const fileContext = Object.entries(files)
      .map(([path, code]) => `--- ${path} ---\n${code}`)
      .join('\n\n')
      .slice(0, 6000)

    const ac = new AbortController()
    abortRef.current = ac
    let full = ''
    const useClaude = isPuterSignedIn()
    const sysMsg = {
      role: 'system' as const,
      content: `${CODING_SYSTEM}\n\nProject: ${project.name} (React template, entry /App.js).\nCurrent files:\n${fileContext}`,
    }
    const convo = history.map((m) => ({ role: m.role, content: m.content }))

    // Auto-continue: models cap output; if we stop mid-file, ask to continue and
    // stitch it together so the user never has to type "continue".
    async function runOnce(messages: any[]): Promise<string> {
      if (useClaude) {
        try {
          const r = await streamPuter({
            model: PUTER_CODER_MODEL,
            messages,
            signal: ac.signal,
            onToken: (d) => { haptic(4); full += d; setLiveText(full) },
          })
          if (full.trim()) return r.finishReason || ''
          // empty (no usage / blocked) → fall through to Groq
        } catch {
          // Puter failed (no usage left, etc.) → fall back to Groq.
        }
      }
      const r = await streamChat({
        model: CODER_MODEL,
        messages,
        temperature: 0.5,
        maxTokens: 7000,
        topP: 1,
        reasoningEffort: 'low',
        signal: ac.signal,
        onToken: (d) => { haptic(4); full += d; setLiveText(full) },
      })
      return r.finishReason || ''
    }

    function looksTruncated(text: string, finish: string): boolean {
      if (finish === 'length') return true
      const fences = (text.match(/```/g) || []).length
      return fences % 2 === 1 // an unclosed code block
    }

    try {
      let messages: any[] = [sysMsg, ...convo]
      let finish = await runOnce(messages)
      let guard = 0
      while (!ac.signal.aborted && looksTruncated(full, finish) && guard < 4) {
        guard++
        messages = [
          sysMsg,
          ...convo,
          { role: 'assistant', content: full },
          { role: 'user', content: 'Continue exactly where you left off. Do not repeat anything already written.' },
        ]
        finish = await runOnce(messages)
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') full += `\n\n⚠️ ${e?.message ?? 'error'}`
    } finally {
      setStreaming(false)
      abortRef.current = null
    }

    setMessages((m) => [...m, { role: 'assistant', content: full }])
    setLiveText('')
    await applyAndSave(full, files)
  }

  const sandpackFiles = Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k, { code: v }]),
  )

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Coding agent chat */}
      <div className="flex h-1/2 flex-col border-b border-white/10 md:h-full md:w-[42%] md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-4 py-3">
          <Wand2 size={18} className="text-accent" />
          <div className="font-bold">{project.name}</div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-muted">
            Coding agent
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          {messages.length === 0 && !streaming && (
            <div className="mt-6 text-sm text-muted">
              <p className="mb-3 font-semibold text-ink">Build anything — live.</p>
              <p>
                Describe what you want and the agent will write the code, which runs instantly in
                the preview. Try:
              </p>
              <div className="mt-3 space-y-2">
                {['Build a sleek todo app with local storage', 'Make a landing page for a coffee brand', 'Create an animated pricing section'].map(
                  (s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="glass pressable block w-full rounded-2xl px-3 py-2 text-left text-sm hover:brightness-110"
                    >
                      {s}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="glass max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-tr-lg px-4 py-2.5 text-sm">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="text-sm">
                <Markdown>{m.content}</Markdown>
              </div>
            ),
          )}
          {streaming && (
            <div className="text-sm">
              {liveText ? <Markdown>{liveText}</Markdown> : <Spinner size={18} />}
            </div>
          )}
          <div ref={chatBottom} />
        </div>

        <div className="p-3">
          <div className="glass-strong flex items-end gap-2 rounded-3xl p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={1}
              placeholder="Ask the agent to build or change something…"
              className="no-scrollbar max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted"
            />
            {streaming ? (
              <button
                onClick={stop}
                className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-ink text-surface"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="pressable accent-gradient-bg flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-40"
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sandpack workspace */}
      <div className="flex h-1/2 min-w-0 flex-1 flex-col md:h-full">
        <div className="flex items-center gap-1 px-4 py-2.5">
          {(
            [
              { id: 'preview', label: 'Preview', icon: Eye },
              { id: 'code', label: 'Code', icon: Code2 },
              { id: 'console', label: 'Console', icon: Terminal },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pressable flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                tab === t.id ? 'accent-gradient-bg text-white' : 'text-muted hover:bg-white/10'
              }`}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1 text-xs text-muted">
            <Sparkles size={12} className="text-accent" /> Live
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="min-h-0 flex-1 px-3 pb-3"
        >
          <SandpackProvider
            key={bundlerKey}
            template="react"
            theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
            files={sandpackFiles}
            options={{ recompileMode: 'delayed', recompileDelay: 400 }}
            style={{ height: '100%' }}
          >
            <SandpackLayout style={{ height: '100%', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
              {tab === 'code' && (
                <>
                  <SandpackFileExplorer style={{ height: '100%' }} />
                  <SandpackCodeEditor showLineNumbers showInlineErrors style={{ height: '100%' }} />
                </>
              )}
              {tab === 'preview' && <SandpackPreview showOpenInCodeSandbox={false} style={{ height: '100%' }} />}
              {tab === 'console' && <SandpackConsole style={{ height: '100%' }} />}
            </SandpackLayout>
          </SandpackProvider>
        </motion.div>
      </div>
    </div>
  )
}
