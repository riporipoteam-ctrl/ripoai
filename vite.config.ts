import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path: canonical Firebase Hosting serves at root; the GitHub Pages
// secondary mirror serves under /ripoai/. Override with VITE_BASE="/" for
// root-hosted builds such as Firebase Hosting.
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
