import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check, Zap, Sparkles, Gauge } from 'lucide-react'
import { MODEL_LIST, type ModelTier, type RipoModel } from '../lib/models'

const CATEGORIES: { label: string; ids: ModelTier[] }[] = [
  { label: 'Latest', ids: ['ripoai-3o-pro', 'ripoai-3o-instant'] },
  { label: 'RipoAI 2o', ids: ['ripoai-2o-pro', 'ripoai-2o-instant'] },
  { label: 'Older — RipoAI 1o', ids: ['ripoai-1o-pro', 'ripoai-1o-instant'] },
]

function modelIcon(m: RipoModel) {
  if (m.badge === 'MAX' || m.badge === 'PRO') return Sparkles
  return m.name.includes('instant') ? Zap : Gauge
}

const badgeColor: Record<string, string> = {
  MAX: 'from-violet-500 to-fuchsia-500',
  PRO: 'from-accent to-blue-500',
  NEW: 'from-emerald-500 to-teal-500',
}

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
        className="pressable flex items-center gap-1.5 rounded-2xl px-2.5 py-2 text-sm font-semibold hover:bg-white/10"
      >
        <Sparkles size={16} className="shrink-0 text-accent" />
        <span className="whitespace-nowrap">{current.name.replace('RipoAI ', '')}</span>
        <ChevronDown size={15} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="glass-strong absolute bottom-12 right-0 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl p-2 shadow-2xl"
          >
            <div className="px-2 pb-1.5 pt-1 text-sm font-bold">Choose a model</div>
            <div className="max-h-[60vh] overflow-y-auto">
              {CATEGORIES.map((cat) => {
                const models = cat.ids.map((id) => MODEL_LIST.find((m) => m.id === id)!).filter(Boolean)
                if (!models.length) return null
                return (
                  <div key={cat.label} className="mb-1.5">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted/70">
                      {cat.label}
                    </div>
                    <div className="space-y-1">
                      {models.map((m) => {
                        const Icon = modelIcon(m)
                        const selected = m.id === value
                        return (
                          <button
                            key={m.id}
                            onClick={() => {
                              onChange(m.id)
                              setOpen(false)
                            }}
                            className={`group flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                              selected
                                ? 'border-accent/50 bg-accent/10'
                                : 'border-transparent hover:border-white/10 hover:bg-white/5'
                            }`}
                          >
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                selected ? 'accent-gradient-bg text-white' : 'bg-white/8 text-accent'
                              }`}
                            >
                              <Icon size={17} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate font-semibold">{m.name}</span>
                                {m.badge && (
                                  <span
                                    className={`rounded-full bg-gradient-to-r px-1.5 py-px text-[9px] font-bold text-white ${
                                      badgeColor[m.badge] ?? 'from-accent to-blue-500'
                                    }`}
                                  >
                                    {m.badge}
                                  </span>
                                )}
                              </span>
                              <span className="block truncate text-xs text-muted">{m.tagline}</span>
                            </span>
                            {selected && <Check size={17} className="shrink-0 text-accent" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
