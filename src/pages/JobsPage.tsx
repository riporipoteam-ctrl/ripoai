// Jobs — scheduled recurring tasks assigned to agents, with cadence and an
// "Upcoming" list (Nebula's Jobs tab).
//
// NOTE: foundation stub. The Jobs subagent owns this file and builds out the
// My jobs / All jobs tabs, the create-job sheet, and per-job actions.
import { useEffect, useState } from 'react'
import { loadAgents } from '../lib/agents'
import { upcomingJobs, untilLabel, type Job } from '../lib/jobs'
import { useStore } from '../store'

export default function JobsPage() {
  const uid = useStore((s) => s.user?.uid)
  const [jobs, setJobs] = useState<Job[]>([])

  useEffect(() => {
    if (!uid) return
    setJobs(upcomingJobs(uid))
  }, [uid])

  const roleFor = (j: Job) => j.agentRole || (uid ? loadAgents(uid).find((a) => a.id === j.agentId)?.role : '') || ''

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-ink">Jobs</h1>
      <h2 className="mb-2 text-sm font-semibold text-muted">Upcoming · {jobs.length}</h2>
      <div className="flex flex-col divide-y divide-line/50">
        {jobs.map((j) => (
          <div key={j.id} className="flex items-start justify-between gap-3 py-3">
            <span>
              <span className="block font-semibold text-ink">⚡ {j.title}</span>
              <span className="block text-sm text-muted">{roleFor(j)}</span>
            </span>
            <span className="shrink-0 text-sm text-muted">{untilLabel(j.nextRunAt)}</span>
          </div>
        ))}
        {!jobs.length && <p className="py-8 text-center text-sm text-muted">No jobs scheduled yet.</p>}
      </div>
    </div>
  )
}
