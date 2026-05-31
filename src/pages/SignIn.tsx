import { useState } from 'react'
import { Link } from 'react-router-dom'
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from '../firebase'
import AuthShell from '../components/AuthShell'
import GoogleButton from '../components/GoogleButton'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { friendlyAuthError } from '../lib/authErrors'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
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
      await signInWithPopup(auth, googleProvider)
    } catch (err: any) {
      setError(friendlyAuthError(err?.code ?? ''))
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to RipoAI.">
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full py-3">
          {loading ? <Spinner size={18} /> : 'Sign in'}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-white/10" />
        OR
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <GoogleButton onClick={google} disabled={loading} label="Continue with Google" />

      <p className="mt-6 text-center text-sm text-muted">
        New to RipoAI?{' '}
        <Link to="/signup" className="font-semibold text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  )
}
