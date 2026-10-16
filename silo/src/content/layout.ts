import { CLAD_JOINT, SHAFT_RADIUS, WALL_START, contentAngle, inCut, walkY } from './floors'
import { ROOMS6 } from './level6'
import { CX_FRAME, RX_FRAME } from './level12'
import { CONSOLE_ANGLE, FLOOR, PORTRAIT_ANGLE, inCreed, inLevel1Room, tangential, type Box } from './level1'

/**
 * Where the repeating wall furniture goes on each level -- ribs, lamps, the
 * radial framing -- in one place, because two things need to know: the
 * drawing, and the collision. A rib is 0.6 m deep; if only the drawing knew
 * where the ribs were, a body could walk through every one of them.
 *
 * Lives apart from floors.ts because it needs the level 1 plan, and the plan
 * itself is built on floors.ts.
 */

/**
 * Wall angles taken by fit-out on a level, which nothing repeating may cover.
 * Levels 2-12 have only their record display, which `wallFree` handles.
 */
function reserved(level: number): number[] {
  if (level === 1) return [PORTRAIT_ANGLE, CONSOLE_ANGLE]
  // The chamber's round door, in the wall at the back of the maze.
  if (level === 6) return ROOMS6.map((r) => r.frame.angle)
  // The reactor's and the communications room's openings.
  if (level === 12) return [RX_FRAME.angle, CX_FRAME.angle]
  return []
}

const angDist = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)

/**
 * The record display on levels 2-12: a curved glass display centred on the
 * level's content angle, so the bridge lands facing it. Same section as the
 * creed wall on level 1 -- glass from `plinth` to `top`, its face at `r`.
 */
export const RECORD_WALL = { half: 0.3, r: SHAFT_RADIUS - 0.25, plinth: 0.8, top: 5.4 }
export const recordWallSpan = (level: number) => {
  const a = contentAngle(level)
  return { from: a - RECORD_WALL.half, to: a + RECORD_WALL.half }
}

/** A wall display's housing as boxes along its arc, for the physics. */
export function displaySolids(from: number, to: number, floorY: number, r: number, top: number): Box[] {
  const out: Box[] = []
  const a0 = from - 0.016
  const a1 = to + 0.016
  const n = 12
  const r0 = r - 0.3
  const r1 = SHAFT_RADIUS - 0.05
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / n
    // Chord long enough to overlap its neighbours.
    const w = ((a1 - a0) / n) * r0 + 0.04
    out.push(tangential(a, (r0 + r1) / 2, w, top + 0.3, r1 - r0, floorY - FLOOR))
  }
  return out
}

export const recordWallSolids = (level: number) => {
  const { from, to } = recordWallSpan(level)
  return displaySolids(from, to, walkY(level), RECORD_WALL.r, RECORD_WALL.top)
}

/** True where the wall at `a` is free for repeating furniture. */
export function wallFree(level: number, a: number, slotPad: number, cutPad = 0.08) {
  if (inCut(a, cutPad)) return false
  if (reserved(level).some((b) => angDist(a, b) < slotPad)) return false
  if (level === 1 && (inLevel1Room(a, 0.05) || inCreed(a, 0.06))) return false
  if (level > 1 && angDist(a, contentAngle(level)) < RECORD_WALL.half + 0.06) return false
  return true
}

/**
 * The wall's vertical structure, on one grid for the whole shaft.
 *
 * Ribs, lamps and the deck framing used to be spaced round each level from
 * that level's content angle -- which turns a little from one level to the
 * next, so every rib stood a metre or two to the side of the one above it and
 * the columns never lined up. They are now placed on the cladding's own
 * vertical joints (`CLAD_JOINT` apart, counted from the cut edge), the same
 * angles on every level: a rib covers a joint, a column of ribs runs the full
 * depth of the shaft, and a joist always lands on a rib.
 *
 * The wall arc is 58 joints wide. Ribs stand on every third joint from the
 * second (2, 5, ... 56), which leaves two joints of wall at each cut edge;
 * joists on every other rib; lamps midway between ribs.
 */
const joint = (j: number) => WALL_START + j * CLAD_JOINT
const grid = (from: number, step: number, to: number) => {
  const out: number[] = []
  for (let j = from; j <= to + 1e-6; j += step) out.push(joint(j))
  return out
}
const RIB_GRID = grid(2, 3, 56)
const BAY_GRID = grid(2, 6, 56)
const LAMP_GRID = grid(3.5, 3, 54.5)

export const RIB = { w: 0.8, d: 0.6, r: SHAFT_RADIUS - 0.32 }
export const RIBS_PER_FLOOR = RIB_GRID.length
export const ribAngles = (level: number) => RIB_GRID.filter((a) => wallFree(level, a, 0.14))

export const LAMPS_PER_FLOOR = LAMP_GRID.length
export const lampAngles = (level: number) => LAMP_GRID.filter((a) => wallFree(level, a, 0.12, 0.06))

export const BAYS_PER_FLOOR = BAY_GRID.length
export const bayAngles = (level: number) => BAY_GRID.filter((a) => wallFree(level, a, 0.12, 0.06))
