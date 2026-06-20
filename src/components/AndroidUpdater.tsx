import { useEffect, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import {
  canSelfUpdate,
  checkApkUpdate,
  installApkUpdate,
  type ApkUpdateInfo,
} from '../lib/apkUpdate'
import { haptic } from '../lib/native'

// Auto-updater for the installed Android app.
//
// There is no button to press anymore: when the app launches and a newer APK is
// available, it downloads it and hands it to Android's package installer
// automatically. (Android still shows its own one-tap install confirmation —
// that system prompt can't be bypassed by a normal app — but the user never has
// to find or press an in-app "Update" button.) A tiny non-blocking toast just
// tells them an update is being applied. Renders nothing on web/iOS.
export default function AndroidUpdater() {
  const [info, setInfo] = useState<ApkUpdateInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!canSelfUpdate()) return
    let alive = true

    // Wait past the splash hand-off so the install prompt doesn't fight launch.
    const t = setTimeout(async () => {
      const update = await checkApkUpdate()
      if (!alive || !update) return
      setInfo(update)
      haptic('medium')
      try {
        // Auto-start the download + system installer. No tap required.
        await installApkUpdate(update.apkUrl)
        // The OS installer is now in the foreground; the app restarts itself
        // once the user confirms. Leave the "Updating…" toast in place.
      } catch (e) {
        if (alive) setError((e as Error)?.message || 'Update will retry next launch.')
      }
    }, 2500)

    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [])

  if (!info) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[200] px-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/12 bg-[rgb(20_20_24/0.82)] p-3.5 shadow-2xl backdrop-blur-xl">
        <span className="accent-gradient-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
          {error ? <Sparkles size={16} /> : <RefreshCw size={16} className="animate-spin" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">
            {error ? 'Update ready' : `Updating AskAI${info.versionName ? ` to ${info.versionName}` : ''}…`}
          </div>
          <p className="mt-0.5 text-xs text-white/60">
            {error || 'Installing the latest version automatically — just confirm the prompt.'}
          </p>
        </div>
      </div>
    </div>
  )
}
