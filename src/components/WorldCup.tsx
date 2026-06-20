import { useEffect, useRef, useState } from 'react'
import { Trophy, Radio, MapPin, Clock, ChevronRight } from 'lucide-react'
import { fetchWorldCup, isLiveNow, type WCMatch } from '../lib/worldcup'
import Flag from './Flag'

function formatKickoff(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function formatDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function StatusPill({ match }: { match: WCMatch }) {
  const live = isLiveNow(match)
  if (live) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-red-600 dark:text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse-dot" />
        LIVE{match.minute ? ` · ${match.minute}` : ''}
      </span>
    )
  }
  if (match.status === 'finished') {
    return (
      <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">
        FT
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-muted">
      <Clock className="h-3 w-3" />
      {formatKickoff(match.kickoff)}
    </span>
  )
}

function TeamRow({
  name,
  flag,
  score,
  show,
  winner,
}: {
  name: string
  flag?: string
  score?: number | null
  show: boolean
  winner?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <Flag name={name} emoji={flag} size={26} />
        <span className={`truncate text-sm ${winner ? 'font-extrabold text-ink' : 'font-semibold text-ink'}`}>
          {name}
        </span>
      </div>
      {show ? (
        <span className={`wc-score text-2xl font-extrabold tabular-nums ${winner ? 'text-ink' : 'text-ink/80'}`}>
          {score ?? 0}
        </span>
      ) : (
        <span className="text-lg text-muted">–</span>
      )}
    </div>
  )
}

function MatchCard({ match }: { match: WCMatch }) {
  const showScore = match.status === 'live' || match.status === 'finished'
  const homeWin = showScore && (match.homeScore ?? 0) > (match.awayScore ?? 0)
  const awayWin = showScore && (match.awayScore ?? 0) > (match.homeScore ?? 0)
  const live = isLiveNow(match)
  return (
    <div
      className={`wc-match pressable flex w-64 shrink-0 snap-start flex-col gap-3 rounded-3xl border bg-card p-4 sm:w-72 ${
        live ? 'border-red-500/40 wc-live-glow' : 'border-line'
      }`}
    >
      <div className="flex items-center justify-between">
        {match.group ? (
          <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
            {match.group}
          </span>
        ) : (
          <span />
        )}
        <StatusPill match={match} />
      </div>

      <div className="flex flex-col gap-2.5">
        <TeamRow name={match.home} flag={match.homeFlag} score={match.homeScore} show={showScore} winner={homeWin} />
        <TeamRow name={match.away} flag={match.awayFlag} score={match.awayScore} show={showScore} winner={awayWin} />
      </div>

      <div className="mt-auto flex flex-col gap-1 border-t border-line pt-2 text-[11px] text-muted">
        {match.venue && (
          <span className="flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{match.venue}</span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3 shrink-0" />
          {formatDay(match.kickoff)} · {formatKickoff(match.kickoff)}
        </span>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="flex w-64 shrink-0 flex-col gap-3 rounded-3xl border border-line bg-card p-4 sm:w-72">
      <div className="flex items-center justify-between">
        <div className="nb-skeleton h-3 w-16 rounded-full" />
        <div className="nb-skeleton h-4 w-12 rounded-full" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="nb-skeleton h-6 w-full rounded-lg" />
        <div className="nb-skeleton h-6 w-full rounded-lg" />
      </div>
      <div className="nb-skeleton h-3 w-3/4 rounded-full" />
    </div>
  )
}

export default function WorldCup() {
  const [matches, setMatches] = useState<WCMatch[] | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    const load = async () => {
      const data = await fetchWorldCup()
      if (!cancelled && mountedRef.current) setMatches(data)
    }

    load()
    const interval = setInterval(load, 30_000)

    return () => {
      cancelled = true
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [])

  const loading = matches == null
  const liveCount = (matches || []).filter((m) => isLiveNow(m)).length

  return (
    <section className="wc-hero relative my-3 w-full overflow-hidden rounded-[28px] p-[1.5px]">
      {/* Official-style WC26 multi-colour gradient frame */}
      <div className="relative overflow-hidden rounded-[26px] bg-card p-5">
        {/* Pitch stripes + colourful aurora wash */}
        <div aria-hidden className="wc-pitch pointer-events-none absolute inset-0" />
        <div aria-hidden className="wc-wash pointer-events-none absolute inset-0" />

        {/* Header */}
        <div className="relative flex items-center gap-3">
          <div className="wc-badge flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg">
            <span className="animate-bounce-sm text-2xl leading-none">⚽</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="wc-title flex items-center gap-2 text-xl font-black tracking-tight">
              FIFA World Cup 26
              {liveCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-red-600 dark:text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse-dot" />
                  {liveCount} live
                </span>
              )}
            </h2>
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Trophy className="h-3.5 w-3.5" />
              Canada · Mexico · USA
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
        </div>

        {/* Matches */}
        <div className="no-scrollbar nb-stagger relative mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : matches.length === 0 ? (
            <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted">
              <Radio className="h-4 w-4" />
              No fixtures available right now.
            </div>
          ) : (
            matches.map((m) => <MatchCard key={m.id} match={m} />)
          )}
        </div>
      </div>
    </section>
  )
}
