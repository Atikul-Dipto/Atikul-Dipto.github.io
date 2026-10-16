import { SHAFT_RADIUS, WALL_THICK, contentAngle, walkY } from './floors'
import { wallFrame } from './frame'

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
 *   3.82          SHERIFF'S OFFICE: a round-topped door in the silo wall,
 *                 and the office behind it, cut into the rock. The records
 *                 vault is in its back wall: a round door, a room beyond it,
 *                 and a second door at the far end that is sealed
 *   5.39          CAFETERIA: a wide pill-shaped opening in the silo wall,
 *                 steps up to it, and the hall behind, with the camera's view
 *                 of the surface on its far wall
 *   0.20 - 0.80   THE CREED: a curved display set into the wall, across
 *                 the atrium from the arrival
 *   the rest      open promenade round to the cutaway
 *
 * The rooms are not on the deck: each is entered through a gate in the silo
 * wall and lies beyond it, laid out in that gate's wall frame (content/frame.ts),
 * so the deck is an open promenade right round the atrium.
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

/**
 * How far behind the silo wall the vault's frame starts: the depth of the
 * sheriff's office, whose back wall the vault door is set in. Every vault
 * dimension above is measured from that wall, as it once was from the silo
 * wall when the office stood on the deck.
 */
export const VAULT_D0 = 9.1

/** World X, Z of a point in the vault's frame. */
export function fromVault(sv: number, dv: number): [number, number] {
  const a = VAULT.angle
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const r = SHAFT_RADIUS + VAULT_D0 + dv
  return [ca * r - sa * sv, sa * r + ca * sv]
}

/** A world X, Z in the vault's frame. */
export function toVault(x: number, z: number) {
  const a = VAULT.angle
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  return { s: -sa * x + ca * z, d: ca * x + sa * z - SHAFT_RADIUS - VAULT_D0 }
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

/** True if `angle` falls on either room's gate in the silo wall, padded by `pad`. */
export function inLevel1Room(angle: number, pad = 0) {
  return [
    [OFFICE_F.angle, OFFICE_GATE.halfW],
    [HALL_F.angle, HALL_GATE.halfW],
  ].some(([a, half]) => Math.abs(((angle - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < (half + 0.5) / SHAFT_RADIUS + pad)
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
// The rooms behind the wall
// ---------------------------------------------------------------------------

/** Each room's frame: `s` across its gate, `d` out through it from the deck. */
export const OFFICE_F = wallFrame(mid(SHERIFF), FLOOR)
export const HALL_F = wallFrame(mid(CAFE), FLOOR)

/** The office runs back from the silo wall to the wall the vault is set in. */
export const OFFICE = { from: WALL_THICK, to: VAULT_D0, half: 6.5, height: 4.2, wall: 0.35 }
/** The cafeteria hall. */
export const HALL = { from: WALL_THICK, to: 15.4, half: 11, height: 5.6, wall: 0.4 }

/**
 * A gate through the silo wall: a rounded rectangle, `centre` above the floor.
 * The office's is a round-topped door; the cafeteria's a wide pill, its foot
 * sunk below the floor so its rounded ends come down to the steps.
 */
export interface Gate {
  halfW: number
  halfH: number
  radius: number
  centre: number
}
export const OFFICE_GATE: Gate = { halfW: 1.15, halfH: 2.0, radius: 1.15, centre: 1.0 }
export const HALL_GATE: Gate = { halfW: 3.7, halfH: 2.3, radius: 1.9, centre: 2.1 }
/** The cafeteria's step: up from the deck onto a sill through the wall, and
 *  down again into the hall. */
export const HALL_SILL = { h: 0.3, out: -0.9, in: WALL_THICK + 0.9 }

/** Half a gate's width at height `y` above the floor. */
export function gateHalfAt(g: Gate, y: number) {
  const dy = Math.abs(y - g.centre)
  const straight = g.halfH - g.radius
  if (dy <= straight) return g.halfW
  const k = dy - straight
  return k >= g.radius ? 0 : g.halfW - g.radius + Math.sqrt(g.radius ** 2 - k ** 2)
}
/** What a body can use: the width at its feet, less a little. */
export const OFFICE_PASS = gateHalfAt(OFFICE_GATE, 0.05) - 0.05
export const HALL_PASS = gateHalfAt(HALL_GATE, HALL_SILL.h + 0.05) - 0.08

/** The cafeteria's camera screen, on the hall's far wall. */
export const SCREEN = { half: 10, sill: 0.9, head: 4.6 }

type Frame = typeof OFFICE_F
type RoomSize = { from: number; to: number; half: number; height: number; wall: number }

/** A room's walls and the passage through the silo wall, for the physics. */
function roomSolids(F: Frame, R: RoomSize, pass: number, backGap = 0): Box[] {
  const out: Box[] = []
  const top = R.height + 0.3
  // The silo wall either side of the gate's passage, and the room's front.
  out.push(F.box(pass, R.half + R.wall, -0.02, R.from + 0.15, 0, top))
  out.push(F.box(-R.half - R.wall, -pass, -0.02, R.from + 0.15, 0, top))
  // Sides and back.
  out.push(F.box(R.half, R.half + R.wall, R.from, R.to + R.wall, 0, top))
  out.push(F.box(-R.half - R.wall, -R.half, R.from, R.to + R.wall, 0, top))
  if (backGap > 0) {
    out.push(F.box(backGap, R.half, R.to, R.to + R.wall, 0, top))
    out.push(F.box(-R.half, -backGap, R.to, R.to + R.wall, 0, top))
  } else out.push(F.box(-R.half, R.half, R.to, R.to + R.wall, 0, top))
  // The floor, level with the deck.
  out.push(F.box(-R.half - R.wall, R.half + R.wall, -0.3, R.to + R.wall, -0.3, 0))
  return out
}

/** The cafeteria's sill, for the physics: a ramp each side under the drawn
 *  steps, which the capsule takes better than a square edge. */
export function hallSillRamps(): Array<[Float32Array, Uint32Array]> {
  const half = HALL_PASS
  const ramp = (d0: number, h0: number, d1: number, h1: number): [Float32Array, Uint32Array] => {
    const pts: Array<[number, number, number]> = [
      [-half, d0, h0],
      [half, d0, h0],
      [half, d1, h1],
      [-half, d1, h1],
    ]
    const v = new Float32Array(12)
    pts.forEach(([sv, dv, h], i) => {
      const [x, z] = HALL_F.to(sv, dv)
      v.set([x, FLOOR + h, z], i * 3)
    })
    return [v, new Uint32Array([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2])]
  }
  return [ramp(HALL_SILL.out, 0, 0, HALL_SILL.h), ramp(WALL_THICK, HALL_SILL.h, HALL_SILL.in, 0)]
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

/** Where a table or a desk stands, and which way it is turned: its long side
 *  runs along its local X. */
export interface Table {
  x: number
  z: number
  rotY: number
}

const placed = (F: Frame, sv: number, dv: number): Table => {
  const [x, z] = F.to(sv, dv)
  return { x, z, rotY: F.yaw }
}

/** A table's local axes in the world: along it (X) and across it (Z). */
export const tableAxes = (t: Table) => ({
  ax: Math.cos(t.rotY),
  az: -Math.sin(t.rotY),
  cx: Math.sin(t.rotY),
  cz: Math.cos(t.rotY),
})

/** A box on a table's footprint, standing on the floor (or lifted). */
export const tableBox = (t: Table, w: number, h: number, d: number, lift = 0): Box => ({
  x: t.x,
  y: FLOOR + lift + h / 2,
  z: t.z,
  w,
  h,
  d,
  rotY: t.rotY,
})

/**
 * Cafeteria tables, in rows either side of an aisle that runs from the gate
 * straight to the screen.
 */
export const CAFE_TABLE = { w: 2.2, d: 0.95, h: 0.76 }
export const cafeTables: Table[] = [4.4, 7.3, 10.2, 13.1].flatMap((dv) =>
  [-8.3, -5.4, -2.5, 2.5, 5.4, 8.3].map((sv) => placed(HALL_F, sv, dv)),
)

export interface Seat {
  x: number
  z: number
  /** Rotation so the seat faces its table. */
  rotY: number
}

/** Four chairs to a table, two on each long side, facing in. */
export const cafeChairs: Seat[] = cafeTables.flatMap((t) => {
  const { ax, az, cx, cz } = tableAxes(t)
  const seats: Seat[] = []
  for (const across of [-1, 1])
    for (const along of [-0.55, 0.55]) {
      seats.push({
        x: t.x + ax * along + cx * across * 0.82,
        z: t.z + az * along + cz * across * 0.82,
        rotY: Math.atan2(-cx * across, -cz * across),
      })
    }
  return seats
})

/** The serving counter, along the cafeteria's left-hand wall. */
export const CAFE_COUNTER = HALL_F.box(-HALL.half + 0.05, -HALL.half + 0.9, 3.0, 13.0, 0, 1.02)

export const SHERIFF_DESK = { w: 1.7, d: 0.82, h: 0.76 }
/**
 * Desks either side of the walk from the door to the vault, facing the door.
 * The pair nearer the vault stands wide of it: the vault door swings out three
 * metres into the office.
 */
export const sheriffDesks: Table[] = [
  placed(OFFICE_F, -2.4, 3.0),
  placed(OFFICE_F, 2.4, 3.0),
  placed(OFFICE_F, -3.9, 5.8),
  placed(OFFICE_F, 3.9, 5.8),
]

/** A chair behind each desk, on the side away from the door, facing it. */
export const sheriffChairs: Seat[] = sheriffDesks.map((t) => {
  const { cx, cz } = tableAxes(t)
  // The table's local Z points back toward the door.
  return { x: t.x - cx * 0.78, z: t.z - cz * 0.78, rotY: Math.atan2(cx, cz) }
})

/** Filing cabinets lined up against both side walls. */
export const sheriffCabinets: Box[] = [-1, 1].flatMap((side) =>
  [0, 1, 2, 3].map((k) => {
    const s0 = side > 0 ? OFFICE.half - 0.62 : -OFFICE.half
    return OFFICE_F.box(s0, s0 + 0.62, 1.7 + k * 0.62, 1.7 + k * 0.62 + 0.56, 0, 1.32)
  }),
)

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
  out.push(...roomSolids(OFFICE_F, OFFICE, OFFICE_PASS, VAULT_PORTAL.outer))
  out.push(...roomSolids(HALL_F, HALL, HALL_PASS))
  // The sill's flat, through the wall.
  out.push(HALL_F.box(-HALL_PASS - 0.1, HALL_PASS + 0.1, 0, WALL_THICK, -0.2, HALL_SILL.h))
  for (const t of cafeTables) out.push(tableBox(t, CAFE_TABLE.w, CAFE_TABLE.h, CAFE_TABLE.d))
  for (const c of cafeChairs) {
    out.push({ x: c.x, y: FLOOR + CHAIR.h / 2, z: c.z, w: CHAIR.w, h: CHAIR.h, d: CHAIR.d, rotY: c.rotY })
  }
  out.push(CAFE_COUNTER)
  for (const t of sheriffDesks) out.push(tableBox(t, SHERIFF_DESK.w, SHERIFF_DESK.h, SHERIFF_DESK.d))
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
