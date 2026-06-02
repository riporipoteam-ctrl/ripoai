import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Download, Presentation, Loader2 } from 'lucide-react'
import { downloadPptx, type Deck } from '../lib/slides'

export default function SlidesCard({ deck }: { deck: Deck }) {
  const [i, setI] = useState(0)
  const [busy, setBusy] = useState(false)
  const total = deck.slides.length
  const s = deck.slides[i]
  const isTitle = i === 0

  return (
    <div className="my-2 w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-white/5">
      <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
        <Presentation size={16} className="text-accent" /> {deck.title}
        <span className="ml-auto text-xs text-muted">{total} slides</span>
      </div>

      {/* Slide canvas (16:9) */}
      <div className="relative mx-3 overflow-hidden rounded-xl" style={{ aspectRatio: '16 / 9' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className={`absolute inset-0 flex flex-col p-5 ${isTitle ? 'justify-center bg-[#1a1a22] text-white' : 'bg-white text-neutral-900'}`}
          >
            {!isTitle && <div className="absolute left-0 top-0 h-full w-1.5 bg-accent" />}
            <div className={`font-bold ${isTitle ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'}`}>{s.title}</div>
            {isTitle && deck.subtitle && <div className="mt-2 text-sm text-accent">{deck.subtitle}</div>}
            {!isTitle && (
              <ul className="mt-3 space-y-1.5 overflow-y-auto pr-1">
                {s.bullets.map((b, j) => (
                  <li key={j} className="flex gap-2 text-sm">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2 p-3">
        <button
          onClick={() => setI((v) => Math.max(0, v - 1))}
          disabled={i === 0}
          className="pressable rounded-full p-1.5 text-muted hover:bg-white/10 disabled:opacity-40"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex flex-1 items-center justify-center gap-1">
          {deck.slides.map((_, j) => (
            <button
              key={j}
              onClick={() => setI(j)}
              className={`h-1.5 rounded-full transition-all ${j === i ? 'w-5 bg-accent' : 'w-1.5 bg-white/20'}`}
            />
          ))}
        </div>
        <button
          onClick={() => setI((v) => Math.min(total - 1, v + 1))}
          disabled={i === total - 1}
          className="pressable rounded-full p-1.5 text-muted hover:bg-white/10 disabled:opacity-40"
        >
          <ChevronRight size={18} />
        </button>
        <button
          onClick={async () => {
            setBusy(true)
            try {
              await downloadPptx(deck)
            } finally {
              setBusy(false)
            }
          }}
          className="accent-gradient-bg pressable ml-1 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} PowerPoint
        </button>
      </div>
    </div>
  )
}
