import { DECK_INNER, SHAFT_RADIUS, walkY } from './floors'
import { seeded, wallFrame } from './frame'
import type { Box } from './level1'

/**
 * LEVEL 6 — RECREATION. The plan.
 *
 * As on level 1, every solid thing here is described once, as data, and read
 * twice: by `three/floors/Level06.tsx` to draw it and by the physics to stand
 * in its way.
 *
 * Going round the ring:
 *
 *   ~4.42         ARRIVAL: the bridge lands facing the record display
 *   5.00 - 6.50   THE MAZE: a hedge maze filling the deck from the
 *                 promenade out to the silo wall, cut on a polar grid --
 *                 rings out from the atrium, sectors round it
 *   5.75          at the heart of its outermost ring, in the silo wall, a
 *                 round door that rolls aside into the wall. Behind it, a
 *                 short tunnel and THE CHAMBER: a great round room cut into
 *                 the rock, dark until someone walks in
 *
 * The chamber is laid out in the door's wall frame (content/frame.ts): `s`
 * across, `d` out from the shaft. Inside it, things are placed round its own
 * centre by `phi` -- 0 at the back of the room, PI at the entrance, positive
 * to the right as you walk in -- and `rr`, the distance from the centre.
 */

export const LEVEL = 6
export const FLOOR6 = walkY(LEVEL)

// ---------------------------------------------------------------------------
// The maze
// ---------------------------------------------------------------------------

export const MAZE = {
  mid: 5.75,
  span: 1.5,
  sectors: 7,
  /** Ring boundaries out from the atrium. The outermost ring runs to the wall. */
  radii: [10.6, 12.8, 15.0, 17.2, 19.4] as number[],
  /** The way in, from the promenade: a gap in the innermost hedge. */
  entrance: 1,
  /** The way out: the outermost ring's middle sector, in front of the door. */
  exit: 3,
  hedge: { h: 2.3, t: 0.36 },
  seed: 1606,
}
export const MAZE_FROM = MAZE.mid - MAZE.span / 2
export const MAZE_TO = MAZE.mid + MAZE.span / 2
const RINGS = MAZE.radii.length
const OUTER = SHAFT_RADIUS - 0.06
const sectorAngle = (j: number) => MAZE_FROM + (MAZE.span * j) / MAZE.sectors

/**
 * Carve the maze: a depth-first walk over the cells from the entrance,
 * knocking through to an unvisited neighbour at random and backing up at a
 * dead end. A perfect maze -- exactly one way between any two cells -- so the
 * door can always be reached.
 */
function carve() {
  const rand = seeded(MAZE.seed)
  const S = MAZE.sectors
  const id = (i: number, j: number) => i * S + j
  const open = new Set<string>()
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  const seen = new Set<number>([id(0, MAZE.entrance)])
  const stack: Array<[number, number]> = [[0, MAZE.entrance]]
  while (stack.length) {
    const [i, j] = stack[stack.length - 1]
    const next = (
      [
        [i - 1, j],
        [i + 1, j],
        [i, j - 1],
        [i, j + 1],
      ] as Array<[number, number]>
    ).filter(([a, b]) => a >= 0 && a < RINGS && b >= 0 && b < S && !seen.has(id(a, b)))
    if (!next.length) {
      stack.pop()
      continue
    }
    const [a, b] = next[Math.floor(rand() * next.length)]
    open.add(key(id(i, j), id(a, b)))
    seen.add(id(a, b))
    stack.push([a, b])
  }
  return (i: number, j: number, a: number, b: number) => open.has(key(id(i, j), id(a, b)))
}

const polar = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r]

/** A hedge run along an arc at radius r, as straight pieces. */
function hedgeArc(r: number, a0: number, a1: number, out: Box[]) {
  const pieces = Math.max(1, Math.ceil(((a1 - a0) * r) / 2.4))
  const da = (a1 - a0) / pieces
  for (let k = 0; k < pieces; k++) {
    const a = a0 + da * (k + 0.5)
    const [x, z] = polar(a, r)
    out.push({
      x,
      y: FLOOR6 + MAZE.hedge.h / 2,
      z,
      w: 2 * r * Math.sin(da / 2) + MAZE.hedge.t,
      h: MAZE.hedge.h,
      d: MAZE.hedge.t,
      rotY: -a - Math.PI / 2,
    })
  }
}

/** A hedge run straight out along angle a, from r0 to r1. */
function hedgeRadial(a: number, r0: number, r1: number, out: Box[]) {
  const [x, z] = polar(a, (r0 + r1) / 2)
  out.push({ x, y: FLOOR6 + MAZE.hedge.h / 2, z, w: r1 - r0, h: MAZE.hedge.h, d: MAZE.hedge.t, rotY: -a })
}

/** Every hedge in the maze, as boxes: drawn as they are, collided as they are. */
export function mazeHedges(): Box[] {
  const linked = carve()
  const out: Box[] = []
  const S = MAZE.sectors
  const R = MAZE.radii
  // The inner boundary, open at the entrance.
  for (let j = 0; j < S; j++) if (j !== MAZE.entrance) hedgeArc(R[0], sectorAngle(j), sectorAngle(j + 1), out)
  // Between rings.
  for (let i = 0; i < RINGS - 1; i++)
    for (let j = 0; j < S; j++)
      if (!linked(i, j, i + 1, j)) hedgeArc(R[i + 1], sectorAngle(j), sectorAngle(j + 1), out)
  // Between sectors, and the two sides of the whole maze.
  for (let i = 0; i < RINGS; i++) {
    const r0 = R[i] - MAZE.hedge.t / 2
    const r1 = i === RINGS - 1 ? OUTER - 0.05 : R[i + 1] + MAZE.hedge.t / 2
    for (let j = 0; j < S - 1; j++) if (!linked(i, j, i, j + 1)) hedgeRadial(sectorAngle(j + 1), r0, r1, out)
    hedgeRadial(MAZE_FROM, r0, r1, out)
    hedgeRadial(MAZE_TO, r0, r1, out)
  }
  return out
}

/** The centre of a maze cell, in world X, Z. */
export function cellCentre(ring: number, sector: number): [number, number] {
  const R = MAZE.radii
  const r0 = R[ring]
  const r1 = ring === RINGS - 1 ? OUTER : R[ring + 1]
  return polar((sectorAngle(sector) + sectorAngle(sector + 1)) / 2, (r0 + r1) / 2)
}

/** The one way through, cell by cell, from the entrance to the door. */
export function mazePath(): Array<{ ring: number; sector: number }> {
  const linked = carve()
  const S = MAZE.sectors
  const start = { ring: 0, sector: MAZE.entrance }
  const goal = `${RINGS - 1},${MAZE.exit}`
  const prev = new Map<string, string | null>([[`0,${MAZE.entrance}`, null]])
  const queue = [start]
  while (queue.length) {
    const { ring: i, sector: j } = queue.shift()!
    if (`${i},${j}` === goal) break
    for (const [a, b] of [
      [i - 1, j],
      [i + 1, j],
      [i, j - 1],
      [i, j + 1],
    ]) {
      if (a < 0 || a >= RINGS || b < 0 || b >= S || prev.has(`${a},${b}`) || !linked(i, j, a, b)) continue
      prev.set(`${a},${b}`, `${i},${j}`)
      queue.push({ ring: a, sector: b })
    }
  }
  const out: Array<{ ring: number; sector: number }> = []
  for (let k: string | null | undefined = goal; k; k = prev.get(k)) {
    const [ring, sector] = k.split(',').map(Number)
    out.unshift({ ring, sector })
  }
  return out
}

/** Which cell of the maze a point is in, or null outside it. */
export function mazeCell(x: number, z: number) {
  const r = Math.hypot(x, z)
  let a = Math.atan2(z, x)
  while (a < MAZE_FROM - Math.PI) a += Math.PI * 2
  while (a > MAZE_FROM + Math.PI) a -= Math.PI * 2
  if (a < MAZE_FROM || a > MAZE_TO || r < MAZE.radii[0] || r > OUTER) return null
  let ring = RINGS - 1
  while (ring > 0 && r < MAZE.radii[ring]) ring--
  return { ring, sector: Math.min(MAZE.sectors - 1, Math.floor(((a - MAZE_FROM) / MAZE.span) * MAZE.sectors)) }
}

/** Where to stand to walk in: on the promenade, in front of the gap. */
export const MAZE_ENTRY = {
  angle: (sectorAngle(MAZE.entrance) + sectorAngle(MAZE.entrance + 1)) / 2,
  r: (DECK_INNER + MAZE.radii[0]) / 2,
}

// ---------------------------------------------------------------------------
// The door and the chamber
// ---------------------------------------------------------------------------

export const CH_FRAME = wallFrame(MAZE.mid, FLOOR6)

/**
 * The round door. It stands inside the wall's thickness, recessed behind a
 * round opening, and rolls aside on a track sunk in the floor into a pocket
 * in the wall -- so neither it nor its path ever takes any room on the deck.
 * It is bigger than the opening, so its foot runs in the floor channel.
 */
export const CH_DOOR = {
  radius: 2.05,
  /** Height of its axle above the floor. */
  centre: 1.5,
  /** Its mid-plane, inside the wall. */
  d: 0.55,
  half: 0.25,
  /** How far it rolls to clear the opening. */
  roll: 4.4,
}

/** The opening in the silo wall: round, its bottom sunk under the floor. */
export const CH_OPENING = { radius: 1.9, centre: 1.5 }

/** Half the opening's width at the floor: what a body can use. */
export const CH_PASS_HALF = Math.sqrt(CH_OPENING.radius ** 2 - CH_OPENING.centre ** 2)

/** The way through, to the chamber's edge. */
export const CH_TUNNEL = { from: -0.02, to: 2.5, half: CH_PASS_HALF + 0.05 }

/** The chamber itself: a round room, its floor level with the deck. */
export const CHAMBER = { centre: 12.2, radius: 10, height: 7.6, wall: 0.4 }
/** Where the chamber's circle meets the tunnel. */
export const CH_FRONT = CHAMBER.centre - CHAMBER.radius

/** World X, Z of a point placed round the chamber's centre. */
export function chamberPoint(phi: number, rr: number): [number, number] {
  return CH_FRAME.to(Math.sin(phi) * rr, CHAMBER.centre + Math.cos(phi) * rr)
}

/** Yaw that faces a thing at (phi, rr) toward the chamber's centre. */
export const facingCentre = (phi: number) => CH_FRAME.yaw - phi

/** A point's place in the chamber: its angle and distance from the centre. */
export function inChamberPolar(x: number, z: number) {
  const { s, d } = CH_FRAME.from(x, z)
  const dd = d - CHAMBER.centre
  return { phi: Math.atan2(s, dd), rr: Math.hypot(s, dd), s, d }
}

/** True if a world X, Z is in the chamber or the tunnel to it. */
export function inChamber(x: number, z: number) {
  const { s, d } = CH_FRAME.from(x, z)
  if (d > CH_TUNNEL.from && d < CH_TUNNEL.to && Math.abs(s) < CH_TUNNEL.half + 0.2) return true
  return Math.hypot(s, d - CHAMBER.centre) < CHAMBER.radius
}

// ---- what is in it ---------------------------------------------------------

export const GRAMOPHONE = { phi: -1.78, rr: 7.4 }
export const CLOSET = { phi: -1.4, rr: 9.25, w: 1.9, h: 2.3, depth: 0.7 }

/** The arcade: one cabinet a game, in an arc at the back of the room. */
export const CABINET = { rr: 8.9, w: 0.86, h: 1.95, depth: 0.82 }
export const ARCADE_GAMES = [
  { id: 'prisoners', title: "PRISONER'S DILEMMA" },
  { id: 'ultimatum', title: 'THE ULTIMATUM' },
  { id: 'stag', title: 'STAG HUNT' },
  { id: 'beauty', title: 'GUESS 2/3' },
  { id: 'maze', title: 'MAZE RUN' },
] as const
export type ArcadeGame = (typeof ARCADE_GAMES)[number]['id']
export const cabinetPhi = (k: number) => (k - (ARCADE_GAMES.length - 1) / 2) * 0.27

export const DRONE_DESK = { phi: 1.78, rr: 8.3, w: 3.2, depth: 0.85, h: 0.78 }
export const DRONE_PLINTH = { phi: 1.32, rr: 7.3 }

/** Curved display counters round the wall, between the alcoves. */
export const SHELF_RUNS: Array<[number, number]> = [
  [-2.62, -2.12],
  [-1.12, -0.74],
  [0.74, 1.12],
  [2.12, 2.62],
]
export const SHELF = { r0: 9.05, r1: 9.85, low: 0.92, high: 1.35 }

/**
 * The order the lights come on in, round the room from the entrance: a
 * section at a time, each named by the middle of its arc.
 */
export const SECTIONS = [
  { id: 'front-left', phi: -2.37 },
  { id: 'music', phi: -1.6 },
  { id: 'left', phi: -0.93 },
  { id: 'arcade', phi: 0 },
  { id: 'right', phi: 0.93 },
  { id: 'drone', phi: 1.6 },
  { id: 'front-right', phi: 2.37 },
  { id: 'orrery', phi: Math.PI },
] as const
export const SECTION_GAP = 0.42
export const LIGHT_UP = SECTION_GAP * SECTIONS.length + 1.2

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

/** A box placed round the chamber's centre, facing it, standing on the floor. */
function chamberBox(phi: number, rr: number, w: number, depth: number, h: number, y0 = 0): Box {
  const [x, z] = chamberPoint(phi, rr)
  return { x, y: FLOOR6 + y0 + h / 2, z, w, h, d: depth, rotY: facingCentre(phi) }
}

/** The chamber's wall, as a ring of boxes open at the entrance. */
function chamberWall(): Box[] {
  const out: Box[] = []
  const R = CHAMBER.radius + CHAMBER.wall / 2
  const gap = Math.asin(CH_TUNNEL.half / CHAMBER.radius) + 0.01
  const n = 96
  for (let i = 0; i < n; i++) {
    const phi = -Math.PI + ((i + 0.5) / n) * Math.PI * 2
    if (Math.abs(Math.abs(phi) - Math.PI) < gap) continue
    out.push(chamberBox(phi, R, ((Math.PI * 2) / n) * R + 0.06, CHAMBER.wall, CHAMBER.height))
  }
  return out
}

export function chamberSolids(): Box[] {
  const F = CH_FRAME
  const out: Box[] = [...chamberWall()]
  // Tunnel sides.
  for (const side of [-1, 1]) {
    const s0 = side * CH_TUNNEL.half
    out.push(F.box(Math.min(s0, s0 + side * 0.4), Math.max(s0, s0 + side * 0.4), CH_TUNNEL.from, CH_TUNNEL.to, 0, 3.4))
  }
  // Floor of the tunnel, flush with the deck.
  out.push(F.box(-CH_TUNNEL.half - 0.4, CH_TUNNEL.half + 0.4, -0.3, CH_TUNNEL.to + 0.4, -0.3, 0))
  // The music nook.
  out.push(chamberBox(GRAMOPHONE.phi, GRAMOPHONE.rr, 0.9, 0.9, 1.05))
  out.push(chamberBox(CLOSET.phi, CLOSET.rr, CLOSET.w, CLOSET.depth, CLOSET.h))
  // The arcade.
  ARCADE_GAMES.forEach((_, k) => out.push(chamberBox(cabinetPhi(k), CABINET.rr, CABINET.w, CABINET.depth, CABINET.h)))
  // Drone control.
  out.push(chamberBox(DRONE_DESK.phi, DRONE_DESK.rr, DRONE_DESK.w, DRONE_DESK.depth, 1.0))
  out.push(chamberBox(DRONE_PLINTH.phi, DRONE_PLINTH.rr, 0.9, 0.9, 1.0))
  // Counters.
  for (const [a0, a1] of SHELF_RUNS) {
    const n = Math.ceil(((a1 - a0) * SHELF.r1) / 1.2)
    for (let i = 0; i < n; i++) {
      const phi = a0 + ((i + 0.5) / n) * (a1 - a0)
      const rr = (SHELF.r0 + SHELF.r1) / 2
      out.push(chamberBox(phi, rr, ((a1 - a0) / n) * SHELF.r1 + 0.05, SHELF.r1 - SHELF.r0, SHELF.high))
    }
  }
  return out
}

/** The physics' view of the floor: the hedges and the chamber. */
export function level6Colliders(): Box[] {
  return [...mazeHedges(), ...chamberSolids()]
}

/** The deck's outer wall is open this wide (each side, in radians) for the
 *  tunnel to pass. */
export const CH_GAP = (CH_TUNNEL.half + 0.02) / OUTER

// ---------------------------------------------------------------------------
// What E does, where
// ---------------------------------------------------------------------------

const near = (x: number, z: number, phi: number, rr: number, within: number) => {
  const [px, pz] = chamberPoint(phi, rr)
  return Math.hypot(x - px, z - pz) < within
}

/**
 * What pressing E would do at a point on level 6: the door from either side,
 * and each thing in the chamber from in front of it.
 */
export function level6Interact(x: number, z: number, doorOpen: boolean): string | null {
  const { s, d } = CH_FRAME.from(x, z)
  // In front of the door, out to the recess against its face.
  if (Math.abs(s) < 2.6 && d > -3.6 && d < CH_DOOR.d - CH_DOOR.half) return doorOpen ? 'chamber-close' : 'chamber'
  if (Math.abs(s) < CH_TUNNEL.half + 0.2 && d > 1.15 && d < CH_FRONT + 1.4) return doorOpen ? 'chamber-close' : 'chamber'
  if (!inChamber(x, z)) return null
  if (near(x, z, GRAMOPHONE.phi, GRAMOPHONE.rr, 1.9) || near(x, z, CLOSET.phi, CLOSET.rr - 1, 1.6)) return 'jukebox'
  for (let k = 0; k < ARCADE_GAMES.length; k++) {
    if (near(x, z, cabinetPhi(k), CABINET.rr - 1.05, 0.95)) return `arcade:${ARCADE_GAMES[k].id}`
  }
  if (near(x, z, DRONE_DESK.phi, DRONE_DESK.rr - 1.2, 1.7)) return 'drone'
  return null
}
