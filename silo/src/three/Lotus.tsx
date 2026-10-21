import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CAR_RADIUS, DECK_INNER, LEVEL_COUNT, WATER_DROP, walkY } from '../content/floors'

/**
 * Padma -- lotus -- on the water at the foot of the silo: open flowers, a few
 * buds still closed on their stems, and the round leaves they float among.
 * Most of them in the open middle, where the decks look down on the water;
 * clear of the lift's pier.
 *
 * Each flower is one merged mesh -- three rings of cupped petals round a gold
 * seed head -- drawn once per flower by instancing, with the leaves another
 * instanced mesh: four draw calls for the whole pond.
 */

const WATER_Y = walkY(LEVEL_COUNT) - WATER_DROP

function colourise(g: THREE.BufferGeometry, colour: (t: number, i: number) => THREE.Color, along: (p: THREE.Vector3) => number) {
  const pos = g.attributes.position
  const out = new Float32Array(pos.count * 3)
  const p = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    const c = colour(along(p), i)
    out[i * 3] = c.r
    out[i * 3 + 1] = c.g
    out[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3))
  return g
}

const PALE = new THREE.Color('#fff2f7')
const PINK = new THREE.Color('#ee5e9e')

/** One petal: pointed, cupped across, curving out toward its tip. Base at
 *  the origin, running up +Y, its inside facing +Z. */
function petal(len: number, wid: number) {
  const g = new THREE.PlaneGeometry(1, 1, 4, 8)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * 2
    const t = pos.getY(i) + 0.5
    const w = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)), 0.8) * (1 - t * 0.2)
    pos.setXYZ(i, x * wid * 0.5 * w, t * len, -x * x * wid * 0.22 + t * t * len * 0.16)
  }
  g.computeVertexNormals()
  return colourise(g, (t) => PALE.clone().lerp(PINK, Math.pow(t, 1.4)), (p) => p.y / len)
}

/** A lotus: rings of petals leaning out by `tilts` round its seed head. */
function lotusGeometry(tilts: number[], counts: number[], len: number, wid: number, withHeart: boolean) {
  const parts: THREE.BufferGeometry[] = []
  const m = new THREE.Matrix4()
  tilts.forEach((tilt, k) => {
    const n = counts[k]
    const l = len * (1 - k * 0.12)
    for (let i = 0; i < n; i++) {
      const g = petal(l, wid * (1 - k * 0.1))
      m.makeRotationX(-tilt)
      g.applyMatrix4(m)
      m.makeRotationY((i / n) * Math.PI * 2 + k * 0.4)
      g.applyMatrix4(m)
      parts.push(g)
    }
  })
  if (withHeart) {
    const gold = new THREE.Color('#e9c23d')
    const pod = new THREE.CylinderGeometry(len * 0.2, len * 0.14, len * 0.2, 16)
    pod.translate(0, len * 0.14, 0)
    parts.push(colourise(pod, (t) => gold.clone().lerp(new THREE.Color('#c9cf55'), t), (p) => (p.y > len * 0.2 ? 1 : 0)))
    const ring = new THREE.TorusGeometry(len * 0.23, len * 0.06, 6, 20)
    ring.rotateX(Math.PI / 2)
    ring.translate(0, len * 0.1, 0)
    parts.push(colourise(ring, () => new THREE.Color('#f7b733'), () => 0))
  } else {
    // A bud's stem, down into the water.
    const stem = new THREE.CylinderGeometry(0.018, 0.022, 0.6, 6)
    stem.translate(0, -0.3, 0)
    parts.push(colourise(stem, () => new THREE.Color('#5d7f36'), () => 0))
  }
  for (const g of parts) g.deleteAttribute('uv')
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!
}

/** A floating leaf: round, with its notch to the stem. */
function padGeometry() {
  const g = new THREE.CircleGeometry(0.5, 28, 0.2, Math.PI * 2 - 0.4)
  g.rotateX(-Math.PI / 2)
  return g
}

function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export default function Lotus() {
  const group = useMemo(() => {
    const g = new THREE.Group()
    const rand = random(1931)
    const flowerMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      side: THREE.DoubleSide,
      // A little light of its own, so it reads pink, not black, from the decks.
      emissive: new THREE.Color('#5a2340'),
      emissiveIntensity: 0.9,
    })
    const open = lotusGeometry([1.2, 0.8, 0.38], [10, 8, 6], 0.42, 0.22, true)
    const bud = lotusGeometry([0.16, 0.06], [6, 5], 0.34, 0.2, false)

    // Spots on the water, apart from one another and clear of the lift's pier.
    const taken: Array<[number, number, number]> = []
    const place = (rMin: number, rMax: number, gap: number) => {
      for (let tries = 0; tries < 200; tries++) {
        const a = rand() * Math.PI * 2
        const r = Math.sqrt(rMin * rMin + rand() * (rMax * rMax - rMin * rMin))
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        if (taken.every(([tx, tz, tg]) => Math.hypot(tx - x, tz - z) > tg + gap)) {
          taken.push([x, z, gap])
          return [x, z] as const
        }
      }
      return null
    }
    const inner = CAR_RADIUS + 1.3
    const dummy = new THREE.Object3D()

    const flowers = new THREE.InstancedMesh(open, flowerMat, 12)
    let n = 0
    for (let i = 0; i < 12; i++) {
      const p = place(inner, DECK_INNER - 0.6, 0.7)
      if (!p) continue
      dummy.position.set(p[0], WATER_Y + 0.02, p[1])
      dummy.rotation.set((rand() - 0.5) * 0.12, rand() * Math.PI * 2, (rand() - 0.5) * 0.12)
      dummy.scale.setScalar(1.1 + rand() * 0.5)
      dummy.updateMatrix()
      flowers.setMatrixAt(n++, dummy.matrix)
    }
    flowers.count = n
    g.add(flowers)

    const buds = new THREE.InstancedMesh(bud, flowerMat, 6)
    n = 0
    for (let i = 0; i < 6; i++) {
      const p = place(inner, DECK_INNER - 0.4, 0.35)
      if (!p) continue
      dummy.position.set(p[0], WATER_Y + 0.25 + rand() * 0.25, p[1])
      dummy.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI * 2, (rand() - 0.5) * 0.3)
      dummy.scale.setScalar(1 + rand() * 0.4)
      dummy.updateMatrix()
      buds.setMatrixAt(n++, dummy.matrix)
    }
    buds.count = n
    g.add(buds)

    const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, metalness: 0, envMapIntensity: 0.25, emissive: new THREE.Color('#0b2410'), emissiveIntensity: 0.3 })
    const pads = new THREE.InstancedMesh(padGeometry(), leafMat, 44)
    n = 0
    for (let i = 0; i < 44; i++) {
      const p = place(inner, DECK_INNER + 3, 0.45)
      if (!p) continue
      dummy.position.set(p[0], WATER_Y + 0.03, p[1])
      dummy.rotation.set(0, rand() * Math.PI * 2, 0)
      dummy.scale.setScalar(1.2 + rand() * 1.1)
      dummy.updateMatrix()
      pads.setMatrixAt(n, dummy.matrix)
      pads.setColorAt(n, new THREE.Color().setHSL(0.3 + rand() * 0.05, 0.55, 0.055 + rand() * 0.04))
      n++
    }
    pads.count = n
    if (pads.instanceColor) pads.instanceColor.needsUpdate = true
    g.add(pads)
    // Over the water, which is see-through and drawn after the solids.
    for (const m of [flowers, buds, pads]) m.renderOrder = 3
    return g
  }, [])
  return <primitive object={group} />
}
