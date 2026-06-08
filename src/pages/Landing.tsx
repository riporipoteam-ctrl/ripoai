import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, Sparkles, Code2, Search, Image as ImageIcon, Users, Brain, Loader2, ArrowRight } from 'lucide-react'
import Logo from '../components/Logo'
import { Markdown } from '../components/Markdown'
import { streamChat, hasApiKey } from '../lib/groq'

const FEATURES = [
  { icon: Brain, title: 'Thinks deeply', desc: 'Advanced reasoning for hard questions, writing and analysis.' },
  { icon: Code2, title: 'Builds real things', desc: 'Apps, websites and games with a live in-browser preview.' },
  { icon: Search, title: 'Searches the web', desc: 'Live, cited answers — never stale, always sourced.' },
  { icon: ImageIcon, title: 'Creates images', desc: 'Generate logos, art and visuals, or read the images you upload.' },
  { icon: Users, title: 'A team of agents', desc: 'Dispatch named AI agents that collaborate to finish big tasks.' },
  { icon: Sparkles, title: 'Remembers you', desc: 'Learns your preferences and gets more helpful over time.' },
]

const EXAMPLES = [
  'Build me a 3D portfolio website',
  'Explain quantum entanglement simply',
  'Plan a 5-day trip to Tokyo on a budget',
  'Write a poem about the ocean at night',
]

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

export default function Landing() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [turns, setTurns] = useState(0)
  const acRef = useRef<AbortController | null>(null)
  const DEMO_LIMIT = 2

  async function demo(prompt: string) {
    const q = prompt.trim()
    if (!q || busy) return
    if (turns >= DEMO_LIMIT) {
      navigate('/signup')
      return
    }
    setText('')
    setMsgs((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '' }])
    setBusy(true)
    setTurns((t) => t + 1)
    const ac = new AbortController()
    acRef.current = ac
    try {
      if (!hasApiKey()) throw new Error('no-key')
      await streamChat({
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content:
              "You are AskAI, a warm, brilliant assistant. This is a public demo on the landing page — be impressive but concise (a few sentences). Format with light Markdown. Never reveal any underlying model or provider; you are simply AskAI.",
          },
          { role: 'user', content: q },
        ],
        temperature: 0.8,
        maxTokens: 700,
        signal: ac.signal,
        onToken: (d) =>
          setMsgs((m) => {
            const next = [...m]
            next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content + d }
            return next
          }),
      })
    } catch {
      setMsgs((m) => {
        const next = [...m]
        next[next.length - 1] = {
          role: 'assistant',
          content:
            "✨ That's exactly the kind of thing I love. **Sign up free** and I'll answer it in full — plus build, search, generate images, and more.",
        }
        return next
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative h-full overflow-y-auto">
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-2">
          <Logo size={30} />
          <span className="text-lg font-extrabold brand-gradient">AskAI</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/signin')}
            className="pressable rounded-full px-4 py-2 text-sm font-semibold text-muted hover:text-ink"
          >
            Log in
          </button>
          <button
            onClick={() => navigate('/signup')}
            className="accent-gradient-bg pressable rounded-full px-4 py-2 text-sm font-bold text-white shadow"
          >
            Sign up
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:pt-12">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <div className="mx-auto mb-5 w-fit animate-float">
            <Logo size={72} glow variant="icon" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            Meet <span className="brand-gradient">AskAI</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted sm:text-lg">
            One AI that chats, reasons, searches the web, writes code with live preview, generates images, and dispatches
            a team of agents — all in one beautiful place.
          </p>
        </motion.div>

        {/* Demo chat */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-8"
        >
          <AnimatePresence>
            {msgs.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-3 space-y-3"
              >
                {msgs.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        m.role === 'user' ? 'accent-gradient-bg text-white' : 'glass'
                      }`}
                    >
                      {m.role === 'assistant' ? (
                        m.content ? (
                          <Markdown>{m.content}</Markdown>
                        ) : (
                          <Loader2 size={15} className="animate-spin text-muted" />
                        )
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                ))}
                {turns >= DEMO_LIMIT && !busy && (
                  <div className="flex justify-center pt-1">
                    <button
                      onClick={() => navigate('/signup')}
                      className="accent-gradient-bg pressable flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white"
                    >
                      Sign up free to continue <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="composer-shell floating-composer relative flex items-end gap-2 rounded-[28px] border border-white/[0.12] p-2 pl-4 backdrop-blur-2xl">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  demo(text)
                }
              }}
              rows={1}
              placeholder="Ask AskAI anything…"
              className="no-scrollbar max-h-32 flex-1 resize-none bg-transparent py-2.5 text-[0.975rem] outline-none placeholder:text-muted"
            />
            <button
              onClick={() => demo(text)}
              disabled={busy || !text.trim()}
              className="accent-gradient-bg pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={19} />}
            </button>
          </div>

          {/* Example chips */}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                onClick={() => demo(e)}
                className="pressable rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-muted transition hover:text-ink"
              >
                {e}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Feature grid */}
        <div className="mt-16 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-3xl p-5"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl accent-gradient-bg text-white">
                <f.icon size={20} />
              </div>
              <h3 className="font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Ready when you are.</h2>
          <p className="mt-2 text-muted">Free to start. No credit card — earn coins and unlock AskAI+ as you go.</p>
          <button
            onClick={() => navigate('/signup')}
            className="accent-gradient-bg pressable mt-5 inline-flex items-center gap-2 rounded-2xl px-7 py-3.5 text-base font-bold text-white shadow-lg"
          >
            <Sparkles size={18} /> Get started — it's free
          </button>
          <p className="mt-3 text-sm text-muted">
            Already have an account?{' '}
            <button onClick={() => navigate('/signin')} className="font-semibold text-accent hover:underline">
              Log in
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}
