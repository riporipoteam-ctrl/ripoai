// Agents home — the roster of AI agents plus the "Chief of Staff" orchestrator
// intro, modeled on Nebula. Tapping an agent opens its profile (AgentProfile).
//
// NOTE: foundation stub. The Agents subagent owns this file and builds out the
// list, Chief-of-Staff intro card, activity threads and "What should your
// agents do?" composer here.
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { loadAgents, type Agent } from '../lib/agents'
import { useStore } from '../store'

export default function AgentsPage() {
  const navigate = useNavigate()
  const uid = useStore((s) => s.user?.uid)
  const [agents, setAgents] = useState<Agent[]>([])

  useEffect(() => {
    if (uid) setAgents(loadAgents(uid))
  }, [uid])

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-ink">Agents</h1>
      <div className="flex flex-col gap-2">
        {agents.map((a) => (
          <button
            key={a.id}
            onClick={() => navigate(`/agent/${a.id}`)}
            className="flex items-center gap-3 rounded-xl border border-line/60 bg-card px-3 py-3 text-left"
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg text-lg"
              style={{ background: a.color + '22' }}
            >
              {a.avatar ? <img src={a.avatar} alt="" className="h-10 w-10 rounded-lg object-cover" /> : a.emoji}
            </span>
            <span>
              <span className="block font-semibold text-ink">{a.name}</span>
              <span className="block text-sm text-muted">{a.role}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
