import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BOTTOM, ELEVATOR_HALF, PALETTE, TOP_MARGIN } from '../content/floors'
import { useSilo } from '../state/useSilo'

/** Guide rails and the counterweight cable the car runs on. Static. */
function Guides() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const steel = new THREE.MeshStandardMaterial({
      color: PALETTE.steelDark,
      roughness: 0.48,
      metalness: 0.82,
    })
    const height = TOP_MARGIN - BOTTOM
    const midY = (TOP_MARGIN + BOTTOM) / 2

    // Four corner rails.
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, height, 0.16), steel)
      rail.position.set(sx * ELEVATOR_HALF, midY, sz * ELEVATOR_HALF)
      group.add(rail)
    }

    // Hoist cables.
    const cable = new THREE.MeshStandardMaterial({ color: '#2c2621', roughness: 0.7, metalness: 0.5 })
    for (const [sx, sz] of [
      [0.55, 0.55],
      [-0.55, -0.55],
    ]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, height, 6), cable)
      c.position.set(sx, midY, sz)
      group.add(c)
    }
    return group
  }, [])

  return <primitive object={nodes} />
}

/**
 * The car. Deliberately an open cage rather than a sealed box: the whole point
 * of a 12-level shaft is watching it go past on the way down.
 */
export default function Elevator({ carY }: { carY: React.RefObject<number> }) {
  const car = useRef<THREE.Group>(null)
  const fanA = useRef<THREE.Mesh>(null)
  const beacon = useRef<THREE.PointLight>(null)
  const doorL = useRef<THREE.Mesh>(null)
  const doorR = useRef<THREE.Mesh>(null)
  const doorsOpen = useSilo((s) => s.doorsOpen)
  const reduced = useSilo((s) => s.reducedMotion)

  const steel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.5, metalness: 0.7 }),
    [],
  )
  const grate = useMemo(
    () => new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.6, metalness: 0.75 }),
    [],
  )

  useFrame((_, dt) => {
    if (car.current) car.current.position.y = carY.current ?? 0
    if (!reduced && fanA.current) fanA.current.rotation.z += dt * 2.4
    if (beacon.current) {
      // Beacon brightens while the doors are shut, i.e. while travelling.
      const want = doorsOpen ? 3 : 9
      beacon.current.intensity += (want - beacon.current.intensity) * Math.min(1, dt * 3)
    }
    const slide = doorsOpen ? ELEVATOR_HALF * 0.92 : 0.04
    if (doorL.current) doorL.current.position.x += (-slide - doorL.current.position.x) * Math.min(1, dt * 3.2)
    if (doorR.current) doorR.current.position.x += (slide - doorR.current.position.x) * Math.min(1, dt * 3.2)
  })

  const S = ELEVATOR_HALF

  return (
    <>
      <Guides />
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
        <pointLight ref={beacon} color={PALETTE.brassHot} intensity={8} distance={14} decay={2} position={[0, 2.1, 0]} />
      </group>
    </>
  )
}
