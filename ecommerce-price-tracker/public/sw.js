// DorAI's service worker. It makes the page installable as an app (and, on
// Android, a target for Share in the Daraz and Cartup apps), and keeps the
// last copy of the page's own files for when the connection drops. Prices
// and answers are never cached here: they come from the agent, live.
const CACHE = 'dorai-page-v1'
const BASE = new URL('./', self.location).pathname // "/price-pulse/"

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return
  // The network first; the last copy when offline. A shared link's page
  // (?url=...) is the same page, so it's stored once, without the query.
  const key = event.request.mode === 'navigate' ? BASE : event.request
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(key, copy))
        }
        return response
      })
      .catch(() => caches.match(key).then((hit) => hit ?? Response.error())),
  )
})
