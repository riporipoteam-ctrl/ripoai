import { useEffect, useState } from 'react'
import { Download, X, RefreshCw, Sparkles } from 'lucide-react'
import {
  canSelfUpdate,
  checkApkUpdate,
  installApkUpdate,
  type ApkUpdateInfo,
} from '../lib/apkUpdate'
import { haptic } from '../lib/native'

const DISMISS_KEY = 'ripoai:apkUpdateDismissed'

// "Update available" banner for the installed Android app. Loads the latest
// APK from the GitHub release and installs it in place — keeping the new app
// icon and native plugins up to date without a manual reinstall. Renders
// nothing on web/iOS or when already on the latest build.
export default function AndroidUpdater() {
  const [info, setInfo] = useState<ApkUpdateInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!canSelfUpdate()) return
    let alive = true
    // Wait past the splash hand-off so the banner doesn't fight the launch.
    const t = setTimeout(async () => {
      const update = await checkApkUpdate()
      if (!alive || !update) return
      let dismissed = 0
      try {
        dismissed = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10)
      } catch {
        /* ignore */
      }
      if (dismissed >= update.latestCode) return
      setInfo(update)
    }, 2500)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [])

  if (!info) return null

  async function update() {
    if (!info) return
    setBusy(true)
    setError('')
    haptic('medium')
    try {
      await installApkUpdate(info.apkUrl)
      // The system installer is now in the foreground. Leave the banner in its
      // "Installing…" state — the app restarts itself once the user confirms.
    } catch (e) {
      setError((e as Error)?.message || 'Update failed. Please try again.')
      setBusy(false)
    }
  }

  function dismiss() {
    if (info) {
      try {
        localStorage.setItem(DISMISS_KEY, String(info.latestCode))
      } catch {
        /* ignore */
      }
    }
    setInfo(null)
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[200] px-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <div className="mx-auto max-w-md rounded-2xl border border-white/12 bg-[rgb(20_20_24/0.82)] p-3.5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="accent-gradient-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
            <Sparkles size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">
              Update available{info.versionName ? ` — ${info.versionName}` : ''}
            </div>
            <p className="mt-0.5 text-xs text-white/60">
              A new version of AskAI is ready, with the latest app icon and
              hands-free voice. Install it in a tap.
            </p>
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          </div>
          {!busy && (
            <button
              onClick={dismiss}
              aria-label="Dismiss update"
              className="-m-1 shrink-0 rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button
          onClick={update}
          disabled={busy}
          className="accent-gradient-bg mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? (
            <>
              <RefreshCw size={15} className="animate-spin" /> Installing…
            </>
          ) : (
            <>
              <Download size={15} /> Update now
            </>
          )}
        </button>
      </div>
    </div>
  )
}
