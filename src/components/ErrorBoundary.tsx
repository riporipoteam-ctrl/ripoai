import { Component, type ReactNode } from 'react'
import Logo from './Logo'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

// Catches any render/runtime error in the React tree and shows a recovery
// screen instead of a blank white page (which on the phone looks like the app
// "crashed"/froze). The user can reload without reinstalling, and the chat data
// is safe in Firestore/local cache.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Surface for debugging; never throw from here.
    console.error('RipoAI crashed:', error)
  }

  reset = () => {
    this.setState({ error: null })
  }

  reload = () => {
    try {
      // Drop any stale cached bundle so a reload pulls the latest deploy.
      if ('serviceWorker' in navigator)
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()))
    } catch {
      /* ignore */
    }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="relative z-10 flex h-full items-center justify-center p-6">
        <div className="glass-strong flex max-w-sm flex-col items-center gap-4 rounded-3xl p-7 text-center">
          <Logo size={48} glow />
          <div>
            <div className="text-lg font-extrabold">Something went wrong</div>
            <p className="mt-1 text-sm text-muted">
              The app hit an unexpected error. Your chats are saved — reloading usually fixes it.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <button
              onClick={this.reload}
              className="pressable accent-gradient-bg w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white"
            >
              Reload RipoAI
            </button>
            <button
              onClick={this.reset}
              className="pressable w-full rounded-2xl px-4 py-2.5 text-sm font-medium text-muted hover:bg-white/10"
            >
              Try to continue
            </button>
          </div>
        </div>
      </div>
    )
  }
}
