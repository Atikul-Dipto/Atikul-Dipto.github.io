/**
 * Keyboard, mouse and touch state for first-person walking.
 *
 * Deliberately a plain mutable object read by the frame loop rather than React
 * state: movement is sampled every frame, and routing it through re-renders
 * would re-render the whole scene sixty times a second for a boolean.
 *
 * Pointer lock is the browser's own API, so it is the browser that decides
 * when it ends -- Escape, tab switch, a dropped canvas. Everything here treats
 * the `pointerlockchange` event as the source of truth rather than tracking it
 * independently and drifting.
 */

export interface MoveState {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  sprint: boolean
  /** Set on the frame E is pressed, and cleared by whoever consumes it. The
   *  interact key is edge-triggered, not held: holding E must not re-open a
   *  panel sixty times a second. */
  interact: boolean
  /** Analog stick, -1..1, from touch. Added to the keys, not instead of them. */
  axisX: number
  axisY: number
  /** Accumulated look since the last frame read, in radians. */
  yaw: number
  pitch: number
  locked: boolean
}

export const move: MoveState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  sprint: false,
  interact: false,
  axisX: 0,
  axisY: 0,
  yaw: 0,
  pitch: 0,
  locked: false,
}

/** Radians per pixel of mouse movement. It was 0.0022, which visitors found
 *  far too quick. */
const LOOK_SENS = 0.0014
/** Radians per pixel of touch drag: thumbs move further than mice. */
const TOUCH_LOOK = 0.0034
/** Some browsers report a huge jump now and then while the pointer is held;
 *  more than this in one event is clipped, not taken as a whip round. */
const MAX_STEP = 90
/** Pixels of thumb travel for full stick. */
const STICK_RANGE = 56

export const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true

const CODES: Record<string, keyof MoveState> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
}

/**
 * Whether the keys belong to something else just now -- a panel open over
 * the walk, a game in the arcade, the drone. The walk ignores them meanwhile.
 * Set by the player, which knows what is open.
 */
export const inputGate = { blocked: () => false }

/** Clear every held key. Called whenever the lock drops, so releasing the
 *  pointer cannot leave the body walking into a wall forever. */
export function releaseKeys() {
  move.forward = false
  move.back = false
  move.left = false
  move.right = false
  move.sprint = false
  move.interact = false
  move.axisX = 0
  move.axisY = 0
  move.yaw = 0
  move.pitch = 0
}

/** Live stick position, for drawing the on-screen thumb ring. */
export const stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 }

type Listener = (locked: boolean) => void

/**
 * Attach the walking controls to a canvas. Returns a teardown.
 *
 * `onLockChange` lets the UI follow the browser rather than guess: the overlay
 * that says "click to look around" has to reappear the instant the lock is
 * lost, including when the visitor presses Escape, which never reaches us as a
 * keydown.
 */
export function attachWalkInput(canvas: HTMLCanvasElement, onLockChange: Listener): () => void {
  const typing = (e: KeyboardEvent) =>
    e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)

  const onKeyDown = (e: KeyboardEvent) => {
    if (typing(e) || inputGate.blocked()) return
    if (e.code === 'KeyE') {
      if (!e.repeat) move.interact = true
      return
    }
    const field = CODES[e.code]
    if (!field) return
    ;(move[field] as boolean) = true
    // Arrow keys scroll the page otherwise, which fights the pointer lock.
    if (e.code.startsWith('Arrow')) e.preventDefault()
  }

  const onKeyUp = (e: KeyboardEvent) => {
    const field = CODES[e.code]
    if (field) (move[field] as boolean) = false
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!move.locked) return
    const clip = (v: number) => Math.max(-MAX_STEP, Math.min(MAX_STEP, v))
    move.yaw -= clip(e.movementX) * LOOK_SENS
    move.pitch -= clip(e.movementY) * LOOK_SENS
  }

  /**
   * Take the pointer on a click.
   *
   * Listening on the canvas is the obvious thing and it does not work: the
   * "click to look around" prompt sits above the canvas, so the click it asks
   * for lands on the prompt and the canvas listener never fires. So listen at
   * the document and decide from where the click landed. Only the canvas and
   * the prompt grab the pointer; controls and HTML panels keep their clicks.
   */
  const onClick = (e: MouseEvent) => {
    if (move.locked || isTouchDevice()) return
    const target = e.target as HTMLElement | null
    if (!target) return
    if (target.closest('button, a, input, textarea, select, label, [role="button"], .panel, .directory, .cv')) return
    if (target === canvas || target.closest('.walk-prompt')) {
      // Newer browsers return a promise and reject it when they refuse (too
      // soon after the last release, for one). pointerlockerror already
      // handles the refusal; an unhandled rejection on top is just noise.
      // Some refuse by throwing instead, synchronously.
      try {
        const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined
        p?.catch?.(() => {})
      } catch {
        /* pointerlockerror reports it */
      }
    }
  }

  const onLock = () => {
    move.locked = document.pointerLockElement === canvas
    if (!move.locked) releaseKeys()
    onLockChange(move.locked)
  }

  // A failed lock request (too soon after the last exit, for instance) leaves
  // the UI claiming to be locked unless this is handled.
  const onLockError = () => {
    move.locked = false
    releaseKeys()
    onLockChange(false)
  }

  // ---- touch: left thumb walks, right thumb looks ------------------------
  const touches = new Map<number, { kind: 'stick' | 'look'; x: number; y: number }>()
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || e.target !== canvas) return
    const kind = e.clientX < window.innerWidth * 0.45 ? 'stick' : 'look'
    if (kind === 'stick' && [...touches.values()].some((t) => t.kind === 'stick')) return
    touches.set(e.pointerId, { kind, x: e.clientX, y: e.clientY })
    if (kind === 'stick') {
      stick.active = true
      stick.ox = stick.x = e.clientX
      stick.oy = stick.y = e.clientY
    }
  }
  const onPointerMove = (e: PointerEvent) => {
    const t = touches.get(e.pointerId)
    if (!t) return
    if (t.kind === 'look') {
      move.yaw -= (e.clientX - t.x) * TOUCH_LOOK
      move.pitch -= (e.clientY - t.y) * TOUCH_LOOK
      t.x = e.clientX
      t.y = e.clientY
      return
    }
    const dx = e.clientX - stick.ox
    const dy = e.clientY - stick.oy
    const len = Math.hypot(dx, dy)
    const k = len > STICK_RANGE ? STICK_RANGE / len : 1
    stick.x = stick.ox + dx * k
    stick.y = stick.oy + dy * k
    move.axisX = (dx * k) / STICK_RANGE
    move.axisY = (-dy * k) / STICK_RANGE
    // Pushed right to the edge of the ring is a run.
    move.sprint = len > STICK_RANGE * 1.15
  }
  const onPointerUp = (e: PointerEvent) => {
    const t = touches.get(e.pointerId)
    if (!t) return
    touches.delete(e.pointerId)
    if (t.kind === 'stick') {
      stick.active = false
      move.axisX = 0
      move.axisY = 0
      move.sprint = false
    }
  }

  document.addEventListener('click', onClick)
  document.addEventListener('pointerlockchange', onLock)
  document.addEventListener('pointerlockerror', onLockError)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('pointerdown', onPointerDown, { passive: true })
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', onPointerUp, { passive: true })
  window.addEventListener('pointercancel', onPointerUp, { passive: true })
  // Losing focus mid-stride leaves keys stuck down.
  window.addEventListener('blur', releaseKeys)

  return () => {
    document.removeEventListener('click', onClick)
    document.removeEventListener('pointerlockchange', onLock)
    document.removeEventListener('pointerlockerror', onLockError)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    window.removeEventListener('blur', releaseKeys)
    releaseKeys()
    if (document.pointerLockElement === canvas) document.exitPointerLock()
  }
}
