import { useEffect, useState } from 'react'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Chrome and Edge announce that the page can be installed before any component
// is listening, so the announcement is kept here from the start.
let offer: InstallEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    offer = event as InstallEvent
    listeners.forEach((notify) => notify())
  })
  window.addEventListener('appinstalled', () => {
    offer = null
    listeners.forEach((notify) => notify())
  })
}

export interface Install {
  /** Already running as an installed app. */
  installed: boolean
  /** The browser will show its install prompt when asked. */
  ready: boolean
  /** An iPhone or iPad, where installing is done from Safari's Share menu. */
  ios: boolean
  install(): Promise<void>
}

export function useInstall(): Install {
  const [, bump] = useState(0)
  useEffect(() => {
    const notify = () => bump((n) => n + 1)
    listeners.add(notify)
    return () => void listeners.delete(notify)
  }, [])
  const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return {
    installed,
    ready: offer !== null,
    ios: /iphone|ipad|ipod/i.test(navigator.userAgent),
    install: async () => {
      if (!offer) return
      await offer.prompt()
      await offer.userChoice.catch(() => null)
      offer = null
      bump((n) => n + 1)
    },
  }
}

/** Installable as an app (sw.js, written by the build); not in development, where it would serve stale files. */
export function registerServiceWorker(): void {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  }
}
