// Android APK self-updater.
//
// The installed Android app loads the LIVE deployed website (see
// capacitor.config.ts), so all web/UI changes ship instantly with every
// deploy — no reinstall. What that can't refresh is the *native* shell: the
// app icon, native plugins (speech/TTS), permissions, splash, etc. Those only
// change when a new APK is installed.
//
// This module lets the app update its own APK: on launch it asks GitHub for
// the latest `android-latest` release, compares the installed versionCode
// against the one published with that release, and — if newer — downloads and
// hands the APK to Android's package installer. After a user installs the
// first updater-capable APK once, every later build updates itself.

import { registerPlugin } from '@capacitor/core'
import { platform } from './native'

const REPO = 'riporipoteam-ctrl/ripoai'
const RELEASE_TAG = 'android-latest'

interface ApkUpdaterPlugin {
  // Downloads the APK at `url` (DownloadManager) and launches the system
  // installer when it finishes. Resolves once the download has started.
  downloadAndInstall(options: { url: string }): Promise<{ started: boolean }>
}

// Custom native plugin, implemented in the Android shell (injected at build
// time by scripts/patch-android-updater.mjs). On web/iOS this is never called.
const ApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater')

export interface ApkUpdateInfo {
  latestCode: number
  currentCode: number
  versionName?: string
  apkUrl: string
}

// Only the Android shell can sideload-update itself. iOS and web update via
// the live deploy / TestFlight, so this stays inert everywhere else.
export function canSelfUpdate() {
  return platform === 'android'
}

let cached: ApkUpdateInfo | null | undefined

// Returns update info when a newer APK is available, otherwise null. Cached
// for the session so the banner doesn't re-query on every render.
export async function checkApkUpdate(force = false): Promise<ApkUpdateInfo | null> {
  if (!canSelfUpdate()) return null
  if (cached !== undefined && !force) return cached ?? null

  try {
    const { App } = await import('@capacitor/app')
    const appInfo = await App.getInfo()
    const currentCode = parseInt(appInfo.build, 10) || 0

    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`,
      { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' },
    )
    if (!res.ok) {
      cached = null
      return null
    }
    const rel = await res.json()
    const apk = (rel.assets || []).find((a: { name?: string }) => /\.apk$/i.test(a.name || ''))
    if (!apk) {
      cached = null
      return null
    }

    // The build workflow stamps `versionCode: N` (and `versionName: X`) into
    // the release notes so we can compare without a separate hosted file.
    const body: string = rel.body || ''
    const codeMatch = body.match(/versionCode:\s*(\d+)/i)
    const latestCode = codeMatch ? parseInt(codeMatch[1], 10) : 0
    const nameMatch = body.match(/versionName:\s*([^\s]+)/i)

    if (!latestCode || latestCode <= currentCode) {
      cached = null
      return null
    }

    cached = {
      latestCode,
      currentCode,
      versionName: nameMatch ? nameMatch[1] : undefined,
      apkUrl: apk.browser_download_url,
    }
    return cached
  } catch {
    cached = null
    return null
  }
}

// Kicks off the download + system install prompt. Resolves once the download
// has started; the OS takes over for the actual install.
export async function installApkUpdate(url: string) {
  return ApkUpdater.downloadAndInstall({ url })
}
