import { useMemo } from 'react'
import * as THREE from 'three'
import { DECK_INNER, LEVEL_COUNT, SHAFT_RADIUS, contentAngle, walkY } from '../content/floors'
import { CREED } from '../content/level1'
import { recordWallSpan } from '../content/layout'
import { openingsOn } from '../content/openings'
import { RAIL_GAP_HALF } from '../content/stairs'

/**
 * Colour and life, level by level.
 *
 * Twelve near-identical decks of grey concrete read as one floor repeated.
 * So each level has a colour of its own, and wears it three ways: a lit cove
 * round the edge of its ceiling over the void and a ring of pendant lamps
 * hung from that ceiling -- what you see of a level from the levels around
 * it -- and a painted band round its wall at hand height. And every rail has
 * planters hung on it, spilling green over the drop.
 *
 * All of it decoration a body never touches: the planters hang on the void
 * side of the rail, the lamps well over head height.
 */

export const LEVEL_COLOURS = [
  '#f2b45c',
  '#4fc3b0',
  '#e8765c',
  '#a9c25a',
  '#d9895b',
  '#6fcf6a',
  '#4fb6e0',
  '#a07de0',
  '#e6c64f',
  '#5b8ee6',
  '#e06f9a',
  '#e0564f',
]
export const levelColour = (level: number) => LEVEL_COLOURS[(level - 1) % LEVEL_COLOURS.length]

/** Height of a level's ceiling over its own deck: the soffit of the deck above. */
const CEILING = 10.6
const PENDANTS = 16
const PENDANT_R = 15
const PLANTERS = 18

const dummy = new THREE.Object3D()
const angDist = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)

/** The arcs of wall a level's band can run along: not across its record
 *  display, the creed, or any opening through the wall. */
function bandArcs(level: number): Array<[number, number]> {
  const blocks: Array<[number, number]> = []
  if (level === 1) blocks.push([CREED.from - 0.03, CREED.to + 0.03])
  else {
    const { from, to } = recordWallSpan(level)
    blocks.push([from - 0.03, to + 0.03])
  }
  for (const o of openingsOn(level)) {
    const half = (o.halfW + 0.4) / SHAFT_RADIUS
    blocks.push([o.angle - half, o.angle + half])
  }
  // Normalise to [0, 2PI) and sort, then take the gaps between them.
  const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  const b = blocks.map(([a0, a1]) => [norm(a0), norm(a0) + (a1 - a0)] as [number, number]).sort((p, q) => p[0] - q[0])
  const out: Array<[number, number]> = []
  b.forEach(([, end], i) => {
    let next = b[(i + 1) % b.length][0]
    while (next <= end) next += Math.PI * 2
    if (next - end > 0.05) out.push([end, next])
  })
  return out
}

export default function LevelLife() {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const cordMat = new THREE.MeshStandardMaterial({ color: '#1e1c1a', roughness: 0.8 })
    const shadeMat = new THREE.MeshStandardMaterial({ color: '#2b2824', roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide })
    const levels = Array.from({ length: LEVEL_COUNT - 1 }, (_, i) => i + 2)
    const cords = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), cordMat, levels.length * PENDANTS)
    const shades = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.42, 0.34, 20, 1, true), shadeMat, levels.length * PENDANTS)
    const bulbs = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.11, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      levels.length * PENDANTS,
    )
    let n = 0
    for (const L of levels) {
      const y = walkY(L)
      const colour = new THREE.Color(levelColour(L)).lerp(new THREE.Color('#fff4e0'), 0.45).multiplyScalar(1.6)
      // The cove under the edge of the ceiling, over the void.
      const cove = new THREE.Mesh(
        new THREE.TorusGeometry(DECK_INNER + 0.35, 0.05, 6, 160),
        new THREE.MeshStandardMaterial({ color: levelColour(L), emissive: levelColour(L), emissiveIntensity: 1.5 }),
      )
      cove.rotation.x = Math.PI / 2
      cove.position.y = y + CEILING - 0.12
      group.add(cove)
      // Pendants, a ring of them, kept off the bridge.
      const a0 = contentAngle(L)
      for (let i = 0; i < PENDANTS; i++) {
        const a = a0 + ((i + 0.5) / PENDANTS) * Math.PI * 2
        const x = Math.cos(a) * PENDANT_R
        const z = Math.sin(a) * PENDANT_R
        const drop = 2.6 + ((i * 7) % 5) * 0.25
        dummy.rotation.set(0, 0, 0)
        dummy.position.set(x, y + CEILING - drop / 2, z)
        dummy.scale.set(1, drop, 1)
        dummy.updateMatrix()
        cords.setMatrixAt(n, dummy.matrix)
        dummy.position.set(x, y + CEILING - drop - 0.12, z)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        shades.setMatrixAt(n, dummy.matrix)
        dummy.position.set(x, y + CEILING - drop - 0.24, z)
        dummy.updateMatrix()
        bulbs.setMatrixAt(n, dummy.matrix)
        bulbs.setColorAt(n, colour)
        n++
      }
    }
    for (const m of [cords, shades, bulbs]) {
      m.count = n
      m.instanceMatrix.needsUpdate = true
      group.add(m)
    }
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true

    // The painted band round each level's wall, at hand height.
    for (let L = 1; L <= LEVEL_COUNT; L++) {
      const paint = new THREE.MeshStandardMaterial({ color: levelColour(L), roughness: 0.7 })
      for (const [from, to] of bandArcs(L)) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_RADIUS - 0.035, SHAFT_RADIUS - 0.035, 0.22, Math.max(8, Math.round((to - from) * 40)), 1, true, Math.PI / 2 - to, to - from), paint)
        band.material.side = THREE.BackSide
        band.position.y = walkY(L) + 1.0
        group.add(band)
      }
    }

    // Planters hung on the void side of every rail, spilling green.
    const boxMat = new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 0.8 })
    const leafMat = new THREE.MeshStandardMaterial({ color: '#4f7a3c', roughness: 0.9 })
    const boxesMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.34, 0.36), boxMat, LEVEL_COUNT * PLANTERS)
    const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 1), leafMat, LEVEL_COUNT * PLANTERS * 14)
    let nb = 0
    let nl = 0
    let seed = 99
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    for (let L = 1; L <= LEVEL_COUNT; L++) {
      const a0 = contentAngle(L)
      const y = walkY(L)
      for (let i = 0; i < PLANTERS; i++) {
        const a = a0 + ((i + 0.5) / PLANTERS) * Math.PI * 2
        if (angDist(a, a0) < RAIL_GAP_HALF + 0.12) continue
        const r = DECK_INNER - 0.26
        dummy.position.set(Math.cos(a) * r, y + 0.95, Math.sin(a) * r)
        dummy.rotation.set(0, -a - Math.PI / 2, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        boxesMesh.setMatrixAt(nb++, dummy.matrix)
        // Foliage heaped in it and trailing over the edge.
        for (let k = 0; k < 14; k++) {
          const along = (rand() - 0.5) * 1.0
          const out = rand() * 0.3
          const down = k > 8 ? rand() * 0.9 : 0
          const px = Math.cos(a) * (r - out) - Math.sin(a) * along
          const pz = Math.sin(a) * (r - out) + Math.cos(a) * along
          dummy.position.set(px, y + 1.15 - down, pz)
          dummy.rotation.set(rand() * 3, rand() * 3, rand() * 3)
          dummy.scale.setScalar(0.6 + rand() * 0.6)
          dummy.updateMatrix()
          leaves.setMatrixAt(nl, dummy.matrix)
          leaves.setColorAt(nl, new THREE.Color().setHSL(0.26 + rand() * 0.08, 0.45, 0.25 + rand() * 0.15))
          nl++
        }
      }
    }
    boxesMesh.count = nb
    leaves.count = nl
    boxesMesh.instanceMatrix.needsUpdate = true
    leaves.instanceMatrix.needsUpdate = true
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true
    group.add(boxesMesh, leaves)
    return group
  }, [])
  return <primitive object={parts} />
}
