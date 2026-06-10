// App-grade swipe navigation for touch devices: swipe right from the left edge
// to open the sidebar, swipe left while it's open to close it — like every
// native app drawer. Haptics fire on trigger. Desktop/mouse is untouched.
import { useEffect } from 'react'
import { useStore } from '../store'
import { haptic } from '../lib/native'

const EDGE = 32 // px from the left edge that starts an "open" gesture
const THRESHOLD = 56 // horizontal px to commit the gesture

export function useSwipeNav() {
  useEffect(() => {
    let startX = 0
    let startY = 0
    let mode: 'open' | 'close' | null = null

    function isMobile() {
      return window.innerWidth < 768
    }

    function onStart(e: TouchEvent) {
      mode = null
      if (!isMobile() || e.touches.length !== 1) return
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      const { sidebarOpen } = useStore.getState()
      if (!sidebarOpen && startX <= EDGE) mode = 'open'
      else if (sidebarOpen) mode = 'close'
    }

    function onEnd(e: TouchEvent) {
      if (!mode) return
      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      // Must be a deliberate horizontal swipe, not a scroll.
      if (Math.abs(dx) < THRESHOLD || Math.abs(dy) > Math.abs(dx) * 0.8) {
        mode = null
        return
      }
      const { sidebarOpen, setSidebar } = useStore.getState()
      if (mode === 'open' && dx > 0 && !sidebarOpen) {
        setSidebar(true)
        haptic('light')
      } else if (mode === 'close' && dx < 0 && sidebarOpen) {
        setSidebar(false)
        haptic('light')
      }
      mode = null
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [])
}
