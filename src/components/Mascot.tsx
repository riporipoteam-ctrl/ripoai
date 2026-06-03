import { motion, AnimatePresence } from 'framer-motion'

export type MascotState = 'idle' | 'thinking' | 'searching' | 'coding' | 'speaking'

// "Ripo" — the RipoAI pet. A small, glossy robot that perches on the composer
// and genuinely reacts to what the AI is doing: it breathes (squash & stretch),
// blinks, glances around, waves, ponders, scans through a lens, types, and
// chatters. Built as inline SVG + Framer Motion so it stays crisp at any size.
export default function Mascot({ state = 'idle', size = 54 }: { state?: MascotState; size?: number }) {
  const active = state !== 'idle'

  // Where the eyes look, per state.
  const pupil =
    state === 'thinking'
      ? { x: 1.5, y: -2.2 }
      : state === 'searching'
        ? { x: 0, y: 0 }
        : { x: 0, y: 0 }

  return (
    <div className="pointer-events-none relative select-none" style={{ width: size, height: size }} aria-hidden>
      {/* soft contact shadow that pulses with the breathing so it "sits" */}
      <motion.div
        className="absolute left-1/2 h-1.5 rounded-full bg-black/30 blur-[3px]"
        style={{ bottom: -2, width: size * 0.42, x: '-50%' }}
        animate={{ scaleX: active ? [1, 0.86, 1] : [1, 0.92, 1], opacity: [0.35, 0.5, 0.35] }}
        transition={{ duration: active ? 0.9 : 2.6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* state accessory bubbles */}
      <AnimatePresence>
        {state === 'thinking' && (
          <motion.div
            key="t"
            initial={{ opacity: 0, scale: 0.6, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className="glass-strong absolute -right-2 -top-4 flex gap-0.5 rounded-full px-1.5 py-1 shadow-lg"
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-1 w-1 rounded-full bg-accent"
                animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </motion.div>
        )}
        {state === 'searching' && (
          <motion.div
            key="s"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1, rotate: [0, -12, 12, 0], x: [0, 2, -2, 0] }}
            transition={{ rotate: { duration: 1.5, repeat: Infinity }, x: { duration: 1.5, repeat: Infinity } }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute -right-2 -top-2 text-[15px] drop-shadow"
          >
            🔍
          </motion.div>
        )}
        {state === 'coding' && (
          <motion.div
            key="c"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: [0, -1.5, 0] }}
            transition={{ y: { duration: 0.5, repeat: Infinity } }}
            exit={{ opacity: 0 }}
            className="absolute -right-2 -top-2 text-[15px] drop-shadow"
          >
            💻
          </motion.div>
        )}
      </AnimatePresence>

      {/* whole-body float + gentle sway */}
      <motion.div
        className="absolute inset-0"
        animate={{ y: active ? [0, -3, 0] : [0, -2, 0], rotate: state === 'idle' ? [0, -2.5, 2.5, 0] : [0, -1, 1, 0] }}
        transition={{
          y: { duration: active ? 0.95 : 2.6, repeat: Infinity, ease: 'easeInOut' },
          rotate: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="ripo-body" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#16c79a" />
              <stop offset="0.5" stopColor="#4ea8ff" />
              <stop offset="1" stopColor="#7c5cff" />
            </linearGradient>
            <linearGradient id="ripo-gloss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="ripo-eye" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#bfefff" />
              <stop offset="1" stopColor="#36e0c0" />
            </radialGradient>
          </defs>

          {/* antenna with a springy, glowing tip */}
          <motion.g
            style={{ transformOrigin: '32px 16px' }}
            animate={{ rotate: state === 'idle' ? [0, 6, -6, 0] : [0, 3, -3, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <line x1="32" y1="9" x2="32" y2="16" stroke="url(#ripo-body)" strokeWidth="2.5" strokeLinecap="round" />
            <motion.circle
              cx="32" cy="8" r="3" fill="#36e0c0"
              animate={{ r: active ? [3, 3.8, 3] : [3, 3.3, 3], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 0.9, repeat: Infinity }}
            />
            <motion.circle
              cx="32" cy="8" r="5" fill="#36e0c0"
              animate={{ opacity: active ? [0.35, 0.05, 0.35] : [0.2, 0.04, 0.2], scale: [1, 1.5, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              style={{ transformOrigin: '32px 8px' }}
            />
          </motion.g>

          {/* arms */}
          <motion.g
            style={{ transformOrigin: '13px 36px' }}
            animate={
              state === 'coding'
                ? { rotate: [0, -22, 0] }
                : state === 'idle'
                  ? { rotate: [0, 0, 48, -4, 0, 0] }
                  : { rotate: [0, -6, 0] }
            }
            transition={{
              duration: state === 'coding' ? 0.4 : state === 'idle' ? 4.5 : 2,
              repeat: Infinity,
              repeatDelay: state === 'idle' ? 2.5 : 0,
            }}
          >
            <rect x="6" y="34" width="8" height="3.6" rx="1.8" fill="url(#ripo-body)" />
            <circle cx="6.5" cy="35.8" r="2.4" fill="url(#ripo-body)" />
          </motion.g>
          <motion.g
            style={{ transformOrigin: '51px 36px' }}
            animate={state === 'coding' ? { rotate: [0, 22, 0] } : { rotate: [0, 6, 0] }}
            transition={{ duration: state === 'coding' ? 0.4 : 2.2, repeat: Infinity, delay: 0.2 }}
          >
            <rect x="50" y="34" width="8" height="3.6" rx="1.8" fill="url(#ripo-body)" />
            <circle cx="57.5" cy="35.8" r="2.4" fill="url(#ripo-body)" />
          </motion.g>

          {/* body — breathes with a subtle squash & stretch */}
          <motion.g
            style={{ transformOrigin: '32px 50px' }}
            animate={{ scaleY: active ? [1, 1.04, 1] : [1, 1.05, 0.99, 1], scaleX: active ? [1, 0.985, 1] : [1, 0.97, 1.01, 1] }}
            transition={{ duration: active ? 0.95 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            {/* feet */}
            <rect x="19" y="49" width="9" height="6" rx="3" fill="url(#ripo-body)" />
            <rect x="36" y="49" width="9" height="6" rx="3" fill="url(#ripo-body)" />

            {/* shell */}
            <rect x="11" y="15" width="42" height="38" rx="15" fill="url(#ripo-body)" />
            {/* glossy top highlight */}
            <rect x="15" y="17" width="34" height="16" rx="11" fill="url(#ripo-gloss)" />

            {/* face screen */}
            <rect x="16" y="22" width="32" height="22" rx="10" fill="#0e1018" />
            <rect x="16" y="22" width="32" height="22" rx="10" fill="none" stroke="#36e0c0" strokeOpacity="0.18" strokeWidth="1" />

            {/* cheeks */}
            <circle cx="20" cy="38" r="2.4" fill="#ff7eb6" opacity="0.5" />
            <circle cx="44" cy="38" r="2.4" fill="#ff7eb6" opacity="0.5" />

            {/* eyes — blink + look around; pupils glance per state */}
            <motion.g
              animate={{ scaleY: [1, 1, 0.08, 1, 1] }}
              transition={{ duration: 0.32, repeat: Infinity, repeatDelay: active ? 2 : 3.4, times: [0, 0.8, 0.88, 0.96, 1] }}
              style={{ transformOrigin: '32px 32px' }}
            >
              <motion.g
                animate={
                  state === 'idle'
                    ? { x: [0, 2.4, -2.4, 0], y: [0, 0, 1, 0] }
                    : { x: pupil.x, y: pupil.y }
                }
                transition={{ duration: 4, repeat: state === 'idle' ? Infinity : 0, repeatDelay: 1.2 }}
              >
                <circle cx="25" cy="32" r="4" fill="url(#ripo-eye)" />
                <circle cx="39" cy="32" r="4" fill="url(#ripo-eye)" />
                {/* shine */}
                <circle cx="26.4" cy="30.6" r="1.1" fill="#fff" />
                <circle cx="40.4" cy="30.6" r="1.1" fill="#fff" />
              </motion.g>
            </motion.g>

            {/* mouth — talks while speaking, smiles otherwise */}
            {state === 'speaking' ? (
              <motion.rect
                x="29" y="38" width="6" height="3.4" rx="1.7" fill="#36e0c0"
                animate={{ scaleY: [1, 0.4, 1.3, 0.6, 1] }}
                transition={{ duration: 0.45, repeat: Infinity }}
                style={{ transformOrigin: '32px 39px' }}
              />
            ) : (
              <path d="M27.5 39 Q32 42.5 36.5 39" stroke="#36e0c0" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            )}
          </motion.g>
        </svg>
      </motion.div>
    </div>
  )
}
