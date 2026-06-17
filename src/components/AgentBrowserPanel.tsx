import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowUpRight, Camera, Check, CircleDot, Globe2, Loader2, MousePointer2, MousePointerClick, Search, Type, XCircle } from 'lucide-react'
import type { AgentBrowserEvent, AgentBrowserState } from '../lib/agentBrowser'
import { renderPage, type RenderResult } from '../lib/integrationsBackend'

const ICONS = {
  start: CircleDot,
  search: Search,
  open: Globe2,
  click: MousePointerClick,
  type: Type,
  read: Globe2,
  screenshot: Camera,
  done: Check,
  error: XCircle,
} as const

function hostOf(url?: string): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').slice(0, 40)
  }
}

/**
 * Detect the "black box" / "Generating preview" failure: free on-demand
 * renderers (thum.io, mshots) sometimes return an all-black or all-one-color
 * placeholder that still fires onLoad — so the old code thought it succeeded and
 * left a black viewport. We sample the decoded image; if it's effectively a flat
 * block (or tiny), we treat it as failed and advance the source chain.
 */
function looksBlank(img: HTMLImageElement): boolean {
  if (img.naturalWidth < 32 || img.naturalHeight < 32) return true
  try {
    const c = document.createElement('canvas')
    const w = (c.width = 24)
    const h = (c.height = 24)
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(img, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    let min = 255
    let max = 0
    let sum = 0
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
      if (lum < min) min = lum
      if (lum > max) max = lum
      sum += lum
    }
    const avg = sum / (data.length / 4)
    // Nearly-uniform (range tiny) OR near-black overall → placeholder.
    return max - min < 8 || avg < 6
  } catch {
    // Cross-origin taint → can't sample; assume it's a real image.
    return false
  }
}

/**
 * Live page preview with a guaranteed-non-black render path:
 *  1. If the Integrations Worker is configured, fetch a REAL headless PNG from
 *     /browse/render (and use its snapshot/title as the fallback content).
 *  2. Otherwise fall through a chain of on-demand screenshot services, each
 *     validated by looksBlank() so black/placeholder images are rejected.
 *  3. If everything fails, show a readable fallback card (favicon + host + URL +
 *     text snapshot) — never a black box.
 */
function Screenshot({ pageUrl, title }: { pageUrl?: string; title?: string }) {
  const chain = pageUrl
    ? [
        `https://image.thum.io/get/width/1200/crop/800/noanimate/${pageUrl}`,
        `https://s0.wp.com/mshots/v1/${encodeURIComponent(pageUrl)}?w=1200`,
      ]
    : []
  const [idx, setIdx] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [bust, setBust] = useState(0)
  const [failed, setFailed] = useState(false)
  // Real headless render from the Worker (preferred when configured).
  const [render, setRender] = useState<RenderResult | null>(null)
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setIdx(0)
    setLoaded(false)
    setBust(0)
    setFailed(false)
    setRender(null)
    if (!pageUrl) return
    const ac = new AbortController()
    // Prefer a real headless screenshot from the Worker. Returns null when no
    // Worker is configured (then we use the on-demand chain below).
    renderPage(pageUrl, { signal: ac.signal })
      .then((r) => {
        if (r) setRender(r)
      })
      .catch(() => {
        /* aborted or failed — on-demand chain still runs */
      })
    return () => ac.abort()
  }, [pageUrl])

  const advance = () => {
    if (idx < chain.length - 1) setIdx((i) => i + 1)
    else setFailed(true)
  }

  // If the current source hasn't loaded within a few seconds, re-request it once
  // (on-demand renderers need a moment), then fall through / give up gracefully.
  useEffect(() => {
    if (loaded || failed || !chain.length || (render && render.ok)) return
    retry.current = setTimeout(() => {
      if (idx < chain.length - 1) setIdx((i) => i + 1)
      else if (bust < 2) setBust((b) => b + 1)
      else setFailed(true)
    }, 4500)
    return () => {
      if (retry.current) clearTimeout(retry.current)
    }
  }, [idx, loaded, failed, bust, chain.length, render])

  // --- 1) Real headless PNG from the Worker -------------------------------
  if (render && render.ok && render.image) {
    return (
      <img
        src={render.image}
        alt={title || render.title || 'Live page'}
        className="absolute inset-0 h-full w-full bg-white object-contain object-top"
      />
    )
  }

  // --- 3) Graceful fallback card (no usable image anywhere) ----------------
  if (failed || (render && !render.ok && !chain.length)) {
    const host = hostOf(pageUrl)
    const snap = render?.snapshot
    return (
      <div className="absolute inset-0 flex flex-col gap-3 overflow-hidden bg-white/85 p-5 text-left text-black dark:bg-[#101012] dark:text-white">
        <div className="flex items-center gap-2">
          {host && (
            <img
              src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
              alt=""
              className="h-5 w-5 rounded"
              onError={(e) => ((e.currentTarget.style.display = 'none'))}
            />
          )}
          <span className="truncate text-sm font-bold">{render?.title || title || host || 'Page'}</span>
        </div>
        {pageUrl && (
          <a href={pageUrl} target="_blank" rel="noreferrer" className="truncate text-xs font-semibold text-accent hover:underline">
            {pageUrl}
          </a>
        )}
        {snap ? (
          <p className="overflow-hidden text-xs leading-relaxed text-black/70 dark:text-white/65">{snap}</p>
        ) : (
          <p className="text-xs leading-relaxed text-black/55 dark:text-white/55">
            Live preview unavailable — opened {host || 'the page'} and read its contents.
          </p>
        )}
      </div>
    )
  }

  const src = chain.length ? `${chain[idx]}${chain[idx].includes('?') ? '&' : '?'}b=${bust}` : ''

  // --- 2) On-demand screenshot chain (validated against black placeholders) -
  return (
    <>
      {src && (
        <img
          key={src}
          src={src}
          alt={title || 'Agent browser page'}
          onLoad={(e) => {
            // Reject black/placeholder images that still fire onLoad. Sampling
            // is best-effort: cross-origin services taint the canvas, in which
            // case looksBlank() catches the error and returns false (show it).
            if (looksBlank(e.currentTarget)) advance()
            else setLoaded(true)
          }}
          onError={advance}
          className={`absolute inset-0 h-full w-full bg-white object-contain object-top transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted">
          <Loader2 size={26} className="animate-spin text-accent" />
          <span className="text-xs font-semibold">Capturing live page…</span>
        </div>
      )}
    </>
  )
}

/** A simulated mouse cursor + click ripple + typing caret driven by the latest
 * action, so the user SEES the agent clicking and typing on the page. */
function CursorOverlay({ event }: { event?: AgentBrowserEvent }) {
  if (!event) return null
  const type = event.type
  // Deterministic-ish position per event so the cursor moves believably.
  const seed = (event.label || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const left = type === 'type' ? 30 : 22 + (seed % 56)
  const top = type === 'type' ? 14 : 28 + (seed % 48)
  const clicking = type === 'click' || type === 'open'
  const typing = type === 'type' || type === 'search'

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* typing caret over the (top) address/search area */}
      <AnimatePresence>
        {typing && (
          <motion.div
            key="caret"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-[6%] top-[7%] flex max-w-[80%] items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-semibold text-black shadow-lg"
          >
            <span className="truncate">{event.label.replace(/^Typing\s*/i, '')}</span>
            <span className="inline-block h-3 w-[2px] animate-pulse bg-black" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* the cursor itself, animating to the action position */}
      <motion.div
        className="absolute"
        initial={false}
        animate={{ left: `${left}%`, top: `${top}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        style={{ left: `${left}%`, top: `${top}%` }}
      >
        <motion.div
          animate={clicking ? { scale: [1, 0.8, 1] } : { scale: 1 }}
          transition={{ duration: 0.4, repeat: clicking ? Infinity : 0, repeatDelay: 0.6 }}
          className="relative"
        >
          <MousePointer2 size={22} className="fill-white text-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
          {clicking && (
            <motion.span
              key={event.label}
              initial={{ scale: 0, opacity: 0.7 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.3 }}
              className="absolute -left-2 -top-2 h-8 w-8 rounded-full border-2 border-accent"
            />
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}

/** Counts up the seconds a live browse has been running, so the panel shows real
 *  progress (and reassures the user the session is bounded, not hung). */
function Elapsed({ events }: { events: AgentBrowserEvent[] }) {
  const startedAt = events.find((e) => e.type === 'start')?.at ?? events[0]?.at
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!startedAt) return null
  const secs = Math.max(0, Math.round((now - startedAt) / 1000))
  return <span className="tabular-nums">{secs}s</span>
}

export default function AgentBrowserPanel({ browser, live }: { browser?: AgentBrowserState; live?: boolean }) {
  // Collapsed by default — like Nebula's "view activity": the chat stays clean
  // and the big live viewport only opens when the user taps to expand it.
  const [expanded, setExpanded] = useState(false)
  if (!browser) return null
  const running = browser.status === 'running' || live
  const unavailable = browser.status === 'unavailable'
  const errored = browser.status === 'error'
  const events = browser.events?.length ? browser.events : []
  const lastEvent = events[events.length - 1]
  // Count the meaningful actions taken (search / open / read / click) so the
  // user can see how much work the agent actually did.
  const actionCount = events.filter((e) =>
    e.type === 'search' || e.type === 'open' || e.type === 'read' || e.type === 'click',
  ).length

  // ── Collapsed pill ────────────────────────────────────────────────────────
  // A compact one-liner that summarizes the browse session; tap to expand.
  if (!expanded) {
    return (
      <motion.button
        type="button"
        onClick={() => setExpanded(true)}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="agent-browser-pill pressable mb-3 flex w-full items-center gap-2 rounded-2xl border border-white/12 px-3 py-2 text-left"
      >
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-500/15 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide text-orange-500">
          🐾 OpenClaw
        </span>
        {running ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
        ) : unavailable || errored ? (
          <AlertTriangle size={14} className="shrink-0 text-amber-400" />
        ) : (
          <Check size={14} className="shrink-0 text-emerald-400" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink/85">
          {running
            ? lastEvent?.label || 'Browsing the live web…'
            : unavailable
              ? 'Live browsing unavailable — answered directly'
              : errored
                ? 'Browser session failed'
                : `Browsed the web · ${actionCount} action${actionCount === 1 ? '' : 's'}`}
        </span>
        {(running || actionCount > 0) && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
            {actionCount > 0 && <span className="tabular-nums">{actionCount}</span>}
            {running && <Elapsed events={events} />}
          </span>
        )}
        <span className="shrink-0 text-[11px] font-semibold text-accent">view activity</span>
      </motion.button>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="agent-browser-panel mb-3 overflow-hidden rounded-[24px] border border-white/12"
    >
      <div className="agent-browser-chrome flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="pressable mr-1 flex h-7 items-center rounded-full border border-white/10 bg-white/25 px-2 text-[11px] font-semibold text-ink hover:bg-white/40 dark:bg-white/10"
          title="Hide browser"
        >
          Hide
        </button>
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/85" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/85" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/85" />
        <span className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-500/15 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide text-orange-500">
          🐾 OpenClaw
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/35 px-3 py-1.5 text-xs font-semibold text-muted dark:bg-black/20">
          {running ? <Loader2 size={13} className="shrink-0 animate-spin text-accent" /> : <Globe2 size={13} className="shrink-0 text-accent" />}
          <span className="truncate">
            {browser.currentUrl || browser.liveUrl || (unavailable ? 'Browser backend not connected' : 'OpenClaw browser')}
          </span>
        </div>
        {browser.liveUrl && (
          <a
            href={browser.liveUrl}
            target="_blank"
            rel="noreferrer"
            className="pressable flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/25 text-ink hover:bg-white/40 dark:bg-white/10"
            title="Open live browser"
          >
            <ArrowUpRight size={15} />
          </a>
        )}
      </div>

      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_230px]">
        <div className="agent-browser-viewport relative aspect-[16/10] w-full overflow-hidden">
          {browser.liveUrl ? (
            <iframe
              title="Agent browser live view"
              src={browser.liveUrl}
              className="absolute inset-0 h-full w-full border-0 bg-white"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            />
          ) : browser.currentUrl || browser.screenshot ? (
            <>
              <Screenshot pageUrl={browser.currentUrl} title={browser.title} />
              {running && <CursorOverlay event={lastEvent} />}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              {unavailable || errored ? (
                <AlertTriangle size={30} className="text-amber-400" />
              ) : (
                <Loader2 size={30} className="animate-spin text-accent" />
              )}
              <div className="max-w-sm text-sm font-semibold">
                {unavailable
                  ? 'Live browsing is unavailable here — answering directly.'
                  : errored
                    ? 'The real browser session failed.'
                    : 'Opening a browser session…'}
              </div>
              {(browser.error || unavailable) && (
                <div className="max-w-md text-xs leading-relaxed text-muted">
                  {browser.error || 'The agent will browse here.'}
                </div>
              )}
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/25 to-transparent" />
        </div>

        <aside className="agent-browser-actions border-t border-white/10 p-3 md:border-l md:border-t-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted">
              Live actions
              {(running || actionCount > 0) && (
                <span className="flex items-center gap-1 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold normal-case text-muted">
                  {actionCount > 0 && <span className="tabular-nums">{actionCount} step{actionCount === 1 ? '' : 's'}</span>}
                  {running && (
                    <>
                      {actionCount > 0 && <span className="opacity-40">·</span>}
                      <Elapsed events={events} />
                    </>
                  )}
                </span>
              )}
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${running ? 'bg-accent/15 text-accent' : errored || unavailable ? 'bg-amber-400/15 text-amber-400' : 'bg-emerald-400/15 text-emerald-400'}`}>
              {running ? 'RUNNING' : unavailable ? 'SKIPPED' : errored ? 'FAILED' : 'DONE'}
            </span>
          </div>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {events.slice(-7).map((event, index) => {
                const Icon = ICONS[event.type] || Globe2
                return (
                  <motion.div
                    key={`${event.type}-${event.label}-${index}`}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex gap-2 rounded-2xl border border-white/8 bg-white/20 p-2 text-xs dark:bg-white/[0.05]"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                      <Icon size={13} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink/85">{event.label}</span>
                      {event.url && <span className="block truncate text-muted">{event.url}</span>}
                    </span>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
          {!!browser.sources?.length && (
            <div className="mt-3 space-y-1.5">
              <div className="text-xs font-bold uppercase text-muted">Sources</div>
              {browser.sources.slice(0, 4).map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block truncate text-xs font-semibold text-accent hover:underline">
                  {source.title || source.url}
                </a>
              ))}
            </div>
          )}
        </aside>
      </div>
    </motion.div>
  )
}
