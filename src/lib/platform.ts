// Platform detection so the shared app can render a native-feeling UI per OS:
// iOS (Cupertino), Android (Material) or Web. Sets a class on <html> that
// platform.css keys off of. Call applyPlatformClass() once at startup.
export type Platform = 'ios' | 'android' | 'web'

export function detectPlatform(): Platform {
  try {
    // Capacitor exposes the native platform when running in the APK/IPA shell.
    const cap = (window as any).Capacitor
    const p = cap?.getPlatform?.()
    if (p === 'ios' || p === 'android') return p
  } catch {
    /* not native */
  }
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'web'
}

export const platform: Platform = detectPlatform()
export const isIOS = platform === 'ios'
export const isAndroid = platform === 'android'

export function applyPlatformClass(): void {
  const el = document.documentElement
  el.classList.remove('plat-ios', 'plat-android', 'plat-web')
  el.classList.add(`plat-${platform}`)
}
