import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Users, Ban as BanIcon, ShieldCheck, MessageSquare, Ticket, Trash2, Plus as PlusIcon } from 'lucide-react'
import { listUsers, banUser, unbanUser, setUserMsgLimit, banActive, type AdminUser } from '../lib/admin'
import { loadCodes, upsertCode, removeCode, type DiscountCode } from '../lib/plus'
import Avatar from './ui/Avatar'

const DURATIONS = [
  { label: '1 hour', ms: 3600e3 },
  { label: '1 day', ms: 86400e3 },
  { label: '7 days', ms: 7 * 86400e3 },
  { label: '30 days', ms: 30 * 86400e3 },
  { label: 'Permanent', ms: 0 },
]

function when(ms: number): string {
  if (!ms) return ''
  const d = Math.max(0, ms - Date.now())
  const days = Math.floor(d / 86400e3)
  const hrs = Math.floor((d % 86400e3) / 3600e3)
  if (days) return `${days}d ${hrs}h left`
  const mins = Math.floor((d % 3600e3) / 60e3)
  return `${hrs}h ${mins}m left`
}

export default function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [banFor, setBanFor] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [duration, setDuration] = useState(DURATIONS[1].ms)
  const [tab, setTab] = useState<'users' | 'codes'>('users')
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [newCode, setNewCode] = useState({ code: '', kind: 'coins' as 'coins' | 'percent' | 'days', value: 100 })

  async function refresh() {
    setLoading(true)
    setErr('')
    try {
      setUsers(await listUsers())
    } catch (e: any) {
      // Surface the real reason (e.g. permission-denied → rules not published).
      setErr(
        `Could not load users: ${e?.code || e?.message || 'unknown error'}. ` +
          'If this says permission-denied, publish the admin Firestore rules (firestore.rules).',
      )
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (open) {
      refresh()
      setCodes(loadCodes())
    }
  }, [open])

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

  function deleteCode(code: string) {
    removeCode(code)
    setCodes(loadCodes())
  }

  const banned = users.filter((u) => banActive(u.ban)).length
  const activeToday = users.filter((u) => u.lastSeen > Date.now() - 86400e3).length

  async function doBan(uid: string) {
    await banUser(uid, duration, reason)
    setBanFor(null)
    setReason('')
    refresh()
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className="glass-strong relative flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-[28px] p-4 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl sm:rounded-[28px]"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[rgb(var(--muted)/0.4)] sm:hidden" />
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-bold">
                <ShieldCheck size={20} className="text-accent" /> Admin
              </div>
              <button onClick={onClose} className="pressable rounded-full p-1.5 text-muted hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="mb-3 flex gap-1 rounded-2xl bg-white/5 p-1 text-sm font-semibold">
              <button
                onClick={() => setTab('users')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 ${tab === 'users' ? 'accent-gradient-bg text-white' : 'text-muted'}`}
              >
                <Users size={15} /> Users
              </button>
              <button
                onClick={() => setTab('codes')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 ${tab === 'codes' ? 'accent-gradient-bg text-white' : 'text-muted'}`}
              >
                <Ticket size={15} /> Discount codes
              </button>
            </div>

            {tab === 'codes' ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3">
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
                    <div key={c.code} className="flex items-center gap-3 rounded-2xl border border-white/10 p-3">
                      <Ticket size={18} className="text-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold tracking-wide">{c.code}</div>
                        <div className="text-xs text-muted">
                          {c.coins ? `+${c.coins} coins` : c.percentOff ? `${c.percentOff}% off Plus` : c.freeDays ? `${c.freeDays} free Plus days` : '—'}
                          {c.active ? '' : ' · inactive'}
                        </div>
                      </div>
                      <button onClick={() => deleteCode(c.code)} className="pressable rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-red-400">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
            <>
            {/* Stats */}
            <div className="mb-4 grid grid-cols-3 gap-2">
              {[
                { icon: Users, label: 'Users', value: users.length },
                { icon: BanIcon, label: 'Banned', value: banned },
                { icon: MessageSquare, label: 'Active 24h', value: activeToday },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                  <s.icon size={16} className="mx-auto mb-1 text-accent" />
                  <div className="text-xl font-extrabold">{s.value}</div>
                  <div className="text-[11px] text-muted">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span>Users</span>
              <button onClick={refresh} className="text-xs font-semibold text-accent hover:underline">
                Refresh
              </button>
            </div>
            {err && <p className="mb-2 text-xs text-red-400">{err}</p>}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {loading && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
              {!loading && users.length === 0 && !err && (
                <p className="py-6 text-center text-sm text-muted">No users yet.</p>
              )}
              {users.map((u) => {
                const isBanned = banActive(u.ban)
                return (
                  <div key={u.uid} className="rounded-2xl border border-white/10 p-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.displayName || u.email} photoURL={u.photoURL} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{u.displayName || '(no name)'}</div>
                        <div className="truncate text-xs text-muted">{u.email}</div>
                      </div>
                      {isBanned ? (
                        <span className="rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-bold text-red-400">
                          BANNED
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-400">
                          ACTIVE
                        </span>
                      )}
                    </div>

                    {isBanned && u.ban && (
                      <div className="mt-1.5 text-[11px] text-muted">
                        {u.ban.reason} · {u.ban.until ? when(u.ban.until) : 'permanent'}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {isBanned ? (
                        <button
                          onClick={() => unbanUser(u.uid).then(refresh)}
                          className="rounded-xl bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Unban
                        </button>
                      ) : (
                        <button
                          onClick={() => { setBanFor(banFor === u.uid ? null : u.uid); setReason(''); }}
                          className="rounded-xl bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Ban
                        </button>
                      )}
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
                    </div>

                    {banFor === u.uid && (
                      <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/5 p-2">
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Reason (shown to the user)"
                          className="w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm outline-none"
                        />
                        <div className="flex flex-wrap gap-1.5">
                          {DURATIONS.map((d) => (
                            <button
                              key={d.label}
                              onClick={() => setDuration(d.ms)}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                duration === d.ms ? 'accent-gradient-bg text-white' : 'border border-white/15 text-muted'
                              }`}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => doBan(u.uid)}
                          className="w-full rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white"
                        >
                          Confirm ban
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
