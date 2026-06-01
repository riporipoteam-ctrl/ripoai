import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'
import './styles/glass.css'
import 'katex/dist/katex.min.css'

// Bump on each deploy so the build hash changes and the version stamp updates.
export const APP_VERSION = 'v1.4.0'
console.log('RipoAI', APP_VERSION)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
