import * as THREE from 'three'
import { WALL_THICK } from '../content/floors'
import type { WallFrame } from '../content/frame'
import type { Box, Gate } from '../content/level1'

/**
 * The pieces every room behind the silo wall is built from: its group in the
 * gate's wall frame, the gate's outline, the passage through the wall, the
 * shell. Level 1's office and hall were built from these first; the rooms on
 * the careers and skills floors use the same ones.
 */

export type RoomSize = { from: number; to: number; half: number; height: number; wall: number }

const dummy = new THREE.Object3D()
const unitBox = new THREE.BoxGeometry(1, 1, 1)

/** One instanced mesh for a list of boxes, each scaled to its own size. */
export function boxes(list: Box[], material: THREE.Material, shadow = true) {
  const mesh = new THREE.InstancedMesh(unitBox, material, Math.max(1, list.length))
  list.forEach((b, i) => {
    dummy.position.set(b.x, b.y, b.z)
    dummy.rotation.set(0, b.rotY, 0)
    dummy.scale.set(b.w, b.h, b.d)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  })
  mesh.count = list.length
  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = shadow
  mesh.receiveShadow = true
  return mesh
}


export function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  paint(ctx)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** A group in a room's frame: local x = s, local z = -d, origin on the deck
 *  floor at the silo wall's inner face. */
export function framed(F: WallFrame) {
  const g = new THREE.Group()
  const [x, z] = F.to(0, 0)
  g.position.set(x, F.floorY, z)
  g.rotation.y = F.yaw
  return g
}

/** A rounded rectangle's outline as points, anticlockwise. */
function outline(halfW: number, halfH: number, r: number, cy: number, seg = 16) {
  const pts: THREE.Vector2[] = []
  const corner = (cx: number, cy0: number, a0: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2)
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy0 + Math.sin(a) * r))
    }
  }
  corner(halfW - r, cy - halfH + r, -Math.PI / 2)
  corner(halfW - r, cy + halfH - r, 0)
  corner(-halfW + r, cy + halfH - r, Math.PI / 2)
  corner(-halfW + r, cy - halfH + r, Math.PI)
  return pts
}

/** The part of a closed outline at or above the floor (y = 0), as an open
 *  chain from its right foot, over the top, to its left foot. */
function aboveFloor(pts: THREE.Vector2[]) {
  // Start at a point under the floor, so the chain above it is unbroken.
  const start = pts.findIndex((p) => p.y < 0)
  const n = pts.length
  const out: THREE.Vector2[] = []
  for (let k = 0; k < n; k++) {
    const p = pts[(start + k) % n]
    const q = pts[(start + k + 1) % n]
    if (p.y >= 0) out.push(p)
    if (p.y >= 0 !== q.y >= 0) {
      const t = p.y / (p.y - q.y)
      out.push(new THREE.Vector2(p.x + (q.x - p.x) * t, 0))
    }
  }
  return out
}

/** Does this gate's outline dip under its floor? */
const sinks = (gate: Gate, pad = 0) => gate.centre - gate.halfH - pad < 0

/**
 * The band between two outlines of a gate, `inner` and `inner + pad`. Where
 * the gate is sunk under its floor, an arch standing on the floor rather than
 * a closed loop: a loop's bottom hung under the deck and showed from the
 * level below.
 */
function gateBand(gate: Gate, pad: number) {
  const o = outline(gate.halfW + pad, gate.halfH + pad, gate.radius + pad, gate.centre)
  const i = outline(gate.halfW, gate.halfH, gate.radius, gate.centre)
  if (!sinks(gate, pad)) {
    const sh = new THREE.Shape(o)
    sh.holes.push(new THREE.Path(i))
    return sh
  }
  return new THREE.Shape([...aboveFloor(o), ...aboveFloor(i).reverse()])
}

/** A rectangle of wall with a gate-shaped hole in it, as a flat mesh. */
export function wallWithHole(halfW: number, y0: number, y1: number, gate: Gate | null, mat: THREE.Material, round?: { r: number; cy: number }) {
  const sh = new THREE.Shape()
  sh.moveTo(-halfW, y0)
  sh.lineTo(halfW, y0)
  sh.lineTo(halfW, y1)
  sh.lineTo(-halfW, y1)
  sh.lineTo(-halfW, y0)
  if (gate) {
    const pts = outline(gate.halfW, gate.halfH, gate.radius, gate.centre)
    // Cut flat at the floor: no hole in the wall under it.
    sh.holes.push(new THREE.Path(sinks(gate) ? aboveFloor(pts) : pts))
  }
  if (round) {
    const h = new THREE.Path()
    h.absarc(0, round.cy, round.r, 0, Math.PI * 2, true)
    sh.holes.push(h)
  }
  return new THREE.Mesh(new THREE.ShapeGeometry(sh, 32), mat)
}

/**
 * The passage through the silo wall: the gate's outline extruded through the
 * wall's thickness, with a face round it standing just proud of the wall on
 * the deck side. Its trim is a separate ring, so it can be brass or timber.
 */
export function gatePassage(gate: Gate, lining: THREE.Material, trim: THREE.Material) {
  const g = new THREE.Group()
  // The lining's outside follows the outline too: a rectangle here showed as
  // a block over the opening and a frame round it inside.
  const pad = 0.12
  const outer = gateBand(gate, pad)
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: WALL_THICK + 0.04, bevelEnabled: false, curveSegments: 24 }), lining)
  body.position.z = -WALL_THICK - 0.01
  body.receiveShadow = true
  g.add(body)
  // The trim: a band round the outline on the deck face.
  const ring = gateBand(gate, 0.16)
  const band = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.08, bevelEnabled: false, curveSegments: 24 }), trim)
  band.position.z = 0.02
  g.add(band)
  return g
}

/** The shell of a room behind the wall: floor, ceiling, four walls. */
export function roomShell(
  g: THREE.Group,
  R: RoomSize,
  gate: Gate,
  mats: { wall: THREE.Material; floor: THREE.Material; ceil: THREE.Material },
  back?: { r: number; cy: number },
) {
  const len = R.to - R.from
  // Out through the passage in the wall too, to meet the deck.
  // Starting at the wall's face, so it does not overlap the deck and flicker.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.half * 2, R.to), mats.floor)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0.006, -R.to / 2)
  floor.receiveShadow = true
  g.add(floor)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(R.half * 2, len), mats.ceil)
  ceil.rotation.x = Math.PI / 2
  ceil.position.set(0, R.height, -(R.from + R.to) / 2)
  g.add(ceil)
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(len, R.height), mats.wall)
    w.position.set(side * R.half, R.height / 2, -(R.from + R.to) / 2)
    w.rotation.y = -side * (Math.PI / 2)
    w.receiveShadow = true
    g.add(w)
  }
  const backWall = wallWithHole(R.half, 0, R.height, null, mats.wall, back)
  backWall.position.z = -R.to
  backWall.receiveShadow = true
  g.add(backWall)
  const front = wallWithHole(R.half, -0.4, R.height, gate, mats.wall)
  front.position.z = -R.from + 0.01
  front.rotation.y = Math.PI
  g.add(front)
}
