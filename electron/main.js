// AskAI Desktop (Windows) — Electron shell around the AskAI web app, plus an
// opt-in, allowlisted bridge that lets AskAI control the local PC (run commands,
// move/organize files) on the user's behalf.
//
// Safety model ("allowlist + auto-run"): read-only and clearly-safe file ops
// inside the user's own folders run automatically; anything destructive or any
// shell command requires an explicit confirmation dialog — unless the user has
// added it to their allowlist. The renderer only ever gets the high-level API in
// preload.js (contextIsolation on, no direct Node access).

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const { exec } = require('node:child_process')
const sideload = require('./sideload')

// The web app the desktop shell loads. Override with ASKAI_URL for local dev
// (e.g. http://localhost:5173).
const APP_URL = process.env.ASKAI_URL || 'https://riporipoteam-ctrl.github.io/ripoai/'

let mainWindow = null

// ---- Allowlist persistence -------------------------------------------------
function settingsPath() {
  return path.join(app.getPath('userData'), 'askai-desktop.json')
}
function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
  } catch {
    return { allowCommands: [], autoRunFileOps: true }
  }
}
function saveSettings(s) {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2))
  } catch {
    /* ignore */
  }
}

// ---- Window ---------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#0f0e0c',
    title: 'AskAI',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  Menu.setApplicationMenu(null)
  mainWindow.loadURL(APP_URL)

  // Open external links in the system browser, keep app links in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url)
      const appHost = new URL(APP_URL).host
      if (u.host !== appHost) {
        shell.openExternal(url)
        return { action: 'deny' }
      }
    } catch {
      /* fall through */
    }
    return { action: 'allow' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---- Auto-update (GitHub Releases) ----------------------------------------
function setupAutoUpdate() {
  let autoUpdater
  try {
    ;({ autoUpdater } = require('electron-updater'))
  } catch {
    return // not installed in dev
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  const send = (channel, payload) => mainWindow && mainWindow.webContents.send(channel, payload)
  autoUpdater.on('update-available', (info) => send('desktop:update', { state: 'available', version: info?.version }))
  autoUpdater.on('download-progress', (p) => send('desktop:update', { state: 'downloading', percent: Math.round(p?.percent || 0) }))
  autoUpdater.on('update-downloaded', (info) => send('desktop:update', { state: 'ready', version: info?.version }))
  autoUpdater.on('error', (e) => send('desktop:update', { state: 'error', message: String(e?.message || e) }))
  ipcMain.handle('desktop:update-check', () => autoUpdater.checkForUpdates().catch(() => null))
  ipcMain.handle('desktop:update-install', () => autoUpdater.quitAndInstall())
  // Check shortly after launch, then hourly.
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 4000)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000)
}

// ---- PC control bridge -----------------------------------------------------
const HOME = os.homedir()

function confirm(title, message, detail) {
  if (!mainWindow) return Promise.resolve(false)
  return dialog
    .showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Allow', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title,
      message,
      detail,
      noLink: true,
    })
    .then((r) => r.response === 0)
}

// Resolve a user-supplied path; expand ~ and known folders.
function resolvePath(p) {
  if (!p) return HOME
  let out = String(p).trim()
  if (out === '~' || out.startsWith('~/') || out.startsWith('~\\')) out = path.join(HOME, out.slice(1))
  const named = {
    desktop: app.getPath('desktop'),
    documents: app.getPath('documents'),
    downloads: app.getPath('downloads'),
    pictures: app.getPath('pictures'),
    music: app.getPath('music'),
    videos: app.getPath('videos'),
    home: HOME,
  }
  const low = out.toLowerCase()
  if (named[low]) return named[low]
  return path.resolve(HOME, out)
}

// Is a path inside the user's home tree (the auto-run safe zone)?
function inHome(p) {
  const rp = path.resolve(p)
  return rp === HOME || rp.startsWith(HOME + path.sep)
}

function registerControlHandlers() {
  ipcMain.handle('desktop:info', () => ({
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    hostname: os.hostname(),
    user: os.userInfo().username,
    home: HOME,
    desktop: app.getPath('desktop'),
    downloads: app.getPath('downloads'),
    documents: app.getPath('documents'),
    appVersion: app.getVersion(),
  }))

  ipcMain.handle('desktop:get-settings', () => loadSettings())
  ipcMain.handle('desktop:set-settings', (_e, s) => {
    const cur = loadSettings()
    const next = { ...cur, ...(s || {}) }
    saveSettings(next)
    return next
  })

  // File operations. Safe ops auto-run; destructive ops confirm (unless the user
  // turned auto-run off, in which case everything confirms).
  ipcMain.handle('desktop:fs', async (_e, req) => {
    const settings = loadSettings()
    const op = req?.op
    const auto = settings.autoRunFileOps !== false
    try {
      switch (op) {
        case 'list': {
          const dir = resolvePath(req.path)
          const names = await fsp.readdir(dir, { withFileTypes: true })
          return {
            ok: true,
            path: dir,
            entries: names.slice(0, 500).map((d) => ({ name: d.name, dir: d.isDirectory() })),
          }
        }
        case 'read': {
          const file = resolvePath(req.path)
          const stat = await fsp.stat(file)
          if (stat.size > 256 * 1024) return { ok: false, error: 'File too large to read (>256KB).' }
          const text = await fsp.readFile(file, 'utf8')
          return { ok: true, path: file, text }
        }
        case 'mkdir': {
          const dir = resolvePath(req.path)
          await fsp.mkdir(dir, { recursive: true })
          return { ok: true, path: dir }
        }
        case 'move':
        case 'copy':
        case 'rename': {
          const from = resolvePath(req.from)
          const to = resolvePath(req.to)
          const safe = inHome(from) && inHome(to)
          if (!auto || !safe) {
            const okGo = await confirm(
              'AskAI wants to ' + op + ' a file',
              `${op[0].toUpperCase() + op.slice(1)} this item?`,
              `${from}\n→ ${to}`,
            )
            if (!okGo) return { ok: false, error: 'Cancelled by user.' }
          }
          if (op === 'copy') await fsp.cp(from, to, { recursive: true })
          else await fsp.rename(from, to)
          return { ok: true, from, to }
        }
        case 'write': {
          const file = resolvePath(req.path)
          if (!auto || !inHome(file)) {
            const okGo = await confirm('AskAI wants to write a file', 'Write/overwrite this file?', file)
            if (!okGo) return { ok: false, error: 'Cancelled by user.' }
          }
          await fsp.writeFile(file, String(req.text ?? ''), 'utf8')
          return { ok: true, path: file }
        }
        case 'trash':
        case 'delete': {
          const target = resolvePath(req.path)
          const okGo = await confirm(
            'AskAI wants to delete an item',
            'Move this item to the Recycle Bin?',
            target,
          )
          if (!okGo) return { ok: false, error: 'Cancelled by user.' }
          await shell.trashItem(target)
          return { ok: true, path: target }
        }
        case 'reveal':
        case 'open': {
          const target = resolvePath(req.path)
          await shell.openPath(target)
          return { ok: true, path: target }
        }
        default:
          return { ok: false, error: 'Unknown file operation: ' + op }
      }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  // Shell command. Always confirms unless the command's first token is on the
  // user's allowlist.
  ipcMain.handle('desktop:exec', async (_e, req) => {
    const command = String(req?.command || '').trim()
    if (!command) return { ok: false, error: 'Empty command.' }
    const settings = loadSettings()
    const first = command.split(/\s+/)[0].toLowerCase()
    const allowed = (settings.allowCommands || []).map((c) => String(c).toLowerCase())
    if (!allowed.includes(first)) {
      const okGo = await confirm('AskAI wants to run a command', 'Run this command on your PC?', command)
      if (!okGo) return { ok: false, error: 'Cancelled by user.' }
    }
    return new Promise((resolve) => {
      exec(command, { cwd: resolvePath(req.cwd), timeout: 60000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error?.code ?? 0,
          stdout: String(stdout || '').slice(0, 100000),
          stderr: String(stderr || error?.message || '').slice(0, 20000),
        })
      })
    })
  })

  // ---- iOS sideloader (install/update the AskAI iOS app over USB) ----------
  ipcMain.handle('sideload:tools', () => {
    const s = loadSettings()
    sideload.setToolsDir(s.iosToolsDir || '')
    return sideload.checkTools()
  })
  ipcMain.handle('sideload:detect', () => {
    const s = loadSettings()
    sideload.setToolsDir(s.iosToolsDir || '')
    return sideload.detectDevice()
  })
  ipcMain.handle('sideload:latest', () => sideload.checkLatestIpa())
  ipcMain.handle('sideload:install', async (e, opts) => {
    const s = loadSettings()
    sideload.setToolsDir(s.iosToolsDir || '')
    const send = (payload) => e.sender.send('sideload:progress', payload)
    try {
      const res = await sideload.installLatest(opts || {}, send)
      return { ok: true, ...res }
    } catch (err) {
      send({ stage: 'error', message: String(err?.message || err) })
      return { ok: false, error: String(err?.message || err) }
    }
  })
}

app.whenReady().then(() => {
  registerControlHandlers()
  createWindow()
  setupAutoUpdate()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
