// AskAI Desktop (Windows) — Electron shell around the AskAI web app, plus an
// opt-in, allowlisted bridge that lets AskAI control the local PC (run commands,
// move/organize files) and a USB iPhone updater (sideloader).
//
// Safety model ("allowlist + auto-run"): read-only and clearly-safe file ops
// inside the user's own folders run automatically; anything destructive or any
// shell command requires an explicit confirmation dialog — unless the user has
// added it to their allowlist. The renderer only ever gets the high-level API in
// preload.js (contextIsolation on, no direct Node access).

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, globalShortcut } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const { exec } = require('node:child_process')
const sideload = require('./sideload')

// The web app the desktop shell loads. Override with ASKAI_URL for local dev
// (e.g. http://localhost:5173).
const APP_URL = process.env.ASKAI_URL || 'https://riporipoteam-ctrl.github.io/ripoai/'
const ICON = path.join(__dirname, 'build', 'icon.png')

let mainWindow = null
let tray = null
let quitting = false

// ---- Single instance: focus the existing window instead of opening a 2nd -----
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

// ---- Settings + window-state persistence -----------------------------------
function settingsPath() {
  return path.join(app.getPath('userData'), 'askai-desktop.json')
}
function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
  } catch {
    return { allowCommands: [], autoRunFileOps: true, minimizeToTray: true }
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
  const s = loadSettings()
  const b = s.bounds || {}
  mainWindow = new BrowserWindow({
    width: b.width || 1180,
    height: b.height || 820,
    x: b.x,
    y: b.y,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#0f0e0c',
    title: 'AskAI',
    show: false,
    autoHideMenuBar: true,
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  })

  mainWindow.loadURL(APP_URL)
  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Persist window bounds (debounced via close/resize).
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isMinimized() || mainWindow.isMaximized()) return
    const cur = loadSettings()
    cur.bounds = mainWindow.getBounds()
    saveSettings(cur)
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

  // Minimize-to-tray: closing hides to the tray instead of quitting (opt-out).
  mainWindow.on('close', (e) => {
    if (!quitting && loadSettings().minimizeToTray !== false && tray) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

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

function showWindow() {
  if (!mainWindow) return createWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// Tell the renderer (HashRouter) to start a new chat.
function newChat() {
  showWindow()
  mainWindow?.webContents.executeJavaScript("location.hash = '#/'; ").catch(() => {})
}

// ---- App menu + accelerators ----------------------------------------------
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: newChat },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => checkUpdatesManual() },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit() } },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', accelerator: 'CmdOrCtrl+R' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow?.webContents.toggleDevTools() },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---- Tray -----------------------------------------------------------------
function buildTray() {
  try {
    let img = nativeImage.createFromPath(ICON)
    if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 })
    tray = new Tray(img)
    tray.setToolTip('AskAI')
    const menu = Menu.buildFromTemplate([
      { label: 'Open AskAI', click: showWindow },
      { label: 'New Chat', click: newChat },
      { type: 'separator' },
      { label: 'Check for Updates…', click: () => checkUpdatesManual() },
      { label: 'Quit', click: () => { quitting = true; app.quit() } },
    ])
    tray.setContextMenu(menu)
    tray.on('click', showWindow)
    tray.on('double-click', showWindow)
  } catch {
    /* tray unavailable — fine */
  }
}

// ---- Auto-update (GitHub Releases) ----------------------------------------
let autoUpdater = null
function checkUpdatesManual() {
  if (autoUpdater) autoUpdater.checkForUpdates().catch(() => {})
}
function setupAutoUpdate() {
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
  ipcMain.handle('desktop:update-install', () => { quitting = true; autoUpdater.quitAndInstall() })
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

  ipcMain.handle('desktop:fs', async (_e, req) => {
    const settings = loadSettings()
    const op = req?.op
    const auto = settings.autoRunFileOps !== false
    try {
      switch (op) {
        case 'list': {
          const dir = resolvePath(req.path)
          const names = await fsp.readdir(dir, { withFileTypes: true })
          return { ok: true, path: dir, entries: names.slice(0, 500).map((d) => ({ name: d.name, dir: d.isDirectory() })) }
        }
        case 'read': {
          const file = resolvePath(req.path)
          const stat = await fsp.stat(file)
          if (stat.size > 256 * 1024) return { ok: false, error: 'File too large to read (>256KB).' }
          return { ok: true, path: file, text: await fsp.readFile(file, 'utf8') }
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
            const okGo = await confirm('AskAI wants to ' + op + ' a file', `${op[0].toUpperCase() + op.slice(1)} this item?`, `${from}\n→ ${to}`)
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
          const okGo = await confirm('AskAI wants to delete an item', 'Move this item to the Recycle Bin?', target)
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
  const withTools = () => sideload.setToolsDir(loadSettings().iosToolsDir || '')
  ipcMain.handle('sideload:tools', () => { withTools(); return sideload.checkTools() })
  ipcMain.handle('sideload:detect', () => { withTools(); return sideload.detectDevice() })
  ipcMain.handle('sideload:latest', () => sideload.checkLatestIpa())
  ipcMain.handle('sideload:pair', () => { withTools(); return sideload.pairDevice() })
  ipcMain.handle('sideload:install', async (e, opts) => {
    withTools()
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
  buildMenu()
  createWindow()
  buildTray()
  setupAutoUpdate()
  // Quick global shortcut to summon AskAI.
  try {
    globalShortcut.register('CommandOrControl+Shift+Space', showWindow)
  } catch {
    /* ignore */
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else showWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
