import type { PointerEvent as ReactPointerEvent } from 'react'

// Dragging, written for this app rather than taken from a library: the page
// is shown scaled, blocks are of very different heights, and they glide when
// they move. The general-purpose libraries assume none of that.
//
// A drag has a group ("section", or the entries of one section). Anywhere a
// block of that group may land is a zone (data-zone-group, data-zone); the
// blocks in it are marked data-drop / data-drop-id. While a block is in the
// air it takes up almost no room where it stood, so the others close up, and
// where it would land is simply "after however many blocks have their middle
// above the pointer". Nothing moves under the pointer as a result of that
// answer, which is what keeps it from flickering.

export interface Landing {
  zone: string
  index: number
}

export interface DragSpec {
  id: string
  group: string
  /** What the chip that follows the pointer says. */
  label: string
  onStart(): void
  /** The landing place changed (null: over nowhere that takes it). */
  onMove(landing: Landing | null): void
  onEnd(landing: Landing | null, cancelled: boolean): void
}

const EDGE = 70

/** Where an element sits in its page, ignoring any glide it is in the middle of. */
function settledRect(el: HTMLElement): { top: number; bottom: number; left: number; right: number } {
  const root = el.closest<HTMLElement>('[data-drag-root]')
  if (!root) return el.getBoundingClientRect()
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== root) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  if (node !== root) return el.getBoundingClientRect()
  const box = root.getBoundingClientRect()
  const scale = box.width / root.offsetWidth || 1
  const left = box.left + (x - root.scrollLeft) * scale
  const top = box.top + (y - root.scrollTop) * scale
  return { left, top, right: left + el.offsetWidth * scale, bottom: top + el.offsetHeight * scale }
}

function landingAt(spec: DragSpec, x: number, y: number): Landing | null {
  let best: HTMLElement | null = null
  let bestDistance = 90
  for (const zone of document.querySelectorAll<HTMLElement>(`[data-zone-group="${CSS.escape(spec.group)}"]`)) {
    const r = zone.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    const distance = Math.hypot(dx, dy)
    if (distance < bestDistance) [best, bestDistance] = [zone, distance]
  }
  if (!best) return null
  const zone = best
  let index = 0
  for (const item of zone.querySelectorAll<HTMLElement>(`[data-drop="${CSS.escape(spec.group)}"]`)) {
    if (item.dataset.dropId === spec.id || item.closest(`[data-zone-group="${CSS.escape(spec.group)}"]`) !== zone) continue
    const r = settledRect(item)
    if ((r.top + r.bottom) / 2 < y) index++
  }
  return { zone: zone.dataset.zone ?? '', index }
}

const same = (a: Landing | null, b: Landing | null) => a?.zone === b?.zone && a?.index === b?.index

/** Starts a drag from a press on a grip. Nothing happens until the pointer has moved a little. */
export function startDrag(event: ReactPointerEvent<HTMLElement>, spec: DragSpec): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  event.preventDefault()
  const pointerId = event.pointerId
  const startX = event.clientX
  const startY = event.clientY
  let x = startX
  let y = startY
  let active = false
  let landing: Landing | null = null
  let frame = 0
  let chip: HTMLElement | null = null

  const scrollers = () => [...document.querySelectorAll<HTMLElement>('[data-drag-scroll]')]

  const tick = () => {
    frame = 0
    if (!active) return
    // Near the top or bottom of a scrolling area, scroll it.
    for (const scroller of scrollers()) {
      const r = scroller.getBoundingClientRect()
      if (x < r.left || x > r.right) continue
      const up = r.top + EDGE - y
      const down = y - (r.bottom - EDGE)
      if (up > 0 && y > r.top - 40) scroller.scrollTop -= Math.min(22, up * 0.3)
      else if (down > 0 && y < r.bottom + 40) scroller.scrollTop += Math.min(22, down * 0.3)
      else continue
      frame = requestAnimationFrame(tick)
    }
    const next = landingAt(spec, x, y)
    if (!same(next, landing)) {
      landing = next
      spec.onMove(landing)
    }
  }

  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    x = e.clientX
    y = e.clientY
    if (!active) {
      if (Math.hypot(x - startX, y - startY) < 5) return
      active = true
      chip = document.createElement('div')
      chip.className = 'drag-chip'
      chip.textContent = spec.label
      document.body.appendChild(chip)
      document.body.classList.add('is-dragging')
      spec.onStart()
    }
    if (chip) chip.style.transform = `translate(${x + 14}px, ${y + 10}px)`
    if (!frame) frame = requestAnimationFrame(tick)
  }

  const finish = (cancelled: boolean) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key, true)
    if (frame) cancelAnimationFrame(frame)
    chip?.remove()
    document.body.classList.remove('is-dragging')
    if (active) spec.onEnd(cancelled ? null : landing, cancelled)
    active = false
  }
  const up = (e: PointerEvent) => {
    if (e.pointerId === pointerId) finish(false)
  }
  const cancel = (e: PointerEvent) => {
    if (e.pointerId === pointerId) finish(true)
  }
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      finish(true)
    }
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key, true)
}
