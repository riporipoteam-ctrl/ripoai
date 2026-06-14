// Preload — exposes a SMALL, safe desktop API to the AskAI web app running in
// the Electron window. The renderer never gets raw Node/Electron access; it can
// only call these high-level methods, every one of which is policed in main.js.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('askaiDesktop', {
  isAskAIDesktop: true,
  info: () => ipcRenderer.invoke('desktop:info'),
  getSettings: () => ipcRenderer.invoke('desktop:get-settings'),
  setSettings: (s) => ipcRenderer.invoke('desktop:set-settings', s),

  // File operations: { op:'list'|'read'|'mkdir'|'move'|'copy'|'rename'|'write'|'delete'|'trash'|'open'|'reveal', ... }
  fs: (req) => ipcRenderer.invoke('desktop:fs', req),
  // Shell command: { command, cwd? }
  exec: (req) => ipcRenderer.invoke('desktop:exec', req),

  // iOS sideloader (install/update the AskAI iOS app on a USB-connected iPhone).
  sideload: {
    tools: () => ipcRenderer.invoke('sideload:tools'),
    detect: () => ipcRenderer.invoke('sideload:detect'),
    latest: () => ipcRenderer.invoke('sideload:latest'),
    install: (opts) => ipcRenderer.invoke('sideload:install', opts),
    onProgress: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('sideload:progress', handler)
      return () => ipcRenderer.removeListener('sideload:progress', handler)
    },
  },

  // Auto-update.
  checkForUpdate: () => ipcRenderer.invoke('desktop:update-check'),
  installUpdate: () => ipcRenderer.invoke('desktop:update-install'),
  onUpdate: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('desktop:update', handler)
    return () => ipcRenderer.removeListener('desktop:update', handler)
  },
})
