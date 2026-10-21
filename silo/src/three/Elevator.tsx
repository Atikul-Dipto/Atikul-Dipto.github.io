import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  CAR_HEIGHT,
  CAR_RADIUS,
  FLOORS,
  LEVEL_COUNT,
  PALETTE,
  SHAFT_RING,
  WATER_DROP,
  contentAngle,
  walkY,
} from '../content/floors'
import { lift } from '../lib/lift'
import { plateSurface, steelSurface, tiled } from './materials'
import { useSilo } from '../state/useSilo'

/**
 * The lift: a glass capsule on the shaft axis.
 *
 * Built after the capsule reference -- a clear cylinder of glass between two
 * polished end caps -- and pushed towards the silo's world rather than a
 * hotel atrium's: the chrome is dulled and slightly dark, the car hangs from
 * exposed cables, a single amber beacon burns on its crown while it moves, and
 * it runs through bare steel rings rather than a finished shaft.
 *
 * The car is round, so its doorway is a gap in the glass rather than a face of
 * a box, and the whole car turns to bring that gap round to whichever level
 * it is serving.
 */

/** Half-angle of the car's doorway, and of each landing's doors. Kept inside
 *  the landing's own half-angle so the doorway always opens onto floor. */
export const DOOR_HALF = 0.36
const LANDING_DOOR_HALF = 0.4
/** Where the hoist cables disappear into the core above level 1. */
export const CABLE_TOP = walkY(1) + 5.6

const dummy = new THREE.Object3D()

function shortestTurn(a: number, b: number) {
  return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI
}

function useMaterials() {
  return useMemo(() => {
    const brushed = tiled(steelSurface(), 2, 1)
    const grate = tiled(plateSurface(), 4, 4)
    return {
      // Dulled, slightly dark chrome: polished once, a long time ago.
      chrome: new THREE.MeshStandardMaterial({
        color: '#9aa4aa',
        metalness: 1,
        roughness: 0.2,
        envMapIntensity: 1.25,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: '#cfe2e8',
        transparent: true,
        opacity: 0.13,
        roughness: 0.04,
        metalness: 0.15,
        envMapIntensity: 1.4,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      smoke: new THREE.MeshStandardMaterial({
        color: '#4a585d',
        transparent: true,
        opacity: 0.42,
        roughness: 0.08,
        metalness: 0.3,
        envMapIntensity: 1.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      steel: new THREE.MeshStandardMaterial({
        roughness: 0.55,
        metalness: 0.55,
        map: brushed.map,
        normalMap: brushed.normalMap,
        roughnessMap: brushed.roughnessMap,
      }),
      grate: new THREE.MeshStandardMaterial({
        roughness: 0.8,
        metalness: 0.2,
        map: grate.map,
        normalMap: grate.normalMap,
        roughnessMap: grate.roughnessMap,
      }),
      light: new THREE.MeshStandardMaterial({
        color: '#eef4ff',
        emissive: new THREE.Color('#e4eeff'),
        emissiveIntensity: 2.4,
        roughness: 0.4,
      }),
    }
  }, [])
}

/**
 * The shaft: at every level a sill ring, a head ring, a lit band, and six
 * mullions -- turned per level so none of them ever stands in that level's
 * doorway. Between levels it is open, so the car stays in view the whole way.
 */
function ShaftRings() {
  const m = useMaterials()
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const ring = new THREE.TorusGeometry(SHAFT_RING, 0.08, 8, 72)
    const posts = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.06, 0.06, 3.0, 8),
      m.steel,
      FLOORS.length * 6,
    )
    const band = new THREE.MeshStandardMaterial({
      color: PALETTE.concreteDark,
      roughness: 0.9,
    })
    const strip = new THREE.MeshStandardMaterial({
      color: PALETTE.brassHot,
      emissive: new THREE.Color(PALETTE.brassHot),
      emissiveIntensity: 1.6,
    })
    let n = 0
    FLOORS.forEach((f) => {
      const y = walkY(f.level)
      const door = contentAngle(f.level)

      const sill = new THREE.Mesh(ring, m.steel)
      sill.rotation.x = -Math.PI / 2
      sill.position.y = y - 0.1
      group.add(sill)

      const head = new THREE.Mesh(ring, m.steel)
      head.rotation.x = -Math.PI / 2
      head.position.y = y + 3.0
      group.add(head)

      // A solid band over the head of the doors, with the level's lit strip.
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(SHAFT_RING + 0.06, SHAFT_RING + 0.06, 0.55, 72, 1, true),
        band,
      )
      b.position.y = y + 3.33
      group.add(b)
      const s = new THREE.Mesh(
        new THREE.CylinderGeometry(SHAFT_RING + 0.075, SHAFT_RING + 0.075, 0.05, 72, 1, true),
        strip,
      )
      s.position.y = y + 3.2
      group.add(s)

      for (let k = 0; k < 6; k++) {
        const a = door + Math.PI / 6 + (k * Math.PI) / 3
        dummy.position.set(Math.cos(a) * (SHAFT_RING + 0.06), y + 1.5, Math.sin(a) * (SHAFT_RING + 0.06))
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        posts.setMatrixAt(n++, dummy.matrix)
      }
    })
    // Under the lowest landing the shaft used to end in mid-air, a ring
    // hanging over the water. It stands on a pier now: concrete up out of the
    // water to just below the car's hull, a steel cap, and the frame's posts
    // carried down onto it.
    const bottom = walkY(LEVEL_COUNT)
    const waterY = bottom - WATER_DROP
    const pierTop = bottom - 1.3
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_RING + 0.14, SHAFT_RING + 0.3, pierTop - waterY + 1.5, 48), band)
    pier.position.y = (pierTop + waterY - 1.5) / 2
    group.add(pier)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_RING + 0.2, SHAFT_RING + 0.2, 0.12, 48), m.steel)
    cap.position.y = pierTop + 0.06
    group.add(cap)
    const footing = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), m.steel, 6)
    const door = contentAngle(LEVEL_COUNT)
    for (let k = 0; k < 6; k++) {
      const a = door + Math.PI / 6 + (k * Math.PI) / 3
      dummy.position.set(Math.cos(a) * (SHAFT_RING + 0.06), pierTop + 0.6, Math.sin(a) * (SHAFT_RING + 0.06))
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      footing.setMatrixAt(k, dummy.matrix)
    }
    footing.instanceMatrix.needsUpdate = true
    group.add(footing)

    posts.count = n
    posts.instanceMatrix.needsUpdate = true
    posts.castShadow = true
    group.add(posts)
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== posts) o.castShadow = true
    })
    return group
  }, [m])
  return <primitive object={nodes} />
}

/** A curved leaf of door, as a cylinder segment centred on local +Z. */
function leafGeometry(r: number, from: number, to: number, height: number) {
  // three.js cylinder theta is measured from +Z, which is exactly the local
  // door direction, so a leaf from `from` to `to` is just that theta range.
  const g = new THREE.CylinderGeometry(r, r, height, 16, 1, true, from, to - from)
  g.translate(0, height / 2, 0)
  return g
}

/**
 * Landing doors on every level. Shut unless the car is standing at that level
 * with its own doors open -- the thing that keeps an open shaft from being a
 * 120 m drop for anyone who has walked down the stair and left the car behind.
 */
function LandingDoors() {
  const m = useMaterials()
  const leaves = useRef<Array<[THREE.Group | null, THREE.Group | null]>>(
    FLOORS.map(() => [null, null]),
  )
  const geos = useMemo(
    () => ({
      a: leafGeometry(SHAFT_RING - 0.03, 0, LANDING_DOOR_HALF, 2.85),
      b: leafGeometry(SHAFT_RING - 0.03, -LANDING_DOOR_HALF, 0, 2.85),
      kickA: leafGeometry(SHAFT_RING - 0.025, 0, LANDING_DOOR_HALF, 0.32),
      kickB: leafGeometry(SHAFT_RING - 0.025, -LANDING_DOOR_HALF, 0, 0.32),
    }),
    [],
  )

  useFrame((_, dt) => {
    const s = useSilo.getState()
    const k = Math.min(1, dt * (s.reducedMotion ? 20 : 3.4))
    FLOORS.forEach((f, i) => {
      const open = s.carLevel === f.level && s.doorsOpen && !s.carMoving
      const want = open ? LANDING_DOOR_HALF * 2 + 0.06 : 0
      const [a, b] = leaves.current[i]
      if (a) a.rotation.y += (want - a.rotation.y) * k
      if (b) b.rotation.y += (-want - b.rotation.y) * k
    })
  })

  return (
    <group>
      {FLOORS.map((f, i) => (
        <group
          key={f.level}
          position={[0, walkY(f.level), 0]}
          rotation={[0, Math.PI / 2 - contentAngle(f.level), 0]}
        >
          <group ref={(g) => (leaves.current[i][0] = g)}>
            <mesh geometry={geos.a} material={m.smoke} />
            <mesh geometry={geos.kickA} material={m.steel} />
          </group>
          <group ref={(g) => (leaves.current[i][1] = g)}>
            <mesh geometry={geos.b} material={m.smoke} />
            <mesh geometry={geos.kickB} material={m.steel} />
          </group>
        </group>
      ))}
    </group>
  )
}

/** The capsule itself. */
function Car() {
  const m = useMaterials()
  const car = useRef<THREE.Group>(null)
  const doorA = useRef<THREE.Mesh>(null)
  const doorB = useRef<THREE.Mesh>(null)
  const beacon = useRef<THREE.MeshStandardMaterial>(null)
  const buttons = useRef<THREE.InstancedMesh>(null)
  const cables = useRef<THREE.Group>(null)

  const R = CAR_RADIUS
  const H = CAR_HEIGHT

  const geos = useMemo(() => {
    const glass = new THREE.CylinderGeometry(R, R, H, 64, 1, true, DOOR_HALF, Math.PI * 2 - DOOR_HALF * 2)
    glass.translate(0, H / 2, 0)
    // Lower and upper shells: squashed hemispheres, so the car reads as a
    // capsule rather than a can.
    const lower = new THREE.SphereGeometry(R + 0.03, 48, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
    lower.scale(1, 0.62, 1)
    const upper = new THREE.SphereGeometry(R + 0.03, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2)
    upper.scale(1, 0.55, 1)
    // The handrail stops either side of the doorway. A torus is drawn in XY;
    // after rotation.x = -PI/2 its angle p lands at local angle -p, so
    // starting it at -PI/2 + gap leaves the opening round local +Z.
    const gap = DOOR_HALF + 0.14
    const rail = new THREE.TorusGeometry(R - 0.17, 0.028, 6, 48, Math.PI * 2 - gap * 2)
    return {
      glass,
      lower,
      upper,
      rail,
      railStart: -Math.PI / 2 + gap,
      leafA: leafGeometry(R - 0.035, 0, DOOR_HALF, H),
      leafB: leafGeometry(R - 0.035, -DOOR_HALF, 0, H),
      cable: new THREE.CylinderGeometry(0.022, 0.022, 1, 5),
    }
  }, [R, H])

  useFrame((_, dt) => {
    const s = useSilo.getState()
    const g = car.current
    if (g) {
      g.position.y = lift.y
      const want = Math.PI / 2 - contentAngle(s.carLevel)
      const k = Math.min(1, dt * (s.reducedMotion ? 20 : 1.6))
      g.rotation.y += shortestTurn(g.rotation.y, want) * k
    }
    const open = s.doorsOpen && !s.carMoving
    const slide = open ? DOOR_HALF * 2 + 0.04 : 0
    const k = Math.min(1, dt * (s.reducedMotion ? 20 : 3.4))
    if (doorA.current) doorA.current.rotation.y += (slide - doorA.current.rotation.y) * k
    if (doorB.current) doorB.current.rotation.y += (-slide - doorB.current.rotation.y) * k
    if (beacon.current) {
      // The beacon burns while the car is moving and idles otherwise.
      const t = performance.now() / 1000
      const want = s.carMoving ? 2.6 + Math.sin(t * 7) * 1.2 : 0.35
      beacon.current.emissiveIntensity += (want - beacon.current.emissiveIntensity) * Math.min(1, dt * 6)
    }
    if (cables.current) {
      // The cables run from the car's crown to the core above level 1, so
      // they shorten as the car climbs and lengthen as it goes down.
      const crown = lift.y + H + R * 0.55 + 0.25
      const len = Math.max(0.1, CABLE_TOP - crown)
      cables.current.position.y = crown + len / 2
      cables.current.scale.y = len
    }
  })

  // One lit button per level on the control column.
  const buttonMatrix = useMemo(() => {
    const out: THREE.Matrix4[] = []
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const row = Math.floor(i / 2)
      const col = i % 2
      dummy.position.set(-0.045 + col * 0.09, 1.55 - row * 0.085, 0.055)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      out.push(dummy.matrix.clone())
    }
    return out
  }, [])

  // The control column stands just inside the doorway, to its left.
  const colA = DOOR_HALF + 0.3
  const colR = R - 0.12

  return (
    <>
      <group ref={car}>
        <mesh material={m.grate} position={[0, -0.07, 0]} receiveShadow>
          <cylinderGeometry args={[R, R, 0.14, 48]} />
        </mesh>
        <mesh geometry={geos.lower} material={m.chrome} position={[0, -0.14, 0]} castShadow />
        <mesh material={m.chrome} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, 0]}>
          <torusGeometry args={[R + 0.02, 0.055, 8, 64]} />
        </mesh>
        <mesh geometry={geos.glass} material={m.glass} renderOrder={2} />
        <mesh ref={doorA} geometry={geos.leafA} material={m.glass} renderOrder={2} />
        <mesh ref={doorB} geometry={geos.leafB} material={m.glass} renderOrder={2} />
        {/* Steel frame either side of the doorway. */}
        {[-1, 1].map((side) => {
          const a = Math.PI / 2 - side * DOOR_HALF
          return (
            <mesh
              key={side}
              material={m.steel}
              position={[Math.cos(a) * R, H / 2, Math.sin(a) * R]}
              castShadow
            >
              <boxGeometry args={[0.07, H, 0.07]} />
            </mesh>
          )
        })}
        <mesh
          geometry={geos.rail}
          material={m.chrome}
          rotation={[-Math.PI / 2, 0, geos.railStart]}
          position={[0, 1.0, 0]}
        />
        <mesh material={m.chrome} rotation={[-Math.PI / 2, 0, 0]} position={[0, H, 0]}>
          <torusGeometry args={[R + 0.02, 0.065, 8, 64]} />
        </mesh>
        {/* Ceiling, with a ring of light set into it. */}
        <mesh material={m.steel} position={[0, H + 0.02, 0]}>
          <cylinderGeometry args={[R, R, 0.06, 48]} />
        </mesh>
        <mesh material={m.light} rotation={[Math.PI / 2, 0, 0]} position={[0, H - 0.02, 0]}>
          <ringGeometry args={[R * 0.42, R * 0.62, 48]} />
        </mesh>
        <mesh geometry={geos.upper} material={m.chrome} position={[0, H + 0.05, 0]} castShadow />
        {/* Crown, and the beacon on it. */}
        <mesh material={m.steel} position={[0, H + R * 0.55 + 0.1, 0]}>
          <cylinderGeometry args={[0.28, 0.36, 0.26, 16]} />
        </mesh>
        <mesh position={[0, H + R * 0.55 + 0.28, 0]}>
          <sphereGeometry args={[0.09, 12, 8]} />
          <meshStandardMaterial
            ref={beacon}
            color="#ffb24a"
            emissive="#ff9a2e"
            emissiveIntensity={0.35}
          />
        </mesh>
        {/* Control column. */}
        <group
          position={[Math.cos(Math.PI / 2 - colA) * colR, 0, Math.sin(Math.PI / 2 - colA) * colR]}
          rotation={[0, Math.PI + colA, 0]}
        >
          <mesh material={m.steel} position={[0, 0.9, 0]} castShadow>
            <boxGeometry args={[0.22, 1.8, 0.1]} />
          </mesh>
          <instancedMesh
            ref={(im) => {
              buttons.current = im
              if (!im) return
              buttonMatrix.forEach((mx, i) => im.setMatrixAt(i, mx))
              im.instanceMatrix.needsUpdate = true
            }}
            args={[undefined, undefined, LEVEL_COUNT]}
          >
            <boxGeometry args={[0.06, 0.05, 0.02]} />
            <meshStandardMaterial color="#ffd9a0" emissive="#ffb35a" emissiveIntensity={1.4} />
          </instancedMesh>
        </group>
        <pointLight color="#dfe8ff" intensity={7} distance={7} decay={2} position={[0, H - 0.4, 0]} />
      </group>
      {/* Cables: three, hung from the core, scaled every frame to reach the car. */}
      <group ref={cables}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2
          return (
            <mesh
              key={i}
              geometry={geos.cable}
              position={[Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16]}
            >
              <meshStandardMaterial color="#26221f" roughness={0.6} metalness={0.6} />
            </mesh>
          )
        })}
      </group>
    </>
  )
}

export default function Elevator() {
  return (
    <>
      <ShaftRings />
      <LandingDoors />
      <Car />
    </>
  )
}
