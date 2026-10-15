import * as THREE from 'three'
import {
  CAR_RADIUS,
  DECK_INNER,
  FLOOR_HEIGHT,
  LEVEL_COUNT,
  contentAngle,
  walkY,
} from './floors'

/**
 * THE STAIR AND THE GANGWAYS — the route between levels on foot.
 *
 * One module, read by both the visible geometry (`three/Stairway.tsx`) and the
 * collision (`three/physics/StairColliders.tsx`). That is the whole point of it
 * existing: the previous stair was drawn from one set of numbers and had no
 * collision at all, so "walkable" was never even a question the code could
 * answer. Anything a foot can land on is generated here exactly once.
 *
 * The arrangement, reading a level from the outside in:
 *
 *   deck ─gap in the rail─ BRIDGE ── LANDING ── lift doors
 *                                       │
 *                               stair up / stair down
 *
 * The LANDING is a sector of floor wrapped round the core at the level's
 * content angle: the lift doors open onto its inner edge and the stair
 * arrives and leaves across its two radial edges. The BRIDGE is a straight
 * span from the landing out across the void to the deck. Together they are
 * the only break in the ring of handrail, so standing on the landing you can
 * see every route out of the level.
 *
 * The bridge is straight rather than a continuation of the sector on purpose:
 * at the atrium's new size a sector reaching the deck would be 6 m wide where
 * it met it, which is a plaza, not a bridge.
 *
 * THE PITCH IS NOT ARBITRARY. Each level's gangway sits at `contentAngle`,
 * and consecutive content angles differ by a fixed step. A flight therefore
 * has to sweep that step PLUS a whole turn to land on the next gangway rather
 * than somewhere out in the void. That constraint fixes the sweep, the sweep
 * and the 11 m storey height fix the pitch, and the pitch comes out at a
 * 134 mm rise on a 312 mm going — a real, comfortable stair, close to the
 * sweeping flight in the reference image. The old helix was a 550 mm rise,
 * which is a ladder, and above Rapier's 450 mm autostep: a body could not have
 * climbed it even if it had been given collision.
 */

/** The stair ribbon, as radii from the shaft axis. */
export const STAIR_INNER = 3.3
export const STAIR_OUTER = 5.32
/** The walk line — where a foot actually falls, and what the pitch is set on. */
export const STAIR_MID = (STAIR_INNER + STAIR_OUTER) / 2
export const STAIR_WIDTH = STAIR_OUTER - STAIR_INNER
export const TREAD_T = 0.1
/** Handrail height above the nosing line. */
export const RAIL_H = 1.02

/**
 * The landing. It runs from inside the lift car's floor edge, so there is no
 * gap to fall through at the threshold, out to the stair's outer edge, where
 * the bridge takes over.
 */
export const LANDING_HALF = 0.4
export const LANDING_INNER = CAR_RADIUS - 0.08
export const LANDING_OUTER = STAIR_OUTER
/** Segments in the landing's arc; the bridge plate reuses its corners. */
export const LANDING_SEGMENTS = 12
export const LANDING_T = 0.18

/**
 * The bridge: exactly as wide as the landing's chord at its outer edge, so its
 * corners land on the ends of that edge and there is no sliver of void between
 * the curved landing and the straight bridge. It starts on that chord, inside
 * the landing, and runs out past the deck lip.
 */
export const BRIDGE_WIDTH = 2 * LANDING_OUTER * Math.sin(LANDING_HALF)
export const BRIDGE_FROM = LANDING_OUTER * Math.cos(LANDING_HALF)
export const BRIDGE_TO = DECK_INNER + 0.25
/** Where the bridge's side edges meet the deck lip -- the end of its parapets. */
export const BRIDGE_LIP = Math.sqrt(DECK_INNER ** 2 - (BRIDGE_WIDTH / 2) ** 2)
/** The opening the bridge needs in the deck's handrail, as a half-angle. */
export const RAIL_GAP_HALF = Math.asin(BRIDGE_WIDTH / 2 / DECK_INNER)

/** Angular step between one level's gangway and the next. */
const LEVEL_STEP = contentAngle(2) - contentAngle(1)
/** Total sweep from one gangway to the next: the step, plus a whole turn. */
export const LEVEL_TURN = LEVEL_STEP + Math.PI * 2
/** The flight proper, i.e. the turn less the two gangways it lands on. */
export const FLIGHT_SWEEP = LEVEL_TURN - LANDING_HALF * 2

export const STEPS_PER_FLIGHT = 82
export const STEP_RISE = FLOOR_HEIGHT / STEPS_PER_FLIGHT
export const STEP_GOING = (FLIGHT_SWEEP * STAIR_MID) / STEPS_PER_FLIGHT
/** Pitch of the flight, in radians. Must stay under the controller's slope limit. */
export const STAIR_PITCH = Math.atan2(STEP_RISE, STEP_GOING)

/** Flights are numbered by the level they leave: flight 1 runs from 1 down to 2. */
export const FLIGHT_COUNT = LEVEL_COUNT - 1
export const flights = Array.from({ length: FLIGHT_COUNT }, (_, i) => i + 1)

/** Angle of the flight leaving `level`, at fraction `t` of its descent. */
export const flightAngle = (level: number, t: number) =>
  contentAngle(level) + LANDING_HALF + t * FLIGHT_SWEEP

/** Height of the nosing line of the flight leaving `level`, at fraction `t`. */
export const flightY = (level: number, t: number) => walkY(level) - t * FLOOR_HEIGHT

/** True where a level has a flight arriving from above / leaving below. */
export const hasFlightUp = (level: number) => level > 1
export const hasFlightDown = (level: number) => level < LEVEL_COUNT

/**
 * three.js rings are drawn in XY measuring from +X counter-clockwise; after
 * `rotateX(-PI/2)` a ring angle `p` lands at world angle `-p`. Every other
 * angle in this project is a world angle, so the sign flip lives here only.
 */
const ringTheta = (worldAngle: number) => -worldAngle

/** Build an indexed strip of quads between two rails of points. */
function strip(
  inner: Array<[number, number, number]>,
  outer: Array<[number, number, number]>,
): THREE.BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i < inner.length; i++) {
    pos.push(...inner[i], ...outer[i])
    if (i > 0) {
      const b = (i - 1) * 2
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/**
 * The walking surface of one flight: a helicoidal ribbon from STAIR_INNER to
 * STAIR_OUTER following the nosing line.
 *
 * Collision uses this ramp rather than the visible treads on purpose. A
 * character controller climbing 82 discrete 134 mm steps autosteps 82 times
 * per flight, and every autostep is a small vertical snap — it reads as a
 * stutter all the way down and is sensitive to frame rate. A smooth 23 degree
 * ramp under the treads is what the body actually walks on; the treads are
 * what the eye sees, and the two differ by at most half a riser, which is
 * 67 mm and invisible.
 */
export function flightSurface(level: number, segments = 108): THREE.BufferGeometry {
  const inner: Array<[number, number, number]> = []
  const outer: Array<[number, number, number]> = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const a = flightAngle(level, t)
    const y = flightY(level, t)
    const c = Math.cos(a)
    const s = Math.sin(a)
    inner.push([c * STAIR_INNER, y, s * STAIR_INNER])
    outer.push([c * STAIR_OUTER, y, s * STAIR_OUTER])
  }
  return strip(inner, outer)
}


/**
 * The visible steps of one flight: every tread and every riser, as one mesh.
 *
 * Not instanced boxes. A box on a helix has a constant depth, but the angular
 * slice it has to fill is 0.24 m across at the inner edge of the stair and
 * 0.39 m at the outer, so a box sized to fit one end leaves a gap at the
 * other -- and looking down a flight, those gaps line up into a ladder of
 * floating plates with the dark of the shaft showing through. Treads on a
 * helical stair are wedges, so they are built as wedges here, each filling
 * exactly its own slice, with a riser closing the step down to the next.
 *
 * Tread tops sit on the ramp at the MIDDLE of their slice, so the surface
 * underfoot and the surface in view are never more than half a riser -- 67 mm
 * -- apart, and the error is symmetric rather than always one way.
 */
export function flightSteps(level: number): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []

  const quad = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    vScale: number,
  ) => {
    const b = pos.length / 3
    pos.push(...p0, ...p1, ...p2, ...p3)
    uv.push(0, 0, 1, 0, 1, vScale, 0, vScale)
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  }

  const at = (a: number, r: number, y: number): [number, number, number] => [
    Math.cos(a) * r,
    y,
    Math.sin(a) * r,
  ]

  for (let i = 0; i < STEPS_PER_FLIGHT; i++) {
    const a0 = flightAngle(level, i / STEPS_PER_FLIGHT)
    const a1 = flightAngle(level, (i + 1) / STEPS_PER_FLIGHT)
    const y = flightY(level, (i + 0.5) / STEPS_PER_FLIGHT)
    const yNext = flightY(level, (i + 1.5) / STEPS_PER_FLIGHT)

    // Tread, looking up.
    quad(
      at(a0, STAIR_INNER, y),
      at(a0, STAIR_OUTER, y),
      at(a1, STAIR_OUTER, y),
      at(a1, STAIR_INNER, y),
      0.55,
    )
    // Riser down to the next tread, facing back up the flight.
    if (i < STEPS_PER_FLIGHT - 1) {
      quad(
        at(a1, STAIR_INNER, y),
        at(a1, STAIR_OUTER, y),
        at(a1, STAIR_OUTER, yNext),
        at(a1, STAIR_INNER, yNext),
        0.24,
      )
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** A vertical skirt along one edge of a flight — the thing that stops a body
 *  walking off the side of the stair into the shaft. */
export function flightSkirt(
  level: number,
  radius: number,
  height: number,
  segments = 108,
): THREE.BufferGeometry {
  const low: Array<[number, number, number]> = []
  const high: Array<[number, number, number]> = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const a = flightAngle(level, t)
    const y = flightY(level, t)
    const c = Math.cos(a)
    const s = Math.sin(a)
    low.push([c * radius, y, s * radius])
    high.push([c * radius, y + height, s * radius])
  }
  return strip(low, high)
}

/** Points along a flight's handrail, for a swept tube. */
export function railPath(level: number, radius: number, segments = 72): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const a = flightAngle(level, t)
    const y = flightY(level, t) + RAIL_H
    pts.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius))
  }
  return pts
}

/**
 * The gangway deck of one level, as a flat ring sector at its walking height.
 * The collider runs in under the edge of the car floor so there is no crack to
 * step over; drawn there it would fight the car floor for the same pixels, so
 * the drawing passes its own `inner`.
 */
export function landingSurface(level: number, inner = LANDING_INNER): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(
    inner,
    LANDING_OUTER,
    LANDING_SEGMENTS,
    1,
    ringTheta(contentAngle(level) + LANDING_HALF),
    LANDING_HALF * 2,
  )
  g.rotateX(-Math.PI / 2)
  g.translate(0, walkY(level), 0)
  return g
}

/**
 * The stretches of a gangway edge that must be closed off.
 *
 * An edge is open only where a flight actually meets it. Everywhere else it is
 * a drop into the shaft, which on level 1 is 120 m. Level 1 has no flight
 * arriving from above and level 12 none leaving below, so on those the edge in
 * question is closed for its whole length — otherwise there would be a
 * gangway-width hole at the top and bottom of the stair.
 *
 * `side` is -1 for the edge the stair arrives at and +1 for the edge it leaves
 * from, matching the sign on the angle.
 */
export function landingEdgeSpans(level: number, side: -1 | 1): Array<[number, number]> {
  const connected = side === -1 ? hasFlightUp(level) : hasFlightDown(level)
  if (!connected) return [[LANDING_INNER, LANDING_OUTER]]
  return [[LANDING_INNER, STAIR_INNER]]
}

/**
 * The bridge as a box: centre, length along the radial axis, and the axis
 * angle. One description for the deck plate, both parapets and the colliders.
 */
export function bridgeFrame(level: number) {
  const a = contentAngle(level)
  const mid = (BRIDGE_FROM + BRIDGE_TO) / 2
  return {
    angle: a,
    y: walkY(level),
    cx: Math.cos(a) * mid,
    cz: Math.sin(a) * mid,
    length: BRIDGE_TO - BRIDGE_FROM,
    /** Parapets run from the landing to the deck lip, not past it. */
    parapetFrom: BRIDGE_FROM,
    parapetTo: BRIDGE_LIP,
  }
}

/** World position of a point given in a bridge's own frame: `along` the axis
 *  from the shaft centre, and `across` it (positive is increasing angle). */
export function bridgePoint(level: number, along: number, across: number): [number, number] {
  const a = contentAngle(level)
  return [
    Math.cos(a) * along - Math.sin(a) * across,
    Math.sin(a) * along + Math.cos(a) * across,
  ]
}

/** World angle of one edge of a level's gangway. */
export const landingEdgeAngle = (level: number, side: -1 | 1) =>
  contentAngle(level) + side * LANDING_HALF

/** A vertical panel standing on a radial line — a gangway edge barrier. */
export function radialPanel(
  angle: number,
  r0: number,
  r1: number,
  y: number,
  height: number,
): THREE.BufferGeometry {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return strip(
    [
      [c * r0, y, s * r0],
      [c * r1, y, s * r1],
    ],
    [
      [c * r0, y + height, s * r0],
      [c * r1, y + height, s * r1],
    ],
  )
}

/**
 * Where the lift car's doorway faces on a level: straight out along the
 * landing. `rotY` matches `rotation.y = PI/2 - angle`, under which a car's
 * local +Z points at world angle `angle`.
 */
export const carTransform = (level: number) => ({
  y: walkY(level),
  rotY: Math.PI / 2 - contentAngle(level),
})
