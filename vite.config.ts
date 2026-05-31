import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the app from /ripoai/ (the repo name).
// Local dev uses '/'. The base only matters for the production build.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/ripoai/' : '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
}))
