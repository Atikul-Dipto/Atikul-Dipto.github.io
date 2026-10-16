import { DECK_INNER, LEVEL_COUNT, ROOM_HEIGHT, SHAFT_RADIUS, contentAngle, levelY, walkY } from './floors'
import { MAZE_FROM, MAZE_TO } from './level6'
import { BRIDGE_WIDTH, STAIR_OUTER } from './stairs'

/**
 * The drone: where it waits, where it may fly, and the race course.
 *
 * It flies in the silo itself. Straight up and down only in the open void
 * between the stair and the decks; out over a deck only between that deck
 * and the one above it, and only as far as the promenade -- the rooms and the
 * maze beyond are no place for propellers. Collision is worked out from these
 * rules rather than from the physics world, which only holds the three decks
 * nearest the visitor's body.
 */

export const DRONE = {
  /** Seconds of battery. */
  battery: 60,
  /** Top speeds, metres a second, across and up/down. */
  speed: 9,
  climb: 5,
  /** The airframe's radius, for collision. */
  radius: 0.35,
}

/** The pad on level 6, on the promenade just short of the maze. */
export const PAD = { angle: MAZE_FROM - 0.14, r: 9.6, level: 6 }
export const padPoint = () => {
  const [x, z] = [Math.cos(PAD.angle) * PAD.r, Math.sin(PAD.angle) * PAD.r]
  return { x, y: walkY(PAD.level) + 1.1, z }
}

/** Solid core: the lift shaft and the stair coiled round it. */
export const CORE_R = STAIR_OUTER + DRONE.radius + 0.1
/** How far out the drone may go over a deck: the promenade, not the rooms. */
export const OVER_DECK_R = 12.6
/** Over the maze on level 6, it may not come down among the hedges. */
const MAZE_PAD = 0.12
export const WATER_LINE = walkY(LEVEL_COUNT) - 5 + 0.45
export const CEILING = levelY(1) + 3.5

/** The band of air above level L's deck and under the next one up. */
const band = (L: number) => ({ lo: walkY(L) + 0.35, hi: walkY(L) + ROOM_HEIGHT - 0.45 })

/** The level whose air band a height falls in, or null between slabs. */
export function bandAt(y: number) {
  for (let L = 1; L <= LEVEL_COUNT; L++) {
    const b = band(L)
    if (y >= b.lo && y <= b.hi) return L
  }
  return null
}

/**
 * Keep a point in the air the drone may use. Returns the corrected point and
 * whether it was pushed: a bump.
 */
export function constrain(x: number, y: number, z: number, prevY: number) {
  let hit = false
  let r = Math.hypot(x, z)
  const a = Math.atan2(z, x)
  // The core.
  if (r < CORE_R) {
    r = CORE_R
    hit = true
  }
  // Top and bottom of the shaft.
  if (y > CEILING) {
    y = CEILING
    hit = true
  }
  if (y < WATER_LINE) {
    y = WATER_LINE
    hit = true
  }
  // Out over a deck: only inside a level's band of air, and not too far out.
  const overDeck = r > DECK_INNER - DRONE.radius
  if (overDeck) {
    let L = bandAt(y)
    if (L === null) {
      // Between slabs. If it came from inside a band, hold it at that band's
      // edge; otherwise send it back over the void.
      const from = bandAt(prevY)
      if (from !== null) {
        const b = band(from)
        y = y > b.hi ? b.hi : b.lo
        L = from
      } else r = DECK_INNER - DRONE.radius - 0.02
      hit = true
    }
    let maxR = OVER_DECK_R
    let ang = a
    while (ang < MAZE_FROM - Math.PI) ang += Math.PI * 2
    while (ang > MAZE_FROM + Math.PI) ang -= Math.PI * 2
    if (L === 6 && ang > MAZE_FROM - MAZE_PAD && ang < MAZE_TO + MAZE_PAD && y < walkY(6) + 2.9) maxR = 10.2
    if (L !== null && r > maxR) {
      r = maxR
      hit = true
    }
  }
  // The bridges across the void, one a level: a plate and two parapets.
  // Only over the void: where the bridge meets the deck, the deck's own rule
  // has already kept it in the air.
  if (r < DECK_INNER - DRONE.radius) {
    for (let L = 1; L <= LEVEL_COUNT; L++) {
      const lo = walkY(L) - 0.45
      const hi = walkY(L) + 1.35
      if (y < lo || y > hi) continue
      const off = Math.abs(((a - contentAngle(L) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * r
      if (off > BRIDGE_WIDTH / 2 + DRONE.radius) continue
      y = prevY >= (lo + hi) / 2 ? hi : lo
      hit = true
    }
  }
  if (r > SHAFT_RADIUS - 1) {
    r = SHAFT_RADIUS - 1
    hit = true
  }
  return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, hit }
}

/**
 * The race: twelve gates spiralling down the void from level 6, round the
 * stair, to level 10. The ring of open air is three metres wide, so the
 * gates fill most of it -- the challenge is the turn and the drop.
 */
export const GATE_R = 1.2
const COURSE_R = (CORE_R + DECK_INNER - 0.2) / 2
export interface Gate {
  x: number
  y: number
  z: number
  /** Unit direction the drone should pass through it. */
  nx: number
  nz: number
}
export const GATES: Gate[] = Array.from({ length: 12 }, (_, k) => {
  const a = PAD.angle - 0.55 - k * 0.78
  const y = walkY(6) + 2.2 - k * 3.8
  // Travelling round the shaft in the direction of decreasing angle.
  return { x: Math.cos(a) * COURSE_R, y, z: Math.sin(a) * COURSE_R, nx: Math.sin(a), nz: -Math.cos(a) }
})
