import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { useStore, applyAppearance } from './store'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import Home from './pages/Home'
import Onboarding from './components/Onboarding'
import Spinner from './components/ui/Spinner'

function FullScreenLoader() {
  return (
    <div className="relative z-10 flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="text-3xl font-extrabold tracking-tight brand-gradient">RipoAI</div>
        <Spinner />
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
  if (!settings.onboarded) return <Onboarding />
  return <>{children}</>
}

export default function App() {
  const { user, authReady, setUser, setAuthReady, initUserData, teardown, settings } = useStore()

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        await initUserData(u.uid)
      } else {
        teardown()
      }
      setAuthReady(true)
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

  return (
    <>
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
            path="/*"
            element={
              <Protected>
                <Home />
              </Protected>
            }
          />
        </Routes>
      </div>
    </>
  )
}
