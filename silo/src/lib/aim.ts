/**
 * The aim range on the recreation level: a thirty-second round of targets
 * that come up past the rail and drop again if not hit in time.
 *
 * The state lives here, outside the store, because it changes every frame;
 * the room (three/floors/Level06.tsx) draws the targets and fires the shots,
 * the HUD reads the score.
 */

export const ROUND_SECONDS = 30
/** How long a target stays up before it drops unhit. */
const TARGET_LIFE = 2.2
/** Up to this many at once. */
const MAX_UP = 3
/** A target's radius, for the hit test. */
export const TARGET_R = 0.36
const BEST_KEY = 'silo.aim.best'

export interface Target {
  id: number
  x: number
  y: number
  z: number
  /** When it came up, and when it was hit (or null). Seconds, round time. */
  born: number
  hitAt: number | null
}

export const aim = {
  active: false,
  /** Seconds since the round started. */
  t: 0,
  countdown: 0,
  hits: 0,
  shots: 0,
  score: 0,
  targets: [] as Target[],
  /** The last round's result, shown after it ends. */
  last: null as { score: number; hits: number; shots: number } | null,
  /** When the last round ended (performance.now()), for how long it shows. */
  lastAt: 0,
  nextId: 1,
  /** Bumped on every change the HUD shows. */
  version: 0,
}

export function readAimBest(): number | null {
  try {
    const v = Number(localStorage.getItem(BEST_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

/** Begin a round, after a three-second count. */
export function startAim() {
  if (aim.active) return
  aim.active = true
  aim.countdown = 3
  aim.t = 0
  aim.hits = 0
  aim.shots = 0
  aim.score = 0
  aim.targets = []
  aim.last = null
  aim.version++
}

export function stopAim() {
  if (!aim.active) return
  aim.active = false
  aim.last = { score: aim.score, hits: aim.hits, shots: aim.shots }
  aim.lastAt = performance.now()
  aim.targets = []
  const best = readAimBest()
  if (best === null || aim.score > best) {
    try {
      localStorage.setItem(BEST_KEY, String(aim.score))
    } catch {
      // Storage blocked; the score still shows.
    }
  }
  aim.version++
}

/**
 * Advance the round. `spawn` returns a fresh target position in the field.
 * Returns the targets that dropped unhit this step, for a sound.
 */
export function stepAim(dt: number, spawn: () => { x: number; y: number; z: number }) {
  if (!aim.active) return 0
  if (aim.countdown > 0) {
    const before = Math.ceil(aim.countdown)
    aim.countdown = Math.max(0, aim.countdown - dt)
    if (Math.ceil(aim.countdown) !== before) aim.version++
    return 0
  }
  aim.t += dt
  let dropped = 0
  aim.targets = aim.targets.filter((tg) => {
    if (tg.hitAt !== null) return aim.t - tg.hitAt < 0.35
    if (aim.t - tg.born > TARGET_LIFE) {
      dropped++
      return false
    }
    return true
  })
  const up = aim.targets.filter((tg) => tg.hitAt === null).length
  // Faster as the round goes on.
  const wanted = Math.min(MAX_UP, 1 + Math.floor(aim.t / 10))
  if (up < wanted) aim.targets.push({ id: aim.nextId++, ...spawn(), born: aim.t, hitAt: null })
  if (aim.t >= ROUND_SECONDS) stopAim()
  else if (Math.floor(aim.t) !== Math.floor(aim.t - dt)) aim.version++
  return dropped
}

/**
 * A shot along a ray. Returns the target hit, if any: the nearest one the ray
 * passes within TARGET_R of. A quick hit scores more.
 */
export function fireAim(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): Target | null {
  if (!aim.active || aim.countdown > 0) return null
  aim.shots++
  let best: Target | null = null
  let bestT = Infinity
  for (const tg of aim.targets) {
    if (tg.hitAt !== null) continue
    const px = tg.x - ox
    const py = tg.y - oy
    const pz = tg.z - oz
    const along = px * dx + py * dy + pz * dz
    if (along <= 0) continue
    const miss = Math.hypot(px - dx * along, py - dy * along, pz - dz * along)
    if (miss < TARGET_R && along < bestT) {
      best = tg
      bestT = along
    }
  }
  if (best) {
    best.hitAt = aim.t
    aim.hits++
    const age = aim.t - best.born
    aim.score += Math.round(100 + 150 * Math.max(0, 1 - age / TARGET_LIFE))
  }
  aim.version++
  return best
}

export const aimAccuracy = (hits: number, shots: number) => (shots ? Math.round((hits / shots) * 100) : 0)

/**
 * The trigger: a shot is asked for here -- by a click while the pointer is
 * held, or the HUD's fire button on a touch screen -- and taken by the range
 * on its next frame, along the camera's line of sight.
 */
export const aimFire = { request: false }
