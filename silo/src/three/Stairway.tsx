import { useMemo } from 'react'
import * as THREE from 'three'
import { FLOORS, PALETTE, contentAngle, walkY } from '../content/floors'
import {
  BRIDGE_FROM,
  BRIDGE_TO,
  BRIDGE_WIDTH,
  LANDING_T,
  RAIL_H,
  STAIR_INNER,
  STAIR_MID,
  STAIR_OUTER,
  STAIR_WIDTH,
  STEPS_PER_FLIGHT,
  STEP_GOING,
  flightAngle,
  flightSteps,
  flightSurface,
  flightY,
  flights,
  landingEdgeAngle,
  landingEdgeSpans,
  landingSurface,
  railPath,
  bridgeFrame,
  bridgePoint,
} from '../content/stairs'
import { plateSurface, steelSurface, tiled } from './materials'
import { useSilo } from '../state/useSilo'

/**
 * What the stair and its gangways look like.
 *
 * Every position here comes from `content/stairs.ts`, which is the same module
 * the colliders are built from. Nothing in this file invents a coordinate, so
 * the stair you can see and the stair you can stand on cannot drift apart —
 * which is precisely how the old helix ended up being decoration: it was drawn
 * from its own constants and never given collision at all.
 */

const dummy = new THREE.Object3D()

function materials() {
  const tread = tiled(plateSurface(), 2, 1)
  const brushed = tiled(steelSurface(), 3, 2)
  return {
    tread: new THREE.MeshStandardMaterial({
      roughness: 0.74,
      metalness: 0.26,
      map: tread.map,
      normalMap: tread.normalMap,
      roughnessMap: tread.roughnessMap,
    }),
    steel: new THREE.MeshStandardMaterial({
      roughness: 0.6,
      metalness: 0.4,
      map: brushed.map,
      normalMap: brushed.normalMap,
      roughnessMap: brushed.roughnessMap,
    }),
    /** The underside of the flight: plain and dark, because it is always seen
     *  at a grazing angle from below where a tiled normal map streaks. */
    soffit: new THREE.MeshStandardMaterial({
      color: PALETTE.concreteDark,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    rail: new THREE.MeshStandardMaterial({
      color: PALETTE.brass,
      roughness: 0.34,
      metalness: 0.88,
    }),
    /** Nosing strip. Lit, so the edge of every tread reads in near-darkness —
     *  the one safety cue a stair in a 120 m shaft genuinely needs. */
    nosing: new THREE.MeshStandardMaterial({
      color: PALETTE.brassHot,
      emissive: new THREE.Color(PALETTE.brassHot),
      emissiveIntensity: 0.5,
      roughness: 0.5,
      metalness: 0.3,
    }),
  }
}

/** Treads, nosings and the slab beneath them, for all eleven flights. */
function Flights() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const m = materials()
    const total = flights.length * STEPS_PER_FLIGHT

    // Every flight's treads and risers, one mesh each.
    for (const level of flights) {
      group.add(new THREE.Mesh(flightSteps(level), m.tread))
    }

    // Lit nosings. The one safety cue a stair in a 120 m shaft genuinely
    // needs, and the thing that makes the helix readable from across the void.
    const nosings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(STAIR_WIDTH * 0.98, 0.02, 0.05),
      m.nosing,
      total,
    )
    let n = 0
    for (const level of flights) {
      for (let i = 0; i < STEPS_PER_FLIGHT; i++) {
        const t = (i + 0.5) / STEPS_PER_FLIGHT
        const a = flightAngle(level, t)
        const y = flightY(level, t)
        dummy.position.set(Math.cos(a) * STAIR_MID, y + 0.012, Math.sin(a) * STAIR_MID)
        dummy.rotation.set(0, -a, 0)
        dummy.translateZ(STEP_GOING * 0.5)
        dummy.updateMatrix()
        nosings.setMatrixAt(n++, dummy.matrix)
      }
    }
    nosings.count = n
    nosings.instanceMatrix.needsUpdate = true
    group.add(nosings)

    // The slab the treads sit on.
    //
    // It has to sit JUST under them. At first it hung 0.42 m below, which from
    // the top of a flight looks like a ladder of floating plates with 42 cm of
    // darkness showing between every tread -- the treads are 0.31 m apart and
    // nothing models the risers. Tucked 0.13 m down it closes those gaps, and
    // from the deck below it is a single smooth helical soffit, which is what
    // a cast stair of this kind actually looks like from underneath.
    for (const level of flights) {
      const slab = flightSurface(level)
      slab.translate(0, -0.13, 0)
      group.add(new THREE.Mesh(slab, m.soffit))
    }
    return group
  }, [])

  return <primitive object={nodes} />
}

/** Handrails and balusters along both edges of every flight. */
function FlightRails() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const m = materials()

    for (const level of flights) {
      for (const r of [STAIR_INNER + 0.08, STAIR_OUTER - 0.08]) {
        const pts = railPath(level, r)
        group.add(
          new THREE.Mesh(
            new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.045, 6, false),
            m.rail,
          ),
        )
      }
    }

    const perFlight = 15
    const posts = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.026, 0.026, RAIL_H, 6),
      m.steel,
      flights.length * perFlight * 2,
    )
    let n = 0
    for (const level of flights) {
      for (let i = 0; i < perFlight; i++) {
        const t = (i + 0.5) / perFlight
        const a = flightAngle(level, t)
        const y = flightY(level, t)
        for (const r of [STAIR_INNER + 0.08, STAIR_OUTER - 0.08]) {
          dummy.position.set(Math.cos(a) * r, y + RAIL_H / 2, Math.sin(a) * r)
          dummy.rotation.set(0, 0, 0)
          dummy.updateMatrix()
          posts.setMatrixAt(n++, dummy.matrix)
        }
      }
    }
    posts.count = n
    posts.instanceMatrix.needsUpdate = true
    group.add(posts)
    return group
  }, [])

  return <primitive object={nodes} />
}

/** A sign plate for a level: the number, large, and the floor's name. */
function signTexture(level: number, name: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 200
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(24,20,17,0.97)'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.strokeStyle = 'rgba(201,153,107,0.55)'
  ctx.lineWidth = 5
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20)
  ctx.fillStyle = PALETTE.brassHot
  ctx.font = 'bold 104px "Segoe UI", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(level).padStart(2, '0'), c.width / 2, 88)
  ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif'
  ctx.fillStyle = 'rgba(237,233,230,0.75)'
  ctx.fillText(name.toUpperCase().slice(0, 30), c.width / 2, 162)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * The landings and bridges: one of each per level.
 *
 * The landing wraps the core where the lift doors open and the stair arrives;
 * the bridge spans the void from it to the deck. Each bridge carries the level
 * sign on a post at its deck end -- it used to be bolted to the wall at a fixed
 * offset from the content angle, which on level 1 put it in the cutaway, where
 * there is no wall, floating in mid-air.
 */
function Gangways() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const m = materials()
    const edgeMat = new THREE.MeshStandardMaterial({
      color: PALETTE.brass,
      emissive: new THREE.Color(PALETTE.brass),
      emissiveIntensity: 1.1,
      roughness: 0.5,
      metalness: 0.4,
    })

    const addBox = (
      w: number, h: number, d: number,
      x: number, y: number, z: number, rotY: number,
      mat: THREE.Material, shadow = true,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      mesh.position.set(x, y, z)
      mesh.rotation.y = rotY
      mesh.castShadow = shadow
      mesh.receiveShadow = true
      group.add(mesh)
      return mesh
    }

    FLOORS.forEach((floor) => {
      const level = floor.level
      const a = contentAngle(level)
      const y = walkY(level)

      // ---- landing ----------------------------------------------------
      const top = new THREE.Mesh(landingSurface(level), m.tread)
      top.receiveShadow = true
      group.add(top)
      const under = landingSurface(level)
      under.translate(0, -LANDING_T, 0)
      group.add(new THREE.Mesh(under, m.soffit))

      // Barrier panels on the landing's radial edges, wherever a flight does
      // NOT meet them.
      for (const side of [-1, 1] as const) {
        const ea = landingEdgeAngle(level, side)
        for (const [r0, r1] of landingEdgeSpans(level, side)) {
          const len = r1 - r0
          if (len < 0.05) continue
          const mid = (r0 + r1) / 2
          const x = Math.cos(ea) * mid
          const z = Math.sin(ea) * mid
          addBox(len, RAIL_H, 0.06, x, y + RAIL_H / 2, z, -ea, m.steel)
          addBox(len, 0.05, 0.1, x, y + RAIL_H, z, -ea, edgeMat, false)
        }
      }

      // ---- bridge -----------------------------------------------------
      const f = bridgeFrame(level)
      addBox(f.length, LANDING_T, BRIDGE_WIDTH, f.cx, y - LANDING_T / 2, f.cz, -a, m.tread)
      // Parapets, from the landing to the deck lip.
      const pLen = f.parapetTo - f.parapetFrom
      const pMid = (f.parapetTo + f.parapetFrom) / 2
      for (const across of [-1, 1]) {
        const [px, pz] = bridgePoint(level, pMid, across * (BRIDGE_WIDTH / 2 - 0.03))
        addBox(pLen, RAIL_H, 0.06, px, y + RAIL_H / 2, pz, -a, m.steel)
        addBox(pLen, 0.05, 0.1, px, y + RAIL_H, pz, -a, edgeMat, false)
        // A deep edge beam under each side, so the span reads as structure.
        const [bx, bz] = bridgePoint(level, (BRIDGE_FROM + BRIDGE_TO) / 2, across * (BRIDGE_WIDTH / 2 - 0.12))
        addBox(f.length, 0.42, 0.2, bx, y - LANDING_T - 0.21, bz, -a, m.steel)
      }

      // Threshold strip where the bridge meets the landing.
      const [tx, tz] = bridgePoint(level, BRIDGE_FROM + 0.1, 0)
      addBox(0.12, 0.02, BRIDGE_WIDTH - 0.2, tx, y + 0.01, tz, -a, edgeMat, false)

      // ---- level sign on a post at the deck end of the bridge ----------
      for (const across of [-1, 1]) {
        const [sx, sz] = bridgePoint(level, f.parapetTo + 0.35, across * (BRIDGE_WIDTH / 2 + 0.45))
        addBox(0.12, 2.4, 0.12, sx, y + 1.2, sz, -a, m.steel)
        if (across === 1) {
          // Two faces back to back, each one-sided. A single double-sided
          // plane shows its text mirrored to anyone on the far side of it --
          // which, for a sign at the end of a bridge, is everyone on the deck.
          const tex = signTexture(level, floor.name)
          const mat = new THREE.MeshStandardMaterial({
            map: tex,
            emissive: new THREE.Color('#ffffff'),
            emissiveMap: tex,
            emissiveIntensity: 0.55,
            roughness: 0.7,
          })
          for (const flip of [0, Math.PI]) {
            const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.625), mat)
            plate.position.set(sx, y + 2.05, sz)
            // flip 0 faces back along the bridge, towards whoever is arriving
            // from the lift; flip PI faces out across the deck.
            plate.rotation.y = Math.PI / 2 - a + Math.PI + flip
            plate.translateZ(0.012)
            group.add(plate)
          }
        }
      }
    })
    return group
  }, [])

  return <primitive object={nodes} />
}

/**
 * A warm light over each landing, so the route reads from anywhere in the
 * shaft.
 *
 * The emissive housing is drawn on all twelve levels; the actual point light
 * only follows the three you could be standing on. three.js compiles the light
 * count into the material, so twelve live point lights on top of everything
 * else would recompile every shader in the scene and cost far more than it
 * could ever show at once.
 */
function GangwayLamps() {
  const level = useSilo((s) => s.level)
  const lamps = useMemo(
    () =>
      FLOORS.map((f) => {
        const fr = bridgeFrame(f.level)
        const posts = [-1, 1].map((across) => {
          const [x, z] = bridgePoint(f.level, fr.parapetTo + 0.35, across * (BRIDGE_WIDTH / 2 + 0.45))
          return [x, walkY(f.level) + 2.5, z] as [number, number, number]
        })
        const [lx, lz] = bridgePoint(f.level, (BRIDGE_FROM + BRIDGE_TO) / 2, 0)
        return { level: f.level, posts, light: [lx, walkY(f.level) + 2.6, lz] as [number, number, number] }
      }),
    [],
  )

  return (
    <group>
      {lamps.map((lamp) => (
        <group key={lamp.level}>
          {/* A lantern on top of each sign post at the deck end. */}
          {lamp.posts.map((p, i) => (
            <mesh key={i} position={p}>
              <boxGeometry args={[0.22, 0.2, 0.22]} />
              <meshStandardMaterial
                color={PALETTE.brassHot}
                emissive={PALETTE.brassHot}
                emissiveIntensity={2.2}
                roughness={0.4}
              />
            </mesh>
          ))}
          {Math.abs(lamp.level - level) <= 1 && (
            <pointLight position={lamp.light} color={PALETTE.brassHot} intensity={9} distance={12} decay={2} />
          )}
        </group>
      ))}
    </group>
  )
}

export default function Stairway() {
  return (
    <group>
      <Flights />
      <FlightRails />
      <Gangways />
      <GangwayLamps />
    </group>
  )
}
