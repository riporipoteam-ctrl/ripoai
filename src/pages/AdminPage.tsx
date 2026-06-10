import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Users,
  Ban as BanIcon,
  ShieldCheck,
  Crown,
  Ticket,
  Trash2,
  Plus as PlusIcon,
  Search,
  Copy,
  Check,
  RefreshCw,
  PanelLeftOpen,
} from 'lucide-react'
import { useStore } from '../store'
import {
  listUsers,
  banUser,
  unbanUser,
  setUserMsgLimit,
  banActive,
  grantPlus,
  revokePlus,
  isAdmin,
  type AdminUser,
} from '../lib/admin'
import { loadCodes, upsertCode, removeCode, type DiscountCode } from '../lib/plus'
import Avatar from '../components/ui/Avatar'

const BAN_DURATIONS = [
  { label: '1 hour', ms: 3600e3 },
  { label: '1 day', ms: 86400e3 },
  { label: '7 days', ms: 7 * 86400e3 },
  { label: '30 days', ms: 30 * 86400e3 },
  { label: 'Permanent', ms: 0 },
]

const PLUS_DURATIONS = [
  { label: '7 days', ms: 7 * 86400e3 },
  { label: '1 month', ms: 30 * 86400e3 },
  { label: '3 months', ms: 90 * 86400e3 },
  { label: '1 year', ms: 365 * 86400e3 },
  { label: 'Forever', ms: 0 },
]

function timeLeft(ms: number): string {
  if (!ms) return 'permanent'
  const d = Math.max(0, ms - Date.now())
  if (d <= 0) return 'expired'
  const days = Math.floor(d / 86400e3)
  if (days >= 1) return `${days}d left`
  const hrs = Math.floor((d % 86400e3) / 3600e3)
  const mins = Math.floor((d % 3600e3) / 60e3)
  return `${hrs}h ${mins}m left`
}

function ago(ms: number): string {
  if (!ms) return '—'
  const d = Date.now() - ms
  const mins = Math.floor(d / 60e3)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}

function plusActive(u: AdminUser): boolean {
  if (!u.plusGrant) return false
  return u.plusGrant.until === 0 || u.plusGrant.until > Date.now()
}

export default function AdminPage() {
  const navigate = useNavigate()
  const { user, sidebarOpen, toggleSidebar } = useStore()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'users' | 'codes'>('users')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [banDur, setBanDur] = useState(BAN_DURATIONS[1].ms)
  const [copied, setCopied] = useState('')
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [newCode, setNewCode] = useState({ code: '', kind: 'coins' as 'coins' | 'percent' | 'days', value: 100 })

  const allowed = isAdmin(user)

  useEffect(() => {
    if (!allowed) {
      navigate('/', { replace: true })
      return
    }
    refresh()
    setCodes(loadCodes())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed])

  async function refresh() {
    setLoading(true)
    setErr('')
    try {
      setUsers(await listUsers())
    } catch (e: any) {
      setErr(
        `Could not load users: ${e?.code || e?.message || 'unknown error'}. ` +
          'If this says permission-denied, publish the admin Firestore rules.',
      )
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) =>
      `${u.displayName} ${u.email} ${u.uid}`.toLowerCase().includes(q),
    )
  }, [users, query])

  const stats = {
    total: users.length,
    banned: users.filter((u) => banActive(u.ban)).length,
    active: users.filter((u) => u.lastSeen > Date.now() - 86400e3).length,
    plus: users.filter(plusActive).length,
  }

  async function doGrant(uid: string, ms: number) {
    const until = ms === 0 ? 0 : Date.now() + ms
    await grantPlus(uid, until)
    refresh()
  }

  function copyUid(uid: string) {
    navigator.clipboard.writeText(uid).catch(() => {})
    setCopied(uid)
    setTimeout(() => setCopied(''), 1200)
  }

  function addCode() {
    const code = newCode.code.trim().toUpperCase()
    if (!code) return
    const entry: DiscountCode = { code, active: true }
    if (newCode.kind === 'coins') entry.coins = newCode.value
    else if (newCode.kind === 'percent') entry.percentOff = Math.min(100, newCode.value)
    else entry.freeDays = newCode.value
    upsertCode(entry)
    setCodes(loadCodes())
    setNewCode({ code: '', kind: newCode.kind, value: newCode.value })
  }

  return (
    <div className="page-enter relative flex h-full flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-white/10 bg-[rgb(var(--glass-bg)/0.4)] px-3 py-2.5 backdrop-blur-xl">
        {!sidebarOpen && (
          <button onClick={toggleSidebar} className="glass pressable rounded-xl p-2" title="Open sidebar">
            <PanelLeftOpen size={18} />
          </button>
        )}
        <button onClick={() => navigate('/')} className="pressable rounded-xl p-2 text-muted hover:text-ink">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <ShieldCheck size={20} className="text-accent" /> Admin
        </div>
        <button
          onClick={refresh}
          className="pressable ml-auto flex items-center gap-1.5 rounded-xl border border-[rgb(var(--ink)/0.1)] px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        <div className="mx-auto max-w-3xl">
          {/* Stats */}
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { icon: Users, label: 'Total users', value: stats.total },
              { icon: Crown, label: 'AskAI+ members', value: stats.plus },
              { icon: BanIcon, label: 'Banned', value: stats.banned },
              { icon: RefreshCw, label: 'Active 24h', value: stats.active },
            ].map((s) => (
              <div key={s.label} className="glass rounded-2xl p-3.5 text-center">
                <s.icon size={17} className="mx-auto mb-1.5 text-accent" />
                <div className="font-display text-2xl font-bold">{s.value}</div>
                <div className="text-[11px] text-muted">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="mb-3 flex gap-1 rounded-2xl bg-[rgb(var(--ink)/0.05)] p-1 text-sm font-semibold">
            <button
              onClick={() => setTab('users')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 ${tab === 'users' ? 'accent-gradient-bg text-white' : 'text-muted'}`}
            >
              <Users size={15} /> Users
            </button>
            <button
              onClick={() => setTab('codes')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 ${tab === 'codes' ? 'accent-gradient-bg text-white' : 'text-muted'}`}
            >
              <Ticket size={15} /> Codes
            </button>
          </div>

          {tab === 'codes' ? (
            <div>
              <div className="glass mb-3 rounded-2xl p-3">
                <div className="mb-2 text-sm font-semibold">Create a code</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={newCode.code}
                    onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                    placeholder="CODE"
                    className="w-28 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm uppercase outline-none"
                  />
                  <select
                    value={newCode.kind}
                    onChange={(e) => setNewCode({ ...newCode, kind: e.target.value as any })}
                    className="rounded-xl border border-white/15 bg-white/5 px-2 py-2 text-sm outline-none"
                  >
                    <option value="coins">Coins</option>
                    <option value="percent">% off Plus</option>
                    <option value="days">Free Plus days</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={newCode.value}
                    onChange={(e) => setNewCode({ ...newCode, value: parseInt(e.target.value || '0', 10) })}
                    className="w-20 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none"
                  />
                  <button onClick={addCode} className="accent-gradient-bg pressable flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-white">
                    <PlusIcon size={15} /> Add
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {codes.length === 0 && <p className="py-6 text-center text-sm text-muted">No codes yet.</p>}
                {codes.map((c) => (
                  <div key={c.code} className="glass flex items-center gap-3 rounded-2xl p-3">
                    <Ticket size={18} className="text-accent" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold tracking-wide">{c.code}</div>
                      <div className="text-xs text-muted">
                        {c.coins ? `+${c.coins} coins` : c.percentOff ? `${c.percentOff}% off Plus` : c.freeDays ? `${c.freeDays} free Plus days` : '—'}
                      </div>
                    </div>
                    <button onClick={() => { removeCode(c.code); setCodes(loadCodes()) }} className="pressable rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-red-400">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="glass mb-3 flex items-center gap-2 rounded-2xl px-3 py-2">
                <Search size={16} className="text-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, email or UID…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                />
                <span className="text-xs text-muted">{filtered.length}/{users.length}</span>
              </div>

              {err && <p className="mb-2 rounded-xl bg-red-500/10 p-2 text-xs text-red-400">{err}</p>}
              {loading && <p className="py-6 text-center text-sm text-muted">Loading users…</p>}
              {!loading && !filtered.length && !err && (
                <p className="py-6 text-center text-sm text-muted">No users found.</p>
              )}

              <div className="space-y-2">
                {filtered.map((u) => {
                  const isBanned = banActive(u.ban)
                  const hasPlus = plusActive(u)
                  const open = expanded === u.uid
                  return (
                    <div key={u.uid} className="glass rounded-2xl p-3">
                      <button
                        onClick={() => { setExpanded(open ? null : u.uid); setReason('') }}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <Avatar name={u.displayName || u.email} photoURL={u.photoURL} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">{u.displayName || '(no name)'}</span>
                            {hasPlus && <Crown size={13} className="shrink-0 text-amber-400" />}
                          </div>
                          <div className="truncate text-xs text-muted">{u.email || u.uid}</div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {isBanned ? (
                            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">BANNED</span>
                          ) : hasPlus ? (
                            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">PLUS</span>
                          ) : (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">FREE</span>
                          )}
                          <span className="text-[10px] text-muted">{ago(u.lastSeen)}</span>
                        </div>
                      </button>

                      {open && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-3 space-y-3 border-t border-white/10 pt-3"
                        >
                          {/* Details */}
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                            <Detail label="Joined" value={u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'} />
                            <Detail label="Last seen" value={ago(u.lastSeen)} />
                            <Detail label="Plan" value={hasPlus ? `AskAI+ (${timeLeft(u.plusGrant!.until)})` : 'Free'} />
                            <Detail label="Msg limit/day" value={u.msgLimit ? String(u.msgLimit) : 'Unlimited'} />
                            <button onClick={() => copyUid(u.uid)} className="col-span-2 flex items-center gap-1.5 text-muted hover:text-ink">
                              {copied === u.uid ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              <span className="truncate font-mono">{u.uid}</span>
                            </button>
                          </div>

                          {/* AskAI+ grant */}
                          <div>
                            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase text-muted">
                              <Crown size={12} className="text-amber-400" /> AskAI+
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {PLUS_DURATIONS.map((d) => (
                                <button
                                  key={d.label}
                                  onClick={() => doGrant(u.uid, d.ms)}
                                  className="pressable rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-500 hover:bg-amber-400/20"
                                >
                                  + {d.label}
                                </button>
                              ))}
                              {hasPlus && (
                                <button
                                  onClick={() => revokePlus(u.uid).then(refresh)}
                                  className="pressable rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-red-400"
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Message cap + ban */}
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-1 text-xs text-muted">
                              Msg/day:
                              <input
                                type="number"
                                min={0}
                                defaultValue={u.msgLimit || 0}
                                onBlur={(e) => setUserMsgLimit(u.uid, parseInt(e.target.value || '0', 10)).then(refresh)}
                                className="w-16 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-ink outline-none"
                                title="0 = unlimited"
                              />
                            </label>
                            {isBanned ? (
                              <button onClick={() => unbanUser(u.uid).then(refresh)} className="rounded-xl bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-white">
                                Unban
                              </button>
                            ) : null}
                          </div>

                          {/* Ban controls */}
                          {!isBanned && (
                            <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-2">
                              <input
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Ban reason (shown to the user)"
                                className="w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm outline-none"
                              />
                              <div className="flex flex-wrap gap-1.5">
                                {BAN_DURATIONS.map((d) => (
                                  <button
                                    key={d.label}
                                    onClick={() => setBanDur(d.ms)}
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${banDur === d.ms ? 'accent-gradient-bg text-white' : 'border border-white/15 text-muted'}`}
                                  >
                                    {d.label}
                                  </button>
                                ))}
                              </div>
                              <button
                                onClick={() => banUser(u.uid, banDur, reason).then(refresh)}
                                className="w-full rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white"
                              >
                                Ban user
                              </button>
                            </div>
                          )}
                          {isBanned && u.ban && (
                            <div className="text-[11px] text-red-400/80">
                              Banned: {u.ban.reason} · {u.ban.until ? timeLeft(u.ban.until) : 'permanent'}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="truncate font-semibold">{value}</span>
    </div>
  )
}
