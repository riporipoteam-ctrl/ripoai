import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Download, RefreshCw, ImageOff, Sparkles } from 'lucide-react'
import { fadeUp, imageReveal } from '../lib/motion'

function withSeed(url: string, seed: number): string {
  return url.replace(/([?&])seed=\d+/, `$1seed=${seed}`)
}

export default function ImageCard({
  prompt,
  url,
  w,
  h,
  provider,
  onRegenerate,
}: {
  prompt: string
  url: string
  w?: number
  h?: number
  provider?: string
  onRegenerate?: () => void
}) {
  const [src, setSrc] = useState(url)
  // Data-URL images (NVIDIA FLUX) are already generated and load instantly;
  // local seed retry only applies to URL-based providers.
  const isData = url.startsWith('data:')
  const reduceMotion = useReducedMotion()
  const [loaded, setLoaded] = useState(isData)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const ratio = w && h ? `${w} / ${h}` : '1 / 1'

  function retry() {
    if (isData) {
      onRegenerate?.()
      return
    }
    setLoaded(false)
    setFailed(false)
    const next = attempt + 1
    setAttempt(next)
    setSrc(withSeed(url, Math.floor(Math.random() * 1_000_000) + next))
  }

  function onError() {
    if (!isData && attempt < 3) {
      // Auto-retry with a fresh seed — cold generations sometimes drop.
      const next = attempt + 1
      setAttempt(next)
      setTimeout(() => setSrc(withSeed(url, Math.floor(Math.random() * 1_000_000) + next)), 600)
    } else {
      setFailed(true)
    }
  }

  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="image-card group w-full max-w-md overflow-hidden rounded-3xl border border-white/10 shadow-lg ring-1 ring-white/5"
    >
      <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold">
        <span className="accent-gradient-bg flex h-7 w-7 items-center justify-center rounded-xl shadow-sm shadow-accent/20">
          <Sparkles size={15} />
        </span>
        {failed ? 'Couldn’t create image' : loaded ? 'Image' : 'Creating image'}
        {provider && loaded && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">{provider}</span>}
        {!loaded && !failed && (
          <span className="ml-auto flex gap-1">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.2s]" />
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.4s]" />
          </span>
        )}
      </div>

      <div className="relative mx-2 overflow-hidden rounded-[1.35rem] bg-black/5 ring-1 ring-white/10" style={{ aspectRatio: ratio }}>
        {/* Shimmer / dot-grid placeholder while generating */}
        {!loaded && !failed && (
          <div className="img-skeleton absolute inset-0">
            <div className="img-shimmer absolute inset-0" />
          </div>
        )}

        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
            <ImageOff size={32} />
            <button
              onClick={retry}
              className="accent-gradient-bg pressable flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
            >
              <RefreshCw size={15} /> Try again
            </button>
          </div>
        ) : (
          <AnimatePresence>
            <motion.img
              key={src}
              src={src}
              alt={prompt}
              onLoad={() => setLoaded(true)}
              onError={onError}
              variants={imageReveal}
              initial="initial"
              animate={loaded ? 'animate' : 'initial'}
              transition={{ duration: reduceMotion ? 0 : 0.5, ease: 'easeOut' }}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </AnimatePresence>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="truncate text-xs text-muted" title={prompt}>
          {prompt}
        </span>
        {loaded && (
          <div className="flex shrink-0 items-center gap-1">
            {(!isData || onRegenerate) && (
              <button
                onClick={retry}
                className="action-chip pressable rounded-xl p-1.5 text-muted hover:text-ink"
                title="Regenerate"
              >
                <RefreshCw size={15} />
              </button>
            )}
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              download="ripoai-image.jpg"
              className="action-chip pressable rounded-xl p-1.5 text-muted hover:text-ink"
              title="Open / download"
            >
              <Download size={15} />
            </a>
          </div>
        )}
      </div>
    </motion.div>
  )
}
