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
  build: {
    rollupOptions: {
      output: {
        // Split big, rarely-changing vendors into their own cached chunks so the
        // app shell loads + parses faster on the phone (and updates re-download
        // only what actually changed).
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          markdown: ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex', 'katex'],
          motion: ['framer-motion'],
        },
      },
    },
  },
}))
