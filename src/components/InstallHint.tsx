import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Share, X, Plus } from 'lucide-react'
import Logo from './Logo'

// A gentle, one-time "Add to Home Screen" prompt for iOS Safari. iOS doesn't
// fire beforeinstallprompt, so the only honest install path on iPhone/iPad is
// the Share → Add to Home Screen flow — this teaches it, then stays out of the
// way (dismissed forever once closed, never shown when already installed).
export default function InstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let dismissed = false
    try {
      dismissed = localStorage.getItem('ripoai:install-hint') === '1'
    } catch {
      /* ignore */
    }
    if (dismissed) return

    const ua = window.navigator.userAgent
    const isIOS = /iphone|ipad|ipod/i.test(ua)
    // iPadOS 13+ reports as Mac; detect via touch.
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS-only flag
      window.navigator.standalone === true
    const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(ua)

    if ((isIOS || isIPadOS) && isSafari && !standalone) {
      const t = setTimeout(() => setShow(true), 2500)
      return () => clearTimeout(t)
    }
  }, [])

  function dismiss() {
    setShow(false)
    try {
      localStorage.setItem('ripoai:install-hint', '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          className="fixed inset-x-3 z-50 mx-auto max-w-sm"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
        >
          <div className="glass relative flex items-center gap-3 rounded-2xl p-3 pr-10 shadow-2xl">
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="absolute right-2 top-2 rounded-full p-1 text-[rgb(var(--muted))] hover:bg-white/10"
            >
              <X size={16} />
            </button>
            <div className="shrink-0">
              <Logo size={40} />
            </div>
            <div className="text-sm leading-snug">
              <div className="font-semibold">Install AskAI</div>
              <div className="text-[rgb(var(--muted))]">
                Tap <Share size={13} className="-mt-0.5 inline" /> then{' '}
                <span className="whitespace-nowrap font-medium text-[rgb(var(--ink))]">
                  <Plus size={12} className="-mt-0.5 inline" /> Add to Home Screen
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
