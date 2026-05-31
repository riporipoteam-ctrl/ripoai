import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  wide?: boolean
}

export default function Modal({ open, onClose, children, title, wide }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            className={`glass-strong relative z-10 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[88vh] overflow-hidden rounded-4xl`}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                <h2 className="text-lg font-bold">{title}</h2>
                <button
                  onClick={onClose}
                  className="pressable rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-ink"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
            )}
            <div className="max-h-[calc(88vh-64px)] overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
