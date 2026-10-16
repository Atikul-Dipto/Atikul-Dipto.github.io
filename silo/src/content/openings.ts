import { DECK_OUTER, walkY } from './floors'
import { FLOOR, VAULT, VAULT_TUNNEL } from './level1'
import { CH_GAP, CH_OPENING, FLOOR6, MAZE } from './level6'
import { CX_FRAME, FLOOR12, PASSAGE, PASS_HALF, RX_FRAME } from './level12'

/**
 * Every opening cut through the silo wall, in one list.
 *
 * Read by the wall's shader, which discards both concrete shells inside each
 * opening's circle, and by the deck's collision, which leaves a gap in the
 * outer wall for each one's tunnel. Round, all of them: an opening whose
 * bottom sits under its floor is round above the floor and flat underfoot.
 */
export interface WallOpening {
  level: number
  angle: number
  /** World height of the circle's centre. */
  centreY: number
  radius: number
  /** Half the gap the deck's wall collider leaves, in radians. */
  gap: number
}

export const OPENINGS: WallOpening[] = [
  {
    level: 1,
    angle: VAULT.angle,
    centreY: FLOOR + VAULT.centre,
    radius: VAULT.radius,
    gap: (VAULT_TUNNEL.half + 0.02) / DECK_OUTER,
  },
  { level: 6, angle: MAZE.mid, centreY: FLOOR6 + CH_OPENING.centre, radius: CH_OPENING.radius, gap: CH_GAP },
  ...[RX_FRAME, CX_FRAME].map((f) => ({
    level: 12,
    angle: f.angle,
    centreY: FLOOR12 + PASSAGE.centre,
    radius: PASSAGE.radius,
    gap: (PASS_HALF + 0.07) / DECK_OUTER,
  })),
]

export const openingsOn = (level: number) => OPENINGS.filter((o) => o.level === level)

/** The wall's shader holds this many; the list must never outgrow it. */
export const MAX_OPENINGS = 6

export const levelOfOpening = (o: WallOpening) => walkY(o.level)
