import { CH_DOOR, ROOMS6, ROOM_SECTIONS, SECTION_GAP } from '../content/level6'
import { PLAYER_RADIUS } from '../content/floors'

/**
 * The recreation rooms' moving parts, shared by the drawing, the physics and
 * the player without going through the store -- they change every frame.
 * One entry per room, in the order of ROOMS6.
 */
export const chamber = {
  /** Each round door: 0 shut, 1 rolled fully aside. */
  doors: ROOMS6.map(() => 0),
  /** Held by a body in its path. */
  blocked: ROOMS6.map(() => false),
  /** When each room's lights began to come on (performance.now()), or null: dark. */
  litAt: ROOMS6.map(() => null as number | null),
  /** The maze: when the current run started, and the last time taken. */
  mazeStart: null as number | null,
  mazeLast: null as number | null,
}

/** Where the walking body is, for the maze map. */
export const bodyAt = { x: 0, z: 0, yaw: 0 }

const ROLL_SECONDS = 3.2

/** How far a door has rolled, in metres along the wall. Eased at both ends. */
export function doorRoll(t: number) {
  const e = t * t * (3 - 2 * t)
  return e * CH_DOOR.roll
}

/**
 * One step of a door. It will not roll back across a body standing in its
 * path through the wall; it waits, and goes on once the way is clear.
 */
export function stepChamberDoor(k: number, t: number, open: boolean, dt: number, body: { x: number; z: number } | null) {
  const target = open ? Math.min(1, t + dt / ROLL_SECONDS) : Math.max(0, t - dt / ROLL_SECONDS)
  if (target === t) {
    chamber.blocked[k] = false
    return t
  }
  if (body && !open) {
    const { s, d } = ROOMS6[k].frame.from(body.x, body.z)
    const inPlane = Math.abs(d - CH_DOOR.d) < CH_DOOR.half + PLAYER_RADIUS + 0.05
    const edge = doorRoll(target) - CH_DOOR.radius
    if (inPlane && s > edge - PLAYER_RADIUS - 0.05) {
      chamber.blocked[k] = true
      return t
    }
  }
  chamber.blocked[k] = false
  return target
}

/** 0 to 1: how far a section of a room's lights has come on. */
export function sectionLit(k: number, index: number, now = performance.now()) {
  const at = chamber.litAt[k]
  if (at === null) return 0
  const t = (now - at) / 1000 - index * SECTION_GAP
  return Math.min(1, Math.max(0, t / 0.9))
}

/** Seconds a room takes to light fully. */
export const lightUpSeconds = (k: number) => SECTION_GAP * ROOM_SECTIONS[ROOMS6[k].id].length + 1.2
