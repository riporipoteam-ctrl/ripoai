import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, Sparkles } from 'lucide-react'

// A floating toolbar that appears when you select text inside an AI answer:
// Copy, or "Ask RipoAI" (drops the selection into the composer to ask about it).
export default function SelectionToolbar() {
  const [state, setState] = useState<{ x: number; y: number; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    function check() {
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      if (!sel || sel.rangeCount === 0 || text.length < 2) {
        setState(null)
        return
      }
      const node = sel.anchorNode
      const el = node instanceof Element ? node : node?.parentElement
      // Only for AI answers (not inputs, not user bubbles).
      if (!el || !el.closest('[data-answer]')) {
        setState(null)
        return
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (!rect.width && !rect.height) return
      setCopied(false)
      setState({ x: rect.left + rect.width / 2, y: rect.top, text })
    }
    document.addEventListener('selectionchange', check)
    document.addEventListener('mouseup', check)
    document.addEventListener('touchend', check)
    return () => {
      document.removeEventListener('selectionchange', check)
      document.removeEventListener('mouseup', check)
      document.removeEventListener('touchend', check)
    }
  }, [])

  function ask() {
    if (!state) return
    window.dispatchEvent(new CustomEvent('ripoai-ask', { detail: state.text }))
    window.getSelection()?.removeAllRanges()
    setState(null)
  }
  function copy() {
    if (!state) return
    navigator.clipboard.writeText(state.text)
    setCopied(true)
    setTimeout(() => setState(null), 700)
  }

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.9 }}
          transition={{ duration: 0.12 }}
          className="glass-strong fixed z-[200] flex -translate-x-1/2 items-center gap-0.5 rounded-2xl p-1 shadow-xl"
          style={{ left: state.x, top: Math.max(state.y - 48, 8) }}
        >
          <button
            onClick={ask}
            className="pressable flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold text-accent hover:bg-white/10"
          >
            <Sparkles size={15} /> Ask RipoAI
          </button>
          <div className="h-5 w-px bg-white/15" />
          <button
            onClick={copy}
            className="pressable flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm hover:bg-white/10"
          >
            {copied ? <Check size={15} className="text-accent" /> : <Copy size={15} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
