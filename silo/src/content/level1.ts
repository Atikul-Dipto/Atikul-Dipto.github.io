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
 *   3.32 - 4.32   SHERIFF'S OFFICE, with the records vault in its back wall:
 *                 a round door, and behind it a room cut out of the rock
 *                 beyond the silo wall, ending at a second door that is
 *                 sealed
 *   4.56 - 6.22   CAFETERIA, with the long window onto the outside
 *   0.20 - 0.80   THE CREED: a curved display set into the wall, across
 *                 the atrium from the arrival
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

/**
 * The records vault: a round door in the sheriff's back wall, and the room
 * behind it.
 *
 * Everything about it is placed in its own frame. `s` runs across the door,
 * to the right as you face it from the office; `d` runs straight out from the
 * shaft through the door, with d = 0 on the inner face of the silo wall. The
 * room behind is a straight box, not a ring sector -- it is cut into the rock
 * beyond the wall, square to the door.
 *
 * In section, out from the office:
 *
 *   d -0.9 .. 0      the portal: two jambs and a head standing proud of the
 *                    wall, the door recessed in it
 *   d -0.58 .. -0.22 the door, shut
 *   d -0.22 .. 1.3   a round tunnel through the bulkhead and the wall, with
 *                    a flat sill in it
 *   d 1.3 .. 7.6     the room, its floor level with the sill
 *   d 7.6            the far wall, and a second round door that does not open
 */
export const VAULT = {
  angle: mid(SHERIFF),
  radius: 1.5,
  /** Height of the door's centre above the office floor. */
  centre: 1.55,
  /** d of the door's own origin: the plane its hinge and seat are set from. */
  seat: -0.3,
  /** The sill through the tunnel, and the room's floor, above the office
   *  floor: one step up, inside the autostep. Low enough that the round
   *  opening is still 1.6 m wide where the feet go through it. */
  sill: 0.3,
}

/** The portal round the door: jambs either side, a head above. */
export const VAULT_PORTAL = {
  /** Clear half-width between the jambs: the door's seat ring fits inside. */
  inner: VAULT.radius + 0.3,
  outer: VAULT.radius + 1.2,
  front: -0.9,
  /** Underside of the head. */
  head: VAULT.centre + VAULT.radius + 0.25,
  top: VAULT.centre + VAULT.radius + 0.85,
}

/** The way through: a round tunnel, collided as a slot the width a body
 *  can actually use at foot height. */
export const VAULT_TUNNEL = { from: -0.22, to: 1.3, half: 0.85 }

/** The room behind the door. Clear height is from its floor (the sill). */
export const VAULT_ROOM = { from: 1.3, to: 7.6, half: 2.3, height: 3.4, wall: 0.3 }

/** The second door, in the far wall. It stays shut. */
export const INNER_DOOR = { radius: 1.25, d: VAULT_ROOM.to }

/** The terminal in the room that holds the personnel record. */
export const VAULT_TERMINAL = { s: -1.75, d: 4.2, w: 0.9, depth: 1.5, h: 1.0 }

/** World X, Z of a point in the vault's frame. */
export function fromVault(sv: number, dv: number): [number, number] {
  const a = VAULT.angle
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  return [ca * (SHAFT_RADIUS + dv) - sa * sv, sa * (SHAFT_RADIUS + dv) + ca * sv]
}

/** A world X, Z in the vault's frame. */
export function toVault(x: number, z: number) {
  const a = VAULT.angle
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  return { s: -sa * x + ca * z, d: ca * x + sa * z - SHAFT_RADIUS }
}

/** A box in the vault's frame, from its extents. Heights from the office floor. */
export function vaultBox(s0: number, s1: number, d0: number, d1: number, y0: number, y1: number): Box {
  const [x, z] = fromVault((s0 + s1) / 2, (d0 + d1) / 2)
  return { x, y: FLOOR + (y0 + y1) / 2, z, w: s1 - s0, h: y1 - y0, d: d1 - d0, rotY: -VAULT.angle - Math.PI / 2 }
}

/**
 * The way up onto the sill, for the physics only: a ramp across the portal
 * floor, from the front of the portal up to the sill's edge -- 25 degrees.
 *
 * Not a step. The character controller's autostep would not take the sill
 * with the capsule: its rounded foot meets the edge square on, and it stood
 * there walking into it. The ramp sits under where the shut door stands,
 * which costs nothing -- the door is a moving body and a ramp is fixed, and
 * the two are never tested against each other -- and nobody can be there
 * while the door is shut.
 *
 * Returned as world-space triangles, ready for a trimesh.
 */
export function vaultRamp(): [Float32Array, Uint32Array] {
  const half = VAULT_TUNNEL.half - 0.02
  const pts: Array<[number, number, number]> = [
    [-half, VAULT_PORTAL.front, 0],
    [half, VAULT_PORTAL.front, 0],
    [half, VAULT_TUNNEL.from - 0.03, VAULT.sill],
    [-half, VAULT_TUNNEL.from - 0.03, VAULT.sill],
  ]
  const v = new Float32Array(pts.length * 3)
  pts.forEach(([s, d, h], i) => {
    const [x, z] = fromVault(s, d)
    v.set([x, FLOOR + h, z], i * 3)
  })
  return [v, new Uint32Array([0, 1, 2, 0, 2, 3])]
}

/** True if a world X, Z is in the tunnel or the room, behind the door. */
export function inVault(x: number, z: number) {
  const { s, d } = toVault(x, z)
  return d > VAULT_TUNNEL.from && d < VAULT_ROOM.to && Math.abs(s) < VAULT_ROOM.half
}

/** The cafeteria window, along the outer wall. */
export const WINDOW = {
  from: CAFE.from + 0.16,
  to: CAFE.to - 0.16,
  sill: 0.85,
  head: 4.55,
}

/**
 * The creed wall: a curved display in the silo wall, glass from `plinth` to
 * `top` above the floor, its face at `r`. It wakes when someone comes within
 * `wakeDistance`.
 */
export const CREED = {
  from: 0.2,
  to: 0.8,
  r: SHAFT_RADIUS - 0.25,
  plinth: 0.8,
  top: 5.4,
  wakeDistance: 24,
}

/**
 * What the silo tells itself: the creed from the series, quoted as the site
 * owner supplied it and credited on the wall. The two long sentences are
 * broken in two so the text stays large on the glass.
 */
export const CREED_TEXT = {
  title: 'WHAT WE KNOW',
  subtitle: 'READ ALOUD AT THE AIRLOCK DOOR',
  stanzas: [
    ['WE DO NOT KNOW WHY WE ARE HERE.', 'WE DO NOT KNOW WHO BUILT THE SILO.'],
    ['WE DO NOT KNOW WHY EVERYTHING OUTSIDE', 'THE SILO IS AS IT IS.'],
    ['WE DO NOT KNOW…', 'WHEN IT WILL BE SAFE TO GO OUTSIDE.'],
    ['WE ONLY KNOW THAT DAY IS NOT THIS DAY.'],
  ] as string[][],
  credit: 'FROM SILO · APPLE TV+',
}

const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)

/** True if `angle` falls on the creed wall, padded by `pad`. */
export function inCreed(angle: number, pad = 0) {
  const a = norm(angle)
  return a >= CREED.from - pad && a <= CREED.to + pad
}

/** The creed wall's housing as boxes along its arc, for the physics. */
function creedSolids(): Box[] {
  const out: Box[] = []
  const from = CREED.from - 0.016
  const to = CREED.to + 0.016
  const n = 12
  const r0 = CREED.r - 0.3
  const r1 = SHAFT_RADIUS - 0.05
  for (let i = 0; i < n; i++) {
    const a = from + ((to - from) * (i + 0.5)) / n
    // Chord long enough to overlap its neighbours.
    const w = ((to - from) / n) * r0 + 0.04
    out.push(tangential(a, (r0 + r1) / 2, w, CREED.top + 0.3, r1 - r0))
  }
  return out
}

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
/**
 * Desks either side of the walk from the door to the vault, facing the door.
 * The pair nearer the vault stands wide of it: the vault door swings out three
 * metres into the office, and at the old spacing it swung through a desk and
 * a chair.
 */
export const sheriffDesks: Table[] = [
  { a: mid(SHERIFF) - 0.15, r: 15.9 },
  { a: mid(SHERIFF) + 0.15, r: 15.9 },
  { a: mid(SHERIFF) - 0.21, r: 18.7 },
  { a: mid(SHERIFF) + 0.21, r: 18.7 },
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
  const P = VAULT_PORTAL
  return [
    vaultBox(P.inner, P.outer, P.front, 0, 0, P.top),
    vaultBox(-P.outer, -P.inner, P.front, 0, 0, P.top),
    vaultBox(-P.inner, P.inner, P.front, 0, P.head, P.top),
  ]
}

/**
 * The tunnel and the room, for the physics. The door itself is not here: it
 * moves, so it is a body of its own (physics/VaultDoorBody.tsx).
 */
export function vaultSolids(): Box[] {
  const T = VAULT_TUNNEL
  const R = VAULT_ROOM
  const top = VAULT.sill + R.height
  const outerS = R.half + R.wall
  return [
    // The sill through the tunnel, and the room's floor, level with it.
    vaultBox(-T.half, T.half, T.from - 0.03, T.to, -0.2, VAULT.sill),
    vaultBox(-R.half, R.half, R.from, R.to, -0.2, VAULT.sill),
    // Either side of the tunnel, from the bulkhead to the room: the slot a
    // body can walk through. The round hole is wider than this above the
    // knees; the feet decide.
    vaultBox(T.half, outerS, T.from, R.from, 0, top),
    vaultBox(-outerS, -T.half, T.from, R.from, 0, top),
    // The room's side walls and the far wall.
    vaultBox(R.half, outerS, R.from, R.to + R.wall, 0, top),
    vaultBox(-outerS, -R.half, R.from, R.to + R.wall, 0, top),
    vaultBox(-outerS, outerS, R.to, R.to + R.wall, 0, top),
    // The sealed door, standing proud of the far wall, handwheel and all.
    vaultBox(-INNER_DOOR.radius, INNER_DOOR.radius, R.to - 0.56, R.to, VAULT.sill, VAULT.sill + INNER_DOOR.radius * 2 + 0.2),
    // The record terminal.
    vaultBox(
      VAULT_TERMINAL.s - VAULT_TERMINAL.w / 2,
      VAULT_TERMINAL.s + VAULT_TERMINAL.w / 2,
      VAULT_TERMINAL.d - VAULT_TERMINAL.depth / 2,
      VAULT_TERMINAL.d + VAULT_TERMINAL.depth / 2,
      VAULT.sill,
      VAULT.sill + VAULT_TERMINAL.h,
    ),
    // Archive shelving down the right-hand wall.
    vaultBox(R.half - 0.55, R.half, R.from + 0.5, R.to - 0.5, VAULT.sill, VAULT.sill + 2.6),
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
  out.push(...vaultSolids())
  out.push(...arrivalSolids)
  out.push(...creedSolids())
  return out
}

export { tangential, radialBox, polar, CHAIR }
