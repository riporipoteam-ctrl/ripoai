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

/** Screenshot that heals itself: mshots returns a blank/black placeholder while
 * it renders, so we re-poll the same URL a few times, then fall back to thum.io.
 * object-contain on a fixed stage kills the "zoomed in / cropped" look. */
function Screenshot({ url, pageUrl, title }: { url: string; pageUrl?: string; title?: string }) {
  const [src, setSrc] = useState(url)
  const [tries, setTries] = useState(0)
  const [fellBack, setFellBack] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setSrc(url)
    setTries(0)
    setFellBack(false)
  }, [url])

  // mshots renders asynchronously — re-request a few times so the live preview
  // updates from the gray/black placeholder to the real page.
  useEffect(() => {
    if (fellBack || !url.includes('mshots') || tries >= 4) return
    timer.current = setTimeout(() => {
      setTries((t) => t + 1)
      setSrc(`${url}${url.includes('?') ? '&' : '?'}r=${tries + 1}`)
    }, 2200)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [url, tries, fellBack])

  return (
    <img
      key={src}
      src={src}
      alt={title || 'Agent browser page'}
      onError={() => {
        if (!fellBack && pageUrl) {
          setFellBack(true)
          setSrc(`https://image.thum.io/get/width/1100/crop/720/noanimate/${pageUrl}`)
        }
      }}
      className="absolute inset-0 h-full w-full bg-white object-contain object-top"
    />
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

export default function AgentBrowserPanel({ browser, live }: { browser?: AgentBrowserState; live?: boolean }) {
  if (!browser) return null
  const running = browser.status === 'running' || live
  const unavailable = browser.status === 'unavailable'
  const errored = browser.status === 'error'
  const events = browser.events?.length ? browser.events : []
  const lastEvent = events[events.length - 1]

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
        <div className="ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/35 px-3 py-1.5 text-xs font-semibold text-muted dark:bg-black/20">
          {running ? <Loader2 size={13} className="shrink-0 animate-spin text-accent" /> : <Globe2 size={13} className="shrink-0 text-accent" />}
          <span className="truncate">
            {browser.currentUrl || browser.liveUrl || (unavailable ? 'Browser backend not connected' : 'Agent browser')}
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
          ) : browser.screenshot ? (
            <>
              <Screenshot url={browser.screenshot} pageUrl={browser.currentUrl} title={browser.title} />
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
                  ? 'Real browser backend is not connected yet.'
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
            <div className="text-xs font-bold uppercase text-muted">Live actions</div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${running ? 'bg-accent/15 text-accent' : errored || unavailable ? 'bg-amber-400/15 text-amber-400' : 'bg-emerald-400/15 text-emerald-400'}`}>
              {running ? 'RUNNING' : errored || unavailable ? 'NEEDS BACKEND' : 'DONE'}
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
