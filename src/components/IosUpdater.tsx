import { useEffect, useRef, useState } from 'react'
import { Smartphone, RefreshCw, Download, Check, AlertTriangle, Usb } from 'lucide-react'
import {
  iosTools,
  iosDetect,
  iosLatest,
  iosInstall,
  iosPair,
  onSideloadProgress,
  getDesktopSettings,
  setDesktopSettings,
  type IosTools,
  type IosDevice,
  type IosLatest,
  type SideloadProgress,
} from '../lib/desktop'

// "Update your iPhone" — install/update the AskAI iOS app onto a USB-connected
// iPhone straight from the Windows app (AltStore/Sideloadly style). Only shown
// inside the desktop shell.
export default function IosUpdater() {
  const [tools, setTools] = useState<IosTools | null>(null)
  const [device, setDevice] = useState<IosDevice | null>(null)
  const [latest, setLatest] = useState<IosLatest | null>(null)
  const [busy, setBusy] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<SideloadProgress | null>(null)
  const [toolsDir, setToolsDir] = useState('')
  const [showSign, setShowSign] = useState(false)
  const [p12, setP12] = useState('')
  const [p12pw, setP12pw] = useState('')
  const [prof, setProf] = useState('')
  const unsub = useRef<() => void>(() => {})

  async function refresh() {
    setBusy(true)
    try {
      const [t, d, l] = await Promise.all([iosTools(), iosDetect(), iosLatest()])
      setTools(t)
      setDevice(d)
      setLatest(l)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    getDesktopSettings().then((s) => s && setToolsDir((s as any).iosToolsDir || ''))
    refresh()
    unsub.current = onSideloadProgress((p) => setProgress(p))
    return () => unsub.current()
  }, [])

  async function install() {
    setInstalling(true)
    setProgress({ stage: 'detect', message: 'Starting…' })
    const signing = p12 && prof ? { p12, p12Password: p12pw, mobileprovision: prof } : undefined
    const res = await iosInstall({ signing })
    if (!res.ok && res.error) setProgress({ stage: 'error', message: res.error })
    setInstalling(false)
    refresh()
  }

  const stageLabel: Record<string, string> = {
    detect: 'Finding iPhone',
    check: 'Checking latest build',
    download: 'Downloading',
    sign: 'Signing',
    install: 'Installing',
    done: 'Done',
    error: 'Error',
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg accent-gradient-bg text-white">
          <Smartphone size={13} />
        </span>
        Update your iPhone
        <button onClick={refresh} disabled={busy} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-white/10 disabled:opacity-50">
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Install or update the AskAI iOS app on a plugged-in iPhone, straight from this PC.
      </p>

      {/* Device status */}
      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        {device?.connected ? (
          <>
            <Check size={16} className="shrink-0 text-emerald-400" />
            <div className="min-w-0 text-xs">
              <div className="font-semibold">{device.name}</div>
              <div className="text-muted">
                {device.productType} · iOS {device.iosVersion}
                {device.installedVersion ? ` · AskAI ${device.installedVersion} installed` : ''}
              </div>
            </div>
            {device.trusted === false && (
              <button
                onClick={async () => {
                  setProgress({ stage: 'detect', message: 'Pairing — tap "Trust" on your iPhone…' })
                  const r = await iosPair()
                  setProgress({ stage: r.ok ? 'detect' : 'error', message: r.message || r.error })
                  refresh()
                }}
                className="ml-auto shrink-0 rounded-xl border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-white/5"
              >
                Pair / Trust
              </button>
            )}
          </>
        ) : (
          <>
            <Usb size={16} className="shrink-0 text-muted" />
            <div className="text-xs text-muted">
              {device?.missingTools
                ? 'iOS tools not found (see below).'
                : 'Plug your iPhone in with a charging cable, unlock it, and tap "Trust".'}
            </div>
          </>
        )}
      </div>

      {/* Latest build */}
      {latest?.found && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <Download size={13} className="text-accent" />
          <span className="font-semibold">Latest:</span>
          <span className="text-muted">
            {latest.name} ({latest.version})
          </span>
        </div>
      )}
      {latest && !latest.found && (
        <div className="mt-2 text-xs text-muted">No .ipa release published on GitHub yet.</div>
      )}

      {/* Tools status */}
      {tools && !tools.ready && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            Install <strong>libimobiledevice</strong> (provides <code>idevice_id</code> &{' '}
            <code>ideviceinstaller</code>) to detect and install to your iPhone.{' '}
            <a
              href="https://github.com/libimobiledevice-win32/imobiledevice-net/releases"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Get it here
            </a>
            , then set the tools folder or add it to PATH. For free Apple accounts you'll also need{' '}
            <code>zsign</code> + your signing assets below.
            <input
              value={toolsDir}
              onChange={(e) => setToolsDir(e.target.value)}
              onBlur={() => setDesktopSettings({ iosToolsDir: toolsDir } as any).then(refresh)}
              placeholder="Folder containing idevice_id, ideviceinstaller, zsign"
              className="field mt-2 w-full text-xs"
            />
          </div>
        </div>
      )}

      {/* Optional signing */}
      <button onClick={() => setShowSign((v) => !v)} className="mt-2 text-xs font-semibold text-accent hover:underline">
        {showSign ? 'Hide' : 'Add'} Apple signing (for unsigned builds)
      </button>
      {showSign && (
        <div className="mt-2 space-y-2">
          <input value={p12} onChange={(e) => setP12(e.target.value)} placeholder="Path to certificate .p12" className="field w-full text-xs" />
          <input value={p12pw} onChange={(e) => setP12pw(e.target.value)} type="password" placeholder=".p12 password" className="field w-full text-xs" />
          <input value={prof} onChange={(e) => setProf(e.target.value)} placeholder="Path to .mobileprovision" className="field w-full text-xs" />
          <p className="text-[11px] text-muted">
            Leave blank if your .ipa is already signed. Re-signing needs <code>zsign</code> on this PC.
          </p>
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold ${progress.stage === 'error' ? 'text-red-400' : progress.stage === 'done' ? 'text-emerald-400' : ''}`}>
              {stageLabel[progress.stage] || progress.stage}
            </span>
            {typeof progress.percent === 'number' && <span className="text-muted">{progress.percent}%</span>}
          </div>
          {typeof progress.percent === 'number' && (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full accent-gradient-bg transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
          )}
          {progress.message && (
            <div className={`mt-1 truncate text-[11px] ${progress.stage === 'error' ? 'text-red-400' : 'text-muted'}`}>
              {progress.message}
            </div>
          )}
        </div>
      )}

      <button
        onClick={install}
        disabled={installing || !latest?.found}
        className="accent-gradient-bg mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {installing ? (
          <>
            <RefreshCw size={15} className="animate-spin" /> Installing…
          </>
        ) : (
          <>
            <Download size={15} /> Install / update iPhone
          </>
        )}
      </button>
    </div>
  )
}
