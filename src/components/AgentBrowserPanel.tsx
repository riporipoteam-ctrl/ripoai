import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowUpRight, Camera, Check, CircleDot, Globe2, Loader2, MousePointerClick, Search, Type, XCircle } from 'lucide-react'
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

export default function AgentBrowserPanel({ browser, live }: { browser?: AgentBrowserState; live?: boolean }) {
  if (!browser) return null
  const running = browser.status === 'running' || live
  const unavailable = browser.status === 'unavailable'
  const errored = browser.status === 'error'
  const events = browser.events?.length ? browser.events : []

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
        <div className="agent-browser-viewport relative min-h-[220px] overflow-hidden">
          {browser.liveUrl ? (
            <iframe
              title="Agent browser live view"
              src={browser.liveUrl}
              className="h-[340px] w-full border-0 bg-white"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            />
          ) : browser.screenshot ? (
            <img
              src={browser.screenshot}
              alt={browser.title || 'Agent browser screenshot'}
              onError={(e) => {
                // Screenshot service hiccup — swap to the backup renderer.
                const img = e.currentTarget
                if (browser.currentUrl && !img.dataset.fallback) {
                  img.dataset.fallback = '1'
                  img.src = `https://image.thum.io/get/width/1100/crop/700/noanimate/${browser.currentUrl}`
                }
              }}
              className="h-full min-h-[260px] w-full object-cover object-top"
            />
          ) : (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center">
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
                    : 'Opening a real browser session...'}
              </div>
              {(browser.error || unavailable) && (
                <div className="max-w-md text-xs leading-relaxed text-muted">
                  {browser.error || 'Set VITE_AGENT_BROWSER_URL or the Netlify AGENT_BROWSER_ENDPOINT to a Cloudflare Browser Run worker.'}
                </div>
              )}
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/20 to-transparent" />
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
