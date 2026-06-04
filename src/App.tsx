import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { useStore, applyAppearance } from './store'
import { initNative, syncStatusBarTheme } from './lib/native'
import { completeGoogleRedirect } from './lib/googleAuth'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import Home from './pages/Home'
import Onboarding from './components/Onboarding'
import InstallHint from './components/InstallHint'
import SelectionToolbar from './components/SelectionToolbar'
import Logo from './components/Logo'

function FullScreenLoader() {
  return (
    <div className="relative z-10 flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          {/* pulsing ring behind the mark */}
          <span className="absolute inset-0 -m-3 animate-ping rounded-full bg-[rgb(var(--accent)/0.18)]" />
          <div className="animate-float">
            <Logo size={60} glow />
          </div>
        </div>
        <div className="text-2xl font-extrabold tracking-tight brand-gradient">RipoAI</div>
        {/* loading bar shimmer */}
        <div className="h-1 w-32 overflow-hidden rounded-full bg-[rgb(var(--ink)/0.08)]">
          <div className="h-full w-1/2 rounded-full bg-[rgb(var(--accent))] [animation:loadbar_1.1s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  )
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, authReady, dataReady, settings } = useStore()
  const location = useLocation()
  if (!authReady) return <FullScreenLoader />
  if (!user) return <Navigate to="/signin" replace state={{ from: location }} />
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
    const unsub = onAuthStateChanged(auth, async (u) => {
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

  return (
    <>
      <div className="aurora" aria-hidden>
        <div className="aurora-orb" />
      </div>
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
      <SelectionToolbar />
    </>
  )
}
