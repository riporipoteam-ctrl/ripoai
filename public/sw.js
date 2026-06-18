// AskAI service worker — NETWORK-FIRST so the installed PWA / browser always
// gets the latest deploy (no more stale cached versions), with a cache fallback
// only when offline.
const CACHE = 'askai-runtime-v4'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop old caches, then take control of open pages immediately.
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Only handle our own origin — let API calls (Groq, NVIDIA worker, fonts, etc.)
  // go straight to the network untouched.
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(req, req.mode === 'navigate' ? { cache: 'no-store' } : undefined)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        }
        return res
      })
      .catch(async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        // SPA fallback for navigations when offline.
        if (req.mode === 'navigate') {
          const idx = await caches.match('./index.html')
          if (idx) return idx
        }
        throw new Error('offline')
      }),
  )
})
