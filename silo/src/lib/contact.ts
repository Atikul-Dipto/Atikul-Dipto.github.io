import type { ContactPlate } from '../content/level12'
import { contactBlip } from './audio'
import { useSilo } from '../state/useSilo'

/** The last plate or website used, for tests: a headless browser cannot
 *  follow a link. */
export const contactLog = { last: null as string | null, at: 0 }

/**
 * Use a contact plate: an email or a call opens the visitor's own app, a
 * link opens in a new tab. The pointer is let go first, so the new tab or
 * app is not fighting a locked mouse.
 */
export function openContact(plate: ContactPlate) {
  contactLog.last = plate.id
  contactLog.at = performance.now()
  contactBlip()
  if (document.pointerLockElement) document.exitPointerLock()
  const external = plate.href.startsWith('http')
  if (external) window.open(plate.href, '_blank', 'noopener')
  else {
    const a = document.createElement('a')
    a.href = plate.href
    a.rel = 'noopener'
    a.click()
  }
  const s = useSilo.getState()
  s.setHudNote(external ? `Opening ${plate.label} in a new tab` : `Opening ${plate.label}: ${plate.value}`)
  window.setTimeout(() => {
    if (useSilo.getState().hudNote?.startsWith('Opening')) useSilo.getState().setHudNote(null)
  }, 3500)
}

/** Visit a company's website from its careers room, in a new tab. */
export function openSite(host: string, href: string) {
  contactLog.last = `site:${host}`
  contactLog.at = performance.now()
  contactBlip()
  if (document.pointerLockElement) document.exitPointerLock()
  window.open(href, '_blank', 'noopener')
  useSilo.getState().setHudNote(`Opening ${host} in a new tab`)
  window.setTimeout(() => {
    if (useSilo.getState().hudNote?.startsWith('Opening')) useSilo.getState().setHudNote(null)
  }, 3500)
}
