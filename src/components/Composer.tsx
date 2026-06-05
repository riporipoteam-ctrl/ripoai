import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ArrowUp, Square, Globe, Bot, ImageIcon, Paperclip, X, FileText, Loader2, Mic, Phone, Sparkles, Check, Camera } from 'lucide-react'
import ModelSelector from './ModelSelector'
import { useVoiceInput, hapticPattern } from '../hooks/useSpeech'
import { fileToAttachment } from '../lib/files'
import { IMAGE_STYLES } from '../lib/imagegen'
import type { Attachment } from '../lib/db'
import type { ModelTier } from '../lib/models'
import { haptic } from '../lib/native'
import { matchSkills } from '../lib/skills'
import { useStore } from '../store'
import { Wand2 } from 'lucide-react'

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
  placeholder = 'Message RipoAI…',
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
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {attachments.map((a, i) => (
            <div key={i} className="glass relative flex items-center gap-2 rounded-2xl p-1.5 pr-7">
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
            </div>
          ))}
        </div>
      )}

      {imageMode && onImageStyle && (
        <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto px-1">
          {IMAGE_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => onImageStyle(s.id)}
              className={`pressable shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                (imageStyle ?? 'auto') === s.id
                  ? 'accent-gradient-bg text-white'
                  : 'border border-white/15 text-muted hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
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

      <div className="relative z-20 rounded-[26px] border border-white/15 bg-[rgb(var(--glass-bg)/0.5)] p-2 shadow-sm backdrop-blur-xl">
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
          placeholder={imageMode ? 'Describe an image to generate…' : placeholder}
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
              className="pressable flex items-center gap-1.5 rounded-full accent-gradient-bg px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Globe size={14} /> Search <X size={13} className="opacity-80" />
            </button>
          )}
          {agent && (
            <button
              onClick={() => { haptic('select'); onToggleAgent() }}
              className="pressable flex items-center gap-1.5 rounded-full accent-gradient-bg px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Bot size={14} /> Agent <X size={13} className="opacity-80" />
            </button>
          )}
          {imageMode && onToggleImage && (
            <button
              onClick={() => { haptic('select'); onToggleImage?.() }}
              className="pressable flex items-center gap-1.5 rounded-full accent-gradient-bg px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Sparkles size={14} /> Image <X size={13} className="opacity-80" />
            </button>
          )}

          <div className="ml-auto flex items-center gap-1.5">
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
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">
        RipoAI can make mistakes. Verify important information.
      </p>

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
