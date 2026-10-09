import { useMemo } from 'react'
import * as THREE from 'three'
import {
  CUT_HALF,
  CUT_MID,
  PALETTE,
  SHAFT_RADIUS,
  WALL_ARC,
  WALL_THETA_START,
  WALL_THICK,
  inCut,
  levelY,
} from '../content/floors'

/**
 * The approach is underground, and deliberately close: the structure and its
 * service gantry, lit by bounded floods, with nothing but darkness beyond.
 *
 * Two richer versions were built and discarded — an excavated surface plain
 * and a full rock cavern. Both failed the same way. The silo is 26 units wide
 * and 157 tall, so from far enough back to take it in it is a needle, and any
 * surface large enough to stand behind it is also large enough to out-light
 * it. Starting near the cutaway, with the only lights in the scene close
 * enough to reach the wall, is legible at every size and costs almost nothing.
 */
/** The service gantry: a walkway ring around the head of the structure. */
const GANTRY_Y = levelY(1) - 1.4
const GANTRY_R = 19

/**
 * Service gantry: the walkway ring around the head of the structure. The only
 * built thing outside the silo, so it is what gives the shaft its scale.
 */
function Gantry() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const steel = new THREE.MeshStandardMaterial({
      color: PALETTE.steelDark,
      roughness: 0.56,
      metalness: 0.72,
    })
    const dummy = new THREE.Object3D()

    const deck = new THREE.Mesh(new THREE.RingGeometry(GANTRY_R - 1.9, GANTRY_R + 1.9, 64, 1), steel)
    deck.rotation.x = -Math.PI / 2
    deck.position.y = GANTRY_Y
    group.add(deck)

    for (const radius of [GANTRY_R + 1.9, GANTRY_R - 1.9]) {
      const rail = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.06, 6, 64), steel)
      rail.rotation.x = -Math.PI / 2
      rail.position.y = GANTRY_Y + 1.05
      group.add(rail)
    }

    const n = 40
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), steel, n * 2)
    let k = 0
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      for (const radius of [GANTRY_R + 1.9, GANTRY_R - 1.9]) {
        dummy.position.set(Math.cos(a) * radius, GANTRY_Y + 0.52, Math.sin(a) * radius)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        posts.setMatrixAt(k++, dummy.matrix)
      }
    }
    posts.instanceMatrix.needsUpdate = true
    group.add(posts)

    return group
  }, [])

  return <primitive object={nodes} />
}

/**
 * The entrance: a lit portal in the outer wall at gantry level, with a bridge
 * across to it. Placed just off the cutaway so it is in frame on the approach
 * without standing in front of the section.
 */
function Entrance() {
  const a = CUT_MID + CUT_HALF + 0.34
  const r = SHAFT_RADIUS + WALL_THICK
  const bridgeLen = GANTRY_R - r + 2

  return (
    <group
      position={[Math.cos(a) * r, GANTRY_Y, Math.sin(a) * r]}
      rotation={[0, Math.PI / 2 - a, 0]}
    >
      {/* Portal surround, set into the face of the wall. */}
      <mesh position={[0, 2.1, 0.3]}>
        <boxGeometry args={[5.6, 4.6, 0.7]} />
        <meshStandardMaterial color={PALETTE.concreteDark} roughness={0.95} />
      </mesh>
      <mesh position={[0, 2.0, 0.72]}>
        <planeGeometry args={[3.0, 3.6]} />
        <meshBasicMaterial color="#1d1510" />
      </mesh>
      {(
        [
          [0.3, 3.9, -1.65, 2.0],
          [0.3, 3.9, 1.65, 2.0],
          [3.6, 0.3, 0, 3.95],
        ] as const
      ).map(([w, h, x, y], i) => (
        <mesh key={i} position={[x, y, 0.78]}>
          <boxGeometry args={[w, h, 0.3]} />
          <meshStandardMaterial color={PALETTE.steel} roughness={0.4} metalness={0.86} />
        </mesh>
      ))}
      {[-2.3, 2.3].map((x) => (
        <mesh key={x} position={[x, 2.0, 0.74]}>
          <boxGeometry args={[0.5, 3.4, 0.1]} />
          <meshStandardMaterial color={PALETTE.brass} roughness={0.74} />
        </mesh>
      ))}
      {/* Portal lamp — the beacon you steer towards. */}
      <mesh position={[0, 4.3, 0.9]}>
        <boxGeometry args={[1.5, 0.26, 0.3]} />
        <meshStandardMaterial
          color={PALETTE.brassHot}
          emissive={PALETTE.brassHot}
          emissiveIntensity={3.2}
        />
      </mesh>
      <pointLight
        color={PALETTE.brassHot}
        intensity={170}
        distance={38}
        decay={2}
        position={[0, 3.2, 3.0]}
      />

      {/* Bridge out to the gantry ring. */}
      <mesh position={[0, -0.08, bridgeLen / 2 + 0.3]}>
        <boxGeometry args={[3.2, 0.16, bridgeLen]} />
        <meshStandardMaterial color={PALETTE.steelDark} roughness={0.56} metalness={0.72} />
      </mesh>
      {[-1.5, 1.5].map((x) => (
        <mesh key={x} position={[x, 0.55, bridgeLen / 2 + 0.3]}>
          <boxGeometry args={[0.07, 1.05, bridgeLen]} />
          <meshStandardMaterial color={PALETTE.steelDark} roughness={0.56} metalness={0.72} />
        </mesh>
      ))}
    </group>
  )
}

/** Work lamps on the gantry, kept clear of the cutaway. */
function WorkLamps() {
  const spots = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => {
        const a = CUT_MID + 1.2 + (i / 5) * (Math.PI * 2 - 2.4)
        return { a, x: Math.cos(a) * (GANTRY_R + 1.4), z: Math.sin(a) * (GANTRY_R + 1.4) }
      }),
    [],
  )

  return (
    <group>
      {spots.map(({ a, x, z }, i) => (
        <group key={i} position={[x, GANTRY_Y, z]} rotation={[0, Math.PI / 2 - a, 0]}>
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 3, 6]} />
            <meshStandardMaterial color={PALETTE.steelDark} roughness={0.6} metalness={0.7} />
          </mesh>
          <mesh position={[0, 3.0, -0.3]} rotation={[0.5, 0, 0]}>
            <boxGeometry args={[0.7, 0.3, 0.42]} />
            <meshStandardMaterial
              color={PALETTE.brassHot}
              emissive={PALETTE.brassHot}
              emissiveIntensity={2.8}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** The structure above the level-1 datum, seen from outside in the cavern. */
function Head() {
  const headY = levelY(1) + 9
  return (
    <group>
      <mesh position={[0, headY - 4, 0]}>
        <cylinderGeometry
          args={[
            SHAFT_RADIUS + 2.4,
            SHAFT_RADIUS + 3.2,
            13,
            48,
            1,
            true,
            WALL_THETA_START,
            WALL_ARC,
          ]}
        />
        <meshStandardMaterial color={PALETTE.concrete} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, headY + 2.6, 0]}>
        <cylinderGeometry
          args={[
            SHAFT_RADIUS + 3.6,
            SHAFT_RADIUS + 3.6,
            1.4,
            48,
            1,
            false,
            WALL_THETA_START,
            WALL_ARC,
          ]}
        />
        <meshStandardMaterial
          color={PALETTE.concreteDark}
          roughness={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Cut faces of the head, matching the wall section. */}
      {[-1, 1].map((sign) => {
        const a = CUT_MID + sign * CUT_HALF
        return (
          <mesh
            key={sign}
            position={[
              Math.cos(a) * (SHAFT_RADIUS + 1.9),
              headY - 4,
              Math.sin(a) * (SHAFT_RADIUS + 1.9),
            ]}
            rotation={[0, -a, 0]}
          >
            <boxGeometry args={[3.4, 13, 0.06]} />
            <meshStandardMaterial color={PALETTE.concreteCut} roughness={0.99} />
          </mesh>
        )
      })}
      {/* Ventilation stacks on the cap. */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + 0.4
        if (inCut(a, 0.1)) return null
        const r = SHAFT_RADIUS - 3
        return (
          <mesh key={i} position={[Math.cos(a) * r, headY + 5, Math.sin(a) * r]}>
            <cylinderGeometry args={[0.9, 1.1, 4.2, 12]} />
            <meshStandardMaterial color={PALETTE.steelDark} roughness={0.7} metalness={0.5} />
          </mesh>
        )
      })}
    </group>
  )
}

export default function Exterior() {
  return (
    <group>
      <Head />
      <Gantry />
      <Entrance />
      <WorkLamps />

      {/* Lighting rule for the approach: every light that reaches the rock is
          a light competing with the structure. The two directionals are kept
          low — just enough to shape the cavern — and all the real output comes
          from bounded point lights on the gantry, whose `distance` stops short
          of the rock at CAVERN_R. */}
      <ambientLight color="#3a4049" intensity={0.9} />
      <directionalLight color="#8ea2b4" intensity={2.0} position={[18, 90, 40]} />
      {/* Key from the viewer's side, which is what actually gives the outer
          wall its value. With no rock behind the structure there is nothing
          left for it to over-light. */}
      <directionalLight color="#b9c3cd" intensity={2.6} position={[12, 20, 120]} />

      {/* Gantry floods: these light the outer wall, and die before the rock. */}
      {[-0.6, 0.6].map((off) => (
        <pointLight
          key={off}
          color={PALETTE.brassHot}
          intensity={260}
          distance={42}
          decay={2}
          position={[
            Math.cos(CUT_MID + off) * (GANTRY_R - 3),
            GANTRY_Y + 3.2,
            Math.sin(CUT_MID + off) * (GANTRY_R - 3),
          ]}
        />
      ))}

      {/* Warm light inside the shaft, so the section stays the brightest thing
          in frame. These unmount with the cavern; TravellingLights take over. */}
      {[0, 1].map((i) => (
        <pointLight
          key={i}
          color={PALETTE.brass}
          intensity={300}
          distance={60}
          decay={2}
          position={[Math.cos(CUT_MID) * 7, levelY(1) - i * 22 - 4, Math.sin(CUT_MID) * 7]}
        />
      ))}
    </group>
  )
}
