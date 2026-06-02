import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path: GitHub Pages serves under /ripoai/, Netlify/custom domains serve
// at root. Override with VITE_BASE (Netlify sets VITE_BASE="/").
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE || (command === 'build' ? '/ripoai/' : '/'),
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
}))
