import './db'

declare module './db' {
  interface UserSettings {
    smartSearch?: boolean
    searchDepth?: 'fast' | 'deep'
    strictImageSearch?: boolean
    designBoost?: boolean
    agentBrowserPreview?: boolean
  }
}
