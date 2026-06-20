import './db'
import type { AgentBrowserState } from './agentBrowser'

declare module './db' {
  interface StoredMessage {
    agentBrowser?: AgentBrowserState
  }

  interface UserSettings {
    smartSearch?: boolean
    searchDepth?: 'fast' | 'deep'
    strictImageSearch?: boolean
    designBoost?: boolean
    agentBrowserPreview?: boolean
  }
}
