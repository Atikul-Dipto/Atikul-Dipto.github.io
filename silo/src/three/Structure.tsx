import { useMemo } from 'react'
import * as THREE from 'three'
import {
  BOTTOM,
  DECK_INNER,
  FLOORS,
  PALETTE,
  SHAFT_RADIUS,
  SLOT,
  STAIR_RADIUS,
  STAIR_WIDTH,
  STEP_RISE,
  TOP_MARGIN,
  WALL_CENTER,
  WALL_HEIGHT,
  contentAngle,
  deckY,
  levelY,
} from '../content/floors'

/** Deterministic PRNG so the concrete weathering is identical every load. */
function makeRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const dummy = new THREE.Object3D()

/** Orients an instance to face the shaft axis. InstancedMesh has no per-instance
 *  lookAt, so a throwaway Object3D does the matrix maths. */
function faceAxis(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number) {
  dummy.position.set(x, y, z)
  dummy.rotation.set(0, 0, 0)
  dummy.lookAt(0, y, 0)
  dummy.updateMatrix()
  mesh.setMatrixAt(i, dummy.matrix)
}

function ConcreteWall() {
  const geometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, WALL_HEIGHT, 80, 64, true)
    // Vertex-colour mottling instead of a texture: nothing to download, no UV
    // seam on a cylinder, and it holds up at every distance.
    const rand = makeRandom(9)
    const base = new THREE.Color(PALETTE.concrete)
    const dark = new THREE.Color(PALETTE.concreteDark)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const blotch =
        (Math.sin(y * 0.6 + pos.getX(i) * 0.4) + Math.sin(pos.getZ(i) * 0.55 - y * 0.22)) * 0.25
      const c = base.clone().lerp(dark, Math.min(1, Math.max(0, 0.32 + blotch + rand() * 0.34)))
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }, [])

  return (
    <mesh geometry={geometry} position={[0, WALL_CENTER, 0]}>
      <meshStandardMaterial vertexColors roughness={0.97} metalness={0} side={THREE.BackSide} />
    </mesh>
  )
}

/** Vertical pilasters — the detail that stops the wall reading as a plain tube. */
function Ribs() {
  const ref = useMemo(() => {
    const count = 28
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.8, WALL_HEIGHT, 0.6),
      new THREE.MeshStandardMaterial({ color: PALETTE.concreteDark, roughness: 0.93 }),
      count,
    )
    // Skip any rib that would stand between the camera and a level's fit-out —
    // a full-height pilaster across the portrait is not "architecture", it is
    // an occluder.
    const blocked: number[] = []
    FLOORS.forEach((f) => {
      const base = contentAngle(f.level)
      Object.values(SLOT).forEach((off) => blocked.push(base + off))
    })
    const clear = (a: number) =>
      blocked.every((b) => {
        const d = Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
        return d > 0.34
      })

    let n = 0
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      if (!clear(a)) continue
      faceAxis(mesh, n, Math.cos(a) * (SHAFT_RADIUS - 0.32), WALL_CENTER, Math.sin(a) * (SHAFT_RADIUS - 0.32))
      n++
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    return mesh
  }, [])
  return <primitive object={ref} />
}

function Decks() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const deckGeo = new THREE.RingGeometry(DECK_INNER, SHAFT_RADIUS - 0.06, 80, 1)
    const deckMat = new THREE.MeshStandardMaterial({
      color: PALETTE.deck,
      roughness: 0.88,
      metalness: 0.18,
      side: THREE.DoubleSide,
    })
    const steel = new THREE.MeshStandardMaterial({
      color: PALETTE.steelDark,
      roughness: 0.45,
      metalness: 0.78,
    })

    FLOORS.forEach((floor) => {
      const y = deckY(floor.level)

      const deck = new THREE.Mesh(deckGeo, deckMat)
      deck.rotation.x = -Math.PI / 2
      deck.position.y = y
      group.add(deck)

      // Lip and handrail around the stairwell opening.
      const lip = new THREE.Mesh(new THREE.TorusGeometry(DECK_INNER, 0.1, 8, 80), steel)
      lip.rotation.x = -Math.PI / 2
      lip.position.y = y + 0.05
      group.add(lip)

      const rail = new THREE.Mesh(new THREE.TorusGeometry(DECK_INNER, 0.055, 6, 80), steel)
      rail.rotation.x = -Math.PI / 2
      rail.position.y = y + 1.05
      group.add(rail)

      const n = 52
      const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 6), steel, n)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        dummy.position.set(Math.cos(a) * DECK_INNER, y + 0.52, Math.sin(a) * DECK_INNER)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        posts.setMatrixAt(i, dummy.matrix)
      }
      posts.instanceMatrix.needsUpdate = true
      group.add(posts)

      // Structural band where the deck meets the wall.
      const band = new THREE.Mesh(new THREE.TorusGeometry(SHAFT_RADIUS - 0.26, 0.1, 6, 80), steel)
      band.rotation.x = -Math.PI / 2
      band.position.y = levelY(floor.level) + 2.2
      group.add(band)
    })
    return group
  }, [])

  return <primitive object={nodes} />
}

/** Spiral stair running the full depth, as one instanced mesh of treads. */
function Stairs() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const steps = Math.floor((TOP_MARGIN - BOTTOM) / STEP_RISE)
    const treads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(STAIR_WIDTH, 0.14, 1.0),
      new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.55, metalness: 0.66 }),
      steps,
    )

    // One continuous helix, independent of the per-level content rotation.
    const turn = (y: number) => (-y / 11) * Math.PI * 0.52 + Math.PI * 0.5
    for (let i = 0; i < steps; i++) {
      const y = TOP_MARGIN - i * STEP_RISE
      const a = turn(y)
      faceAxis(treads, i, Math.cos(a) * STAIR_RADIUS, y, Math.sin(a) * STAIR_RADIUS)
    }
    treads.instanceMatrix.needsUpdate = true
    group.add(treads)

    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= steps; i += 2) {
      const y = TOP_MARGIN - i * STEP_RISE
      const a = turn(y)
      pts.push(new THREE.Vector3(Math.cos(a) * (STAIR_RADIUS + 0.68), y + 1.0, Math.sin(a) * (STAIR_RADIUS + 0.68)))
    }
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.05, 6, false),
        new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.34, metalness: 0.88 }),
      ),
    )
    return group
  }, [])

  return <primitive object={nodes} />
}

/** Wall lamps. Emissive geometry only; the real lights follow the camera. */
function Lamps() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const perFloor = 6
    const total = FLOORS.length * perFloor
    const bulbs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.1, 0.18, 0.34),
      new THREE.MeshStandardMaterial({
        color: PALETTE.brassHot,
        emissive: new THREE.Color(PALETTE.brassHot),
        emissiveIntensity: 1.4,
        roughness: 0.4,
      }),
      total,
    )
    const housings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.36, 0.16, 0.5),
      new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.6, metalness: 0.7 }),
      total,
    )

    let n = 0
    FLOORS.forEach((floor) => {
      const y = levelY(floor.level)
      for (let k = 0; k < perFloor; k++) {
        const a = (k / perFloor) * Math.PI * 2 + contentAngle(floor.level)
        const r = SHAFT_RADIUS - 0.62
        faceAxis(bulbs, n, Math.cos(a) * r, y + 1.5, Math.sin(a) * r)
        faceAxis(housings, n, Math.cos(a) * r, y + 1.68, Math.sin(a) * r)
        n++
      }
    })
    bulbs.instanceMatrix.needsUpdate = true
    housings.instanceMatrix.needsUpdate = true
    group.add(bulbs, housings)
    return group
  }, [])

  return <primitive object={nodes} />
}

function Caps() {
  return (
    <>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, TOP_MARGIN + 9, 0]}>
        <circleGeometry args={[SHAFT_RADIUS, 56]} />
        <meshStandardMaterial color={PALETTE.concreteDark} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BOTTOM + 1, 0]}>
        <circleGeometry args={[SHAFT_RADIUS, 56]} />
        <meshStandardMaterial color={PALETTE.concreteDark} roughness={1} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}

export default function Structure() {
  return (
    <group>
      <ConcreteWall />
      <Ribs />
      <Decks />
      <Stairs />
      <Lamps />
      <Caps />
    </group>
  )
}
