import { walkY } from './floors'
import { wallFrame } from './frame'
import type { Box } from './level1'
import { identity } from './portfolio'

/**
 * LEVEL 12 — DEEP CORE & CONTACT. The plan.
 *
 * The bottom of the silo. Across the atrium from where the bridge lands, two
 * round openings in the wall lead out into the rock:
 *
 *   2.55   THE REACTOR. A tunnel to a gallery round the rim of a vast round
 *          pit, and in the pit the machine that powers the silo: a column of
 *          turning rings round a burning core, forty metres from top to
 *          bottom. A catwalk runs out over the drop to a platform beside it,
 *          with a console. Conduits carry its power out through the tunnel and
 *          up the silo wall.
 *   3.95   COMMUNICATIONS. A tunnel to a long room of machinery: racks of
 *          equipment down both walls, a transmitter at the end. On the floor
 *          beneath the machines, lit plates with every way to get in touch.
 *
 * Both are laid out in their door's wall frame (content/frame.ts).
 */

export const LEVEL = 12
export const FLOOR12 = walkY(LEVEL)

/** The two openings: round, their bottoms under the floor. */
export const PASSAGE = { radius: 2.2, centre: 1.9 }
export const PASS_HALF = Math.sqrt(PASSAGE.radius ** 2 - PASSAGE.centre ** 2)
export const TUNNEL_TO = 2.6

// ---------------------------------------------------------------------------
// The reactor
// ---------------------------------------------------------------------------

export const RX_FRAME = wallFrame(2.55, FLOOR12)
export const REACTOR = {
  /** Centre of the hall, out from the wall. */
  centre: TUNNEL_TO + 13,
  radius: 13,
  /** The gallery runs round the rim, out from here to the wall. */
  rim: 10.2,
  /** How deep the pit goes below the gallery, and how high the hall rises. */
  depth: 30,
  height: 20,
  /** The machine's core column. */
  core: 2.4,
}
export const CATWALK = { half: 0.9, from: REACTOR.rim + 0.05, to: 6.3 }
export const PLATFORM = { rr: 5.3, radius: 1.5 }
export const CONSOLE = { rr: 4.6 }

/** World X, Z of a point placed round the hall's centre (phi 0 = far side). */
export function reactorPoint(phi: number, rr: number): [number, number] {
  return RX_FRAME.to(Math.sin(phi) * rr, REACTOR.centre + Math.cos(phi) * rr)
}
export function reactorPolar(x: number, z: number) {
  const { s, d } = RX_FRAME.from(x, z)
  const dd = d - REACTOR.centre
  return { phi: Math.atan2(s, dd), rr: Math.hypot(s, dd), s, d }
}

/** A box in the hall, placed round its centre and facing it. */
function hallBox(phi: number, rr: number, w: number, depth: number, h: number, y0: number): Box {
  const [x, z] = reactorPoint(phi, rr)
  return { x, y: FLOOR12 + y0 + h / 2, z, w, h, d: depth, rotY: RX_FRAME.yaw - phi }
}

export function reactorSolids(): Box[] {
  const F = RX_FRAME
  const out: Box[] = []
  const R = REACTOR
  // Tunnel: floor and sides.
  out.push(F.box(-PASS_HALF - 0.4, PASS_HALF + 0.4, -0.3, TUNNEL_TO + 0.6, -0.3, 0))
  for (const side of [-1, 1]) {
    const s0 = side * (PASS_HALF + 0.05)
    out.push(F.box(Math.min(s0, s0 + side * 0.4), Math.max(s0, s0 + side * 0.4), -0.02, TUNNEL_TO + 0.2, 0, 3.6))
  }
  // The gallery: a ring of floor round the rim, and the hall's wall behind it.
  const n = 72
  const rimMid = (R.rim + R.radius) / 2
  const catGap = Math.asin((CATWALK.half + 0.05) / R.rim)
  const doorGap = Math.asin((PASS_HALF + 0.4) / R.radius)
  for (let i = 0; i < n; i++) {
    const phi = -Math.PI + ((i + 0.5) / n) * Math.PI * 2
    const chord = ((Math.PI * 2) / n) * R.radius + 0.1
    out.push(hallBox(phi, rimMid, chord, R.radius - R.rim + 0.1, 0.3, -0.3))
    if (Math.abs(Math.abs(phi) - Math.PI) > doorGap) out.push(hallBox(phi, R.radius + 0.25, chord, 0.4, 6, 0))
    // The rail on the edge of the drop, open where the catwalk goes out.
    if (Math.abs(Math.abs(phi) - Math.PI) > catGap) out.push(hallBox(phi, R.rim, ((Math.PI * 2) / n) * R.rim + 0.06, 0.1, 1.1, 0))
  }
  // The catwalk out over the pit, toward the machine, with its rails.
  const len = CATWALK.from - CATWALK.to
  const mid = (CATWALK.from + CATWALK.to) / 2
  const [cx, cz] = reactorPoint(Math.PI, mid)
  out.push({ x: cx, y: FLOOR12 - 0.12, z: cz, w: CATWALK.half * 2, h: 0.24, d: len + 0.2, rotY: F.yaw })
  for (const side of [-1, 1]) {
    const [rx, rz] = F.to(side * CATWALK.half, R.centre - mid)
    out.push({ x: rx, y: FLOOR12 + 0.55, z: rz, w: 0.08, h: 1.1, d: len, rotY: F.yaw })
  }
  // The platform's rail: a ring of short posts, open toward the catwalk.
  const pd = R.centre - PLATFORM.rr
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2
    if (Math.abs(Math.cos(a) + 1) < 0.2 && Math.abs(a - Math.PI) < 0.7) continue
    const [px, pz] = F.to(Math.sin(a) * PLATFORM.radius, pd + Math.cos(a) * PLATFORM.radius)
    out.push({ x: px, y: FLOOR12 + 0.55, z: pz, w: 0.36, h: 1.1, d: 0.1, rotY: F.yaw - a })
  }
  // The console.
  const [kx, kz] = reactorPoint(Math.PI, CONSOLE.rr)
  out.push({ x: kx, y: FLOOR12 + 0.5, z: kz, w: 1.2, h: 1.0, d: 0.6, rotY: F.yaw })
  return out
}

/** The platform's floor, for the physics: a disc. */
export const platformCentre = () => reactorPoint(Math.PI, PLATFORM.rr)

// ---------------------------------------------------------------------------
// Communications
// ---------------------------------------------------------------------------

export const CX_FRAME = wallFrame(3.95, FLOOR12)
export const COMMS = { from: TUNNEL_TO, to: 15, half: 6, height: 5.2 }
export const RACK = { depth: 0.9, h: 2.6, w: 1.1, from: 4.2, to: 13.2 }

/** The ways to get in touch, each a lit plate on the floor under the machines. */
export interface ContactPlate {
  id: string
  label: string
  value: string
  href: string
  /** Where it lies, in the room's frame. */
  s: number
  d: number
}
const linkHref = (label: string) => identity.links.find((l) => l.label === label)?.href
/** A link as it reads on the plate: the real address, without the scheme. */
const shown = (href: string) => href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
const plates: Array<Omit<ContactPlate, 's' | 'd'> | null> = [
  { id: 'email', label: 'Email', value: identity.email, href: `mailto:${identity.email}` },
  identity.phone ? { id: 'phone', label: 'Phone', value: identity.phone, href: `tel:${identity.phone.replace(/\s+/g, '')}` } : null,
  linkHref('LinkedIn') ? { id: 'linkedin', label: 'LinkedIn', value: shown(linkHref('LinkedIn')!), href: linkHref('LinkedIn')! } : null,
  linkHref('GitHub') ? { id: 'github', label: 'GitHub', value: shown(linkHref('GitHub')!), href: linkHref('GitHub')! } : null,
  linkHref('Portfolio') ? { id: 'portfolio', label: 'Portfolio', value: shown(linkHref('Portfolio')!), href: linkHref('Portfolio')! } : null,
]
/** Laid out in front of the racks, alternating sides, toward the transmitter. */
export const CONTACTS: ContactPlate[] = plates
  .filter((p): p is Omit<ContactPlate, 's' | 'd'> => p !== null)
  .map((p, i) => ({ ...p, s: (i % 2 ? 1 : -1) * (COMMS.half - RACK.depth - 0.9), d: 5 + i * 1.9 }))

export function commsSolids(): Box[] {
  const F = CX_FRAME
  const C = COMMS
  const out: Box[] = []
  out.push(F.box(-PASS_HALF - 0.4, PASS_HALF + 0.4, -0.3, C.from + 0.6, -0.3, 0))
  for (const side of [-1, 1]) {
    const s0 = side * (PASS_HALF + 0.05)
    out.push(F.box(Math.min(s0, s0 + side * 0.4), Math.max(s0, s0 + side * 0.4), -0.02, C.from + 0.1, 0, 3.6))
  }
  // Floor, walls.
  out.push(F.box(-C.half - 0.4, C.half + 0.4, C.from, C.to + 0.4, -0.3, 0))
  out.push(F.box(-C.half - 0.4, -C.half, C.from, C.to, 0, C.height))
  out.push(F.box(C.half, C.half + 0.4, C.from, C.to, 0, C.height))
  out.push(F.box(-C.half, C.half, C.to, C.to + 0.4, 0, C.height))
  out.push(F.box(-C.half, -PASS_HALF - 0.05, C.from - 0.4, C.from, 0, C.height))
  out.push(F.box(PASS_HALF + 0.05, C.half, C.from - 0.4, C.from, 0, C.height))
  // Racks down both walls, the transmitter at the end.
  for (const side of [-1, 1]) out.push(F.box(side > 0 ? C.half - RACK.depth : -C.half, side > 0 ? C.half : -C.half + RACK.depth, RACK.from, RACK.to, 0, RACK.h))
  out.push(F.box(-2.6, 2.6, C.to - 1.4, C.to, 0, 2.2))
  return out
}

export function level12Colliders(): Box[] {
  return [...reactorSolids(), ...commsSolids()]
}

/** True inside either room or its tunnel. */
export function inReactor(x: number, z: number) {
  const { s, d } = RX_FRAME.from(x, z)
  if (d > -0.05 && d < TUNNEL_TO + 0.5 && Math.abs(s) < PASS_HALF + 0.3) return true
  return reactorPolar(x, z).rr < REACTOR.radius
}
export function inComms(x: number, z: number) {
  const { s, d } = CX_FRAME.from(x, z)
  return d > -0.05 && d < COMMS.to && Math.abs(s) < (d < COMMS.from ? PASS_HALF + 0.3 : COMMS.half)
}

/** What E does on level 12: the console, and each contact plate. */
export function level12Interact(x: number, z: number): string | null {
  if (inReactor(x, z)) {
    const [kx, kz] = reactorPoint(Math.PI, CONSOLE.rr + 0.9)
    return Math.hypot(x - kx, z - kz) < 1.2 ? 'reactor' : null
  }
  if (inComms(x, z)) {
    const { s, d } = CX_FRAME.from(x, z)
    let best: ContactPlate | null = null
    let bd = 1.9
    for (const c of CONTACTS) {
      const dist = Math.hypot(s - c.s, d - c.d)
      if (dist < bd) {
        bd = dist
        best = c
      }
    }
    return best ? `contact:${best.id}` : null
  }
  return null
}
