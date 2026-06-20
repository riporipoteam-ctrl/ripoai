// AskAI+ economy — coins, plans, daily tasks, free trials and discount codes.
// Persisted locally per-user (instant, no backend). The currency is "AskAI
// coins": users earn them by chatting and completing daily tasks, then spend
// 500 to subscribe to AskAI+, which auto-renews monthly from the coin balance.

export type Plan = 'free' | 'plus'

export interface PlanLimits {
  /** Image uploads (vision) allowed per day. */
  imagesPerDay: number
  /** AI image generations allowed per day. */
  imageGenPerDay: number
  /** Daily credit budget for pro models (slow-burning). */
  creditsPerDay: number
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { imagesPerDay: 50, imageGenPerDay: 15, creditsPerDay: 2500 },
  plus: { imagesPerDay: 500, imageGenPerDay: 50, creditsPerDay: 4000 },
}

/** Cost of one month of AskAI+, in coins. */
export const PLUS_PRICE = 500
const MONTH_MS = 30 * 24 * 60 * 60 * 1000

// Free-trial window: accounts first seen between these dates get AskAI+ free
// until the window closes.
const TRIAL_START = Date.parse('2026-06-08T00:00:00Z')
const TRIAL_END = Date.parse('2026-07-08T23:59:59Z')

// How many coins chatting earns, and the daily cap from chat alone.
const COINS_PER_MESSAGE = 5
const CHAT_DAILY_CAP = 100

export interface DailyTask {
  id: string
  title: string
  desc: string
  reward: number
}

export const DAILY_TASKS: DailyTask[] = [
  { id: 'checkin', title: 'Daily check-in', desc: 'Open AskAI today', reward: 15 },
  { id: 'chat3', title: 'Curious mind', desc: 'Send 3 messages', reward: 20 },
  { id: 'image', title: 'Make something', desc: 'Generate an image', reward: 25 },
  { id: 'search', title: 'Do your research', desc: 'Use web search once', reward: 20 },
  { id: 'project', title: 'Builder', desc: 'Open or create a project', reward: 30 },
]

export interface PlusState {
  coins: number
  plan: Plan
  /** AskAI+ active until this timestamp (0 = not subscribed). */
  plusUntil: number
  autoRenew: boolean
  firstSeen: number
  /** Whether the free trial has been granted to this account. */
  trialGranted: boolean
  /** Redeemed discount codes (one use each). */
  redeemed: string[]
  /** Per-day counters, reset when `day` changes. */
  day: string
  chatEarnedToday: number
  imageGenToday: number
  creditsUsedToday: number
  msgsToday: number
  /** Task ids claimed today. */
  tasksDone: string[]
  /** Consecutive-day check-in streak. */
  streak: number
  lastCheckinDay: string
}

export interface DiscountCode {
  code: string
  /** Coins granted on redeem. */
  coins?: number
  /** Percent off the AskAI+ price (0-100). */
  percentOff?: number
  /** Free days of AskAI+ granted on redeem. */
  freeDays?: number
  /** Optional expiry timestamp. */
  expires?: number
  active: boolean
}

const todayKey = () => new Date().toISOString().slice(0, 10)

function freshState(now = Date.now()): PlusState {
  return {
    coins: 0,
    plan: 'free',
    plusUntil: 0,
    autoRenew: true,
    firstSeen: now,
    trialGranted: false,
    redeemed: [],
    day: todayKey(),
    chatEarnedToday: 0,
    imageGenToday: 0,
    creditsUsedToday: 0,
    msgsToday: 0,
    tasksDone: [],
    streak: 0,
    lastCheckinDay: '',
  }
}

const dayKeyOffset = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

/** Streak bonus coins for the current check-in (escalates, caps at 7 days). */
export function streakBonus(streak: number): number {
  return Math.min(7, Math.max(1, streak)) * 5
}

const key = (uid: string) => `askai:plus:${uid}`

export function loadPlus(uid: string): PlusState {
  let s: PlusState
  try {
    const raw = localStorage.getItem(key(uid))
    s = raw ? { ...freshState(), ...JSON.parse(raw) } : freshState()
  } catch {
    s = freshState()
  }
  return reconcile(uid, s)
}

export function savePlus(uid: string, s: PlusState) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(s))
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent('askai-plus-changed'))
  } catch {
    /* ignore */
  }
  return s
}

/** Apply daily resets, free-trial grant and AskAI+ auto-renew/expiry. */
export function reconcile(uid: string, s: PlusState): PlusState {
  const now = Date.now()
  let changed = false

  // Daily reset.
  const day = todayKey()
  if (s.day !== day) {
    s.day = day
    s.chatEarnedToday = 0
    s.imageGenToday = 0
    s.creditsUsedToday = 0
    s.msgsToday = 0
    s.tasksDone = []
    changed = true
  }

  // Free trial for accounts first seen during the window.
  if (!s.trialGranted && s.firstSeen >= TRIAL_START && s.firstSeen <= TRIAL_END) {
    s.trialGranted = true
    s.plusUntil = Math.max(s.plusUntil, TRIAL_END)
    s.plan = 'plus'
    changed = true
  }

  // AskAI+ expiry / monthly auto-renew from coins.
  if (s.plan === 'plus' && s.plusUntil && now > s.plusUntil) {
    if (s.autoRenew && s.coins >= PLUS_PRICE) {
      s.coins -= PLUS_PRICE
      s.plusUntil = now + MONTH_MS
    } else {
      s.plan = 'free'
      s.plusUntil = 0
    }
    changed = true
  }

  if (changed) savePlus(uid, s)
  return s
}

/** Apply an admin's remote AskAI+ grant to this account. `until` is the expiry
 * (0 = permanent → far-future). Idempotent: only upgrades, never downgrades. */
export function applyRemoteGrant(uid: string, until: number): PlusState {
  const s = loadPlus(uid)
  const target = until === 0 ? Date.now() + 100 * 365 * 24 * 60 * 60 * 1000 : until
  if (target > s.plusUntil) {
    s.plusUntil = target
    s.plan = 'plus'
    return savePlus(uid, s)
  }
  return s
}

export function effectivePlan(s: PlusState): Plan {
  return s.plan === 'plus' && s.plusUntil > Date.now() ? 'plus' : 'free'
}

export function limitsFor(s: PlusState): PlanLimits {
  return PLAN_LIMITS[effectivePlan(s)]
}

export function isOnTrial(s: PlusState): boolean {
  return s.trialGranted && s.plusUntil <= TRIAL_END && effectivePlan(s) === 'plus' && Date.now() <= TRIAL_END
}

/** Award coins for sending a chat message (daily-capped). Returns coins earned. */
export function earnFromChat(uid: string): number {
  const s = loadPlus(uid)
  s.msgsToday++
  let earned = 0
  if (s.chatEarnedToday < CHAT_DAILY_CAP) {
    earned = Math.min(COINS_PER_MESSAGE, CHAT_DAILY_CAP - s.chatEarnedToday)
    s.coins += earned
    s.chatEarnedToday += earned
  }
  savePlus(uid, s)
  return earned
}

/** Claim a daily task reward once per day. Returns coins granted (0 if already done / unmet). */
export function claimTask(uid: string, taskId: string): number {
  const s = loadPlus(uid)
  const task = DAILY_TASKS.find((t) => t.id === taskId)
  if (!task || s.tasksDone.includes(taskId)) return 0
  s.tasksDone.push(taskId)
  let reward = task.reward
  // The daily check-in builds a streak with an escalating bonus.
  if (taskId === 'checkin') {
    const today = todayKey()
    if (s.lastCheckinDay === dayKeyOffset(-1)) s.streak += 1
    else if (s.lastCheckinDay !== today) s.streak = 1
    s.lastCheckinDay = today
    reward += streakBonus(s.streak)
  }
  s.coins += reward
  savePlus(uid, s)
  return reward
}

/** Buy / extend AskAI+ for one month using coins. */
export function buyPlus(uid: string, discountPercent = 0): { ok: boolean; reason?: string } {
  const s = loadPlus(uid)
  const price = Math.max(0, Math.round(PLUS_PRICE * (1 - discountPercent / 100)))
  if (s.coins < price) return { ok: false, reason: `You need ${price} coins (you have ${s.coins}).` }
  s.coins -= price
  const base = effectivePlan(s) === 'plus' ? s.plusUntil : Date.now()
  s.plusUntil = base + MONTH_MS
  s.plan = 'plus'
  s.autoRenew = true
  savePlus(uid, s)
  return { ok: true }
}

export function setAutoRenew(uid: string, on: boolean): PlusState {
  const s = loadPlus(uid)
  s.autoRenew = on
  return savePlus(uid, s)
}

/* ---- Discount codes (admin-managed, stored locally) -------------------- */

const CODES_KEY = 'askai:codes'

const BUILTIN_CODES: DiscountCode[] = [
  { code: 'WELCOME', coins: 100, active: true },
  { code: 'ASKAIPLUS', percentOff: 50, active: true },
  { code: 'LAUNCH', freeDays: 7, active: true },
]

export function loadCodes(): DiscountCode[] {
  try {
    const raw = localStorage.getItem(CODES_KEY)
    if (!raw) return [...BUILTIN_CODES]
    const custom: DiscountCode[] = JSON.parse(raw)
    // Merge built-ins that haven't been overridden.
    const names = new Set(custom.map((c) => c.code.toUpperCase()))
    return [...custom, ...BUILTIN_CODES.filter((c) => !names.has(c.code.toUpperCase()))]
  } catch {
    return [...BUILTIN_CODES]
  }
}

export function saveCodes(codes: DiscountCode[]) {
  try {
    localStorage.setItem(CODES_KEY, JSON.stringify(codes))
  } catch {
    /* ignore */
  }
}

export function upsertCode(c: DiscountCode) {
  const codes = loadCodes().filter((x) => x.code.toUpperCase() !== c.code.toUpperCase())
  codes.unshift({ ...c, code: c.code.toUpperCase() })
  saveCodes(codes)
}

export function removeCode(code: string) {
  saveCodes(loadCodes().filter((x) => x.code.toUpperCase() !== code.toUpperCase()))
}

export interface RedeemResult {
  ok: boolean
  message: string
  /** If the code is a percent-off coupon, the buy page can apply it. */
  percentOff?: number
}

export function redeemCode(uid: string, raw: string): RedeemResult {
  const code = raw.trim().toUpperCase()
  if (!code) return { ok: false, message: 'Enter a code.' }
  const found = loadCodes().find((c) => c.code.toUpperCase() === code)
  if (!found || !found.active) return { ok: false, message: 'That code is not valid.' }
  if (found.expires && Date.now() > found.expires) return { ok: false, message: 'That code has expired.' }
  const s = loadPlus(uid)
  if (s.redeemed.includes(code)) return { ok: false, message: 'You already used that code.' }

  let message = ''
  if (found.coins) {
    s.coins += found.coins
    message = `+${found.coins} coins added!`
  }
  if (found.freeDays) {
    const base = effectivePlan(s) === 'plus' ? s.plusUntil : Date.now()
    s.plusUntil = base + found.freeDays * 24 * 60 * 60 * 1000
    s.plan = 'plus'
    message = `${message ? message + ' ' : ''}AskAI+ unlocked for ${found.freeDays} days!`
  }
  if (found.percentOff) {
    message = `${message ? message + ' ' : ''}${found.percentOff}% off AskAI+ applied.`
  }
  // Percent-off codes are reusable at checkout; coin/day codes are one-time.
  if (found.coins || found.freeDays) s.redeemed.push(code)
  savePlus(uid, s)
  return { ok: true, message: message || 'Code applied.', percentOff: found.percentOff }
}

/** Record an image generation; returns false if the daily cap is hit. */
export function tryImageGen(uid: string): boolean {
  const s = loadPlus(uid)
  const limit = limitsFor(s).imageGenPerDay
  if (s.imageGenToday >= limit) return false
  s.imageGenToday++
  savePlus(uid, s)
  return true
}
