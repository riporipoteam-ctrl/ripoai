/**
 * AskAI Cloud Computer — a real Linux sandbox for AI agents, on Cloudflare
 * Containers via the Sandbox SDK. Agents (and AskAI+ users) share one sandbox
 * per workspace: run commands, install packages, read/write files, and host
 * apps with a live preview URL.
 *
 * Requires: Workers Paid plan + Containers enabled. Deployed to YOUR Cloudflare
 * account with YOUR token (see .github/workflows/deploy-sandbox.yml). Usage is
 * billed by Cloudflare. Nothing runs until SANDBOX_SECRET is set and an agent
 * calls it.
 *
 * Auth: every request must send  Authorization: Bearer <SANDBOX_SECRET>.
 */
import { getSandbox } from '@cloudflare/sandbox'
export { Sandbox } from '@cloudflare/sandbox'

interface Env {
  Sandbox: DurableObjectNamespace
  SANDBOX_SECRET: string
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

    // Shared-secret auth so only the AskAI app can drive the sandbox.
    const auth = req.headers.get('Authorization') || ''
    if (!env.SANDBOX_SECRET || auth !== `Bearer ${env.SANDBOX_SECRET}`) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const url = new URL(req.url)
    // One shared sandbox per workspace id (default: a single shared machine).
    const workspace = url.searchParams.get('workspace') || 'shared'
    const sandbox = getSandbox(env.Sandbox, `askai-${workspace}`)

    let body: any = {}
    if (req.method === 'POST') {
      try { body = await req.json() } catch { body = {} }
    }

    try {
      switch (url.pathname) {
        // Run a shell command (install software, run apps, anything).
        case '/exec': {
          const cmd = String(body.cmd || '')
          if (!cmd) return json({ error: 'cmd required' }, 400)
          const r = await sandbox.exec(cmd)
          return json({ stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode })
        }
        // Write a file into the sandbox.
        case '/write': {
          await sandbox.writeFile(String(body.path), String(body.content ?? ''))
          return json({ ok: true })
        }
        // Read a file from the sandbox.
        case '/read': {
          const f = await sandbox.readFile(String(body.path))
          return json({ content: f.content })
        }
        // List a directory (for the file browser / storage cleanup UI).
        case '/ls': {
          const r = await sandbox.exec(`ls -la --time-style=+%s ${body.path || '.'}`)
          return json({ stdout: r.stdout })
        }
        // Delete a file/folder.
        case '/rm': {
          const r = await sandbox.exec(`rm -rf ${JSON.stringify(body.path || '')}`)
          return json({ ok: r.exitCode === 0 })
        }
        // Start a long-running process (a dev server / hosted app).
        case '/start': {
          const proc = await sandbox.startProcess(String(body.cmd))
          return json({ pid: proc.id })
        }
        // Expose a port → returns a public live-preview URL for the hosted app.
        case '/expose': {
          const port = Number(body.port || 3000)
          const exposed = await sandbox.exposePort(port)
          return json({ url: exposed.url, port })
        }
        // Disk usage — for the "clean up storage" settings screen.
        case '/usage': {
          const r = await sandbox.exec('du -sh /workspace 2>/dev/null; df -h / | tail -1')
          return json({ stdout: r.stdout })
        }
        // Wipe the workspace.
        case '/reset': {
          await sandbox.exec('rm -rf /workspace/* /workspace/.[!.]* 2>/dev/null || true')
          return json({ ok: true })
        }
        case '/health':
          return json({ ok: true, workspace })
        default:
          return json({ error: 'Not found' }, 404)
      }
    } catch (e: any) {
      return json({ error: e?.message || 'Sandbox error' }, 500)
    }
  },
}
