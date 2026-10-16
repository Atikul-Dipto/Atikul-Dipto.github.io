import { CH_DOOR, CH_FRAME, LIGHT_UP } from '../content/level6'
import { PLAYER_RADIUS } from '../content/floors'

/**
 * The recreation chamber's moving parts, shared by the drawing, the physics
 * and the player without going through the store -- they change every frame.
 */
export const chamber = {
  /** The round door: 0 shut, 1 rolled fully aside. */
  door: 0,
  /** Held by a body in its path. */
  blocked: false,
  /** When the lights began to come on (performance.now()), or null: dark. */
  litAt: null as number | null,
  /** The maze: when the current run started, and the best time this visit. */
  mazeStart: null as number | null,
  mazeLast: null as number | null,
}

const ROLL_SECONDS = 3.2

/** How far the door has rolled, in metres along the wall. Eased at both ends. */
export function doorRoll(t: number) {
  const e = t * t * (3 - 2 * t)
  return e * CH_DOOR.roll
}

/**
 * One step of the door. It will not roll across a body standing in its path
 * through the wall; it waits, and goes on once the way is clear.
 */
export function stepChamberDoor(t: number, open: boolean, dt: number, body: { x: number; z: number } | null) {
  const target = open ? Math.min(1, t + dt / ROLL_SECONDS) : Math.max(0, t - dt / ROLL_SECONDS)
  if (target === t) {
    chamber.blocked = false
    return t
  }
  if (body) {
    const { s, d } = CH_FRAME.from(body.x, body.z)
    const inPlane = Math.abs(d - CH_DOOR.d) < CH_DOOR.half + PLAYER_RADIUS + 0.05
    // The door's leading edge, as it closes, sweeps from the pocket side back
    // across the opening.
    const edge = doorRoll(target) - CH_DOOR.radius
    if (!open && inPlane && s > edge - PLAYER_RADIUS - 0.05) {
      chamber.blocked = true
      return t
    }
  }
  chamber.blocked = false
  return target
}

/** 0 to 1: how far a section's lights have come on, given its order. */
export function sectionLit(index: number, now = performance.now()) {
  if (chamber.litAt === null) return 0
  const t = (now - chamber.litAt) / 1000 - index * 0.42
  return Math.min(1, Math.max(0, t / 0.9))
}

export const chamberFullyLit = (now = performance.now()) =>
  chamber.litAt !== null && (now - chamber.litAt) / 1000 > LIGHT_UP
