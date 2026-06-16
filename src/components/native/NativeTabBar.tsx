import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, Bot, Plus, Zap, MessageSquare } from 'lucide-react'
import { useStore } from '../../store'
import { isNative } from '../../lib/native'
import { haptic } from '../../lib/native'

/** Native-only bottom navigation — the single biggest "this is an app, not a
 * website" signal. Glassy, with a raised center New-chat button. Hidden on the
 * website entirely (isNative gate). */
export default function NativeTabBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setSidebar, sidebarOpen } = useStore()
  if (!isNative) return null

  const path = location.pathname
  const isHome = path === '/' || path.startsWith('/c/')
  const onAgents = path.startsWith('/agents') || path.startsWith('/agent/') || path.startsWith('/team')
  const onJobs = path.startsWith('/jobs')
  const onFriends = path.startsWith('/friends')

  function go(fn: () => void) {
    haptic('light')
    fn()
  }

  const Tab = ({
    icon,
    label,
    active,
    onClick,
  }: {
    icon: React.ReactNode
    label: string
    active?: boolean
    onClick: () => void
  }) => (
    <button
      onClick={() => go(onClick)}
      className="native-tab pressable flex flex-1 flex-col items-center justify-center gap-0.5 py-1"
    >
      <span className={active ? 'text-accent' : 'text-muted'}>{icon}</span>
      <span className={`text-[10px] font-semibold ${active ? 'text-ink' : 'text-muted'}`}>{label}</span>
      {active && (
        <motion.span
          layoutId="native-tab-dot"
          className="absolute -top-0.5 h-1 w-1 rounded-full bg-accent"
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      )}
    </button>
  )

  // Slide the bar out of the way when the drawer is open or a project is open.
  const hidden = sidebarOpen || path.startsWith('/project')

  return (
    <motion.nav
      className="native-tabbar"
      animate={{ y: hidden ? 140 : 0, opacity: hidden ? 0 : 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
    >
      <div className="native-tabbar-inner glass">
        <Tab icon={<Home size={21} />} label="Home" active={isHome} onClick={() => navigate('/')} />
        <Tab icon={<Bot size={21} />} label="Agents" active={onAgents} onClick={() => navigate('/agents')} />

        {/* Raised center New-chat button */}
        <div className="relative flex w-16 shrink-0 items-end justify-center">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() =>
              go(() => {
                navigate('/chat')
                window.dispatchEvent(new CustomEvent('askai-focus-composer'))
              })
            }
            className="native-fab accent-gradient-bg"
            aria-label="New chat"
          >
            <Plus size={26} strokeWidth={2.6} />
          </motion.button>
        </div>

        <Tab icon={<Zap size={21} />} label="Jobs" active={onJobs} onClick={() => navigate('/jobs')} />
        <Tab icon={<MessageSquare size={21} />} label="Friends" active={onFriends} onClick={() => navigate('/friends')} />
      </div>
    </motion.nav>
  )
}
