import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, RefreshCw, ImageOff, Sparkles } from 'lucide-react'
import { useMotionVariants } from '../lib/motion'

function withSeed(url: string, seed: number): string {
  return url.replace(/([?&])seed=\d+/, `$1seed=${seed}`)
}

export default function ImageCard({ prompt, url }: { prompt: string; url: string }) {
  const motionVariants = useMotionVariants()
  const [src, setSrc] = useState(url)
  // Data-URL images (NVIDIA FLUX) are already generated and load instantly;
  // reseeding only applies to the old URL-based provider.
  const isData = url.startsWith('data:')
  const [loaded, setLoaded] = useState(isData)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  function retry() {
    if (isData) return
    setLoaded(false)
    setFailed(false)
    const next = attempt + 1
    setAttempt(next)
    setSrc(withSeed(url, Math.floor(Math.random() * 1_000_000) + next))
  }

  function onError() {
    if (attempt < 3) {
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
      variants={motionVariants.fadeUp}
      initial="initial"
      animate="animate"
      transition={motionVariants.transitions.fade}
      className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-lg"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
        <Sparkles size={15} className="text-accent" />
        {failed ? 'Couldn’t create image' : loaded ? 'Image' : 'Creating image'}
        {!loaded && !failed && (
          <span className="ml-auto flex gap-1">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.2s]" />
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.4s]" />
          </span>
        )}
      </div>

      <div className="relative aspect-square w-full">
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
              variants={motionVariants.imageLoad}
              initial="initial"
              animate={loaded ? 'animate' : 'initial'}
              exit="exit"
              transition={motionVariants.transitions.imageLoad}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </AnimatePresence>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="truncate text-xs text-muted" title={prompt}>
          {prompt}
        </span>
        {loaded && (
          <div className="flex shrink-0 items-center gap-1">
            {!isData && (
              <button
                onClick={retry}
                className="pressable rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-ink"
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
              className="pressable rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-ink"
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
