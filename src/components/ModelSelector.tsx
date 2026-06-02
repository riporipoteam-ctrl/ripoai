import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check, Sparkles } from 'lucide-react'
import { MODEL_LIST, type ModelTier } from '../lib/models'

const CATEGORIES: { label: string; ids: ModelTier[] }[] = [
  { label: 'Latest', ids: ['ripoai-4o-pro', 'ripoai-3o-pro', 'ripoai-3o-instant'] },
  { label: 'RipoAI 2o', ids: ['ripoai-2o-pro', 'ripoai-2o-instant'] },
  { label: 'RipoAI 1o (older)', ids: ['ripoai-1o-pro', 'ripoai-1o-instant'] },
]

export default function ModelSelector({
  value,
  onChange,
}: {
  value: ModelTier
  onChange: (m: ModelTier) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = MODEL_LIST.find((m) => m.id === value) ?? MODEL_LIST[0]

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="pressable flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-semibold hover:bg-white/10"
      >
        <Sparkles size={16} className="text-accent" />
        <span>{current.name}</span>
        <ChevronDown size={15} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="glass-strong absolute bottom-12 right-0 z-40 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-3xl p-1.5 shadow-2xl"
          >
            {CATEGORIES.map((cat) => {
              const models = MODEL_LIST.filter((m) => cat.ids.includes(m.id))
              if (!models.length) return null
              return (
                <div key={cat.label} className="mb-1">
                  <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-muted">
                    {cat.label}
                  </div>
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        onChange(m.id)
                        setOpen(false)
                      }}
                      className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/10"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{m.name}</span>
                          {m.badge && (
                            <span className="rounded-full border border-accent/40 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                              {m.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted">{m.tagline}</div>
                      </div>
                      {m.id === value && <Check size={16} className="mt-1 shrink-0 text-accent" />}
                    </button>
                  ))}
                </div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
