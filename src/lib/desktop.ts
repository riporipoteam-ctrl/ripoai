// Desktop bridge — the web app's view of the AskAI Windows app (Electron).
//
// When AskAI runs inside the desktop shell, `window.askaiDesktop` (from
// electron/preload.js) is present and we can control the local PC: list/move/
// organize files, run commands, etc. On the website/iOS/APK this is all inert,
// so the same build runs everywhere.

export interface DesktopInfo {
  platform: string
  arch: string
  release: string
  hostname: string
  user: string
  home: string
  desktop: string
  downloads: string
  documents: string
  appVersion: string
}

export interface DesktopUpdate {
  state: 'available' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  message?: string
}

export interface FsRequest {
  op: 'list' | 'read' | 'mkdir' | 'move' | 'copy' | 'rename' | 'write' | 'delete' | 'trash' | 'open' | 'reveal'
  path?: string
  from?: string
  to?: string
  text?: string
}

interface DesktopApi {
  isAskAIDesktop: boolean
  info: () => Promise<DesktopInfo>
  getSettings: () => Promise<{ allowCommands: string[]; autoRunFileOps: boolean }>
  setSettings: (s: Partial<{ allowCommands: string[]; autoRunFileOps: boolean }>) => Promise<any>
  fs: (req: FsRequest) => Promise<any>
  exec: (req: { command: string; cwd?: string }) => Promise<any>
  checkForUpdate: () => Promise<any>
  installUpdate: () => Promise<any>
  onUpdate: (cb: (u: DesktopUpdate) => void) => () => void
}

function api(): DesktopApi | null {
  const a = (window as any).askaiDesktop
  return a && a.isAskAIDesktop ? (a as DesktopApi) : null
}

export function isDesktop(): boolean {
  return !!api()
}

let cachedInfo: DesktopInfo | null = null
export async function getDesktopInfo(): Promise<DesktopInfo | null> {
  const a = api()
  if (!a) return null
  if (cachedInfo) return cachedInfo
  try {
    cachedInfo = await a.info()
    return cachedInfo
  } catch {
    return null
  }
}

export async function getDesktopSettings(): Promise<{ allowCommands: string[]; autoRunFileOps: boolean } | null> {
  const a = api()
  if (!a) return null
  try {
    return await a.getSettings()
  } catch {
    return null
  }
}

export async function setDesktopSettings(
  s: Partial<{ allowCommands: string[]; autoRunFileOps: boolean }>,
): Promise<void> {
  const a = api()
  if (!a) return
  try {
    await a.setSettings(s)
  } catch {
    /* ignore */
  }
}

export async function checkForDesktopUpdate(): Promise<void> {
  await api()?.checkForUpdate?.()
}
export async function installDesktopUpdate(): Promise<void> {
  await api()?.installUpdate?.()
}
export function onDesktopUpdate(cb: (u: DesktopUpdate) => void): () => void {
  const a = api()
  return a ? a.onUpdate(cb) : () => {}
}

// ---- AI-proposed PC actions ------------------------------------------------
export interface PcAction {
  kind: 'fs' | 'exec' | 'open'
  // fs
  op?: FsRequest['op']
  path?: string
  from?: string
  to?: string
  text?: string
  // exec
  command?: string
  cwd?: string
  // human-friendly one-liner the model writes
  label?: string
}

export interface PcActionResult {
  ok: boolean
  detail?: string
  error?: string
}

/** Pull ```pc-action``` JSON blocks out of an assistant message. */
export function parsePcActions(text: string): PcAction[] {
  const out: PcAction[] = []
  const re = /```pc-action\s*([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    try {
      const obj = JSON.parse(m[1].trim())
      const actions = Array.isArray(obj?.actions) ? obj.actions : Array.isArray(obj) ? obj : [obj]
      for (const a of actions) if (a && a.kind) out.push(a as PcAction)
    } catch {
      /* ignore malformed block */
    }
  }
  return out
}

/** Strip the raw ```pc-action``` blocks from text so they're not shown verbatim. */
export function stripPcActions(text: string): string {
  return text.replace(/```pc-action\s*[\s\S]*?```/gi, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** Execute one action. Electron enforces the allowlist/confirmation policy. */
export async function runPcAction(action: PcAction): Promise<PcActionResult> {
  const a = api()
  if (!a) return { ok: false, error: 'Not running in the AskAI desktop app.' }
  try {
    if (action.kind === 'exec') {
      const r = await a.exec({ command: action.command || '', cwd: action.cwd })
      return { ok: !!r?.ok, detail: r?.stdout || r?.stderr, error: r?.ok ? undefined : r?.stderr || 'Command failed.' }
    }
    // fs / open
    const op = action.kind === 'open' ? 'open' : action.op
    const r = await a.fs({ op: op as FsRequest['op'], path: action.path, from: action.from, to: action.to, text: action.text })
    if (r?.ok) {
      const detail =
        r.entries ? r.entries.map((e: any) => e.name).join(', ') : r.text ? r.text.slice(0, 500) : r.to ? `${r.from} → ${r.to}` : r.path
      return { ok: true, detail }
    }
    return { ok: false, error: r?.error || 'Operation failed.' }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/** Capability block injected into the system prompt when on desktop, so the
 *  model knows it can really act on the PC and how to request it. */
export function desktopCapabilityPrompt(info: DesktopInfo): string {
  return `DESKTOP CONTROL — You are running inside the AskAI Windows desktop app on ${info.user}'s PC (${info.platform}). You CAN actually control this computer: list/open/move/copy/rename/delete files and folders, create folders, and run shell commands. Known folders: home=${info.home}, Desktop=${info.desktop}, Downloads=${info.downloads}, Documents=${info.documents}.
When the user asks you to DO something on their PC, briefly say what you'll do, then emit a fenced \`\`\`pc-action\`\`\` block with JSON. The app executes it (safe file ops auto-run; risky ops and commands ask the user to confirm). Format:
\`\`\`pc-action
{"actions":[{"kind":"fs","op":"move","from":"~/Downloads/funny","to":"~/Desktop/funny","label":"Move the funny folder to the Desktop"}]}
\`\`\`
Action shapes: fs ops {"kind":"fs","op":"move|copy|rename|mkdir|delete|trash|list|read|open|write","path|from|to|text":…}; commands {"kind":"exec","command":"…","label":"…"}. Use ~ or folder names (Desktop, Downloads…) for paths. Prefer file ops over raw commands when possible. Never fabricate results — the app reports back what actually happened. Only include a pc-action block when the user actually wants something done on their PC.`
}
