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
import { Eye, Code2, Terminal, ArrowUp, Square, Sparkles, Wand2, Paperclip, X, FileText } from 'lucide-react'
import { useStore } from '../store'
import { streamChat, complete, getOpenRouterKey } from '../lib/groq'
import { fileToAttachment } from '../lib/files'
import { getModel } from '../lib/models'
import type { Attachment } from '../lib/db'
import { haptic } from '../hooks/useSpeech'
import { CODER_MODEL } from '../lib/models'
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
  const [mobileView, setMobileView] = useState<'chat' | 'build'>('chat')
  const [coderModel, setCoderModel] = useState<'fast' | 'smart' | 'pro'>('smart')
  const [attached, setAttached] = useState<Attachment[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
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
      // If a file was streamed across multiple blocks (truncation + continue),
      // concatenate the parts in order instead of overwriting with a fragment.
      const byPath: Record<string, string> = {}
      for (const f of parsed) byPath[f.path] = byPath[f.path] ? byPath[f.path] + '\n' + f.code : f.code
      for (const [path, code] of Object.entries(byPath)) updated[path] = code
      setFiles(updated)
      setBundlerKey((k) => k + 1)
      setTab('preview')
      setMobileView('build')
    }
    if (user && project) {
      const next: Project = { ...project, files: updated, updatedAt: Date.now() }
      await saveProject(user.uid, next)
    }
  }

  async function send() {
    if ((!input.trim() && !attached.length) || streaming || !user || !project) return
    const atts = attached
    let userText = input.trim()

    // Fold attachments into the prompt: text/code files inline; images get
    // described by the vision model so the coder can match a reference.
    if (atts.length) {
      const fileParts = atts
        .filter((a) => a.kind === 'file' && a.text)
        .map((a) => `\n\n[Attached file ${a.name}]\n${a.text?.slice(0, 6000)}`)
      userText += fileParts.join('')
      const imgs = atts.filter((a) => a.kind === 'image' && a.url)
      for (const img of imgs) {
        try {
          const desc = await complete(
            getModel('ripoai-2o-instant').groqModel,
            [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Describe this reference image in detail (layout, colors, style, content) so it can be recreated as a website.' } as any,
                  { type: 'image_url', image_url: { url: img.url! } } as any,
                ] as any,
              },
            ],
            { maxTokens: 400 },
          )
          if (desc) userText += `\n\n[Reference image "${img.name}"]: ${desc}`
        } catch {
          userText += `\n\n[A reference image "${img.name}" was attached.]`
        }
      }
    }

    const userMsg: CodeMsg = { role: 'user', content: input.trim() || '(see attachments)' }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setAttached([])
    setStreaming(true)
    setLiveText('')

    const fileContext = Object.entries(files)
      .map(([path, code]) => `--- ${path} ---\n${code}`)
      .join('\n\n')
      .slice(0, 6000)

    const ac = new AbortController()
    abortRef.current = ac
    let full = ''
    const sysMsg = {
      role: 'system' as const,
      content: `${CODING_SYSTEM}\n\nProject: ${project.name} (static website, entry /index.html).\nCurrent files:\n${fileContext}`,
    }
    const convo = history.map((m, i) =>
      i === history.length - 1 ? { role: m.role, content: userText } : { role: m.role, content: m.content },
    )

    // Auto-continue: models cap output; if we stop mid-file, ask to continue and
    // stitch it together so the user never has to type "continue".
    async function runOnce(messages: any[], continuation = false): Promise<string> {
      const before = full.length
      // First pass on the selected model; continuations always use fast+reliable
      // Groq so the file is guaranteed to finish (free OpenRouter often drops).
      if (!continuation && coderModel === 'pro' && getOpenRouterKey()) {
        try {
          const r = await streamChat({
            provider: 'openrouter',
            model: 'moonshotai/kimi-k2.6:free',
            messages,
            temperature: 0.6,
            maxTokens: 5000,
            topP: 1,
            signal: ac.signal,
            onToken: (d) => { haptic(4); full += d; setLiveText(full) },
          })
          if (full.length > before) return r.finishReason || ''
        } catch {
          /* fall through to Groq */
        }
      }
      const useFast = !continuation && coderModel === 'fast'
      const r = await streamChat({
        model: useFast ? 'llama-3.3-70b-versatile' : CODER_MODEL,
        messages,
        temperature: 0.5,
        maxTokens: 5000,
        topP: 1,
        reasoningEffort: useFast ? undefined : 'low',
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
          { role: 'user', content: 'Continue exactly where you left off. Output only the remaining code. Do not repeat anything already written.' },
        ]
        try {
          finish = await runOnce(messages, true)
        } catch {
          // A continuation failed — keep what we have and stop gracefully.
          break
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError' && !full.trim()) full += `⚠️ ${e?.message ?? 'Something went wrong — try again.'}`
    } finally {
      setStreaming(false)
      abortRef.current = null
    }

    setMessages((m) => [...m, { role: 'assistant', content: full }])
    setLiveText('')
    await applyAndSave(full, files)
  }

  const sandpackFiles = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, { code: v }]))

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Mobile Chat/Build toggle */}
      <div className="flex shrink-0 gap-1 p-2 md:hidden">
        {(['chat', 'build'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setMobileView(v)}
            className={`pressable flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              mobileView === v ? 'accent-gradient-bg text-white' : 'glass text-muted'
            }`}
          >
            {v === 'chat' ? 'Agent' : 'Workspace'}
          </button>
        ))}
      </div>

      {/* Coding agent chat */}
      <div
        className={`${mobileView === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col md:flex md:h-full md:w-[42%] md:flex-none md:border-r md:border-white/10`}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <Wand2 size={18} className="text-accent" />
          <div className="truncate font-bold">{project.name}</div>
          <div className="ml-auto flex gap-0.5 rounded-full bg-white/5 p-0.5">
            {(
              [
                { id: 'fast', label: 'Fast' },
                { id: 'smart', label: 'Smart' },
                { id: 'pro', label: 'Pro' },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                onClick={() => setCoderModel(o.id)}
                title={o.id === 'fast' ? 'Fastest' : o.id === 'smart' ? 'Balanced (recommended)' : 'Most powerful (slower)'}
                className={`pressable rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  coderModel === o.id ? 'accent-gradient-bg text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
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
          {!!attached.length && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attached.map((a, i) => (
                <div key={i} className="glass relative flex items-center gap-2 rounded-xl p-1 pr-6">
                  {a.kind === 'image' && a.url ? (
                    <img src={a.url} alt={a.name} className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 py-1 text-xs">
                      <FileText size={14} className="text-accent" />
                      <span className="max-w-[100px] truncate">{a.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => setAttached((arr) => arr.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5 text-white"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="glass-strong flex items-end gap-2 rounded-3xl p-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/10 hover:text-ink"
              title="Attach image or file"
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css,.pdf"
              multiple
              hidden
              onChange={async (e) => {
                const fs = e.target.files
                if (fs)
                  for (const f of Array.from(fs)) {
                    try {
                      const att = await fileToAttachment(f)
                      setAttached((a) => [...a, att])
                    } catch {
                      /* ignore */
                    }
                  }
                e.target.value = ''
              }}
            />
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
                disabled={!input.trim() && !attached.length}
                className="pressable accent-gradient-bg flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-40"
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sandpack workspace */}
      <div
        className={`${mobileView === 'build' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col md:flex md:h-full`}
      >
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
            template="static"
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
