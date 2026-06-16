import { useEffect, useMemo, useState } from 'react'
import {
  Github,
  Slack,
  Mail,
  FileText,
  Calendar,
  Trello,
  Webhook,
  ShieldCheck,
  Check,
  Loader2,
  Plug,
  type LucideIcon,
} from 'lucide-react'
import { useStore } from '../../store'
import {
  INTEGRATIONS,
  CATEGORY_LABEL,
  getConnectionStatus,
  refreshStatus,
  startConnect,
  disconnectProvider,
  onConnectionStatus,
  getIntegrationsBase,
  type ConnectionMap,
  type ProviderId,
  type IntegrationCategory,
} from '../../lib/integrations'

const ICONS: Record<string, LucideIcon> = {
  Github,
  Slack,
  Mail,
  FileText,
  Calendar,
  Trello,
  Webhook,
}

/** Render order for the grouped categories. */
const CATEGORY_ORDER: IntegrationCategory[] = [
  'dev',
  'comms',
  'email',
  'calendar',
  'docs',
  'automation',
]

export default function IntegrationsSettings() {
  const uid = useStore((s) => s.user?.uid)
  const [status, setStatus] = useState<ConnectionMap>(() =>
    uid ? getConnectionStatus(uid) : {},
  )
  const [busy, setBusy] = useState<ProviderId | null>(null)
  const [errors, setErrors] = useState<Partial<Record<ProviderId, string>>>({})

  const hasBackend = !!getIntegrationsBase()

  // Keep in sync with the app-wide observable + fetch live status on open.
  useEffect(() => {
    if (!uid) return
    setStatus(getConnectionStatus(uid))
    const off = onConnectionStatus(() => setStatus({ ...getConnectionStatus(uid) }))
    refreshStatus(uid).then((s) => setStatus({ ...s })).catch(() => {})
    return off
  }, [uid])

  async function handleConnect(provider: ProviderId) {
    if (!uid || busy) return
    setErrors((e) => ({ ...e, [provider]: undefined }))
    setBusy(provider)
    try {
      const res = await startConnect(uid, provider)
      if (!res.ok && res.error) {
        setErrors((e) => ({ ...e, [provider]: res.error }))
      } else if (res.ok && !res.connected) {
        setErrors((e) => ({
          ...e,
          [provider]: 'Connection wasn’t completed. Try again.',
        }))
      }
      setStatus({ ...getConnectionStatus(uid) })
    } finally {
      setBusy(null)
    }
  }

  async function handleDisconnect(provider: ProviderId) {
    if (!uid || busy) return
    setBusy(provider)
    try {
      await disconnectProvider(uid, provider)
      setStatus({ ...getConnectionStatus(uid) })
    } finally {
      setBusy(null)
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<IntegrationCategory, typeof INTEGRATIONS>()
    for (const meta of INTEGRATIONS) {
      const arr = map.get(meta.category) ?? []
      arr.push(meta)
      map.set(meta.category, arr)
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      items: map.get(c)!,
    }))
  }, [])

  return (
    <div>
      <div className="intg-note">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent" />
        <span>
          <span className="font-semibold text-ink">No API keys needed.</span>{' '}
          OAuth is handled securely by the AskAI backend — clicking Connect opens
          the service’s own sign-in, and your credentials never touch this app.
          {!hasBackend && (
            <>
              {' '}
              <span className="text-amber-400">
                Connections aren’t available in this build yet.
              </span>
            </>
          )}
        </span>
      </div>

      {grouped.map(({ category, items }) => (
        <div className="intg-group" key={category}>
          <div className="intg-group-title">{CATEGORY_LABEL[category]}</div>
          <div className="intg-grid">
            {items.map((meta) => {
              const provider = meta.id as ProviderId
              const Icon = ICONS[meta.icon] ?? Plug
              const connected = !!status[provider]
              const isBusy = busy === provider
              const err = errors[provider]
              return (
                <div className="intg-card" key={meta.id}>
                  <div className="intg-card-head">
                    <span className="intg-icon" style={{ background: meta.color }}>
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="intg-name">{meta.label}</div>
                      <div className="intg-desc">{meta.description}</div>
                    </div>
                  </div>

                  <div className="intg-scopes">
                    {meta.scopes.map((s) => (
                      <span className="intg-scope" key={s}>
                        {s}
                      </span>
                    ))}
                  </div>

                  {err && <div className="intg-err">{err}</div>}

                  <div className="intg-actions">
                    {connected ? (
                      <>
                        <span className="intg-connected-pill">
                          <Check size={14} /> Connected
                        </span>
                        <button
                          className="intg-disconnect pressable"
                          onClick={() => handleDisconnect(provider)}
                          disabled={isBusy}
                        >
                          {isBusy ? 'Working…' : 'Disconnect'}
                        </button>
                      </>
                    ) : (
                      <button
                        className="intg-btn intg-btn-connect accent-gradient-bg pressable"
                        style={{ background: meta.color }}
                        onClick={() => handleConnect(provider)}
                        disabled={isBusy || !uid || !hasBackend}
                      >
                        {isBusy ? (
                          <>
                            <Loader2 size={14} className="animate-spin" /> Connecting…
                          </>
                        ) : (
                          <>
                            <Plug size={14} /> Connect
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
