/**
 * Keyboard and pointer-lock state for first-person walking.
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
  /** Accumulated mouse delta since the last frame read, in radians. */
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
  yaw: 0,
  pitch: 0,
  locked: false,
}

/** Radians per pixel of mouse movement. */
const LOOK_SENS = 0.0022

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

/** Clear every held key. Called whenever the lock drops, so releasing the
 *  pointer cannot leave the body walking into a wall forever. */
export function releaseKeys() {
  move.forward = false
  move.back = false
  move.left = false
  move.right = false
  move.sprint = false
  move.yaw = 0
  move.pitch = 0
}

type Listener = (locked: boolean) => void

/**
 * Attach the walking controls to a canvas. Returns a teardown.
 *
 * `onLockChange` lets the UI follow the browser rather than guess: the overlay
 * that says "click to look around" has to reappear the instant the lock is
 * lost, including when the visitor presses Escape, which never reaches us as a
 * keydown.
 */
export function attachWalkInput(
  canvas: HTMLCanvasElement,
  onLockChange: Listener,
): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
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
    move.yaw -= e.movementX * LOOK_SENS
    move.pitch -= e.movementY * LOOK_SENS
  }

  const onClick = () => {
    if (!move.locked) canvas.requestPointerLock()
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

  canvas.addEventListener('click', onClick)
  document.addEventListener('pointerlockchange', onLock)
  document.addEventListener('pointerlockerror', onLockError)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mousemove', onMouseMove)
  // Losing focus mid-stride leaves keys stuck down.
  window.addEventListener('blur', releaseKeys)

  return () => {
    canvas.removeEventListener('click', onClick)
    document.removeEventListener('pointerlockchange', onLock)
    document.removeEventListener('pointerlockerror', onLockError)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('blur', releaseKeys)
    releaseKeys()
    if (document.pointerLockElement === canvas) document.exitPointerLock()
  }
}
