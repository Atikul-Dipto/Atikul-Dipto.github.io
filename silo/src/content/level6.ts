import { DECK_INNER, SHAFT_RADIUS, contentAngle, walkY } from './floors'
import { seeded, wallFrame, type WallFrame } from './frame'
import type { Box } from './level1'

/**
 * LEVEL 4 — RECREATION. The plan. (Level 6 when the silo had twelve floors;
 * the file keeps its old name.)
 *
 * As on level 1, every solid thing here is described once, as data, and read
 * twice: by `three/floors/Level06.tsx` to draw it and by the physics to stand
 * in its way.
 *
 *   THE PLAZA     where the bridge lands, facing the record display, with a
 *                 map of the maze standing on it
 *   THE MAZE      everything else: a hedge maze right round the ring from the
 *                 promenade to the silo wall, cut on a polar grid -- rings out
 *                 from the atrium, sectors round it -- with a way in from the
 *                 plaza at each end
 *   THREE DOORS   round doors in the silo wall at the back of the maze, each
 *                 rolling aside into the wall. Behind them, rooms cut into the
 *                 rock, joined to one another by corridors:
 *                   the CHAMBER -- the orrery, the arcade, drone control
 *                   the MUSIC HALL -- the gramophone and the cassettes
 *                   an EMPTY ROOM, waiting to be fitted out
 *
 * Each room is laid out in its door's wall frame (content/frame.ts): `s`
 * across, `d` out from the shaft. Inside, things are placed round the room's
 * own centre by `phi` -- 0 at the back of the room, PI at the entrance,
 * positive to the right as you walk in -- and `rr`, the distance from the
 * centre.
 */

export const LEVEL = 4
export const FLOOR6 = walkY(LEVEL)
const OUTER = SHAFT_RADIUS - 0.06
const polar = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r]
const wrapNear = (a: number, ref: number) => {
  let x = a
  while (x < ref - Math.PI) x += Math.PI * 2
  while (x > ref + Math.PI) x -= Math.PI * 2
  return x
}

// ---------------------------------------------------------------------------
// The plaza and the maze
// ---------------------------------------------------------------------------

/** Where the bridge lands. The maze leaves this much of the ring either side
 *  of it clear. */
export const ARRIVAL = contentAngle(LEVEL)
export const PLAZA_HALF = 0.42

export const MAZE = {
  sectors: 24,
  /** Ring boundaries out from the atrium. The outermost ring runs to the wall. */
  radii: [10.6, 12.8, 15.0, 17.2, 19.4] as number[],
  hedge: { h: 4.0, t: 0.4 },
  seed: 1606,
}
export const MAZE_FROM = ARRIVAL + PLAZA_HALF
export const MAZE_SPAN = Math.PI * 2 - PLAZA_HALF * 2
export const MAZE_TO = MAZE_FROM + MAZE_SPAN
const RINGS = MAZE.radii.length
const S = MAZE.sectors
const sectorAngle = (j: number) => MAZE_FROM + (MAZE_SPAN * j) / S
export const sectorMid = (j: number) => sectorAngle(j + 0.5)
/** The two ways in, from the plaza: a gap in the innermost hedge at each end. */
export const ENTRANCES = [0, S - 1]

/** True if a world angle falls over the maze rather than the plaza. */
export const overMaze = (a: number) => {
  const x = wrapNear(a, ARRIVAL)
  return Math.abs(x - ARRIVAL) > PLAZA_HALF
}

// ---------------------------------------------------------------------------
// The rooms behind the wall
// ---------------------------------------------------------------------------

export type RoomId = 'chamber' | 'music' | 'empty'
export interface Room {
  id: RoomId
  /** The maze sector whose outermost cell the door opens from. */
  sector: number
  frame: WallFrame
  radius: number
  /** d of the room's centre. */
  centre: number
  height: number
}

/** Where every room's round wall begins, behind its tunnel. */
export const FRONT = 2.2

function room(id: RoomId, sector: number, radius: number, height: number): Room {
  return { id, sector, frame: wallFrame(sectorMid(sector), FLOOR6), radius, centre: FRONT + radius, height }
}

export const ROOMS6: Room[] = [room('chamber', 2, 10, 7.6), room('music', 5, 9, 6.8), room('empty', 8, 8, 5.6)]
export const roomById = (id: RoomId) => ROOMS6.find((r) => r.id === id)!

/** The round door, the same in every opening. It stands inside the wall's
 *  thickness behind the opening, and rolls aside on a track sunk in the floor
 *  into a pocket in the wall. */
export const CH_DOOR = { radius: 2.05, centre: 1.5, d: 0.55, half: 0.25, roll: 4.4 }
/** The opening in the silo wall: round, its bottom sunk under the floor. */
export const CH_OPENING = { radius: 1.9, centre: 1.5 }
export const CH_PASS_HALF = Math.sqrt(CH_OPENING.radius ** 2 - CH_OPENING.centre ** 2)
/** The way through, to the room's edge. */
export const CH_TUNNEL = { from: -0.02, to: FRONT + 0.3, half: CH_PASS_HALF + 0.05 }
/** The deck's outer wall is open this wide (each side, in radians) at each door. */
export const CH_GAP = (CH_TUNNEL.half + 0.02) / OUTER

/** World X, Z of a point placed round a room's centre. */
export function roomPoint(r: Room, phi: number, rr: number): [number, number] {
  return r.frame.to(Math.sin(phi) * rr, r.centre + Math.cos(phi) * rr)
}
/** Yaw that faces a thing at `phi` toward the room's centre. */
export const facingCentre = (r: Room, phi: number) => r.frame.yaw - phi
/** A world point's place in a room: its angle and distance from the centre. */
export function roomPolar(r: Room, x: number, z: number) {
  const { s, d } = r.frame.from(x, z)
  const dd = d - r.centre
  return { phi: Math.atan2(s, dd), rr: Math.hypot(s, dd), s, d }
}

/**
 * The corridors joining the rooms: straight tunnels through the rock from one
 * room's wall to the next.
 */
export const CORRIDOR = { half: 1.25, height: 3.4 }
export interface Corridor {
  a: Room
  b: Room
  /** World X, Z where it leaves each room's wall, and its direction. */
  from: [number, number]
  to: [number, number]
  dir: [number, number]
  /** Where it meets each room's wall, as that room's phi. */
  phiA: number
  phiB: number
}
const centreOf = (r: Room) => r.frame.to(0, r.centre)
export const CORRIDORS: Corridor[] = [
  [ROOMS6[0], ROOMS6[1]],
  [ROOMS6[1], ROOMS6[2]],
].map(([a, b]) => {
  const [ax, az] = centreOf(a)
  const [bx, bz] = centreOf(b)
  const len = Math.hypot(bx - ax, bz - az)
  const dir: [number, number] = [(bx - ax) / len, (bz - az) / len]
  const from: [number, number] = [ax + dir[0] * (a.radius - 0.2), az + dir[1] * (a.radius - 0.2)]
  const to: [number, number] = [bx - dir[0] * (b.radius - 0.2), bz - dir[1] * (b.radius - 0.2)]
  return { a, b, from, to, dir, phiA: roomPolar(a, bx, bz).phi, phiB: roomPolar(b, ax, az).phi }
})

/** The gaps in a room's wall: its entrance, and each corridor. */
function wallGaps(r: Room): Array<[number, number]> {
  const gaps: Array<[number, number]> = [[Math.PI, Math.asin((CH_TUNNEL.half + 0.15) / r.radius)]]
  for (const c of CORRIDORS) {
    if (c.a === r) gaps.push([c.phiA, Math.asin((CORRIDOR.half + 0.1) / r.radius)])
    if (c.b === r) gaps.push([c.phiB, Math.asin((CORRIDOR.half + 0.1) / r.radius)])
  }
  return gaps
}
const angDist = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
/** True if `phi` falls in one of the room's wall openings. */
export const inWallGap = (r: Room, phi: number, pad = 0) => wallGaps(r).some(([c, h]) => angDist(phi, c) < h + pad)
export const roomWallGaps = wallGaps

/** True if a world point is in a room, its tunnel, or a corridor off it. */
export function inRoom(r: Room, x: number, z: number) {
  const { s, d } = r.frame.from(x, z)
  if (d > CH_TUNNEL.from && d < CH_TUNNEL.to && Math.abs(s) < CH_TUNNEL.half + 0.2) return true
  return Math.hypot(s, d - r.centre) < r.radius
}
export function inCorridor(c: Corridor, x: number, z: number) {
  const ox = x - c.from[0]
  const oz = z - c.from[1]
  const along = ox * c.dir[0] + oz * c.dir[1]
  const len = Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1])
  const across = -ox * c.dir[1] + oz * c.dir[0]
  return along > -0.5 && along < len + 0.5 && Math.abs(across) < CORRIDOR.half + 0.3
}
/** True anywhere behind the wall: a room, a tunnel, a corridor. */
export const behindWall = (x: number, z: number) => ROOMS6.some((r) => inRoom(r, x, z)) || CORRIDORS.some((c) => inCorridor(c, x, z))

// ---- what is in them ---------------------------------------------------------

/** The chamber: the arcade at the back, drone control on the left, the
 *  corridor to the music hall on the right. */
export const CHAMBER = ROOMS6[0]
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
export const DRONE_DESK = { phi: -1.78, rr: 8.3, w: 3.2, depth: 0.85, h: 0.78 }
export const DRONE_PLINTH = { phi: -1.3, rr: 7.3 }
/** Curved display counters round the chamber's wall, between the alcoves. */
export const SHELF_RUNS: Array<[number, number]> = [
  [-2.62, -2.12],
  [-1.12, -0.74],
  [0.74, 1.05],
  [2.12, 2.62],
]
export const SHELF = { r0: 9.05, r1: 9.85, low: 0.92, high: 1.35 }

/** The music hall: the gramophone on a round stage at the back, cassette
 *  closets either side of it, seats in a half-ring facing it. */
export const MUSIC = ROOMS6[1]
export const GRAMOPHONE = { phi: 0, rr: 5.6 }
export const STAGE = { rr: 5.6, radius: 1.6, h: 0.22 }
export const CLOSETS = [-0.62, 0.62].map((phi) => ({ phi, rr: 8.25, w: 1.9, h: 2.3, depth: 0.7 }))
export const SEATS = [-1.0, -0.5, 0, 0.5, 1.0].map((off) => ({ phi: Math.PI + off, rr: 3.4 }))
export const SPEAKERS = [-0.3, 0.3].map((phi) => ({ phi, rr: 7.9 }))

/** The empty room: nothing yet. */
export const EMPTY = ROOMS6[2]

/** The map of the maze, standing on the plaza facing the bridge. */
export const MAP_BOARD = { angle: ARRIVAL + 0.26, r: 13.2, w: 2.6, h: 1.8 }

// ---------------------------------------------------------------------------
// The lights in each room come on a section at a time
// ---------------------------------------------------------------------------

/** Section angles round each room, from the entrance; the last is the room's
 *  centre -- the orrery, the chandelier, the ceiling. */
export const ROOM_SECTIONS: Record<RoomId, number[]> = {
  chamber: [-2.37, -1.6, -0.93, 0, 0.93, 1.6, 2.37, Math.PI],
  music: [-2.2, -1.2, -0.4, 0.4, 1.2, 2.2, Math.PI],
  empty: [-1.6, 0, 1.6, Math.PI],
}
export const SECTION_GAP = 0.42

// ---------------------------------------------------------------------------
// Carving the maze
// ---------------------------------------------------------------------------

/**
 * A depth-first walk over the cells from the first entrance, knocking through
 * to an unvisited neighbour at random and backing up at a dead end. A perfect
 * maze -- exactly one way between any two cells -- so every door can be
 * reached from either entrance.
 */
function carve() {
  const rand = seeded(MAZE.seed)
  const id = (i: number, j: number) => i * S + j
  const open = new Set<string>()
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  const seen = new Set<number>([id(0, ENTRANCES[0])])
  const stack: Array<[number, number]> = [[0, ENTRANCES[0]]]
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
const linked = carve()

/** A hedge run along an arc at radius r, as straight pieces. */
function hedgeArc(r: number, a0: number, a1: number, out: Box[]) {
  const pieces = Math.max(1, Math.ceil(((a1 - a0) * r) / 2.4))
  const da = (a1 - a0) / pieces
  for (let k = 0; k < pieces; k++) {
    const a = a0 + da * (k + 0.5)
    const [x, z] = polar(a, r)
    out.push({ x, y: FLOOR6 + MAZE.hedge.h / 2, z, w: 2 * r * Math.sin(da / 2) + MAZE.hedge.t, h: MAZE.hedge.h, d: MAZE.hedge.t, rotY: -a - Math.PI / 2 })
  }
}

/** A hedge run straight out along angle a, from r0 to r1. */
function hedgeRadial(a: number, r0: number, r1: number, out: Box[]) {
  const [x, z] = polar(a, (r0 + r1) / 2)
  out.push({ x, y: FLOOR6 + MAZE.hedge.h / 2, z, w: r1 - r0, h: MAZE.hedge.h, d: MAZE.hedge.t, rotY: -a })
}

let hedgeCache: Box[] | null = null
/** Every hedge in the maze, as boxes: drawn as they are, collided as they are. */
export function mazeHedges(): Box[] {
  if (hedgeCache) return hedgeCache
  const out: Box[] = []
  const R = MAZE.radii
  for (let j = 0; j < S; j++) if (!ENTRANCES.includes(j)) hedgeArc(R[0], sectorAngle(j), sectorAngle(j + 1), out)
  for (let i = 0; i < RINGS - 1; i++)
    for (let j = 0; j < S; j++) if (!linked(i, j, i + 1, j)) hedgeArc(R[i + 1], sectorAngle(j), sectorAngle(j + 1), out)
  for (let i = 0; i < RINGS; i++) {
    const r0 = R[i] - MAZE.hedge.t / 2
    const r1 = i === RINGS - 1 ? OUTER - 0.05 : R[i + 1] + MAZE.hedge.t / 2
    for (let j = 0; j < S - 1; j++) if (!linked(i, j, i, j + 1)) hedgeRadial(sectorAngle(j + 1), r0, r1, out)
    hedgeRadial(MAZE_FROM, r0, r1, out)
    hedgeRadial(MAZE_TO, r0, r1, out)
  }
  hedgeCache = out
  return out
}

/** The centre of a maze cell, in world X, Z. */
export function cellCentre(ring: number, sector: number): [number, number] {
  const R = MAZE.radii
  const r1 = ring === RINGS - 1 ? OUTER : R[ring + 1]
  return polar(sectorMid(sector), (R[ring] + r1) / 2)
}

/** The one way through, cell by cell, from an entrance to a room's door. */
export function mazePath(to: RoomId, entrance = ENTRANCES[0]): Array<{ ring: number; sector: number }> {
  const goal = `${RINGS - 1},${roomById(to).sector}`
  const prev = new Map<string, string | null>([[`0,${entrance}`, null]])
  const queue = [{ ring: 0, sector: entrance }]
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
  const a = wrapNear(Math.atan2(z, x), MAZE_FROM + MAZE_SPAN / 2)
  if (a < MAZE_FROM || a > MAZE_TO || r < MAZE.radii[0] || r > OUTER) return null
  let ring = RINGS - 1
  while (ring > 0 && r < MAZE.radii[ring]) ring--
  return { ring, sector: Math.min(S - 1, Math.floor(((a - MAZE_FROM) / MAZE_SPAN) * S)) }
}

/** Where to stand to walk in: on the promenade, in front of each gap. */
export const MAZE_ENTRIES = ENTRANCES.map((j) => ({ angle: sectorMid(j), r: (DECK_INNER + MAZE.radii[0]) / 2 }))

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

function roomBox(r: Room, phi: number, rr: number, w: number, depth: number, h: number, y0 = 0): Box {
  const [x, z] = roomPoint(r, phi, rr)
  return { x, y: FLOOR6 + y0 + h / 2, z, w, h, d: depth, rotY: facingCentre(r, phi) }
}

/** A room's wall, as a ring of boxes, open at the entrance and each corridor. */
function roomWall(r: Room): Box[] {
  const out: Box[] = []
  const R = r.radius + 0.2
  const n = 96
  for (let i = 0; i < n; i++) {
    const phi = -Math.PI + ((i + 0.5) / n) * Math.PI * 2
    if (inWallGap(r, phi, 0.01)) continue
    out.push(roomBox(r, phi, R, ((Math.PI * 2) / n) * R + 0.06, 0.4, r.height))
  }
  return out
}

function corridorSolids(c: Corridor): Box[] {
  const len = Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]) + 0.4
  const mx = (c.from[0] + c.to[0]) / 2
  const mz = (c.from[1] + c.to[1]) / 2
  // A box whose local X runs along the corridor.
  const rotY = -Math.atan2(c.dir[1], c.dir[0])
  const out: Box[] = [{ x: mx, y: FLOOR6 - 0.15, z: mz, w: len, h: 0.3, d: CORRIDOR.half * 2 + 0.8, rotY }]
  for (const side of [-1, 1]) {
    const ox = -c.dir[1] * side * (CORRIDOR.half + 0.2)
    const oz = c.dir[0] * side * (CORRIDOR.half + 0.2)
    out.push({ x: mx + ox, y: FLOOR6 + CORRIDOR.height / 2, z: mz + oz, w: len, h: CORRIDOR.height, d: 0.4, rotY })
  }
  return out
}

export function roomSolids(): Box[] {
  const out: Box[] = []
  for (const r of ROOMS6) {
    const F = r.frame
    out.push(...roomWall(r))
    for (const side of [-1, 1]) {
      const s0 = side * CH_TUNNEL.half
      out.push(F.box(Math.min(s0, s0 + side * 0.4), Math.max(s0, s0 + side * 0.4), CH_TUNNEL.from, CH_TUNNEL.to, 0, 3.4))
    }
    out.push(F.box(-CH_TUNNEL.half - 0.4, CH_TUNNEL.half + 0.4, -0.3, CH_TUNNEL.to + 0.4, -0.3, 0))
  }
  for (const c of CORRIDORS) out.push(...corridorSolids(c))
  // The chamber.
  const C = CHAMBER
  ARCADE_GAMES.forEach((_, k) => out.push(roomBox(C, cabinetPhi(k), CABINET.rr, CABINET.w, CABINET.depth, CABINET.h)))
  out.push(roomBox(C, DRONE_DESK.phi, DRONE_DESK.rr, DRONE_DESK.w, DRONE_DESK.depth, 1.0))
  out.push(roomBox(C, DRONE_PLINTH.phi, DRONE_PLINTH.rr, 0.9, 0.9, 1.0))
  for (const [a0, a1] of SHELF_RUNS) {
    const n = Math.ceil(((a1 - a0) * SHELF.r1) / 1.2)
    for (let i = 0; i < n; i++) {
      const phi = a0 + ((i + 0.5) / n) * (a1 - a0)
      out.push(roomBox(C, phi, (SHELF.r0 + SHELF.r1) / 2, ((a1 - a0) / n) * SHELF.r1 + 0.05, SHELF.r1 - SHELF.r0, SHELF.high))
    }
  }
  // The music hall.
  const M = MUSIC
  out.push(roomBox(M, GRAMOPHONE.phi, GRAMOPHONE.rr, 0.9, 0.9, 1.05 + STAGE.h, 0))
  for (const c of CLOSETS) out.push(roomBox(M, c.phi, c.rr, c.w, c.depth, c.h))
  for (const sp of SPEAKERS) out.push(roomBox(M, sp.phi, sp.rr, 0.9, 0.7, 1.9))
  for (const seat of SEATS) out.push(roomBox(M, seat.phi, seat.rr, 1.5, 0.8, 0.8))
  return out
}

/** The map board's legs and frame, standing on the plaza. */
export function mapBoardBox(): Box {
  const [x, z] = polar(MAP_BOARD.angle, MAP_BOARD.r)
  return { x, y: FLOOR6 + 1.3, z, w: MAP_BOARD.w, h: 2.6, d: 0.3, rotY: -MAP_BOARD.angle - Math.PI / 2 }
}

/** The physics' view of the floor: the hedges, the rooms, the map board. */
export function level6Colliders(): Box[] {
  return [...mazeHedges(), ...roomSolids(), mapBoardBox()]
}

// ---------------------------------------------------------------------------
// What E does, where
// ---------------------------------------------------------------------------

const near = (x: number, z: number, r: Room, phi: number, rr: number, within: number) => {
  const [px, pz] = roomPoint(r, phi, rr)
  return Math.hypot(x - px, z - pz) < within
}

/**
 * What pressing E would do at a point on level 6: each door from either side,
 * the map, and each thing in the rooms from in front of it.
 */
export function level6Interact(x: number, z: number, open: boolean[]): string | null {
  for (let k = 0; k < ROOMS6.length; k++) {
    const { s, d } = ROOMS6[k].frame.from(x, z)
    const front = Math.abs(s) < 2.6 && d > -3.6 && d < CH_DOOR.d - CH_DOOR.half
    const back = Math.abs(s) < CH_TUNNEL.half + 0.2 && d > 1.15 && d < FRONT + 1.4
    if (front || back) return `${open[k] ? 'chamber-close' : 'chamber'}:${k}`
  }
  const [mx, mz] = polar(MAP_BOARD.angle, MAP_BOARD.r - 1.2)
  if (Math.hypot(x - mx, z - mz) < 1.4) return 'maze-map'
  if (inRoom(CHAMBER, x, z)) {
    for (let k = 0; k < ARCADE_GAMES.length; k++) {
      if (near(x, z, CHAMBER, cabinetPhi(k), CABINET.rr - 1.05, 0.95)) return `arcade:${ARCADE_GAMES[k].id}`
    }
    if (near(x, z, CHAMBER, DRONE_DESK.phi, DRONE_DESK.rr - 1.2, 1.7)) return 'drone'
  }
  if (inRoom(MUSIC, x, z)) {
    if (near(x, z, MUSIC, GRAMOPHONE.phi, GRAMOPHONE.rr - 1.9, 1.6)) return 'jukebox'
    for (const c of CLOSETS) if (near(x, z, MUSIC, c.phi, c.rr - 1, 1.6)) return 'jukebox'
  }
  return null
}
