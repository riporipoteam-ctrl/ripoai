import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowUpRight, Camera, Check, CircleDot, Globe2, Loader2, MousePointer2, MousePointerClick, Search, Type, XCircle } from 'lucide-react'
import type { AgentBrowserEvent, AgentBrowserState } from '../lib/agentBrowser'

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

/** Live page screenshot with a real loading state and a fallback chain.
 * Renders nothing-but-spinner until a shot actually loads, so the viewport
 * never shows a black/placeholder image. object-contain kills the zoom/crop. */
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
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setIdx(0)
    setLoaded(false)
    setBust(0)
  }, [pageUrl])

  // If the current source hasn't loaded within a few seconds, re-request it
  // (on-demand renderers need a moment), then fall through the chain.
  useEffect(() => {
    if (loaded || !chain.length) return
    retry.current = setTimeout(() => {
      if (idx < chain.length - 1) setIdx((i) => i + 1)
      else setBust((b) => b + 1)
    }, 4000)
    return () => {
      if (retry.current) clearTimeout(retry.current)
    }
  }, [idx, loaded, bust, chain.length])

  const src = chain.length ? `${chain[idx]}${chain[idx].includes('?') ? '&' : '?'}b=${bust}` : ''

  return (
    <>
      {src && (
        <img
          key={src}
          src={src}
          alt={title || 'Agent browser page'}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (idx < chain.length - 1) setIdx((i) => i + 1)
          }}
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="agent-browser-panel mb-3 overflow-hidden rounded-[24px] border border-white/12"
    >
      <div className="agent-browser-chrome flex items-center gap-2 border-b border-white/10 px-3 py-2">
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
