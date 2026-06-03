import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ArrowUp, Square, Globe, Bot, ImageIcon, Paperclip, X, FileText, Loader2, Mic, Phone, Sparkles } from 'lucide-react'
import ModelSelector from './ModelSelector'
import { useVoiceInput, hapticPattern } from '../hooks/useSpeech'
import { fileToAttachment } from '../lib/files'
import { IMAGE_STYLES } from '../lib/imagegen'
import type { Attachment } from '../lib/db'
import type { ModelTier } from '../lib/models'
import { haptic } from '../lib/native'
import Mascot, { type MascotState } from './Mascot'

interface Props {
  model: ModelTier
  onModelChange: (m: ModelTier) => void
  mascotState?: MascotState
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
  mascotState = 'idle',
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
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [plusOpen, setPlusOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const imgInput = useRef<HTMLInputElement>(null)
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
      {/* RipoAI mascot perched on the input */}
      <div className="absolute -top-9 left-4 z-10">
        <Mascot state={mascotState} size={48} />
      </div>
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

      <div className="glass-strong relative z-20 rounded-[28px] p-2">
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
            <AnimatePresence>
              {plusOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="glass-strong absolute bottom-12 left-0 z-30 w-52 overflow-hidden rounded-2xl p-1.5"
                >
                  <button
                    onClick={() => {
                      imgInput.current?.click()
                      setPlusOpen(false)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-white/10"
                  >
                    <ImageIcon size={17} className="text-accent" /> Upload image
                  </button>
                  <button
                    onClick={() => {
                      fileInput.current?.click()
                      setPlusOpen(false)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-white/10"
                  >
                    <Paperclip size={17} className="text-accent" /> Upload file
                  </button>
                  {onVoiceCall && (
                    <button
                      onClick={() => {
                        onVoiceCall()
                        setPlusOpen(false)
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-white/10"
                    >
                      <Phone size={17} className="text-accent" /> Voice call
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mode chips */}
          <button
            onClick={() => { haptic('select'); onToggleWeb() }}
            className={`pressable flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              webSearch ? 'accent-gradient-bg text-white' : 'border border-white/15 text-muted hover:text-ink'
            }`}
            title="Web search mode"
          >
            <Globe size={14} /> Search
          </button>
          <button
            onClick={() => { haptic('select'); onToggleAgent() }}
            className={`pressable flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              agent ? 'accent-gradient-bg text-white' : 'border border-white/15 text-muted hover:text-ink'
            }`}
            title="Agent mode (autonomous web research)"
          >
            <Bot size={14} /> Agent
          </button>
          {onToggleImage && (
            <button
              onClick={() => { haptic('select'); onToggleImage?.() }}
              className={`pressable flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                imageMode ? 'accent-gradient-bg text-white' : 'border border-white/15 text-muted hover:text-ink'
              }`}
              title="Image generation mode"
            >
              <Sparkles size={14} /> Image
            </button>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {showModelSelector && <ModelSelector value={model} onChange={onModelChange} />}
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
