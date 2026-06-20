import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { auth } from '../firebase'
import { signInWithGoogle, googleRedirectPending } from '../lib/googleAuth'
import AuthShell from '../components/AuthShell'
import GoogleButton from '../components/GoogleButton'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { friendlyAuthError } from '../lib/authErrors'

export default function SignUp() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(googleRedirectPending())
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() })
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
    <AuthShell title="Create your account" subtitle="Join AskAI in a few seconds.">
      <form onSubmit={submit} className="space-y-3">
        <input
          type="text"
          autoComplete="name"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field"
        />
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
          autoComplete="new-password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full py-3">
          {loading ? <Spinner size={18} /> : 'Create account'}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-ink/10" />
        OR
        <div className="h-px flex-1 bg-ink/10" />
      </div>

      <GoogleButton onClick={google} disabled={loading} label="Sign up with Google" />

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/signin" className="font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}
