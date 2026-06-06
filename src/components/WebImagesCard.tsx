import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, Image as ImageIcon, Link2, Search, X } from 'lucide-react'
import type { WebImageResult } from '../lib/webImages'

export default function WebImagesCard({ query, images }: { query: string; images: WebImageResult[] }) {
  const [selected, setSelected] = useState<WebImageResult | null>(null)
  if (!images.length) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24 }}
      className="web-image-card glass w-full max-w-2xl overflow-hidden rounded-3xl p-3"
    >
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="web-image-icon flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Search size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold">Web images</div>
          <div className="truncate text-xs text-muted">{query}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {images.map((image, index) => (
          <motion.button
            key={`${image.id}-${index}`}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.035 }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setSelected(image)}
            className="web-image-tile pressable group relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-[rgb(var(--muted)/0.08)] text-left"
          >
            <img
              src={image.thumbUrl || image.imageUrl}
              alt={image.title}
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 text-[11px] font-semibold leading-tight text-white">
              <span className="line-clamp-2">{image.title}</span>
            </span>
          </motion.button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 px-1 text-xs text-muted">
        <ImageIcon size={14} />
        <span>Tap any image to preview it and open the original source.</span>
      </div>

      {createPortal(
        <AnimatePresence>
          {selected && (
            <motion.div
              className="fixed inset-0 z-[160] flex items-end justify-center bg-black/55 p-3 backdrop-blur-md sm:items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 22, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 22, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                className="web-image-preview glass-strong relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[28px]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="pressable absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/65"
                  title="Close preview"
                >
                  <X size={18} />
                </button>
                <div className="grid max-h-[92vh] grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="flex min-h-[280px] items-center justify-center bg-black/70">
                    <img
                      src={selected.imageUrl}
                      alt={selected.title}
                      className="max-h-[70vh] w-full object-contain"
                    />
                  </div>
                  <aside className="space-y-3 overflow-y-auto p-4">
                    <div>
                      <div className="text-sm font-bold leading-snug">{selected.title}</div>
                      <div className="mt-1 text-xs text-muted">{selected.provider}</div>
                    </div>
                    {selected.creator && (
                      <div className="text-xs text-muted">
                        Creator:{' '}
                        {selected.creatorUrl ? (
                          <a href={selected.creatorUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                            {selected.creator}
                          </a>
                        ) : (
                          selected.creator
                        )}
                      </div>
                    )}
                    {selected.license && <div className="text-xs text-muted">License: {selected.license}</div>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <a
                        href={selected.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="pressable inline-flex items-center gap-1.5 rounded-xl accent-gradient-bg px-3 py-2 text-xs font-bold text-white"
                      >
                        <ExternalLink size={14} /> Source
                      </a>
                      <a
                        href={selected.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="pressable inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-ink hover:bg-white/10"
                      >
                        <Link2 size={14} /> Image file
                      </a>
                    </div>
                  </aside>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </motion.div>
  )
}
