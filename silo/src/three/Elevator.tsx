import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  BOTTOM,
  ELEVATOR_HALF,
  FLOORS,
  FLOOR_HEIGHT,
  PALETTE,
  SHAFT_CAGE,
  TOP_MARGIN,
  contentAngle,
  levelY,
} from '../content/floors'
import { plateSurface, steelSurface, tiled } from './materials'
import { useSilo } from '../state/useSilo'

const dummy = new THREE.Object3D()

/** Shortest signed distance from `a` to `b`, so the car never spins the long way. */
function shortestTurn(a: number, b: number) {
  return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI
}

/**
 * The shaft itself: four guide columns running the full depth, a ring beam at
 * every level, X bracing between them, and a landing portal on each level's
 * content side. Deliberately a lattice rather than a solid box — the car has to
 * stay visible travelling past twelve decks, and a sealed shaft would also hide
 * the stair helix behind it.
 */
function ShaftCage() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const brushed = tiled(steelSurface(), 2, 1)
    const steel = new THREE.MeshStandardMaterial({
      roughness: 0.62,
      metalness: 0.32,
      map: brushed.map,
      normalMap: brushed.normalMap,
      roughnessMap: brushed.roughnessMap,
    })
    const brace = new THREE.MeshStandardMaterial({
      color: PALETTE.steel,
      roughness: 0.56,
      metalness: 0.7,
    })
    const height = TOP_MARGIN - BOTTOM
    const midY = (TOP_MARGIN + BOTTOM) / 2
    const corners: Array<[number, number]> = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]

    // Guide columns.
    for (const [sx, sz] of corners) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, height, 0.2), steel)
      rail.position.set(sx * SHAFT_CAGE, midY, sz * SHAFT_CAGE)
      group.add(rail)
    }

    // Hoist cables, running in the middle of the cage.
    const cable = new THREE.MeshStandardMaterial({
      color: '#2c2621',
      roughness: 0.7,
      metalness: 0.5,
    })
    for (const [sx, sz] of [
      [0.55, 0.55],
      [-0.55, -0.55],
    ]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, height, 6), cable)
      c.position.set(sx, midY, sz)
      group.add(c)
    }

    // A ring beam at every level datum, framing each landing.
    // Capacity must cover every write below: two datums per floor, four beams
    // each. Allocating fewer and then setting `count` higher makes the renderer
    // read past the end of instanceMatrix, which draws garbage geometry large
    // enough to fill the screen.
    const beams = new THREE.InstancedMesh(
      new THREE.BoxGeometry(SHAFT_CAGE * 2 + 0.2, 0.16, 0.16),
      steel,
      FLOORS.length * 2 * 4,
    )
    let b = 0
    FLOORS.forEach((floor) => {
      for (const dy of [0, 2.9]) {
        const y = levelY(floor.level) + dy
        for (const sz of [1, -1]) {
          dummy.position.set(0, y, sz * SHAFT_CAGE)
          dummy.rotation.set(0, 0, 0)
          dummy.updateMatrix()
          beams.setMatrixAt(b++, dummy.matrix)
        }
        for (const sx of [1, -1]) {
          dummy.position.set(sx * SHAFT_CAGE, y, 0)
          dummy.rotation.set(0, Math.PI / 2, 0)
          dummy.updateMatrix()
          beams.setMatrixAt(b++, dummy.matrix)
        }
      }
    })
    beams.count = b
    beams.instanceMatrix.needsUpdate = true
    group.add(beams)

    // X bracing on all four faces, one bay per level.
    const bayH = FLOOR_HEIGHT - 3.2
    const diag = Math.hypot(SHAFT_CAGE * 2, bayH)
    const tilt = Math.atan2(bayH, SHAFT_CAGE * 2)
    const braces = new THREE.InstancedMesh(
      new THREE.BoxGeometry(diag, 0.08, 0.08),
      brace,
      FLOORS.length * 8,
    )
    let d = 0
    FLOORS.forEach((floor) => {
      const y = levelY(floor.level) - bayH / 2 - 0.4
      const faces: Array<[number, number, number]> = [
        [0, SHAFT_CAGE, 0],
        [0, -SHAFT_CAGE, 0],
        [SHAFT_CAGE, 0, Math.PI / 2],
        [-SHAFT_CAGE, 0, Math.PI / 2],
      ]
      for (const [x, z, ry] of faces) {
        for (const sign of [1, -1]) {
          dummy.position.set(x, y, z)
          dummy.rotation.set(0, ry, sign * tilt)
          dummy.updateMatrix()
          braces.setMatrixAt(d++, dummy.matrix)
        }
      }
    })
    braces.count = d
    braces.instanceMatrix.needsUpdate = true
    group.add(braces)
    return group
  }, [])

  return <primitive object={nodes} />
}

/** Landing portals: a lit frame on each level, on that level's content side. */
function Landings() {
  const current = useSilo((s) => s.level)
  const frames = useMemo(
    () =>
      FLOORS.map((floor) => {
        const a = contentAngle(floor.level)
        return { level: floor.level, a, y: levelY(floor.level) }
      }),
    [],
  )

  return (
    <group>
      {frames.map(({ level, a, y }) => (
        <group
          key={level}
          position={[Math.cos(a) * SHAFT_CAGE * 1.02, y, Math.sin(a) * SHAFT_CAGE * 1.02]}
          rotation={[0, Math.PI / 2 - a, 0]}
        >
          {/* Jambs and head of the landing opening. */}
          {(
            [
              [0.14, 2.9, -ELEVATOR_HALF, 1.45],
              [0.14, 2.9, ELEVATOR_HALF, 1.45],
              [ELEVATOR_HALF * 2 + 0.14, 0.18, 0, 2.96],
            ] as const
          ).map(([w, h, x, yy], i) => (
            <mesh key={i} position={[x, yy, 0]}>
              <boxGeometry args={[w, h, 0.12]} />
              <meshStandardMaterial color={PALETTE.steel} roughness={0.46} metalness={0.8} />
            </mesh>
          ))}
          {/* Call indicator — lit on the level you are standing on. */}
          <mesh position={[0, 3.2, 0]}>
            <boxGeometry args={[0.44, 0.16, 0.1]} />
            <meshStandardMaterial
              color={PALETTE.brassHot}
              emissive={PALETTE.brassHot}
              emissiveIntensity={level === current ? 2.6 : 0.25}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * The car. Deliberately an open cage rather than a sealed box: the whole point
 * of a 12-level shaft is watching it go past on the way down. It yaws so its
 * doorway always faces the landing of the level it is serving.
 */
export default function Elevator({ carY }: { carY: React.RefObject<number> }) {
  const car = useRef<THREE.Group>(null)
  const fanA = useRef<THREE.Mesh>(null)
  const beacon = useRef<THREE.PointLight>(null)
  const doorL = useRef<THREE.Mesh>(null)
  const doorR = useRef<THREE.Mesh>(null)
  const doorsOpen = useSilo((s) => s.doorsOpen)
  const reduced = useSilo((s) => s.reducedMotion)

  const steel = useMemo(() => {
    const t = tiled(steelSurface(), 3, 4)
    return new THREE.MeshStandardMaterial({
      roughness: 0.6,
      metalness: 0.3,
      map: t.map,
      normalMap: t.normalMap,
      roughnessMap: t.roughnessMap,
    })
  }, [])
  const grate = useMemo(() => {
    const t = tiled(plateSurface(), 6, 5)
    return new THREE.MeshStandardMaterial({
      roughness: 0.82,
      metalness: 0.14,
      map: t.map,
      normalMap: t.normalMap,
      roughnessMap: t.roughnessMap,
    })
  }, [])

  useFrame((_, dt) => {
    if (car.current) {
      car.current.position.y = carY.current ?? 0
      // The doorway faces the landing it is serving. Local +Z maps to world
      // angle `a` when rotation.y = PI/2 - a.
      const want = Math.PI / 2 - contentAngle(useSilo.getState().target)
      const turn = shortestTurn(car.current.rotation.y, want)
      car.current.rotation.y += turn * Math.min(1, dt * (reduced ? 12 : 2.2))
    }
    if (!reduced && fanA.current) fanA.current.rotation.z += dt * 2.4
    if (beacon.current) {
      // Beacon brightens while the doors are shut, i.e. while travelling.
      const want = doorsOpen ? 3 : 9
      beacon.current.intensity += (want - beacon.current.intensity) * Math.min(1, dt * 3)
    }
    const slide = doorsOpen ? ELEVATOR_HALF * 0.92 : 0.04
    if (doorL.current)
      doorL.current.position.x += (-slide - doorL.current.position.x) * Math.min(1, dt * 3.2)
    if (doorR.current)
      doorR.current.position.x += (slide - doorR.current.position.x) * Math.min(1, dt * 3.2)
  })

  const S = ELEVATOR_HALF

  return (
    <>
      <ShaftCage />
      <Landings />
      <group ref={car}>
        {/* Floor grating */}
        <mesh material={grate} position={[0, -0.08, 0]}>
          <boxGeometry args={[S * 2, 0.14, S * 2]} />
        </mesh>
        {/* Roof */}
        <mesh material={grate} position={[0, 2.5, 0]}>
          <boxGeometry args={[S * 2, 0.14, S * 2]} />
        </mesh>
        {/* Corner posts */}
        {[
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ].map(([sx, sz], i) => (
          <mesh key={i} material={steel} position={[sx * S * 0.96, 1.25, sz * S * 0.96]}>
            <boxGeometry args={[0.12, 2.6, 0.12]} />
          </mesh>
        ))}
        {/* Three caged sides; the fourth is the doorway. */}
        {[
          [0, -S * 0.96, 0],
          [-S * 0.96, 0, Math.PI / 2],
          [S * 0.96, 0, Math.PI / 2],
        ].map(([x, z, ry], i) => (
          <mesh key={i} material={grate} position={[x, 1.25, z]} rotation={[0, ry, 0]}>
            <boxGeometry args={[S * 1.9, 2.5, 0.06]} />
          </mesh>
        ))}
        {/* Sliding doors on the open face */}
        <mesh ref={doorL} material={steel} position={[-0.04, 1.25, S * 0.96]}>
          <boxGeometry args={[S * 0.95, 2.5, 0.08]} />
        </mesh>
        <mesh ref={doorR} material={steel} position={[0.04, 1.25, S * 0.96]}>
          <boxGeometry args={[S * 0.95, 2.5, 0.08]} />
        </mesh>

        {/* Ventilation fan in the roof */}
        <mesh ref={fanA} material={steel} position={[0, 2.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.3, 0.04, 6, 12]} />
        </mesh>

        {/* Car lamp */}
        <mesh position={[0, 2.3, 0]}>
          <boxGeometry args={[0.8, 0.1, 0.3]} />
          <meshStandardMaterial
            color={PALETTE.brassHot}
            emissive={PALETTE.brassHot}
            emissiveIntensity={2}
          />
        </mesh>
        <pointLight
          ref={beacon}
          color={PALETTE.brassHot}
          intensity={8}
          distance={14}
          decay={2}
          position={[0, 2.1, 0]}
        />
      </group>
    </>
  )
}
