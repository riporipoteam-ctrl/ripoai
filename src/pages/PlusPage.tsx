import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles, Check, Coins, ArrowLeft, Zap, ImageIcon, ImagePlus, Crown, RefreshCw, Ticket, PanelLeftOpen } from 'lucide-react'
import { usePlus } from '../hooks/usePlus'
import { useStore } from '../store'
import {
  PLAN_LIMITS,
  PLUS_PRICE,
  effectivePlan,
  isOnTrial,
  buyPlus,
  setAutoRenew,
  redeemCode,
} from '../lib/plus'
import Logo from '../components/Logo'

function Stat({ icon, label, free, plus }: { icon: React.ReactNode; label: string; free: string; plus: string }) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr] items-center gap-2 border-t border-white/10 px-1 py-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className="text-center text-muted">{free}</div>
      <div className="text-center font-semibold text-accent">{plus}</div>
    </div>
  )
}

export default function PlusPage() {
  const navigate = useNavigate()
  const { setSidebar, sidebarOpen, toggleSidebar } = useStore()
  const { uid, state, refresh } = usePlus()
  const [code, setCode] = useState('')
  const [discount, setDiscount] = useState(0)
  const [msg, setMsg] = useState('')

  if (!state || !uid) return null
  const plan = effectivePlan(state)
  const onTrial = isOnTrial(state)
  const free = PLAN_LIMITS.free
  const plus = PLAN_LIMITS.plus
  const price = Math.max(0, Math.round(PLUS_PRICE * (1 - discount / 100)))

  function doBuy() {
    if (!uid) return
    const r = buyPlus(uid, discount)
    setMsg(r.ok ? '🎉 Welcome to AskAI+! Your perks are now active.' : r.reason || 'Could not subscribe.')
    refresh()
  }

  function doRedeem() {
    if (!uid) return
    const r = redeemCode(uid, code)
    setMsg(r.message)
    if (r.ok && r.percentOff) setDiscount(r.percentOff)
    if (r.ok) setCode('')
    refresh()
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-5">
        <div className="mb-5 flex items-center gap-2">
          {!sidebarOpen && (
            <button onClick={toggleSidebar} className="glass pressable rounded-xl p-2" title="Open sidebar">
              <PanelLeftOpen size={18} />
            </button>
          )}
          <button
            onClick={() => navigate('/')}
            className="pressable flex items-center gap-1.5 rounded-xl px-2 py-2 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft size={18} /> Back
          </button>
          <div className="ml-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-bold">
            <Coins size={15} className="text-amber-400" /> {state.coins}
          </div>
        </div>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong relative overflow-hidden rounded-3xl p-6 text-center"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[rgb(var(--accent)/0.25)] blur-3xl" />
          <div className="mx-auto mb-3 w-fit">
            <Logo size={56} glow variant="icon" />
          </div>
          <h1 className="flex items-center justify-center gap-2 text-2xl font-extrabold">
            AskAI<span className="brand-gradient">+</span>
          </h1>
          <p className="mt-1 text-sm text-muted">More images, more credits, more power — paid for with coins you earn.</p>

          {plan === 'plus' ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent/15 px-4 py-2 text-sm font-bold text-accent">
              <Crown size={16} /> {onTrial ? 'Free trial active' : 'AskAI+ active'} ·{' '}
              {new Date(state.plusUntil).toLocaleDateString()}
            </div>
          ) : (
            <button
              onClick={doBuy}
              className="accent-gradient-bg pressable mt-4 inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white shadow-lg"
            >
              <Sparkles size={17} /> Get AskAI+ for {price} coins
            </button>
          )}
          {discount > 0 && plan !== 'plus' && (
            <p className="mt-2 text-xs font-semibold text-emerald-400">{discount}% discount applied!</p>
          )}
          {msg && <p className="mt-3 text-sm font-medium text-accent">{msg}</p>}
        </motion.div>

        {/* Comparison */}
        <div className="glass mt-4 rounded-3xl p-4">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 px-1 pb-1 text-xs font-bold uppercase tracking-wide text-muted">
            <div>What you get</div>
            <div className="text-center">Free</div>
            <div className="text-center text-accent">Plus</div>
          </div>
          <Stat icon={<ImageIcon size={16} />} label="Image uploads / day" free={`${free.imagesPerDay}`} plus={`${plus.imagesPerDay}`} />
          <Stat icon={<ImagePlus size={16} />} label="Image generations / day" free={`${free.imageGenPerDay}`} plus={`${plus.imageGenPerDay}`} />
          <Stat icon={<Zap size={16} />} label="Pro credits / day" free={`${free.creditsPerDay.toLocaleString()}`} plus={`${plus.creditsPerDay.toLocaleString()}`} />
          <Stat icon={<Check size={16} />} label="Credit burn rate" free="Standard" plus="Slow" />
          <Stat icon={<Crown size={16} />} label="Priority + early features" free="—" plus="Yes" />
        </div>

        {/* Auto-renew */}
        {plan === 'plus' && !onTrial && (
          <div className="glass mt-4 flex items-center gap-3 rounded-2xl p-4 text-sm">
            <RefreshCw size={18} className="text-accent" />
            <div className="flex-1">
              <div className="font-semibold">Auto-renew monthly</div>
              <div className="text-xs text-muted">Renews for {PLUS_PRICE} coins each month. Removed automatically if you can't afford it.</div>
            </div>
            <button
              onClick={() => {
                setAutoRenew(uid, !state.autoRenew)
                refresh()
              }}
              className={`relative h-6 w-11 rounded-full transition ${state.autoRenew ? 'bg-accent' : 'bg-white/20'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${state.autoRenew ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
        )}

        {/* Redeem code */}
        <div className="glass mt-4 rounded-2xl p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Ticket size={16} className="text-accent" /> Have a discount code?
          </div>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter code"
              className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm uppercase outline-none placeholder:normal-case placeholder:text-muted"
            />
            <button onClick={doRedeem} className="pressable rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10">
              Redeem
            </button>
          </div>
        </div>

        <button
          onClick={() => {
            navigate('/tasks')
            if (window.innerWidth < 768) setSidebar(false)
          }}
          className="accent-gradient-bg pressable mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white"
        >
          <Coins size={16} /> Earn more coins — Daily tasks
        </button>
        <p className="mt-3 text-center text-xs text-muted">Earn coins by chatting and completing daily tasks. No card needed, ever.</p>
      </div>
    </div>
  )
}
