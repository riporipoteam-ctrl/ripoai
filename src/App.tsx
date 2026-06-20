import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { useStore, applyAppearance } from './store'
import { useI18n } from './lib/i18n'
import { applyAutoTranslate } from './lib/autoTranslate'
import { initNative, syncStatusBarTheme } from './lib/native'
import { completeGoogleRedirect } from './lib/googleAuth'
// Loaded here (last component-level import) so its rules win the cascade over
// every prebuilt theme layer, including chatgpt-theme.css.
import './styles/chatgpt-layout.css'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import Home from './pages/Home'
import Landing from './pages/Landing'
import Onboarding from './components/Onboarding'
import InstallHint from './components/InstallHint'
import AndroidUpdater from './components/AndroidUpdater'
import SelectionToolbar from './components/SelectionToolbar'

// Minimal, near-invisible boot state. The old full-screen "Loading your
// workspace…" splash was distracting (and could get stuck), so we just hold on
// the app's own background for the brief moment auth resolves — no logo, no
// progress bar. A hard safety timeout (see App) guarantees we never hang here.
function FullScreenLoader() {
  return <div className="relative z-10 h-full" aria-hidden />
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, authReady, dataReady, settings } = useStore()
  const location = useLocation()
  if (!authReady) return <FullScreenLoader />
  // Visitors see the public landing (chat showcase) instead of a bare login wall.
  if (!user) return <Navigate to="/welcome" replace state={{ from: location }} />
  if (!dataReady) return <FullScreenLoader />
  // Onboarding shows at most once per browser (even across accounts).
  let onboardedGlobally = false
  try {
    onboardedGlobally = localStorage.getItem('ripoai:onboarded') === '1'
  } catch {
    /* ignore */
  }
  if (!settings.onboarded && !onboardedGlobally) return <Onboarding />
  return <>{children}</>
}

export default function App() {
  const { user, authReady, setUser, setAuthReady, initUserData, teardown, settings } = useStore()

  // Wire up the native shell (status bar, keyboard, back button, haptics).
  useEffect(() => {
    initNative()
    // Complete any Google redirect sign-in (the PWA/standalone path).
    completeGoogleRedirect()
  }, [])

  useEffect(() => {
    // Safety net: never let the app hang on a blank boot screen if Firebase auth
    // is slow to initialise inside the native WebView — show the UI after 2.5s
    // regardless (onAuthStateChanged will still correct the user when it fires).
    const safety = setTimeout(() => setAuthReady(true), 2500)
    const unsub = onAuthStateChanged(auth, async (u) => {
      clearTimeout(safety)
      setUser(u)
      try {
        if (u) {
          import('./lib/admin').then(({ registerUser }) => registerUser(u))
          await initUserData(u.uid)
        } else {
          teardown()
        }
      } catch (e) {
        // Never trap the user on the loading screen.
        console.warn('initUserData failed:', e)
      } finally {
        setAuthReady(true)
      }
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // React to OS theme changes when in "system" mode.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyAppearance(useStore.getState().settings)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings.theme])

  // Keep the native status bar icons readable against the current theme.
  useEffect(() => {
    syncStatusBarTheme(document.documentElement.classList.contains('dark'))
  }, [settings.theme])

  // Translate the whole UI into the chosen language (cached per language).
  useEffect(() => {
    useI18n.getState().apply(settings.language)
    // Runtime DOM translator covers ALL visible UI chrome (not just wrapped
    // strings) — non-blocking, cached, and excludes chat/AI/code content.
    applyAutoTranslate(settings.language)
  }, [settings.language])

  return (
    <>
      {/* Ambient nebula-mesh backdrop — a calm, slowly-drifting magenta/violet
          wash behind the whole app (styled in nebula.css; subtle + reduced-motion
          safe). */}
      <div className="aurora" aria-hidden />
      <div className="relative z-10 h-full">
        <Routes>
          <Route
            path="/signin"
            element={authReady && user ? <Navigate to="/" replace /> : <SignIn />}
          />
          <Route
            path="/signup"
            element={authReady && user ? <Navigate to="/" replace /> : <SignUp />}
          />
          <Route
            path="/welcome"
            element={authReady && user ? <Navigate to="/" replace /> : <Landing />}
          />
          <Route
            path="/*"
            element={
              <Protected>
                <Home />
              </Protected>
            }
          />
        </Routes>
      </div>
      <InstallHint />
      <AndroidUpdater />
      <SelectionToolbar />
    </>
  )
}
