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
import { streamChat, complete } from '../lib/groq'
import { fileToAttachment } from '../lib/files'
import { getModel, CODER_MODEL, type ModelTier } from '../lib/models'
import type { Attachment } from '../lib/db'
import { haptic } from '../hooks/useSpeech'
import { CODING_SYSTEM, WEB3D_INSTRUCTIONS, wants3D } from '../lib/prompt'
import { buildAssetPrompt } from '../lib/assets3d'
import { extractSocialImages, buildSocialPrompt } from '../lib/social'
import { parseCodeFiles, pathFromInfo } from '../lib/parseCode'
import { saveProject, type Project } from '../lib/db'
import ModelSelector from './ModelSelector'
import { Markdown } from './Markdown'

interface CodeMsg {
  role: 'user' | 'assistant'
  content: string
}

// Show only the prose (no raw code) in the agent chat; code lives in the workspace.
function proseOf(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/```[\s\S]*$/, '')
    .replace(/<!doctype html>[\s\S]*$/i, '')
    .replace(/<html[\s\S]*$/i, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
// A short, friendly one-liner for the chat transcript — never raw code/HTML.
function summaryOf(text: string, fileCount: number): string {
  let s = proseOf(text).split('\n').filter(Boolean).slice(0, 2).join(' ').trim()
  if (s.length > 220) s = s.slice(0, 220).trim() + '…'
  if (!s) s = fileCount ? `Built ${fileCount} file${fileCount === 1 ? '' : 's'} — check the preview.` : 'Done.'
  return s
}
function fileList(text: string): string[] {
  return Array.from(new Set(parseCodeFiles(text).map((f) => f.path)))
}
function FileChips({ paths }: { paths: string[] }) {
  if (!paths.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {paths.map((p) => (
        <span key={p} className="flex items-center gap-1 rounded-lg bg-white/8 px-2 py-1 text-xs text-muted">
          <Code2 size={12} className="text-accent" /> {p.replace(/^\//, '')}
        </span>
      ))}
    </div>
  )
}

// Live "watch it code" view: parses the in-flight stream into per-file blocks and
// shows the code typing out into an editor-like panel as it arrives.
interface StreamBlock {
  path: string
  code: string
  open: boolean
}
function streamBlocks(text: string): StreamBlock[] {
  const parts = text.split('```')
  const out: StreamBlock[] = []
  for (let i = 1; i < parts.length; i += 2) {
    const block = parts[i]
    const nl = block.indexOf('\n')
    const info = (nl === -1 ? block : block.slice(0, nl)).trim()
    const code = nl === -1 ? '' : block.slice(nl + 1)
    const open = i === parts.length - 1 // a trailing, still-streaming block
    if (!info && !code.trim()) continue
    out.push({ path: pathFromInfo(info) || info || 'code', code, open })
  }
  return out
}

function LiveCodePanel({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const blocks = streamBlocks(text)
  const active = blocks.length ? blocks[blocks.length - 1] : null
  const status = !blocks.length ? proseOf(text) || text.trim() : ''
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [text])
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[20px] border border-white/10 bg-[#0c0d12]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
        </span>
        <span className="font-mono text-white/70">
          {active ? active.path.replace(/^\//, '') : 'workspace'}
        </span>
        <span className="ml-auto flex items-center gap-1 text-accent">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> live
        </span>
      </div>
      <div ref={ref} className="no-scrollbar flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed text-white/85">
        {status && <div className="text-white/60">{status}</div>}
        {blocks.map((b, i) => (
          <div key={i} className="mb-4">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-accent/80">{b.path.replace(/^\//, '')}</div>
            <pre className="whitespace-pre-wrap break-words">
              {b.code}
              {b.open && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />}
            </pre>
          </div>
        ))}
      </div>
    </div>
  )
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
  const [model, setModel] = useState<ModelTier>(settings.defaultModel === 'auto' ? 'ripoai-2o-pro' : settings.defaultModel)
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
    setMessages((project.chat as CodeMsg[]) ?? [])
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

  async function applyAndSave(text: string, newFiles: Record<string, string>, chat?: CodeMsg[]) {
    let parsed = parseCodeFiles(text)
    // Last-ditch salvage: the model clearly wrote HTML but in a shape the parser
    // missed — wrap the raw markup as index.html so the build never comes up empty.
    if (!parsed.length && /<\/?(html|body|div|section|header|main|h1|canvas)\b/i.test(text)) {
      const start = text.search(/<!doctype html>|<html|<body|<section|<header|<main|<div/i)
      if (start >= 0) parsed = [{ path: '/index.html', code: text.slice(start) }]
    }
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
      const next: Project = {
        ...project,
        files: updated,
        chat: (chat ?? messages).slice(-60),
        updatedAt: Date.now(),
      }
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
    setMobileView('build') // let the user watch it code live

    const fileContext = Object.entries(files)
      .map(([path, code]) => `--- ${path} ---\n${code}`)
      .join('\n\n')
      .slice(0, 6000)

    const ac = new AbortController()
    abortRef.current = ac
    let full = ''

    // Search before coding: for real brands / topics / "about X" builds, grab
    // current facts + good image keywords so the site uses accurate content.
    const want3D = wants3D(userText)
    let research = ''
    const needsResearch = /\b(about|company|brand|for (a|the|my) |real|current|latest|product|menu|prices?|portfolio|store|shop|restaurant|startup|agency)\b/i.test(userText)
    if (needsResearch && messages.length < 3) {
      try {
        setLiveText('🔎 Researching…')
        research = await complete(
          'groq/compound',
          [{ role: 'user', content: `For building a website about: "${userText.slice(0, 220)}". Give 4-6 short, accurate, current factual bullets. Then a line "REAL IMAGE URLS: <up to 4 direct https links to real public images (logos/products/photos) ending in .jpg/.png/.webp if you can find them, else none>". Then a final line "IMAGE KEYWORDS: <comma keywords for loremflickr>". The image keywords MUST match the exact requested subject, brand, product, vehicle, place, or industry. If the request is about cars, Peugeot, mechanics, garages, or automotive service, use car/vehicle/automotive/mechanic/garage keywords and never nature/forest/mountain keywords unless nature is requested.` }],
          { maxTokens: 500 },
        )
        setLiveText('')
      } catch {
        setLiveText('')
      }
    }

    // 3D requested → actually search the web for art-direction (what the subject
    // looks like, motion ideas, palette) and attach a verified, CORS-enabled model
    // catalog matched to the request so the agent loads a real, good-looking asset.
    let asset3D = ''
    if (want3D) {
      asset3D = `\n\n${buildAssetPrompt(userText)}`
      if (messages.length < 3) {
        try {
          setLiveText('🔎 Finding the best 3D + motion references…')
          const dir = await complete(
            'groq/compound',
            [{ role: 'user', content: `I'm building an Awwwards-tier 3D website for: "${userText.slice(0, 220)}". In 5-7 short bullets give concrete art direction: the hero 3D subject, how it should move/animate on scroll, a color palette (hex), font pairing, and section ideas. End with a line "IMAGE KEYWORDS: <comma keywords for loremflickr>". The keywords must be literal subject keywords from the request, not generic nature fillers.` }],
            { maxTokens: 500 },
          )
          if (dir) asset3D += `\n\nArt direction (from research — follow it):\n${dir}`
          setLiveText('')
        } catch {
          setLiveText('')
        }
      }
    }

    // Real profile photos from any social handles the user mentioned.
    const social = buildSocialPrompt(extractSocialImages(userText))

    // When the user asks for 3D / scroll motion / animation, fold in the full
    // premium Awwwards-tier 3D directives so it actually loads real glTF models.
    const sysMsg = {
      role: 'system' as const,
      content:
        `${CODING_SYSTEM}` +
        (want3D ? `\n\n${WEB3D_INSTRUCTIONS}${asset3D}` : '') +
        (social ? `\n\n${social}` : '') +
        `\n\nProject: ${project.name} (static website, entry /index.html).\nCurrent files:\n${fileContext}` +
        (research ? `\n\nResearched facts to use (be accurate; prefer the REAL IMAGE URLS for real photos with an onerror fallback to loremflickr keywords). Use subject-matched images only; do not substitute nature photos unless the user asked for nature:\n${research}` : ''),
    }
    const convo = history.map((m, i) =>
      i === history.length - 1 ? { role: m.role, content: userText } : { role: m.role, content: m.content },
    )

    // Auto-continue: models cap output; if we stop mid-file, ask to continue and
    // stitch it together so the user never has to type "continue".
    async function runOnce(messages: any[], continuation = false): Promise<string> {
      const m = getModel(model)
      const before = full.length
      // Try the chosen model (NVIDIA worker for 4o tiers) on the first pass.
      if (!continuation && m.provider === 'nvidia' && m.nvModel) {
        try {
          const r = await streamChat({
            provider: 'nvidia',
            model: m.nvModel,
            messages,
            temperature: 0.5,
            maxTokens: 8000,
            topP: 1,
            signal: ac.signal,
            onToken: (d) => { haptic(4); full += d; setLiveText(full) },
          })
          if (full.length > before) return r.finishReason || ''
        } catch {
          /* fall through to reliable Groq */
        }
      }
      // Fast, reliable Groq: the chosen model's Groq backing (or gpt-oss-120b).
      const groqModel = m.groqModel && m.provider !== 'openrouter' ? m.groqModel : CODER_MODEL
      const r = await streamChat({
        model: groqModel || CODER_MODEL,
        messages,
        temperature: 0.5,
        maxTokens: 8000,
        topP: 1,
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
      while (!ac.signal.aborted && looksTruncated(full, finish) && guard < 7) {
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

    const finalChat: CodeMsg[] = [...history, { role: 'assistant', content: full }]
    setMessages(finalChat)
    setLiveText('')
    await applyAndSave(full, files, finalChat)
  }

  const sandpackFiles = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, { code: v }]))
  // Render whatever the agent actually wrote: static (index.html) or React.
  const fileKeys = Object.keys(files)
  const sandpackTemplate: 'static' | 'react' = fileKeys.includes('/index.html')
    ? 'static'
    : fileKeys.some((k) => /App\.(jsx?|tsx)$/.test(k) || k === '/App.js')
      ? 'react'
      : 'static'

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
          <div className="ml-auto">
            <ModelSelector value={model} onChange={setModel} />
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
                {['Cinematic 3D landing page with a robot that reacts as I scroll', 'Portfolio site using my Instagram @username photos', 'Sleek product page for a sneaker with a spinning 3D model'].map(
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
          {messages.map((m, i) => {
            if (m.role === 'user') {
              return (
                <div key={i} className="flex justify-end">
                  <div className="glass max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-tr-lg px-4 py-2.5 text-sm">
                    {m.content}
                  </div>
                </div>
              )
            }
            const paths = fileList(m.content)
            // Built something → clean status card (never dump raw code in chat).
            if (paths.length) {
              return (
                <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                  <div className="flex items-start gap-2 font-medium text-ink">
                    <Code2 size={15} className="mt-0.5 shrink-0 text-accent" />
                    <span>{summaryOf(m.content, paths.length)}</span>
                  </div>
                  <FileChips paths={paths} />
                </div>
              )
            }
            // Pure prose (a question/answer with no code) → render normally.
            const prose = proseOf(m.content)
            return prose ? (
              <div key={i} className="text-sm">
                <Markdown>{prose}</Markdown>
              </div>
            ) : null
          })}
          {streaming && (
            <div className="flex items-center gap-2 py-1 text-sm font-medium text-muted">
              <span className="bg-gradient-to-r from-accent via-ink to-accent bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">
                Coding…
              </span>
              {fileList(liveText).length > 0 && (
                <span className="text-xs">· {fileList(liveText).length} file{fileList(liveText).length === 1 ? '' : 's'}</span>
              )}
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.4s]" />
              </span>
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
          {streaming ? (
            <LiveCodePanel text={liveText} />
          ) : (
          <SandpackProvider
            key={bundlerKey}
            template={sandpackTemplate}
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
          )}
        </motion.div>
      </div>
    </div>
  )
}
