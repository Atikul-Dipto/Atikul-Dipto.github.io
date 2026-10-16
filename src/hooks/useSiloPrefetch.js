import { useCallback, useEffect } from 'react'

// The silo build writes the list of files a first visit needs
// (silo/vite.config.ts). Fetching them early means the click through lands
// on a warm cache instead of a cold download.
const LIST = '/silo/prefetch.json'

let started = false
let laterStarted = false
let list = null

function slowConnection() {
  const c = navigator.connection
  return !!c && (c.saveData || /(^|-)2g$|^3g$/.test(c.effectiveType || ''))
}

function prefetch(urls) {
  for (const href of urls) {
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.href = href
    // Module scripts are fetched in CORS mode; match it so the cached copy
    // is the one the silo uses.
    if (href.endsWith('.js')) link.crossOrigin = 'anonymous'
    document.head.appendChild(link)
  }
}

function loadList() {
  list ??= fetch(LIST)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  return list
}

/** The scene and everything under it -- what the loading screen waits for. */
function prefetchFirst() {
  if (started) return
  started = true
  loadList().then((l) => l && prefetch(l.first))
}

/** Plus the walking physics, needed once the visitor presses Enter. */
function prefetchAll() {
  prefetchFirst()
  if (laterStarted) return
  laterStarted = true
  loadList().then((l) => l && prefetch(l.later))
}

/**
 * Warms the silo for the link it is attached to: everything on hover, focus
 * or touch -- a click is likely -- and the first part anyway once the page has
 * settled, unless the connection is slow or the visitor has asked to save
 * data.
 */
export function useSiloPrefetch() {
  useEffect(() => {
    if (slowConnection()) return
    const idle = window.requestIdleCallback ?? ((f) => window.setTimeout(f, 1))
    let handle = 0
    const id = window.setTimeout(() => {
      handle = idle(prefetchFirst, { timeout: 4000 })
    }, 3000)
    return () => {
      window.clearTimeout(id)
      window.cancelIdleCallback?.(handle)
    }
  }, [])

  const intent = useCallback(() => {
    if (!navigator.connection?.saveData) prefetchAll()
  }, [])

  return { onPointerEnter: intent, onFocus: intent, onTouchStart: intent }
}
