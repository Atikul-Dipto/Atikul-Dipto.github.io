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

/** A rounded rectangle as a path, centred on (0, cy). */
export function roundedRect<T extends THREE.Path>(p: T, halfW: number, halfH: number, r: number, cy: number, reverse = false) {
  const x0 = -halfW
  const x1 = halfW
  const y0 = cy - halfH
  const y1 = cy + halfH
  if (!reverse) {
    p.moveTo(x0 + r, y0)
    p.lineTo(x1 - r, y0)
    p.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false)
    p.lineTo(x1, y1 - r)
    p.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false)
    p.lineTo(x0 + r, y1)
    p.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false)
    p.lineTo(x0, y0 + r)
    p.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false)
  } else {
    p.moveTo(x0 + r, y0)
    p.absarc(x0 + r, y0 + r, r, Math.PI * 1.5, Math.PI, true)
    p.lineTo(x0, y1 - r)
    p.absarc(x0 + r, y1 - r, r, Math.PI, Math.PI / 2, true)
    p.lineTo(x1 - r, y1)
    p.absarc(x1 - r, y1 - r, r, Math.PI / 2, 0, true)
    p.lineTo(x1, y0 + r)
    p.absarc(x1 - r, y0 + r, r, 0, -Math.PI / 2, true)
  }
  return p
}

/** A rectangle of wall with a gate-shaped hole in it, as a flat mesh. */
export function wallWithHole(halfW: number, y0: number, y1: number, gate: Gate | null, mat: THREE.Material, round?: { r: number; cy: number }) {
  const sh = new THREE.Shape()
  sh.moveTo(-halfW, y0)
  sh.lineTo(halfW, y0)
  sh.lineTo(halfW, y1)
  sh.lineTo(-halfW, y1)
  sh.lineTo(-halfW, y0)
  if (gate) sh.holes.push(roundedRect(new THREE.Path(), gate.halfW, gate.halfH, gate.radius, gate.centre, true))
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
  const outer = roundedRect(new THREE.Shape(), gate.halfW + pad, gate.halfH + pad, gate.radius + pad, gate.centre)
  outer.holes.push(roundedRect(new THREE.Path(), gate.halfW, gate.halfH, gate.radius, gate.centre, true))
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: WALL_THICK + 0.04, bevelEnabled: false, curveSegments: 24 }), lining)
  body.position.z = -WALL_THICK - 0.01
  body.receiveShadow = true
  g.add(body)
  // The trim: a band round the outline on the deck face.
  const ring = new THREE.Shape()
  roundedRect(ring, gate.halfW + 0.16, gate.halfH + 0.16, gate.radius + 0.16, gate.centre)
  ring.holes.push(roundedRect(new THREE.Path(), gate.halfW, gate.halfH, gate.radius, gate.centre, true))
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
