import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/globals.css'
import './styles/glass.css'
import './styles/release-polish.css'
import './styles/composer-float-hotfix.css'
import './styles/redesign.css'
import './styles/native-app.css'
import './styles/ui-upgrades.css'
import './styles/ios-polish.css'
import 'katex/dist/katex.min.css'

// Bump on each deploy so the build hash changes and the version stamp updates.
export const APP_VERSION = 'v9.0.0'
console.log('AskAI', APP_VERSION)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HashRouter>
  </React.StrictMode>,
)
