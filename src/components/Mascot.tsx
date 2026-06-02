import { motion, AnimatePresence } from 'framer-motion'

export type MascotState = 'idle' | 'thinking' | 'searching' | 'coding' | 'speaking'

// A little RipoAI character that perches on the composer and reacts to what the
// AI is doing — blinks when idle, ponders while thinking, peers through a lens
// while searching, types on a laptop while coding.
export default function Mascot({ state = 'idle', size = 50 }: { state?: MascotState; size?: number }) {
  const active = state !== 'idle'
  return (
    <div className="pointer-events-none relative" style={{ width: size, height: size }} aria-hidden>
      {/* Accessory bubble */}
      <AnimatePresence>
        {state === 'thinking' && (
          <motion.div
            key="think"
            initial={{ opacity: 0, scale: 0.6, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className="glass-strong absolute -right-1 -top-5 flex gap-0.5 rounded-full px-1.5 py-1"
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
            key="search"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1, rotate: [0, -12, 12, 0], x: [0, 2, -2, 0] }}
            transition={{ rotate: { duration: 1.4, repeat: Infinity }, x: { duration: 1.4, repeat: Infinity } }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute -right-2 -top-3 text-base"
          >
            🔍
          </motion.div>
        )}
        {state === 'coding' && (
          <motion.div
            key="code"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: [0, -1.5, 0] }}
            transition={{ y: { duration: 0.5, repeat: Infinity } }}
            exit={{ opacity: 0 }}
            className="absolute -right-2 -top-3 text-base"
          >
            💻
          </motion.div>
        )}
      </AnimatePresence>

      {/* Character — gentle float + bob faster when active */}
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        animate={{ y: active ? [0, -2.5, 0] : [0, -1.5, 0] }}
        transition={{ duration: active ? 0.9 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <defs>
          <linearGradient id="mascot-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#10a37f" />
            <stop offset="0.5" stopColor="#4ea8ff" />
            <stop offset="1" stopColor="#7c5cff" />
          </linearGradient>
        </defs>
        {/* antenna */}
        <line x1="32" y1="8" x2="32" y2="15" stroke="url(#mascot-g)" strokeWidth="2.5" strokeLinecap="round" />
        <motion.circle
          cx="32" cy="7" r="3" fill="#36e0c0"
          animate={{ opacity: active ? [0.5, 1, 0.5] : [0.7, 1, 0.7], r: active ? [3, 3.6, 3] : 3 }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
        {/* body */}
        <rect x="12" y="15" width="40" height="36" rx="13" fill="url(#mascot-g)" />
        {/* face screen */}
        <rect x="17" y="21" width="30" height="22" rx="9" fill="#10121a" />
        {/* eyes — blink */}
        <motion.g
          animate={{ scaleY: [1, 1, 0.1, 1] }}
          transition={{ duration: 0.3, repeat: Infinity, repeatDelay: active ? 1.6 : 3, times: [0, 0.85, 0.92, 1] }}
          style={{ transformOrigin: '32px 31px' }}
        >
          {state === 'thinking' ? (
            <>
              <circle cx="26" cy="29" r="3" fill="#fff" />
              <circle cx="38" cy="29" r="3" fill="#fff" />
            </>
          ) : (
            <>
              <circle cx="25.5" cy="32" r="3.4" fill="#fff" />
              <circle cx="38.5" cy="32" r="3.4" fill="#fff" />
            </>
          )}
        </motion.g>
        {/* little smile */}
        <path d="M27 38 Q32 41 37 38" stroke="#36e0c0" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* feet */}
        <rect x="20" y="50" width="8" height="5" rx="2.5" fill="url(#mascot-g)" />
        <rect x="36" y="50" width="8" height="5" rx="2.5" fill="url(#mascot-g)" />
      </motion.svg>
    </div>
  )
}
