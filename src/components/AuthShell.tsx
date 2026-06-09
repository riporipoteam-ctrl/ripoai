import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import Logo from './Logo'

const FEATURES = [
  'Chat with the latest AskAI models',
  'Live in-browser coding projects',
  'Web search & autonomous agent',
  'Memory that learns about you',
]

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto p-4">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-4xl md:grid-cols-2">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden p-10 md:flex">
          <div className="accent-gradient-bg absolute inset-0" />
          {/* floating depth orbs */}
          <span className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <span className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-black/10 blur-2xl" />
          <div className="relative z-10 flex items-center gap-3">
            <span className="rounded-2xl bg-white/15 p-2 backdrop-blur-sm">
              <Logo size={40} variant="icon" />
            </span>
            <div className="text-3xl font-extrabold tracking-tight text-[rgb(var(--accent-ink))]">AskAI</div>
          </div>
          <div className="relative z-10">
            <h2 className="max-w-xs text-3xl font-extrabold leading-tight text-[rgb(var(--accent-ink))]">
              One workspace for everything you can imagine.
            </h2>
            <ul className="mt-6 space-y-3">
              {FEATURES.map((f, i) => (
                <motion.li
                  key={f}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i + 0.2 }}
                  className="flex items-center gap-3 text-[rgb(var(--accent-ink))]/90"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent-ink))]/20 text-xs">
                    ✓
                  </span>
                  {f}
                </motion.li>
              ))}
            </ul>
          </div>
          <div className="relative z-10 text-sm text-[rgb(var(--accent-ink))]/55">
            Free to start · earn coins · unlock AskAI+
          </div>
        </div>

        {/* Form panel */}
        <motion.div
          className="glass-strong flex flex-col justify-center p-8 sm:p-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        >
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <Logo size={32} />
            <div className="text-3xl font-extrabold brand-gradient">AskAI</div>
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </motion.div>
      </div>
    </div>
  )
}
