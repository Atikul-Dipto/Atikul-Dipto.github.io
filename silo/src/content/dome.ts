import { SHAFT_RADIUS, WALL_CENTER, WALL_HEIGHT } from './floors'

/**
 * The dome's geometry, shared by the drawing (three/Dome.tsx) and the light
 * that hangs in the dish (three/Lighting.tsx).
 */

/** The dome springs from the top of the wall. */
export const DOME_BASE = WALL_CENTER + WALL_HEIGHT / 2
export const DOME_RISE = 9
/** Radius of the sphere the dome is cut from. */
export const RS = (SHAFT_RADIUS ** 2 + DOME_RISE ** 2) / (2 * DOME_RISE)
export const CY = DOME_BASE + DOME_RISE - RS
/** Polar angle (from straight up) at which the dome meets the wall. */
export const T_BASE = Math.asin(SHAFT_RADIUS / RS)

/** Height of the dome's inner surface at radius r. */
export const domeY = (r: number) => CY + Math.sqrt(RS * RS - r * r)

export const DISH = {
  neck: 1.9,
  rim: 8.5,
  bottom: 0,
  top: 0,
}
DISH.top = domeY(DISH.rim) - 0.45
DISH.bottom = DISH.top - 7
export const T_OCULUS = Math.asin((DISH.rim + 0.6) / RS)

/** Meridian ribs on the dome's inner face, from the wall head to the oculus,
 *  the first on +X. Each pair of neighbours bounds one bay. */
export const DOME_RIBS = 16
/** Half the rib's width: the radius of its round section. */
export const DOME_RIB_HALF = 0.22

/** One louvred vent: a pill, `w` along the line of latitude, `h` up the dome. */
export const VENT = { w: 1.7, h: 0.8 }

/**
 * The vents, bay by bay. Three rings, set so that each bay holds one vent in
 * the top ring, two in the middle and three in the bottom -- the bays widen
 * towards the wall head, and the count widens with them. Within a bay the
 * vents divide it evenly, so every vent sits squarely between two ribs and
 * none of them can land on one.
 *
 * `t` is the polar angle (from straight up) of the ring.
 */
export const VENT_RINGS: Array<{ t: number; perBay: number }> = [
  { t: 0.39, perBay: 1 },
  { t: 0.55, perBay: 2 },
  { t: 0.71, perBay: 3 },
]

export function ventAngles() {
  const out: Array<{ t: number; a: number }> = []
  const bay = (Math.PI * 2) / DOME_RIBS
  for (const { t, perBay } of VENT_RINGS) {
    for (let i = 0; i < DOME_RIBS; i++) {
      for (let k = 0; k < perBay; k++) out.push({ t, a: i * bay + ((k + 0.5) / perBay) * bay })
    }
  }
  return out
}

/**
 * Clear distance, in metres along the ring, between the nearest vent and the
 * nearest rib, for each ring. Must stay positive; the test suite checks it.
 */
export function ventClearance() {
  const bay = (Math.PI * 2) / DOME_RIBS
  return VENT_RINGS.map(({ t, perBay }) => {
    const ring = Math.sin(t) * RS
    const half = (bay / perBay / 2) * ring
    return { t, perBay, clear: +(half - VENT.w / 2 - DOME_RIB_HALF).toFixed(3), gap: +(half * 2 - VENT.w).toFixed(3) }
  })
}
