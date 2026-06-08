import { useRef, useState, useEffect, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  ArrowUp,
  Square,
  Globe,
  Bot,
  ImageIcon,
  Paperclip,
  X,
  FileText,
  Loader2,
  Mic,
  Phone,
  Sparkles,
  Check,
  Camera,
  Wand2,
  Eraser,
  Maximize2,
  Images,
  Code2,
  MapPin,
  Plane,
  Languages,
  Presentation,
  ListChecks,
  Lightbulb,
  ImagePlus,
  Search,
  Braces,
  type LucideIcon,
} from 'lucide-react'
import ModelSelector from './ModelSelector'
import { useVoiceInput, hapticPattern } from '../hooks/useSpeech'
import { fileToAttachment } from '../lib/files'
import { IMAGE_STYLES } from '../lib/imagegen'
import type { Attachment } from '../lib/db'
import type { ModelTier } from '../lib/models'
import { haptic } from '../lib/native'
import { matchSkills } from '../lib/skills'
import { useStore } from '../store'

interface Props {
  model: ModelTier
  onModelChange: (m: ModelTier) => void
  webSearch: boolean
  agent: boolean
  imageMode?: boolean
  imageStyle?: string
  onToggleWeb: () => void
  onToggleAgent: () => void
  onToggleImage?: () => void
  onImageStyle?: (id: string) => void
  onSend: (text: string, attachments: Attachment[]) => void
  onStop: () => void
  streaming: boolean
  placeholder?: string
  showModelSelector?: boolean
  onVoiceCall?: () => void
}

type QuickAction = {
  id: string
  label: string
  icon: LucideIcon
  prompt: string
  mode?: 'web' | 'image' | 'agent' | 'voice'
  wrap?: boolean
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'web-images', label: 'Web images', icon: Images, prompt: 'Find web images with preview cards and source links for ', wrap: true },
  { id: 'generate', label: 'Generate', icon: ImagePlus, prompt: 'Generate a high quality image of ', mode: 'image', wrap: true },
  { id: 'logo', label: 'Logo', icon: Sparkles, prompt: 'Generate a clean premium logo concept with readable text for ', mode: 'image', wrap: true },
  { id: 'edit-image', label: 'Edit image', icon: Wand2, prompt: 'Edit this image and improve it: ', mode: 'image', wrap: true },
  { id: 'deep-search', label: 'Deep search', icon: Search, prompt: 'Search the web and give sources for ', mode: 'web', wrap: true },
  { id: 'agent-plan', label: 'Agent', icon: Bot, prompt: 'Act as an agent and complete this step by step: ', mode: 'agent', wrap: true },
  { id: 'summarize', label: 'Summarize', icon: ListChecks, prompt: 'Summarize this clearly with action points: ', wrap: true },
  { id: 'files', label: 'Files', icon: FileText, prompt: 'Analyze the attached files and extract the important details.' },
  { id: 'code', label: 'Code fix', icon: Code2, prompt: 'Fix this code and explain the bug: ', wrap: true },
  { id: 'app', label: 'Build app', icon: Braces, prompt: 'Build a polished app with animations for ', wrap: true },
  { id: 'slides', label: 'Slides', icon: Presentation, prompt: 'Create a sharp slide deck outline for ', wrap: true },
  { id: 'translate', label: 'Translate', icon: Languages, prompt: 'Translate this and keep the tone natural: ', wrap: true },
  { id: 'ideas', label: 'Ideas', icon: Lightbulb, prompt: 'Give me 12 strong ideas for ', wrap: true },
  { id: 'places', label: 'Places', icon: MapPin, prompt: 'Find places near me for ', wrap: true },
  { id: 'trip', label: 'Trip', icon: Plane, prompt: 'Plan a realistic trip for ', wrap: true },
  { id: 'voice', label: 'Voice', icon: Mic, prompt: '', mode: 'voice' },
]

export default function Composer({
  model,
  onModelChange,
  webSearch,
  agent,
  imageMode,
  imageStyle,
  onToggleWeb,
  onToggleAgent,
  onToggleImage,
  onImageStyle,
  onSend,
  onStop,
  streaming,
  placeholder = 'Message RipoAI...',
  showModelSelector = true,
  onVoiceCall,
}: Props) {
  const { user } = useStore()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])

  // Slash-command skill picker: typing "/" (before a space) lists matching skills.
  const slashQuery = text.startsWith('/') && !text.includes(' ') ? text.slice(1) : null
  const slashSkills = slashQuery !== null && user ? matchSkills(user.uid, slashQuery).slice(0, 6) : []
  function pickSkill(slug: string) {
    setText(`/${slug} `)
    haptic('select')
    requestAnimationFrame(() => taRef.current?.focus())
  }
  const [plusOpen, setPlusOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)

  useEffect(() => {
    if (!plusOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [plusOpen])

  // "Ask RipoAI" from the text-selection toolbar → quote it into the composer.
  useEffect(() => {
    function onAsk(e: Event) {
      const t = (e as CustomEvent).detail as string
      if (!t) return
      const quote = t.length > 600 ? t.slice(0, 600) + '…' : t
      setText((prev) => `Regarding: "${quote}"\n\n${prev}`)
      requestAnimationFrame(() => {
        const ta = taRef.current
        if (ta) {
          ta.focus()
          ta.style.height = 'auto'
          ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'
          const end = ta.value.length
          ta.setSelectionRange(end, end)
        }
      })
    }
    window.addEventListener('ripoai-ask', onAsk as EventListener)
    return () => window.removeEventListener('ripoai-ask', onAsk as EventListener)
  }, [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const imgInput = useRef<HTMLInputElement>(null)
  const camInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const voice = useVoiceInput((t) => {
    setText(t)
    requestAnimationFrame(autosize)
  })

  function autosize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setErr('')
    setBusy(true)
    try {
      const next: Attachment[] = []
      for (const f of Array.from(files)) next.push(await fileToAttachment(f))
      setAttachments((a) => [...a, ...next])
    } catch (e: any) {
      setErr(e?.message ?? 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  // Paste an image straight from the clipboard (screenshots, copied pics).
  async function handlePaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData?.items ?? []).filter((i) => i.type.startsWith('image/'))
    if (!imgs.length) return
    e.preventDefault()
    const files = imgs.map((i) => i.getAsFile()).filter(Boolean) as File[]
    const dt = new DataTransfer()
    files.forEach((f) => dt.items.add(f))
    haptic('light')
    await handleFiles(dt.files)
  }

  const focusComposer = () => requestAnimationFrame(() => taRef.current?.focus())

  function applyQuickAction(action: QuickAction) {
    haptic('select')
    setPlusOpen(false)

    if (action.mode === 'voice') {
      onVoiceCall?.()
      return
    }

    if (action.mode === 'web' && !webSearch) onToggleWeb()
    if (action.mode === 'image' && onToggleImage && !imageMode) onToggleImage()
    if (action.mode === 'agent' && !agent) onToggleAgent()

    setText((previous) => {
      const clean = previous.trim()
      if (action.wrap && clean) return `${action.prompt}${clean}`
      return action.prompt
    })

    setTimeout(() => {
      autosize()
      focusComposer()
    }, 0)
  }

  function enhancePrompt() {
    haptic('light')
    setText((previous) => {
      const clean = previous.trim()
      return clean
        ? `Improve this request for a precise, useful RipoAI answer:\n\n${clean}`
        : 'Improve this request for a precise, useful RipoAI answer: '
    })
    setTimeout(() => {
      autosize()
      focusComposer()
    }, 0)
  }

  function clearComposer() {
    haptic('light')
    setText('')
    setPlusOpen(false)
    focusComposer()
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    void handleFiles(event.dataTransfer.files)
  }

  function submit() {
    if (streaming || busy) return
    if (!text.trim() && attachments.length === 0) return
    haptic('medium')
    onSend(text, attachments)
    setText('')
    setAttachments([])
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      {err && <p className="mb-2 px-2 text-xs text-red-400">{err}</p>}
      {!!attachments.length && (
        <motion.div layout className="mb-2 flex flex-wrap gap-2 px-1">
          {attachments.map((a, i) => (
            <motion.div
              key={i}
              layout
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              className="glass relative flex items-center gap-2 rounded-2xl p-1.5 pr-7"
            >
              {a.kind === 'image' && a.url ? (
                <img src={a.url} alt={a.name} className="h-12 w-12 rounded-xl object-cover" />
              ) : (
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
                  <FileText size={16} className="text-accent" />
                  <span className="max-w-[140px] truncate">{a.name}</span>
                </div>
              )}
              <button
                onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
              >
                <X size={12} />
              </button>
            </motion.div>
          ))}
        </motion.div>
      )}

      {imageMode && onImageStyle && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          className="image-style-strip no-scrollbar mb-2 flex gap-1.5 overflow-x-auto px-1"
        >
          {IMAGE_STYLES.map((s) => (
            <motion.button
              key={s.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => onImageStyle(s.id)}
              className={`image-style-chip pressable shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                (imageStyle ?? 'auto') === s.id
                  ? 'accent-gradient-bg text-white'
                  : 'border border-white/15 text-muted hover:text-ink'
              }`}
            >
              {s.label}
            </motion.button>
          ))}
        </motion.div>
      )}

      {/* Slash skill picker */}
      <AnimatePresence>
        {slashSkills.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="glass-strong mb-2 max-h-64 overflow-y-auto rounded-2xl p-1.5 shadow-xl"
          >
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted/70">Skills</div>
            {slashSkills.map((s) => (
              <button
                key={s.id}
                onClick={() => pickSkill(s.slug)}
                className="pressable flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-white/10"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Wand2 size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {s.name} <span className="font-normal text-muted">/{s.slug}</span>
                  </span>
                  {s.description && <span className="block truncate text-xs text-muted">{s.description}</span>}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {createPortal(
        <AnimatePresence>
          {focusOpen && (
            <motion.div
              className="focus-composer-overlay fixed inset-0 z-[130] flex items-end justify-center bg-black/20 p-3 backdrop-blur-xl sm:items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFocusOpen(false)}
            >
              <motion.div
                className="focus-composer-panel w-full max-w-3xl rounded-[30px] border border-white/20 bg-white/70 p-3 shadow-2xl backdrop-blur-3xl dark:bg-black/55"
                initial={{ y: 26, scale: 0.98 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 26, scale: 0.98 }}
                onClick={(event) => event.stopPropagation()}
              >
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Write the full request..."
                  className="min-h-[220px] w-full resize-none rounded-[22px] border border-black/5 bg-white/45 p-4 text-base outline-none backdrop-blur-xl placeholder:text-[rgb(var(--muted))] dark:border-white/10 dark:bg-white/5"
                  autoFocus
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button className="composer-tool" type="button" title="Improve prompt" onClick={enhancePrompt}>
                    <Wand2 size={16} />
                  </button>
                  <button className="composer-tool" type="button" title="Clear" onClick={clearComposer}>
                    <Eraser size={16} />
                  </button>
                  <span className="composer-meter ml-auto">{text.length} chars</span>
                  <button className="rounded-full px-4 py-2 text-sm font-semibold text-[rgb(var(--muted))] hover:bg-black/5" type="button" onClick={() => setFocusOpen(false)}>
                    Close
                  </button>
                  <button
                    className="rounded-full bg-[rgb(var(--ink))] px-4 py-2 text-sm font-semibold text-[rgb(var(--paper))] disabled:opacity-45"
                    type="button"
                    disabled={!text.trim() && attachments.length === 0}
                    onClick={() => {
                      setFocusOpen(false)
                      submit()
                    }}
                  >
                    Send
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <div className="quick-action-rail no-scrollbar mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="RipoAI quick features">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <motion.button
              key={action.id}
              type="button"
              whileTap={{ scale: 0.96 }}
              className="quick-action-chip inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/34 px-3 py-2 text-xs font-semibold text-[rgb(var(--ink))] shadow-sm backdrop-blur-2xl transition hover:bg-white/55 dark:border-white/[0.08] dark:bg-white/[0.06]"
              onClick={() => applyQuickAction(action)}
              title={action.label}
            >
              <Icon size={14} />
              <span>{action.label}</span>
            </motion.button>
          )
        })}
      </div>

      <motion.div
        layout
        className={`composer-shell floating-composer relative z-20 rounded-[28px] border border-white/[0.12] bg-[rgb(var(--glass-bg)/0.08)] p-2 shadow-sm backdrop-blur-2xl ${dragging ? 'composer-drop-hot' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            autosize()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          onPaste={handlePaste}
          rows={1}
          placeholder={imageMode ? 'Describe an image to generate...' : placeholder}
          className="no-scrollbar max-h-[220px] w-full resize-none bg-transparent px-3 py-2 text-[0.975rem] outline-none placeholder:text-muted"
        />

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 px-1">
          {/* Plus menu */}
          <div className="relative shrink-0">
            <button
              onClick={() => setPlusOpen((o) => !o)}
              className={`pressable flex h-9 w-9 items-center justify-center rounded-full transition ${plusOpen ? 'bg-accent text-white' : 'hover:bg-white/10'}`}
              title="Add"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={20} className={plusOpen ? 'rotate-45 transition-transform' : 'transition-transform'} />}
            </button>
            {createPortal(
              <AnimatePresence>
                {plusOpen && (
                  <motion.div
                    className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div
                      className="absolute inset-0 bg-black/45 backdrop-blur-sm"
                      onClick={() => setPlusOpen(false)}
                    />
                    <motion.div
                      initial={{ y: '100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '100%' }}
                      transition={{ type: 'spring', stiffness: 360, damping: 34 }}
                      className="glass-strong relative w-full max-w-lg rounded-t-[28px] p-3 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl sm:mb-0 sm:rounded-[28px]"
                    >
                      <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[rgb(var(--muted)/0.4)] sm:hidden" />
                      <button
                        onClick={() => {
                          camInput.current?.click()
                          setPlusOpen(false)
                        }}
                        className="pressable flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-[15px] font-medium hover:bg-white/10"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                          <Camera size={18} />
                        </span>
                        Take photo
                      </button>
                      <button
                        onClick={() => {
                          imgInput.current?.click()
                          setPlusOpen(false)
                        }}
                        className="pressable flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-[15px] font-medium hover:bg-white/10"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                          <ImageIcon size={18} />
                        </span>
                        Upload image
                      </button>
                      <button
                        onClick={() => {
                          fileInput.current?.click()
                          setPlusOpen(false)
                        }}
                        className="pressable flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-[15px] font-medium hover:bg-white/10"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                          <Paperclip size={18} />
                        </span>
                        Upload file
                      </button>

                      <div className="my-1.5 h-px bg-white/10" />
                      <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-muted/70">
                        Modes
                      </div>
                      <button
                        onClick={() => { haptic('select'); onToggleWeb(); setPlusOpen(false) }}
                        className={`pressable flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-[15px] font-medium ${webSearch ? 'bg-accent/15' : 'hover:bg-white/10'}`}
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                          <Globe size={18} />
                        </span>
                        Web search
                        {webSearch && <Check size={18} className="ml-auto text-accent" />}
                      </button>
                      <button
                        onClick={() => { haptic('select'); onToggleAgent(); setPlusOpen(false) }}
                        className={`pressable flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-[15px] font-medium ${agent ? 'bg-accent/15' : 'hover:bg-white/10'}`}
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                          <Bot size={18} />
                        </span>
                        Agent
                        {agent && <Check size={18} className="ml-auto text-accent" />}
                      </button>
                      {onToggleImage && (
                        <button
                          onClick={() => { haptic('select'); onToggleImage?.(); setPlusOpen(false) }}
                          className={`pressable flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-[15px] font-medium ${imageMode ? 'bg-accent/15' : 'hover:bg-white/10'}`}
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                            <Sparkles size={18} />
                          </span>
                          Generate image
                          {imageMode && <Check size={18} className="ml-auto text-accent" />}
                        </button>
                      )}

                      <div className="my-1.5 h-px bg-white/10" />
                      {onVoiceCall && (
                        <button
                          onClick={() => {
                            onVoiceCall()
                            setPlusOpen(false)
                          }}
                          className="pressable flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-[15px] font-medium hover:bg-white/10"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                            <Phone size={18} />
                          </span>
                          Voice call
                        </button>
                      )}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>,
              document.body,
            )}
          </div>

          {/* Active mode pill (modes now live in the + menu) */}
          {webSearch && (
            <button
              onClick={() => { haptic('select'); onToggleWeb() }}
              className="mode-chip pressable flex items-center gap-1.5 rounded-full accent-gradient-bg px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Globe size={14} /> Search <X size={13} className="opacity-80" />
            </button>
          )}
          {agent && (
            <button
              onClick={() => { haptic('select'); onToggleAgent() }}
              className="mode-chip pressable flex items-center gap-1.5 rounded-full accent-gradient-bg px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Bot size={14} /> Agent <X size={13} className="opacity-80" />
            </button>
          )}
          {imageMode && onToggleImage && (
            <button
              onClick={() => { haptic('select'); onToggleImage?.() }}
              className="mode-chip pressable flex items-center gap-1.5 rounded-full accent-gradient-bg px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Sparkles size={14} /> Image <X size={13} className="opacity-80" />
            </button>
          )}

          <button className="composer-tool" type="button" title="Improve prompt" onClick={enhancePrompt}>
            <Wand2 size={16} />
          </button>
          <button className="composer-tool" type="button" title="Clear composer" onClick={clearComposer}>
            <Eraser size={16} />
          </button>
          <button className="composer-tool" type="button" title="Focus composer" onClick={() => setFocusOpen(true)}>
            <Maximize2 size={16} />
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="composer-meter hidden sm:inline-flex">{attachments.length ? `${attachments.length} files` : `${text.length} chars`}</span>
            {showModelSelector && (
              <ModelSelector value={model} onChange={onModelChange} />
            )}
            {voice.supported && !streaming && (
              <button
                onClick={() => {
                  hapticPattern([10])
                  voice.listening ? voice.stop() : voice.start()
                }}
                className={`pressable flex h-9 w-9 items-center justify-center rounded-full transition ${
                  voice.listening ? 'bg-red-500 text-white' : 'text-muted hover:bg-white/10 hover:text-ink'
                }`}
                title="Voice input"
              >
                <Mic size={18} className={voice.listening ? 'animate-pulse' : ''} />
              </button>
            )}
            {streaming ? (
              <button
                onClick={onStop}
                className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-ink text-surface"
                title="Stop"
              >
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!text.trim() && attachments.length === 0}
                className="pressable accent-gradient-bg flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-40"
                title="Send"
              >
                <ArrowUp size={19} />
              </button>
            )}
          </div>
        </div>
      </motion.div>
      <input
        ref={imgInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={camInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css,.pdf,text/*"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
