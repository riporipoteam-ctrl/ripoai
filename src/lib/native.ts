// Native (Capacitor) integration layer.
//
// On the web this is almost entirely inert — every call is guarded by
// `isNative` so the browser build behaves exactly as before. Inside the
// Android/iOS shell it wires up the things that make AskAI feel like a real
// app instead of a web page: an overlaid translucent status bar, keyboard
// resize handling, hardware back-button navigation, a splash hand-off, and
// tactile haptics. A `.native` class is added to <html> so CSS can switch on
// an app-grade, glassier treatment.

import { Capacitor } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform() // 'web' | 'android' | 'ios'

let backHandler: (() => boolean) | null = null

// Let the app register what the hardware back button should do (close an open
// overlay first, otherwise fall back to default). Return true if handled.
export function setBackHandler(fn: (() => boolean) | null) {
  backHandler = fn
}

export async function initNative() {
  if (!isNative) return

  document.documentElement.classList.add('native', `native-${platform}`)

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    // Draw our own gradient/aurora behind a translucent status bar.
    await StatusBar.setOverlaysWebView({ overlay: true })
    const dark = document.documentElement.classList.contains('dark')
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
  } catch {
    /* status bar not available */
  }

  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard')
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native })
    await Keyboard.setAccessoryBarVisible({ isVisible: false })
  } catch {
    /* keyboard plugin not available */
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    // Web content is ready — fade the splash out.
    await SplashScreen.hide()
  } catch {
    /* no splash */
  }

  try {
    const { App } = await import('@capacitor/app')
    App.addListener('backButton', ({ canGoBack }) => {
      if (backHandler && backHandler()) return
      if (canGoBack) window.history.back()
      else App.exitApp()
    })
  } catch {
    /* app plugin not available */
  }
}

type HapticStyle = 'light' | 'medium' | 'heavy' | 'select'

// Fire-and-forget tactile feedback. No-op on web.
export function haptic(style: HapticStyle = 'light') {
  if (!isNative) {
    // Web/PWA fallback: vibrate where supported (Android Chrome) so gestures
    // still feel tactile outside the native shell.
    try {
      navigator.vibrate?.(style === 'heavy' ? 18 : style === 'medium' ? 12 : 6)
    } catch {
      /* unsupported */
    }
    return
  }
  import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle }) => {
      if (style === 'select') return Haptics.selectionChanged()
      const map = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      } as const
      return Haptics.impact({ style: map[style] })
    })
    .catch(() => {})
}

// Keep the native status bar style in sync when the theme flips.
export async function syncStatusBarTheme(dark: boolean) {
  if (!isNative) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
  } catch {
    /* ignore */
  }
}
