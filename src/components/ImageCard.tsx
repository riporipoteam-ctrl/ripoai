import { useState, type SyntheticEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, RefreshCw, ImageOff, Sparkles } from 'lucide-react'
import { dimsFor, generateImage } from '../lib/imagegen'

function withSeed(url: string, seed: number): string {
  return url.replace(/([?&])seed=\d+/, `$1seed=${seed}`)
}

async function imageElementLooksBlank(img: HTMLImageElement): Promise<boolean> {
  try {
    const canvas = document.createElement('canvas')
    const size = 28
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(img, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data
    let dark = 0
    let total = 0
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 20) continue
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      if (lum < 12) dark++
      total++
      sum += lum
      sumSq += lum * lum
    }
    if (!total) return true
    const avg = sum / total
    const variance = sumSq / total - avg * avg
    return (avg < 10 && variance < 18) || dark / total > 0.985
  } catch {
    return false
  }
}

export default function ImageCard({ prompt, url }: { prompt: string; url: string }) {
  const [src, setSrc] = useState(url)
  const isData = src.startsWith('data:')
  const [loaded, setLoaded] = useState(isData)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const dims = dimsFor(prompt)
  const aspectRatio = `${dims.w} / ${dims.h}`

  async function regenerate(next = attempt + 1) {
    setLoaded(false)
    setFailed(false)
    setRegenerating(true)
    setAttempt(next)
    const seed = Math.floor(Math.random() * 1_000_000) + next
    try {
      if (src.startsWith('data:') || url.startsWith('data:')) {
        setSrc(await generateImage(prompt, { w: dims.w, h: dims.h, seed }))
      } else {
        setSrc(withSeed(url, seed))
      }
    } catch {
      setFailed(true)
    } finally {
      setRegenerating(false)
    }
  }

  function retry() {
    void regenerate()
  }

  function onError() {
    if (attempt < 3) {
      // Auto-retry with a fresh seed; cold generations sometimes drop.
      const next = attempt + 1
      setTimeout(() => void regenerate(next), 600)
    } else {
      setFailed(true)
    }
  }

  async function onLoad(e: SyntheticEvent<HTMLImageElement>) {
    const blank = await imageElementLooksBlank(e.currentTarget)
    if (blank) {
      if (attempt < 4) {
        const next = attempt + 1
        setTimeout(() => void regenerate(next), 250)
        return
      }
      setFailed(true)
      return
    }
    setLoaded(true)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      className="image-card glass w-full max-w-xl overflow-hidden rounded-[28px] border border-white/15 shadow-lg"
    >
      <div className="relative z-10 flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
        <span className="image-card-icon flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles size={15} />
        </span>
        {failed ? 'Could not create image' : loaded ? 'Image' : regenerating ? 'Refining image' : 'Creating image'}
        <span className="ml-auto rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
          NVIDIA
        </span>
        {!loaded && !failed && (
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.2s]" />
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.4s]" />
          </span>
        )}
      </div>

      <div className="image-stage relative w-full overflow-hidden" style={{ aspectRatio }}>
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
              crossOrigin={isData ? undefined : 'anonymous'}
              onLoad={onLoad}
              onError={onError}
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: loaded ? 1 : 0, scale: loaded ? 1 : 1.04 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
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
            <button
              onClick={retry}
              className="pressable rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-ink"
              title="Regenerate"
            >
              <RefreshCw size={15} />
            </button>
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
