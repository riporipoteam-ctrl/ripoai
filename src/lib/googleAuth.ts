import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  type Auth,
  type AuthProvider,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase'

// Google sign-in that actually works everywhere — including a home-screen PWA.
//
// In iOS/Android "Add to Home Screen" standalone mode, signInWithPopup silently
// fails: the OS opens the Google page in a *separate* Safari/Chrome context, so
// the popup never hands the credential back to the standalone window. The robust
// path there is signInWithRedirect (navigates in-place) + getRedirectResult on
// next load. We detect standalone (and other popup-hostile contexts) and pick
// redirect; elsewhere we try the nicer popup and fall back to redirect on any
// popup-related failure.

export function isStandalonePWA(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      // iOS Safari home-screen flag
      // @ts-expect-error iOS-only
      window.navigator.standalone === true
    )
  } catch {
    return false
  }
}

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
  'auth/internal-error',
])

// Remember that we kicked off a redirect so the landing page can show a spinner
// instead of a flash of the sign-in form while Firebase resolves the result.
const PENDING_KEY = 'ripoai:google-redirect'

export function googleRedirectPending(): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) === '1'
  } catch {
    return false
  }
}

function setPending(v: boolean) {
  try {
    if (v) sessionStorage.setItem(PENDING_KEY, '1')
    else sessionStorage.removeItem(PENDING_KEY)
  } catch {
    /* ignore */
  }
}

async function redirect(a: Auth, p: AuthProvider) {
  setPending(true)
  await signInWithRedirect(a, p)
}

// Kick off Google sign-in. Resolves when signed in (popup path) or never
// resolves because the page navigates away (redirect path) — callers should
// not assume a return means success on the redirect path.
export async function signInWithGoogle(): Promise<void> {
  if (isStandalonePWA()) {
    await redirect(auth, googleProvider)
    return
  }
  try {
    await signInWithPopup(auth, googleProvider)
  } catch (err: any) {
    const code = err?.code ?? ''
    if (POPUP_FALLBACK_CODES.has(code)) {
      await redirect(auth, googleProvider)
      return
    }
    throw err
  }
}

// Complete a pending redirect sign-in. Call once on app start. Returns true if
// a redirect sign-in just completed (so callers can clear any pending UI).
export async function completeGoogleRedirect(): Promise<boolean> {
  try {
    const res = await getRedirectResult(auth)
    setPending(false)
    return !!res
  } catch (err) {
    setPending(false)
    console.warn('Google redirect sign-in failed:', err)
    return false
  }
}
