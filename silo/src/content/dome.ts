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

