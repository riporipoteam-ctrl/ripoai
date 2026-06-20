// Native swipe-between-tabs. On the app shell (Capacitor only), a horizontal
// swipe across the page moves between the bottom-tab destinations — like every
// native app. Carefully gated so it never fights:
//   • the edge-swipe sidebar drawer (useSwipeNav)
//   • horizontal scrollers (carousels, image-style strips, code blocks)
//   • vertical scrolling
// Web/desktop is completely untouched.
import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../store'
import { haptic, isNative } from '../lib/native'

// Order mirrors the NativeTabBar (Home · Agents · Jobs · Friends).
const TABS = ['/', '/agents', '/jobs', '/friends']

const EDGE = 36 // ignore swipes that start at the very edge (drawer territory)
const THRESHOLD = 70 // horizontal px to commit a tab change
const RATIO = 1.4 // dx must dominate dy by this factor (a real horizontal swipe)

function tabIndex(path: string): number {
  if (path === '/' || path.startsWith('/c/')) return 0
  if (path.startsWith('/agents') || path.startsWith('/agent/') || path.startsWith('/team')) return 1
  if (path.startsWith('/jobs')) return 2
  if (path.startsWith('/friends')) return 3
  return -1
}

// True when the gesture began inside something the user can scroll sideways —
// we must not hijack those (WC carousel, image-style strip, code, tables…).
function startedInHScroller(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el)
    const ox = style.overflowX
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 4) return true
    if (el.classList?.contains('no-scrollbar')) return true
    el = el.parentElement
  }
  return false
}

export function useTabSwipe() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!isNative) return
    let startX = 0
    let startY = 0
    let active = false

    function onStart(e: TouchEvent) {
      active = false
      if (e.touches.length !== 1) return
      const { sidebarOpen } = useStore.getState()
      if (sidebarOpen) return
      const idx = tabIndex(location.pathname)
      if (idx < 0) return // not on a tab route
      const t = e.touches[0]
      if (t.clientX <= EDGE || t.clientX >= window.innerWidth - EDGE) return
      if (startedInHScroller(e.target)) return
      startX = t.clientX
      startY = t.clientY
      active = true
    }

    function onEnd(e: TouchEvent) {
      if (!active) return
      active = false
      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy) * RATIO) return
      const idx = tabIndex(location.pathname)
      if (idx < 0) return
      // Swipe left → next tab, swipe right → previous tab.
      const next = dx < 0 ? idx + 1 : idx - 1
      if (next < 0 || next >= TABS.length || next === idx) return
      haptic('light')
      navigate(TABS[next])
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [navigate, location.pathname])
}
