import { useRef, useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { haptic } from '../lib/native'

/**
 * Native-style pull-to-refresh. Owns its own vertical scroll container; when the
 * user drags down from the very top, a spinner is revealed and `onRefresh` runs
 * on release past the threshold. Touch-only, so desktop/mouse is unaffected. No
 * preventDefault is used (we only engage at scrollTop 0 while pulling down), and
 * `overscroll-y: contain` keeps the browser from bouncing underneath.
 */
export default function PullToRefresh({
  onRefresh,
  className = '',
  children,
  disabled = false,
}: {
  onRefresh: () => Promise<void> | void
  className?: string
  children: ReactNode
  disabled?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const pulling = useRef(false)
  const armed = useRef(false)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const THRESHOLD = 72
  const MAX = 120

  function onTouchStart(e: React.TouchEvent) {
    if (disabled || refreshing) return
    const el = scrollRef.current
    if (!el || el.scrollTop > 0) return
    startY.current = e.touches[0].clientY
    pulling.current = true
    armed.current = false
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!pulling.current) return
    const el = scrollRef.current
    if (!el) return
    if (el.scrollTop > 0) {
      pulling.current = false
      setPull(0)
      return
    }
    const dy = e.touches[0].clientY - startY.current
    if (dy <= 0) {
      setPull(0)
      return
    }
    // Rubber-band resistance.
    const p = Math.min(MAX, dy * 0.5)
    setPull(p)
    if (!armed.current && p >= THRESHOLD) {
      armed.current = true
      haptic('light')
    } else if (armed.current && p < THRESHOLD) {
      armed.current = false
    }
  }

  async function onTouchEnd() {
    if (!pulling.current) return
    pulling.current = false
    if (pull >= THRESHOLD) {
      setRefreshing(true)
      setPull(56)
      haptic('medium')
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPull(0)
      }
    } else {
      setPull(0)
    }
  }

  const progress = Math.min(1, pull / THRESHOLD)

  return (
    <div
      ref={scrollRef}
      className={`relative overflow-y-auto ${className}`}
      style={{ overscrollBehaviorY: 'contain' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{ height: pull, opacity: pull > 4 ? 1 : 0 }}
      >
        <span
          className="mt-3 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-accent shadow-md"
          style={{ transform: `scale(${0.7 + progress * 0.3})` }}
        >
          <RefreshCw
            size={17}
            className={refreshing ? 'animate-spin' : ''}
            style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }}
          />
        </span>
      </div>

      {/* Content shifts down with the pull */}
      <div
        style={{
          transform: `translateY(${pull}px)`,
          transition: pulling.current ? 'none' : 'transform 0.32s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
