import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

const FEATURES = [
  'Chat with four RipoAI models',
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
        <div className="relative hidden flex-col justify-between p-10 md:flex">
          <div className="accent-gradient-bg absolute inset-0 opacity-90" />
          <div className="relative z-10">
            <div className="text-4xl font-extrabold tracking-tight text-white">RipoAI</div>
            <p className="mt-3 max-w-xs text-white/80">
              Your intelligent workspace for chatting, researching and building anything.
            </p>
          </div>
          <ul className="relative z-10 space-y-3">
            {FEATURES.map((f, i) => (
              <motion.li
                key={f}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i + 0.2 }}
                className="flex items-center gap-3 text-white/90"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-xs">
                  ✓
                </span>
                {f}
              </motion.li>
            ))}
          </ul>
          <div className="float-element relative z-10 text-sm text-white/60">
            Designed with iOS-26 Liquid Glass aesthetics.
          </div>
        </div>

        {/* Form panel */}
        <motion.div
          className="glass-strong flex flex-col justify-center p-8 sm:p-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        >
          <div className="mb-6 md:hidden">
            <div className="text-3xl font-extrabold brand-gradient">RipoAI</div>
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </motion.div>
      </div>
    </div>
  )
}
