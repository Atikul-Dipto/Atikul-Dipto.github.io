import { DECK_OUTER, walkY } from './floors'
import { FLOOR, HALL_F, HALL_GATE, HALL_PASS, OFFICE_F, OFFICE_GATE, OFFICE_PASS } from './level1'
import { CH_GAP, CH_OPENING, FLOOR6, LEVEL as REC_LEVEL, ROOMS6 } from './level6'
import { CX_FRAME, FLOOR12, LEVEL as CORE_LEVEL, PASSAGE, PASS_HALF, RX_FRAME } from './level12'
import { wallRoomOpenings } from './wallRooms'

/**
 * Every opening cut through the silo wall, in one list.
 *
 * Read by the wall's shader, which discards both concrete shells inside each
 * opening's outline, and by the deck's collision, which leaves a gap in the
 * outer wall for each one's passage. Each outline is a rounded rectangle: a
 * circle when its half-width, half-height and corner radius are all equal,
 * the cafeteria's wide pill when they are not. One whose bottom sits under
 * its floor is cut flat underfoot.
 */
export interface WallOpening {
  level: number
  angle: number
  /** World height of the outline's centre. */
  centreY: number
  halfW: number
  halfH: number
  radius: number
  /** Half the gap the deck's wall collider leaves, in radians. */
  gap: number
}

const round = (level: number, angle: number, centreY: number, r: number, gap: number): WallOpening => ({
  level,
  angle,
  centreY,
  halfW: r,
  halfH: r,
  radius: r,
  gap,
})

export const OPENINGS: WallOpening[] = [
  {
    level: 1,
    angle: OFFICE_F.angle,
    centreY: FLOOR + OFFICE_GATE.centre,
    halfW: OFFICE_GATE.halfW,
    halfH: OFFICE_GATE.halfH,
    radius: OFFICE_GATE.radius,
    gap: (OFFICE_PASS + 0.04) / DECK_OUTER,
  },
  {
    level: 1,
    angle: HALL_F.angle,
    centreY: FLOOR + HALL_GATE.centre,
    halfW: HALL_GATE.halfW,
    halfH: HALL_GATE.halfH,
    radius: HALL_GATE.radius,
    gap: (HALL_PASS + 0.04) / DECK_OUTER,
  },
  ...ROOMS6.map((r) => round(REC_LEVEL, r.frame.angle, FLOOR6 + CH_OPENING.centre, CH_OPENING.radius, CH_GAP)),
  ...[RX_FRAME, CX_FRAME].map((f) => round(CORE_LEVEL, f.angle, FLOOR12 + PASSAGE.centre, PASSAGE.radius, (PASS_HALF + 0.07) / DECK_OUTER)),
  ...wallRoomOpenings(),
]

export const openingsOn = (level: number) => OPENINGS.filter((o) => o.level === level)

/** The wall's shader holds this many at once: the ones nearest the camera
 *  (Structure.tsx). More than that on one level and its own would be lost. */
export const MAX_OPENINGS = 8

export const levelOfOpening = (o: WallOpening) => walkY(o.level)
