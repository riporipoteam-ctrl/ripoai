import { useState } from 'react'
import { Link } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'
import { signInWithGoogle, googleRedirectPending } from '../lib/googleAuth'
import AuthShell from '../components/AuthShell'
import GoogleButton from '../components/GoogleButton'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { friendlyAuthError } from '../lib/authErrors'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(googleRedirectPending())
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err: any) {
      setError(friendlyAuthError(err?.code ?? ''))
    } finally {
      setLoading(false)
    }
  }

  async function google() {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (err: any) {
      setError(friendlyAuthError(err?.code ?? ''))
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to AskAI.">
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full py-3">
          {loading ? <Spinner size={18} /> : 'Sign in'}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-ink/10" />
        OR
        <div className="h-px flex-1 bg-ink/10" />
      </div>

      <GoogleButton onClick={google} disabled={loading} label="Continue with Google" />

      <p className="mt-6 text-center text-sm text-muted">
        New to AskAI?{' '}
        <Link to="/signup" className="font-semibold text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  )
}
