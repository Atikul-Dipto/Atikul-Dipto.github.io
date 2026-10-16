import * as THREE from 'three'
import { PLAYER_RADIUS } from '../content/floors'
import { FLOOR, VAULT, fromVault, inVault, toVault } from '../content/level1'

/**
 * The vault door, as plain mutable state shared by the three things that must
 * agree on where it is: the drawn door, its collider, and the body that it
 * must not swing through. Not store state, for the same reason the lift car's
 * height is not: it changes every frame it moves.
 *
 * `t` is the door's progress: 0 shut; 0..1 the handwheel turns; 1..1.4 the
 * door draws straight out of its seat; 1.4..2.6 it swings open on its hinge,
 * out into the office.
 */
export const DOOR_OPEN_T = 2.6
const SWING = 1.75
const DRAW = 0.32

export const vaultDoor = {
  t: 0,
  /** True while the door wants to move and a body is in its way. */
  blocked: false,
  /** performance.now() of the last time the sealed door was tried. */
  knock: 0,
}

export function doorPose(t: number) {
  return {
    wheel: -Math.min(1, t) * Math.PI * 2.4,
    plug: THREE.MathUtils.smoothstep(t, 1, 1.4) * DRAW,
    swing: THREE.MathUtils.smoothstep(t, 1.4, DOOR_OPEN_T) * SWING,
  }
}

/**
 * The door's frame. Its origin is on the vault's axis at the seat; local X runs
 * across the door to the right as seen from the office, local Z back out into
 * the office. The hinge is on the right-hand jamb.
 */
export const HINGE_X = VAULT.radius + 0.05
const HINGE_Z = 0.1
/** Half the door's thickness, and how far the handwheel stands off its face. */
const HALF_T = 0.18
const WHEEL = 0.45

/** A world X, Z in the door's frame. */
function local(x: number, z: number) {
  const { s, d } = toVault(x, z)
  return { lx: s, lz: VAULT.seat - d }
}

/**
 * Would the door, at this pose, be inside a body standing at (x, z)? Tested in
 * plan: the door is a slab from the hinge out to its far edge, as thick as the
 * door plus the handwheel on its face, and the body is a circle a little wider
 * than the capsule.
 */
export function doorHits(x: number, z: number, plug: number, swing: number) {
  const { lx, lz } = local(x, z)
  const u = lx - HINGE_X
  const v = lz - (HINGE_Z + plug)
  // Along the door from the hinge, and across it (positive on its face).
  const ex = -Math.cos(swing)
  const ez = Math.sin(swing)
  const along = u * ex + v * ez
  const across = u * ez - v * ex
  const L = VAULT.radius * 2 + 0.05
  const da = Math.max(0, -along, along - L)
  const dc = Math.max(0, -HALF_T - across, across - WHEEL)
  return Math.hypot(da, dc) < PLAYER_RADIUS + 0.08
}

/**
 * Step the door towards open or shut, as far as the body allows. Returns the
 * new progress. A door that would swing into the body stops where it is and
 * waits -- the visitor has to step back out of its way -- and it will not shut
 * on anyone standing behind it in the tunnel or the room.
 */
export function stepDoor(t: number, open: boolean, dt: number, body: { x: number; z: number } | null) {
  const target = open ? Math.min(DOOR_OPEN_T, t + dt) : Math.max(0, t - dt * 1.6)
  if (target === t) {
    vaultDoor.blocked = false
    return t
  }
  if (body) {
    if (!open && inVault(body.x, body.z)) {
      vaultDoor.blocked = false
      return t
    }
    const now = doorPose(t)
    const next = doorPose(target)
    const moves = next.plug !== now.plug || next.swing !== now.swing
    if (moves && doorHits(body.x, body.z, next.plug, next.swing)) {
      vaultDoor.blocked = true
      return t
    }
  }
  vaultDoor.blocked = false
  return target
}

/** The door's world transform at a pose, for drawing it and colliding it:
 *  the centre of the slab and its yaw. */
export function doorTransform(plug: number, swing: number) {
  const a = VAULT.angle
  const [ox, oz] = fromVault(0, VAULT.seat)
  // Local X is the vault's s; local Z points back along -d.
  const tx = -Math.sin(a)
  const tz = Math.cos(a)
  const nx = Math.cos(a)
  const nz = Math.sin(a)
  const lx = HINGE_X - HINGE_X * Math.cos(swing)
  const lz = HINGE_Z + plug + HINGE_X * Math.sin(swing)
  return {
    x: ox + lx * tx - lz * nx,
    y: FLOOR + VAULT.centre,
    z: oz + lx * tz - lz * nz,
    yaw: Math.PI * 1.5 - a + swing,
  }
}

/** The yaw of the door's frame: local X across the door, Z into the office. */
export const DOOR_FRAME_YAW = Math.PI * 1.5 - VAULT.angle
export const DOOR_HALF_T = HALF_T
