// sideload.js — install/update the AskAI iOS app onto a USB-connected iPhone
// from the Windows desktop app (AltStore / Sideloadly style).
//
// Pipeline: detect device → find the latest .ipa on our GitHub releases →
// download → (optionally) re-sign with the user's Apple signing assets → install
// to the device. We orchestrate the standard, battle-tested iOS CLI tools:
//   • libimobiledevice  (idevice_id, ideviceinfo, ideviceinstaller) — pairing,
//     device info and installing the .ipa over USB.
//   • zsign (optional)  — re-sign the .ipa with a .p12 cert + .mobileprovision
//     so it can run on the device (free or paid Apple developer account).
//
// Those are native binaries; the app finds them on PATH, in a user-set tools
// folder, or in a bundled resources/tools dir, and tells the user how to get
// them if they're missing. Nothing here is iOS- or Windows-specific in JS — the
// platform specifics live entirely in those external tools.

const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const https = require('node:https')

const REPO = { owner: 'riporipoteam-ctrl', repo: 'ripoai' }
// The AskAI iOS bundle identifier (used to read the currently-installed version).
const BUNDLE_ID = 'io.github.riporipoteam.ripoai'

let toolsDirOverride = ''
function setToolsDir(dir) {
  toolsDirOverride = dir || ''
}

// Resolve a tool's executable path: explicit tools dir → bundled resources →
// bare name (found on PATH by spawn). On Windows we also try the .exe suffix.
function toolPath(name) {
  const candidates = []
  const exe = process.platform === 'win32' ? name + '.exe' : name
  if (toolsDirOverride) candidates.push(path.join(toolsDirOverride, exe))
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'tools', exe))
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c
    } catch {
      /* ignore */
    }
  }
  return name // rely on PATH
}

// Run a tool, capturing output. Resolves { ok, code, stdout, stderr }. onLine is
// called with each stdout/stderr line (used for live install progress).
function run(name, args, { onLine } = {}) {
  return new Promise((resolve) => {
    let proc
    try {
      proc = spawn(toolPath(name), args, { windowsHide: true })
    } catch (e) {
      resolve({ ok: false, code: -1, stdout: '', stderr: String(e?.message || e), missing: true })
      return
    }
    let stdout = ''
    let stderr = ''
    const feed = (buf, isErr) => {
      const s = buf.toString()
      if (isErr) stderr += s
      else stdout += s
      if (onLine) for (const line of s.split(/\r?\n/)) if (line.trim()) onLine(line.trim())
    }
    proc.stdout.on('data', (b) => feed(b, false))
    proc.stderr.on('data', (b) => feed(b, true))
    proc.on('error', (e) => {
      const missing = e && (e.code === 'ENOENT')
      resolve({ ok: false, code: -1, stdout, stderr: String(e?.message || e), missing })
    })
    proc.on('close', (code) => resolve({ ok: code === 0, code, stdout, stderr }))
  })
}

// ---- Tool availability -----------------------------------------------------
async function checkTools() {
  const probe = async (name, args) => {
    const r = await run(name, args)
    return !(r.missing || (r.code === -1 && /ENOENT/i.test(r.stderr)))
  }
  const [idevice_id, ideviceinstaller, zsign] = await Promise.all([
    probe('idevice_id', ['-l']),
    probe('ideviceinstaller', ['-h']),
    probe('zsign', ['-v']),
  ])
  return {
    idevice_id,
    ideviceinstaller,
    zsign,
    // libimobiledevice (idevice_id + ideviceinstaller) is required to install;
    // zsign is only needed when re-signing.
    ready: idevice_id && ideviceinstaller,
  }
}

// ---- Device detection ------------------------------------------------------
async function detectDevice() {
  const ids = await run('idevice_id', ['-l'])
  if (ids.missing || /ENOENT/i.test(ids.stderr)) {
    return { connected: false, missingTools: true }
  }
  const udid = (ids.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]
  if (!udid) return { connected: false }
  // Pull friendly details. ideviceinfo -k <key> prints just that value.
  const get = async (key) => (await run('ideviceinfo', ['-u', udid, '-k', key])).stdout.trim()
  const [name, productType, version] = await Promise.all([
    get('DeviceName'),
    get('ProductType'),
    get('ProductVersion'),
  ])
  // A pairing/trust prompt may be required the first time.
  const paired = (await run('idevicepair', ['-u', udid, 'validate'])).ok
  return {
    connected: true,
    udid,
    name: name || 'iPhone',
    productType,
    iosVersion: version,
    trusted: paired,
    installedVersion: paired ? await installedVersion(udid) : '',
  }
}

// Trigger the trust/pairing handshake (the iPhone shows a "Trust This Computer?"
// prompt the user must accept, then enter their passcode).
async function pairDevice() {
  const ids = await run('idevice_id', ['-l'])
  const udid = (ids.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]
  if (!udid) return { ok: false, error: 'No iPhone detected. Plug it in with a cable.' }
  const r = await run('idevicepair', ['-u', udid, 'pair'])
  const ok = r.ok || /SUCCESS|already paired/i.test(r.stdout + r.stderr)
  return { ok, message: ok ? 'Paired.' : (r.stderr || r.stdout || 'Tap "Trust" on your iPhone, then retry.').trim() }
}

// Read the AskAI version currently installed on the device (if any), so the UI
// can show "installed vX → latest vY".
async function installedVersion(udid) {
  try {
    const r = await run('ideviceinstaller', ['-u', udid, '-l'])
    if (!r.ok) return ''
    for (const line of r.stdout.split(/\r?\n/)) {
      if (line.includes(BUNDLE_ID)) {
        const m = line.match(/"?([0-9][0-9.]*)"?\s*$/) || line.match(/,\s*"?([0-9][0-9.]+)"?/)
        return m ? m[1] : 'installed'
      }
    }
    return ''
  } catch {
    return ''
  }
}

// ---- Latest .ipa on GitHub releases ---------------------------------------
function ghJson(urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: 'api.github.com',
        path: urlPath,
        method: 'GET',
        headers: { 'User-Agent': 'AskAI-Desktop', Accept: 'application/vnd.github+json' },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

async function checkLatestIpa() {
  // Look through recent releases for the newest .ipa asset.
  const releases = await ghJson(`/repos/${REPO.owner}/${REPO.repo}/releases?per_page=20`).catch(() => [])
  const list = Array.isArray(releases) ? releases : []
  for (const rel of list) {
    const asset = (rel.assets || []).find((a) => /\.ipa$/i.test(a.name))
    if (asset) {
      return {
        found: true,
        version: rel.tag_name || rel.name || '',
        name: asset.name,
        size: asset.size,
        url: asset.browser_download_url,
        notes: (rel.body || '').slice(0, 2000),
        publishedAt: rel.published_at,
      }
    }
  }
  return { found: false }
}

// ---- Download (follows redirects) -----------------------------------------
function download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const go = (u, redirects = 0) => {
      if (redirects > 6) return reject(new Error('Too many redirects'))
      https
        .get(u, { headers: { 'User-Agent': 'AskAI-Desktop' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            return go(res.headers.location, redirects + 1)
          }
          if (res.statusCode !== 200) {
            res.resume()
            return reject(new Error('Download failed: HTTP ' + res.statusCode))
          }
          const total = parseInt(res.headers['content-length'] || '0', 10)
          let received = 0
          const file = fs.createWriteStream(dest)
          res.on('data', (chunk) => {
            received += chunk.length
            if (total && onProgress) onProgress(Math.round((received / total) * 100))
          })
          res.pipe(file)
          file.on('finish', () => file.close(() => resolve(dest)))
          file.on('error', reject)
        })
        .on('error', reject)
    }
    go(url)
  })
}

// ---- Sign (optional) -------------------------------------------------------
// opts: { p12, p12Password, mobileprovision }. Returns the path to a signed ipa.
async function signIpa(ipaPath, opts, onLine) {
  if (!opts || !opts.p12 || !opts.mobileprovision) return ipaPath // assume already signed
  const out = path.join(os.tmpdir(), `askai-signed-${Date.now()}.ipa`)
  const args = ['-k', opts.p12]
  if (opts.p12Password) args.push('-p', opts.p12Password)
  args.push('-m', opts.mobileprovision, '-o', out, ipaPath)
  const r = await run('zsign', args, { onLine })
  if (!r.ok) {
    if (r.missing) throw new Error('zsign not found — install it to re-sign the .ipa, or provide an already-signed build.')
    throw new Error('Signing failed: ' + (r.stderr || r.stdout || 'unknown error').slice(0, 400))
  }
  return out
}

// ---- Install ---------------------------------------------------------------
async function installIpa(udid, ipaPath, onLine) {
  const args = []
  if (udid) args.push('-u', udid)
  args.push('-i', ipaPath)
  const r = await run('ideviceinstaller', args, { onLine })
  if (!r.ok) {
    if (r.missing) throw new Error('ideviceinstaller not found — install libimobiledevice.')
    throw new Error('Install failed: ' + (r.stderr || r.stdout || 'unknown error').slice(0, 500))
  }
  return true
}

// ---- Full pipeline: detect → check → download → sign → install ------------
// onEvent({ stage, percent?, message? }) drives the UI. signing is optional.
async function installLatest({ signing } = {}, onEvent = () => {}) {
  onEvent({ stage: 'detect', message: 'Looking for your iPhone…' })
  const device = await detectDevice()
  if (!device.connected) {
    throw new Error(
      device.missingTools
        ? 'iOS tools not found. Install libimobiledevice (idevice_id, ideviceinstaller) first.'
        : 'No iPhone detected. Plug your iPhone in with a cable and tap "Trust" if prompted.',
    )
  }

  onEvent({ stage: 'check', message: 'Checking for the latest AskAI build…' })
  const latest = await checkLatestIpa()
  if (!latest.found) throw new Error('No .ipa release found on GitHub yet.')

  const dest = path.join(os.tmpdir(), latest.name)
  onEvent({ stage: 'download', percent: 0, message: `Downloading ${latest.name}…` })
  await download(latest.url, dest, (p) => onEvent({ stage: 'download', percent: p }))

  let toInstall = dest
  if (signing && signing.p12 && signing.mobileprovision) {
    onEvent({ stage: 'sign', message: 'Signing the app for your device…' })
    toInstall = await signIpa(dest, signing, (line) => onEvent({ stage: 'sign', message: line }))
  }

  onEvent({ stage: 'install', percent: 0, message: 'Installing onto your iPhone…' })
  await installIpa(device.udid, toInstall, (line) => {
    const m = line.match(/(\d+)%/)
    onEvent({ stage: 'install', percent: m ? parseInt(m[1], 10) : undefined, message: line })
  })

  // Best-effort cleanup of temp files.
  fsp.unlink(dest).catch(() => {})
  if (toInstall !== dest) fsp.unlink(toInstall).catch(() => {})

  onEvent({ stage: 'done', message: `AskAI ${latest.version} installed on ${device.name}.` })
  return { device, version: latest.version }
}

module.exports = {
  setToolsDir,
  checkTools,
  detectDevice,
  pairDevice,
  checkLatestIpa,
  installLatest,
}
