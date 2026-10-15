import { BAYS, SHAFT_RADIUS, SLOT, contentAngle, inCut } from './floors'
import { CONSOLE_ANGLE, PORTRAIT_ANGLE, inLevel1Room } from './level1'

/**
 * Where the repeating wall furniture goes on each level -- ribs, lamps, the
 * radial framing -- in one place, because two things need to know: the
 * drawing, and the collision. A rib is 0.6 m deep; if only the drawing knew
 * where the ribs were, a body could walk through every one of them.
 *
 * Lives apart from floors.ts because it needs the level 1 plan, and the plan
 * itself is built on floors.ts.
 */

/** Wall angles taken by fit-out on a level, which nothing repeating may cover. */
function reserved(level: number): number[] {
  if (level === 1) return [PORTRAIT_ANGLE, CONSOLE_ANGLE]
  const base = contentAngle(level)
  return Object.values(SLOT).map((off) => base + off)
}

const angDist = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)

/** True where the wall at `a` is free for repeating furniture. */
export function wallFree(level: number, a: number, slotPad: number, cutPad = 0.08) {
  if (inCut(a, cutPad)) return false
  if (reserved(level).some((b) => angDist(a, b) < slotPad)) return false
  if (level === 1 && inLevel1Room(a, 0.05)) return false
  return true
}

function around(level: number, count: number, phase = 0) {
  const base = contentAngle(level)
  return Array.from({ length: count }, (_, i) => base + ((i + phase) / count) * Math.PI * 2)
}

export const RIB = { w: 0.8, d: 0.6, r: SHAFT_RADIUS - 0.32 }
export const RIBS_PER_FLOOR = 22
export const ribAngles = (level: number) =>
  around(level, RIBS_PER_FLOOR).filter((a) => wallFree(level, a, 0.14))

export const LAMPS_PER_FLOOR = 12
export const lampAngles = (level: number) =>
  around(level, LAMPS_PER_FLOOR, 0.5).filter((a) => wallFree(level, a, 0.12, 0.06))

export const bayAngles = (level: number) =>
  around(level, BAYS, 0.5).filter((a) => wallFree(level, a, 0.12, 0.06))
