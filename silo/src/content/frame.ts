import { SHAFT_RADIUS } from './floors'
import type { Box } from './level1'

/**
 * A frame on the silo wall, for anything built through it.
 *
 * `s` runs across the wall, to the right as you face it from the deck; `d`
 * runs straight out from the shaft, with d = 0 on the inner face of the wall.
 * Rooms cut into the rock beyond the wall are square to their door, so they
 * are laid out in this frame rather than in rings.
 *
 * The same construction as the level 1 vault's frame (content/level1.ts),
 * made reusable for every other door in the wall.
 */
export interface WallFrame {
  angle: number
  /** World X, Z of a point in the frame. */
  to: (s: number, d: number) => [number, number]
  /** A world X, Z in the frame. */
  from: (x: number, z: number) => { s: number; d: number }
  /** A box from its extents in the frame; heights from `floorY`. */
  box: (s0: number, s1: number, d0: number, d1: number, y0: number, y1: number) => Box
  /** Yaw that turns a box's local X onto the frame's s. */
  yaw: number
  /** The floor the frame's heights are measured from. */
  floorY: number
}

export function wallFrame(angle: number, floorY: number): WallFrame {
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  const to = (s: number, d: number): [number, number] => [ca * (SHAFT_RADIUS + d) - sa * s, sa * (SHAFT_RADIUS + d) + ca * s]
  const yaw = -angle - Math.PI / 2
  return {
    angle,
    to,
    from: (x, z) => ({ s: -sa * x + ca * z, d: ca * x + sa * z - SHAFT_RADIUS }),
    box: (s0, s1, d0, d1, y0, y1) => {
      const [x, z] = to((s0 + s1) / 2, (d0 + d1) / 2)
      return { x, y: floorY + (y0 + y1) / 2, z, w: s1 - s0, h: y1 - y0, d: d1 - d0, rotY: yaw }
    },
    yaw,
    floorY,
  }
}

/** A deterministic random sequence, so generated plans are the same on every
 *  visit -- and the same for the drawing and the physics. */
export function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
