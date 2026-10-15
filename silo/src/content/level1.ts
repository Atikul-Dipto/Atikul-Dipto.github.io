import { SHAFT_RADIUS, contentAngle, walkY } from './floors'

/**
 * LEVEL 1 — the plan.
 *
 * Every solid thing on this floor is described here once, as data, and read
 * twice: by `three/floors/Level01.tsx` to draw it and by the physics to stand
 * in its way. The stair taught the lesson -- a thing drawn from one set of
 * numbers and collided from another is a thing you can walk through -- so on
 * the floor a visitor now spends most of their time, nothing gets drawn that
 * the collision does not also know about.
 *
 * Plan, going round the ring (angles in radians from +X, as everywhere):
 *
 *   1.07 - 2.07   the cutaway: no wall, open to the cavern
 *   ~2.79         ARRIVAL: the bridge from the lift lands here, facing the
 *                 personnel monitor and the portrait on the far wall
 *   3.32 - 4.32   SHERIFF'S OFFICE, with the records vault in its back wall
 *   4.56 - 6.22   CAFETERIA, with the long window onto the outside
 *   the rest      open promenade round to the cutaway
 *
 * Rooms are built on the deck, against the silo wall, behind a curved facade
 * at ROOM_INNER. Between the facades and the handrail is a five-metre
 * promenade running right round the atrium.
 */

/** A box in world space. `x, y, z` is its centre; `w` runs along its local X,
 *  `d` along its local Z, and `rotY` turns it about the vertical. */
export interface Box {
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
  rotY: number
}

export const FLOOR = walkY(1)
export const ROOM_INNER = 13.4
export const WALL_T = 0.32
/** The facade lintel: doors and interior windows stop here. */
const DOOR_HEAD = 2.7

export interface Room {
  id: 'sheriff' | 'cafeteria'
  from: number
  to: number
  height: number
  doorWidth: number
}

export const SHERIFF: Room = { id: 'sheriff', from: 3.32, to: 4.32, height: 4.2, doorWidth: 1.9 }
export const CAFE: Room = { id: 'cafeteria', from: 4.56, to: 6.22, height: 5.6, doorWidth: 5.4 }
export const ROOMS = [SHERIFF, CAFE]

export const mid = (r: Room) => (r.from + r.to) / 2

/** Arrival: the bridge lands facing straight out at the content angle. */
export const ARRIVAL = contentAngle(1)
export const PORTRAIT_ANGLE = ARRIVAL
export const CONSOLE_ANGLE = ARRIVAL - 0.19

/** The records vault: a round door in the sheriff's back wall. */
export const VAULT = {
  angle: mid(SHERIFF),
  radius: 1.5,
  /** Height of the door's centre above the floor. */
  centre: 1.72,
}

/** The cafeteria window, along the outer wall. */
export const WINDOW = {
  from: CAFE.from + 0.16,
  to: CAFE.to - 0.16,
  sill: 0.85,
  head: 4.55,
}

const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)

/** True if `angle` falls inside any room on level 1, padded by `pad`. */
export function inLevel1Room(angle: number, pad = 0) {
  const a = norm(angle)
  return ROOMS.some((r) => {
    const from = norm(r.from - pad)
    const to = norm(r.to + pad)
    return from < to ? a >= from && a <= to : a >= from || a <= to
  })
}

const polar = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r]

/** A box sitting on the floor, tangential to the ring at (a, r). */
function tangential(a: number, r: number, w: number, h: number, d: number, lift = 0): Box {
  const [x, z] = polar(a, r)
  return { x, y: FLOOR + lift + h / 2, z, w, h, d, rotY: -a - Math.PI / 2 }
}

/** A box sitting on the floor, its local X running radially out along `a`. */
function radialBox(a: number, r0: number, r1: number, h: number, d: number, lift = 0): Box {
  const [x, z] = polar(a, (r0 + r1) / 2)
  return { x, y: FLOOR + lift + h / 2, z, w: r1 - r0, h, d, rotY: -a }
}

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

export interface Opening {
  from: number
  to: number
  kind: 'door' | 'window'
}

export interface WallParts {
  /** Opaque concrete, drawn and collided. */
  solid: Box[]
  /** Glazing in the facade: drawn translucent, collided like a wall. */
  glass: Box[]
  /** What the physics sees: one full-height box per facade segment. */
  collide: Box[]
}

/**
 * A curved wall as a run of short straight segments, with openings.
 *
 * Straight segments rather than a curved mesh because each one is then a
 * cuboid for the physics as well as for the eye, and at this radius a segment
 * every 0.05 rad is under 0.7 m long -- the facets do not show.
 */
function arcWall(from: number, to: number, r: number, height: number, openings: Opening[]): WallParts {
  const out: WallParts = { solid: [], glass: [], collide: [] }
  const step = 0.05
  const n = Math.max(1, Math.round((to - from) / step))
  const da = (to - from) / n
  const seg = 2 * r * Math.sin(da / 2) + 0.04
  for (let i = 0; i < n; i++) {
    const a = from + (i + 0.5) * da
    const hole = openings.find((o) => a > o.from && a < o.to)
    if (!hole) {
      const b = tangential(a, r, seg, height, WALL_T)
      out.solid.push(b)
      out.collide.push(b)
      continue
    }
    // Lintel over every opening.
    out.solid.push(tangential(a, r, seg, height - DOOR_HEAD, WALL_T, DOOR_HEAD))
    if (hole.kind === 'window') {
      out.solid.push(tangential(a, r, seg, 0.95, WALL_T))
      out.glass.push(tangential(a, r, seg, DOOR_HEAD - 0.95, 0.04, 0.95))
      out.collide.push(tangential(a, r, seg, height, WALL_T))
    }
  }
  return out
}

/** Everything that makes up one room's walls. */
export function roomWalls(room: Room): WallParts {
  const m = mid(room)
  const doorHalf = room.doorWidth / 2 / ROOM_INNER
  const openings: Opening[] = [{ from: m - doorHalf, to: m + doorHalf, kind: 'door' }]
  // The cafeteria's facade is glazed either side of its doors, so the room
  // reads from the promenade and the promenade from the tables.
  if (room.id === 'cafeteria') {
    openings.push(
      { from: room.from + 0.1, to: m - doorHalf - 0.06, kind: 'window' },
      { from: m + doorHalf + 0.06, to: room.to - 0.1, kind: 'window' },
    )
  }
  const facade = arcWall(room.from, room.to, ROOM_INNER, room.height, openings)

  // Radial side walls, from the facade out to the silo wall.
  const sides = [room.from, room.to].map((a) =>
    radialBox(a, ROOM_INNER - WALL_T / 2, SHAFT_RADIUS - 0.05, room.height, WALL_T),
  )

  return {
    solid: [...facade.solid, ...sides],
    glass: facade.glass,
    collide: [...facade.collide, ...sides],
  }
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

export interface Table {
  a: number
  r: number
}

/**
 * Cafeteria tables, in two rows, with a clear aisle from the doors straight
 * to the window. Two rows rather than three: three left 20 cm between one
 * row's chairs and the next, which is a room you can see but not cross.
 */
export const CAFE_TABLE = { w: 2.2, d: 0.95, h: 0.76 }
export const cafeTables: Table[] = (() => {
  const out: Table[] = []
  const m = mid(CAFE)
  const aisle = 0.13
  for (const r of [15.7, 19.0]) {
    const pitch = 3.5 / r
    // Keep each table's END, not its centre, clear of what is beside it: the
    // serving counter on one side and the plain side wall on the other.
    const lo = CAFE.from + 3.0 / r
    const hi = CAFE.to - 2.2 / r
    for (const side of [-1, 1]) {
      let a = m + side * (aisle + pitch / 2)
      while (side < 0 ? a > lo : a < hi) {
        out.push({ a, r })
        a += side * pitch
      }
    }
  }
  return out
})()

export interface Seat {
  x: number
  z: number
  /** Rotation so the seat faces its table. */
  rotY: number
}

/** Four chairs to a table, two on each long side, facing in. */
export const cafeChairs: Seat[] = cafeTables.flatMap(({ a, r }) => {
  const seats: Seat[] = []
  // Tangent along the table, and the radial direction across it.
  const tx = -Math.sin(a)
  const tz = Math.cos(a)
  const rx = Math.cos(a)
  const rz = Math.sin(a)
  for (const across of [-1, 1]) {
    for (const along of [-0.55, 0.55]) {
      const x = rx * (r + across * 0.82) + tx * along
      const z = rz * (r + across * 0.82) + tz * along
      // Face back towards the table's centre line.
      const fx = -across * rx
      const fz = -across * rz
      seats.push({ x, z, rotY: Math.atan2(fx, fz) })
    }
  }
  return seats
})

/** The serving counter, along the cafeteria's first side wall. */
export const CAFE_COUNTER = radialBox(CAFE.from + 0.07, 14.6, 20.4, 1.02, 0.85)

export const SHERIFF_DESK = { w: 1.7, d: 0.82, h: 0.76 }
/** Desks either side of the walk from the door to the vault, facing the door. */
export const sheriffDesks: Table[] = [
  { a: mid(SHERIFF) - 0.15, r: 15.9 },
  { a: mid(SHERIFF) + 0.15, r: 15.9 },
  { a: mid(SHERIFF) - 0.13, r: 18.7 },
  { a: mid(SHERIFF) + 0.13, r: 18.7 },
]

/** A chair behind each desk, on the side away from the door. */
export const sheriffChairs: Seat[] = sheriffDesks.map(({ a, r }) => {
  const [x, z] = polar(a, r + 0.78)
  // Facing in, towards the desk and the door beyond it.
  return { x, z, rotY: Math.atan2(-Math.cos(a), -Math.sin(a)) }
})

/** Filing cabinets lined up against both side walls. */
export const sheriffCabinets: Box[] = (() => {
  const out: Box[] = []
  for (const [a, side] of [
    [SHERIFF.from, 1],
    [SHERIFF.to, -1],
  ] as const) {
    for (let k = 0; k < 4; k++) {
      const r = 14.4 + k * 0.62
      // Step in off the side wall by the wall's half-thickness and the
      // cabinet's half-depth, measured as an angle at this radius.
      const off = (WALL_T / 2 + 0.32) / r
      const [x, z] = polar(a + side * off, r)
      out.push({ x, y: FLOOR + 0.66, z, w: 0.56, h: 1.32, d: 0.62, rotY: -a })
    }
  }
  return out
})()

/** The deep portal the vault door sits in, standing proud of the back wall. */
export function vaultPortal(): Box[] {
  const a = VAULT.angle
  const r = SHAFT_RADIUS - 0.45
  const R = VAULT.radius
  return [
    // Jambs.
    tangential(a + (R + 0.55) / r, r, 0.9, 3.9, 0.9),
    tangential(a - (R + 0.55) / r, r, 0.9, 3.9, 0.9),
    // Head.
    tangential(a, r, 2 * R + 2.0, 0.55, 0.9, 3.65),
  ]
}

// ---------------------------------------------------------------------------
// Arrival
// ---------------------------------------------------------------------------

/** The personnel monitor and the portrait both stand proud of the wall. */
export const arrivalSolids: Box[] = [
  tangential(PORTRAIT_ANGLE, SHAFT_RADIUS - 0.32, 4.3, 4.4, 0.6, 0.2),
  tangential(CONSOLE_ANGLE, SHAFT_RADIUS - 0.85, 3.3, 1.7, 1.25),
]

// ---------------------------------------------------------------------------
// Collision, all of it
// ---------------------------------------------------------------------------

const CHAIR = { w: 0.46, h: 0.86, d: 0.46 }

/** Every cuboid on level 1 that a body must not pass through. */
export function level1Colliders(): Box[] {
  const out: Box[] = []
  for (const room of ROOMS) out.push(...roomWalls(room).collide)
  for (const t of cafeTables) out.push(tangential(t.a, t.r, CAFE_TABLE.w, CAFE_TABLE.h, CAFE_TABLE.d))
  for (const c of cafeChairs) {
    out.push({ x: c.x, y: FLOOR + CHAIR.h / 2, z: c.z, w: CHAIR.w, h: CHAIR.h, d: CHAIR.d, rotY: c.rotY })
  }
  out.push(CAFE_COUNTER)
  for (const t of sheriffDesks) out.push(tangential(t.a, t.r, SHERIFF_DESK.w, SHERIFF_DESK.h, SHERIFF_DESK.d))
  for (const c of sheriffChairs) {
    out.push({ x: c.x, y: FLOOR + CHAIR.h / 2, z: c.z, w: CHAIR.w, h: CHAIR.h, d: CHAIR.d, rotY: c.rotY })
  }
  out.push(...sheriffCabinets)
  out.push(...vaultPortal())
  // The vault door itself, shut: a slab across the portal.
  out.push(tangential(VAULT.angle, SHAFT_RADIUS - 0.25, VAULT.radius * 2 + 0.2, 3.6, 0.5))
  out.push(...arrivalSolids)
  return out
}

export { tangential, radialBox, polar, CHAIR }
