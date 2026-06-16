// Apps / Integrations — connect external services (GitHub, Slack, Gmail,
// Notion …) that agents can act on, mirroring Nebula's Apps tab.
//
// NOTE: foundation stub. The Integrations subagent owns this file and builds
// out the connect cards, connection state and per-agent wiring.
const INTEGRATIONS = [
  { id: 'github', label: 'GitHub', desc: 'Repos, issues, pull requests' },
  { id: 'slack', label: 'Slack', desc: 'Messages and channels' },
  { id: 'gmail', label: 'Gmail', desc: 'Read and send email' },
  { id: 'notion', label: 'Notion', desc: 'Docs and databases' },
]

export default function AppsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-ink">Apps</h1>
      <p className="mb-4 text-sm text-muted">Connect services so your agents can act on them.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {INTEGRATIONS.map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded-xl border border-line/60 bg-card px-3 py-3">
            <span>
              <span className="block font-semibold text-ink">{i.label}</span>
              <span className="block text-sm text-muted">{i.desc}</span>
            </span>
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink">Connect</button>
          </div>
        ))}
      </div>
    </div>
  )
}
