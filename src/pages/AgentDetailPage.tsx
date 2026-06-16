// Agent detail — the full Nebula-style profile for a single agent:
// header (avatar, name, "Ready to work", per-agent model), tabs
// Info / Tools / Triggers / Prompt, plus Visibility, Device, About and Goals.
//
// NOTE: foundation stub. The Agent-Detail subagent owns this file and builds
// out the tabbed editor described above. It reads the agent id from the route.
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getAgent, normalizeAgent, statusMeta, type Agent } from '../lib/agents'
import { useStore } from '../store'

export default function AgentDetailPage() {
  const navigate = useNavigate()
  const { agentId } = useParams()
  const uid = useStore((s) => s.user?.uid)
  const [agent, setAgent] = useState<Agent | null>(null)

  useEffect(() => {
    if (uid && agentId) setAgent(getAgent(uid, agentId))
  }, [uid, agentId])

  if (!agent) return <div className="p-8 text-center text-muted">Agent not found.</div>
  const a = normalizeAgent(agent)
  const status = statusMeta(a.status)

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-muted">
        <ArrowLeft size={18} /> Agent
      </button>
      <div className="flex flex-col items-center text-center">
        <span
          className="flex h-20 w-20 items-center justify-center rounded-2xl text-4xl"
          style={{ background: a.color + '22' }}
        >
          {a.avatar ? <img src={a.avatar} alt="" className="h-20 w-20 rounded-2xl object-cover" /> : a.emoji}
        </span>
        <h1 className="mt-3 text-xl font-bold text-ink">{a.name}</h1>
        <span className="text-sm font-medium" style={{ color: status.color }}>
          {status.label}
        </span>
      </div>
      <section className="mt-6">
        <h2 className="mb-1 text-base font-bold text-ink">About</h2>
        <p className="rounded-xl bg-card p-3 text-sm text-muted">{a.about}</p>
      </section>
      <section className="mt-5">
        <h2 className="mb-1 text-base font-bold text-ink">Goals</h2>
        <div className="rounded-xl bg-card p-3 text-center text-sm text-muted">
          {a.goals.length ? a.goals.map((g) => g.text).join(', ') : 'No goals configured'}
        </div>
      </section>
    </div>
  )
}
