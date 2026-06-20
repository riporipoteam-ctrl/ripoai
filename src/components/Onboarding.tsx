import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Moon, Sun, Monitor, MessageSquare, FolderGit2, Globe, Brain, ImageIcon, Mic } from 'lucide-react'
import { useStore } from '../store'
import Button from './ui/Button'
import Logo from './Logo'

export default function Onboarding() {
  const { settings, updateSettings, user } = useStore()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(settings.displayName || user?.displayName || '')
  const [about, setAbout] = useState('')

  const steps = [
    // 0 — Welcome
    <div key="w" className="text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mx-auto mb-6 flex w-fit items-center justify-center"
      >
        <div className="overflow-hidden rounded-3xl shadow-2xl ring-1 ring-[rgb(var(--ink)/0.1)]">
          <Logo size={84} variant="icon" glow />
        </div>
      </motion.div>
      <h1 className="text-3xl font-extrabold">
        Welcome to <span className="brand-gradient">AskAI</span>
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-muted">
        Your intelligent workspace for chatting, researching the live web, and building real apps —
        all in one beautiful place. Let's set it up.
      </p>
    </div>,
    // 1 — Name
    <div key="n">
      <h2 className="text-2xl font-bold">What should we call you?</h2>
      <p className="mt-1 text-muted">AskAI will use this to personalize your experience.</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="field mt-5 text-lg"
      />
    </div>,
    // 2 — Appearance
    <div key="a">
      <h2 className="text-2xl font-bold">Make it yours</h2>
      <p className="mt-1 text-muted">Pick a look. You can change these anytime in Settings.</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {[
          { v: 'chatgpt', label: 'Black & White', sw: ['#ffffff', '#0d0d0d'] },
          { v: 'claude', label: 'Orange', sw: ['#f4f2eb', '#d97757'] },
        ].map((o) => (
          <button
            key={o.v}
            onClick={() => updateSettings({ uiTheme: o.v as any })}
            className={`flex items-center justify-center gap-2 rounded-2xl border py-4 text-sm font-semibold transition ${
              (settings.uiTheme ?? 'chatgpt') === o.v ? 'border-accent bg-accent/10' : 'border-white/10 text-muted hover:bg-white/5'
            }`}
          >
            <span className="flex">
              <span className="h-5 w-5 rounded-l-full border border-black/10" style={{ background: o.sw[0] }} />
              <span className="h-5 w-5 rounded-r-full" style={{ background: o.sw[1] }} />
            </span>
            {o.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        {[
          { v: 'light', icon: Sun, label: 'Light' },
          { v: 'dark', icon: Moon, label: 'Dark' },
          { v: 'system', icon: Monitor, label: 'System' },
        ].map((o) => (
          <button
            key={o.v}
            onClick={() => updateSettings({ theme: o.v as any })}
            className={`flex flex-1 flex-col items-center gap-1 rounded-2xl border py-3 text-xs font-semibold transition ${
              settings.theme === o.v ? 'border-accent bg-accent/10' : 'border-white/10 text-muted hover:bg-white/5'
            }`}
          >
            <o.icon size={18} /> {o.label}
          </button>
        ))}
      </div>
    </div>,
    // 3 — Custom instructions
    <div key="c">
      <h2 className="text-2xl font-bold">Tell AskAI about you</h2>
      <p className="mt-1 text-muted">Optional — helps tailor every answer. You can edit later in Settings.</p>
      <textarea
        value={about}
        onChange={(e) => setAbout(e.target.value)}
        rows={4}
        placeholder="e.g. I'm a frontend developer who loves TypeScript and clean design."
        className="field mt-5 resize-none"
      />
    </div>,
    // 4 — Feature tour
    <div key="f">
      <h2 className="text-center text-2xl font-bold">You're all set 🎉</h2>
      <p className="mt-1 text-center text-muted">Here's what you can do:</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {[
          { icon: MessageSquare, t: 'Chat', d: 'The latest AI models' },
          { icon: Globe, t: 'Web search', d: 'Live, cited answers' },
          { icon: FolderGit2, t: 'Projects', d: 'Build 3D sites live' },
          { icon: ImageIcon, t: 'Images', d: 'Generate anything' },
          { icon: Mic, t: 'Voice + Vision', d: 'Talk & show your camera' },
          { icon: Brain, t: 'Memory', d: 'Remembers you' },
        ].map((f, i) => (
          <motion.div
            key={f.t}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="lift-card glass rounded-2xl p-4"
          >
            <span className="accent-gradient-bg flex h-9 w-9 items-center justify-center rounded-xl">
              <f.icon size={18} strokeWidth={2.4} />
            </span>
            <div className="mt-2.5 font-bold">{f.t}</div>
            <div className="text-xs text-muted">{f.d}</div>
          </motion.div>
        ))}
      </div>
    </div>,
  ]

  const last = step === steps.length - 1

  // Advance synchronously. updateSettings updates local state immediately and
  // persists in the background, so the UI never waits on (or hangs behind) a
  // Firestore write.
  function next() {
    if (step === 1 && name.trim()) void updateSettings({ displayName: name.trim() })
    if (step === 3 && about.trim()) void updateSettings({ aboutYou: about.trim() })
    if (last) {
      try {
        localStorage.setItem('ripoai:onboarded', '1')
      } catch {
        /* ignore */
      }
      void updateSettings({ onboarded: true })
      return
    }
    setStep((s) => s + 1)
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong w-full max-w-md rounded-4xl p-8"
      >
        {/* Progress dots */}
        <div className="mb-8 flex justify-center gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-8 accent-gradient-bg' : 'w-1.5 bg-white/20'
              }`}
            />
          ))}
        </div>

        <div className="min-h-[260px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25 }}
            >
              {steps[step]}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center justify-between">
          {step > 0 ? (
            <button onClick={() => setStep((s) => s - 1)} className="text-sm text-muted hover:text-ink">
              Back
            </button>
          ) : (
            <span />
          )}
          <Button onClick={next} className="px-6">
            {last ? (
              <>
                <Sparkles size={16} /> Start using AskAI
              </>
            ) : (
              'Continue'
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
