// CV Morph's service worker. It makes the page installable as an app and
// keeps what the app is made of, so it opens and works without a connection.
// Nothing of a CV passes through here: files are read in the page itself.
//
// vite.config.ts fills in the three placeholders when it writes sw.js.
const BUILD = '__BUILD__'
const SHELL = '__SHELL__' // the app's own scripts and styles
const KEEP = '__KEEP__' // folders whose file names change when their content does

const BASE = new URL('./', self.location).pathname // "/cv-morph/"
const APP = `cv-morph-app-${BUILD}` // replaced by each new build
const KEPT = 'cv-morph-kept-v1' // the OCR engine and CV typefaces: fetched once, kept

self.addEventListener('install', (event) => {
  // One file failing must not stop the rest: whatever is missing is fetched,
  // and kept, the first time the page asks for it.
  event.waitUntil(
    caches
      .open(APP)
      .then((cache) => Promise.all([BASE, ...SHELL.map((file) => BASE + file)].map((url) => cache.add(url).catch(() => {})))),
  )
})

// No skipWaiting: a page that is open keeps the worker, and the scripts, it
// started with. The next build takes over the next time the app is opened.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('cv-morph-') && key !== APP && key !== KEPT).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return
  const path = url.pathname.slice(BASE.length)

  // Named by their content: the first copy is the only copy there will be.
  if (KEEP.some((folder) => path.startsWith(folder))) {
    const store = /\.(js|mjs|css)$/.test(path) && path.startsWith('assets/') ? APP : KEPT
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(store).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
    return
  }

  // The page and its loose files (icons, the manifest): the network first, so
  // an update shows on the next visit; the last copy when offline.
  const key = request.mode === 'navigate' ? BASE : request
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(APP).then((cache) => cache.put(key, copy))
        }
        return response
      })
      .catch(() => caches.match(key).then((hit) => hit ?? Response.error())),
  )
})
