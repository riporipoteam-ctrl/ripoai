import { useEffect, useRef, useState } from 'react'
import { Trophy, Radio, MapPin, Clock } from 'lucide-react'
import { fetchWorldCup, isLiveNow, type WCMatch } from '../lib/worldcup'

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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink">
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

function TeamRow({ name, flag, score, show }: { name: string; flag?: string; score?: number | null; show: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-xl leading-none">{flag || '🏳️'}</span>
        <span className="truncate text-sm font-semibold text-ink">{name}</span>
      </div>
      {show ? (
        <span className="nebula-display text-2xl font-bold tabular-nums text-ink">{score ?? 0}</span>
      ) : (
        <span className="text-lg text-muted">–</span>
      )}
    </div>
  )
}

function MatchCard({ match }: { match: WCMatch }) {
  const showScore = match.status === 'live' || match.status === 'finished'
  return (
    <div className="pressable flex w-64 shrink-0 flex-col gap-3 rounded-3xl border border-line bg-card p-4 sm:w-72">
      <div className="flex items-center justify-between">
        {match.group ? (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{match.group}</span>
        ) : (
          <span />
        )}
        <StatusPill match={match} />
      </div>

      <div className="flex flex-col gap-2.5">
        <TeamRow name={match.home} flag={match.homeFlag} score={match.homeScore} show={showScore} />
        <TeamRow name={match.away} flag={match.awayFlag} score={match.awayScore} show={showScore} />
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

  return (
    <section className="relative my-3 w-full overflow-hidden rounded-4xl border border-line bg-card p-5">
      {/* Pitch-stripe / gradient backdrop using tokenized colors */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgb(var(--ink)) 0 1px, transparent 1px 64px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-2xl"
      />

      {/* Floating accent emoji */}
      <span aria-hidden className="nb-float pointer-events-none absolute right-6 top-8 text-lg opacity-30">
        🏆
      </span>
      <span
        aria-hidden
        className="nb-float pointer-events-none absolute right-16 bottom-6 text-base opacity-20"
        style={{ animationDelay: '1.2s' }}
      >
        ⚽
      </span>

      {/* Header */}
      <div className="relative flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10">
          <span className="animate-bounce-sm text-xl leading-none">⚽</span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="nebula-display flex items-center gap-2 text-lg font-bold text-ink">
            World Cup 2026
            <Trophy className="h-4 w-4 text-muted animate-spin-slow" />
          </h2>
          <p className="text-xs text-muted">United 2026 · USA · Canada · Mexico</p>
        </div>
      </div>

      {/* Matches */}
      <div className="no-scrollbar nb-stagger relative mt-4 flex gap-3 overflow-x-auto pb-1">
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
    </section>
  )
}
