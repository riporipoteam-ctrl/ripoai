import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check, Zap, Sparkles, Gauge, Wand2 } from 'lucide-react'
import { MODEL_LIST, type ModelTier, type RipoModel } from '../lib/models'

// 4o Pro is featured on top; the rest live in categories that are collapsed by
// default — tap a category to reveal its (older) models.
const FEATURED: ModelTier[] = ['auto', 'ripoai-4o-pro', 'ripoai-4o-instant']
const GROUPS: { label: string; ids: ModelTier[] }[] = [
  { label: 'AskAI 3o', ids: ['ripoai-3o-pro', 'ripoai-3o-instant'] },
  { label: 'AskAI 2o', ids: ['ripoai-2o-pro', 'ripoai-2o-instant'] },
  { label: 'AskAI 1o', ids: ['ripoai-1o-pro', 'ripoai-1o-instant'] },
]

function modelIcon(m: RipoModel) {
  if (m.id === 'auto') return Wand2
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
  onOpenChange,
}: {
  value: ModelTier
  onChange: (m: ModelTier) => void
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const current = MODEL_LIST.find((m) => m.id === value) ?? MODEL_LIST[0]

  function setOpenState(v: boolean) {
    setOpen(v)
    onOpenChange?.(v)
    // When opening, auto-expand the category that holds the current model.
    if (v) {
      const g = GROUPS.find((g) => g.ids.includes(value))
      setOpenGroups(new Set(g ? [g.label] : []))
    }
  }
  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  function ModelButton({ id }: { id: ModelTier }) {
    const m = MODEL_LIST.find((x) => x.id === id)
    if (!m) return null
    const Icon = modelIcon(m)
    const selected = m.id === value
    return (
      <button
        onClick={() => {
          onChange(m.id)
          setOpenState(false)
        }}
        className={`pressable flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
          selected ? 'border-accent/50 bg-accent/10' : 'border-white/10 hover:bg-white/5'
        }`}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            selected ? 'accent-gradient-bg text-white' : 'bg-white/10 text-accent'
          }`}
        >
          <Icon size={18} />
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
        {selected && <Check size={18} className="shrink-0 text-accent" />}
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpenState(!open)}
        className="pressable flex items-center gap-1.5 rounded-2xl px-2.5 py-2 text-sm font-semibold hover:bg-white/10"
      >
        <Sparkles size={16} className="shrink-0 text-accent" />
        <span className="whitespace-nowrap">{current.name.replace('AskAI ', '')}</span>
        <ChevronDown size={15} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setOpenState(false)} />

              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 360, damping: 34 }}
                className="glass-strong relative w-full max-w-lg rounded-t-[28px] p-3 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl sm:mb-0 sm:rounded-[28px]"
              >
                <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[rgb(var(--muted)/0.4)] sm:hidden" />
                <div className="px-2 pb-2 text-base font-bold">Choose a model</div>
                <div className="max-h-[68vh] space-y-2 overflow-y-auto">
                  {/* Featured */}
                  {FEATURED.map((id) => (
                    <ModelButton key={id} id={id} />
                  ))}

                  {/* Collapsible categories (closed by default) */}
                  {GROUPS.map((g) => {
                    const isOpen = openGroups.has(g.label)
                    return (
                      <div key={g.label} className="overflow-hidden rounded-2xl border border-white/10">
                        <button
                          onClick={() => toggleGroup(g.label)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm font-semibold hover:bg-white/5"
                        >
                          <span>{g.label}</span>
                          <ChevronDown
                            size={16}
                            className={`text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          />
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-1.5 p-2 pt-0">
                                {g.ids.map((id) => (
                                  <ModelButton key={id} id={id} />
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
