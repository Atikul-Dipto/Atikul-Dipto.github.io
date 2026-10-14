import { useMemo } from 'react'
import * as THREE from 'three'
import {
  FLOORS,
  PALETTE,
  SHAFT_CAGE,
  contentAngle,
  walkY,
} from '../content/floors'
import {
  LANDING_HALF,
  LANDING_INNER,
  LANDING_OUTER,
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

/**
 * The gangways: one per level, running from the lift threshold out to the deck.
 *
 * Each is a lit platform. The light matters more than it sounds — it is the
 * only thing marking which of the twelve near-identical decks you are standing
 * on when you look up or down the shaft, and it is what you aim for coming
 * down the stair in the dark.
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

    FLOORS.forEach((floor) => {
      const level = floor.level
      const a = contentAngle(level)
      const y = walkY(level)

      // Deck plate. Drawn as a thin solid rather than a plane so it has an
      // underside when you walk beneath it on the flight below.
      const top = landingSurface(level)
      group.add(new THREE.Mesh(top, m.tread))
      const under = landingSurface(level)
      under.translate(0, -LANDING_T, 0)
      const underMesh = new THREE.Mesh(under, m.soffit)
      group.add(underMesh)

      // Edge beams along both sides, and the barrier panels where the stair
      // does NOT meet the edge.
      for (const side of [-1, 1] as const) {
        const ea = landingEdgeAngle(level, side)
        const c = Math.cos(ea)
        const s = Math.sin(ea)

        const beamLen = LANDING_OUTER - LANDING_INNER
        const beamR = (LANDING_OUTER + LANDING_INNER) / 2
        const beam = new THREE.Mesh(new THREE.BoxGeometry(beamLen, 0.16, 0.1), m.steel)
        beam.position.set(c * beamR, y - 0.08, s * beamR)
        beam.rotation.y = -ea
        group.add(beam)

        for (const [r0, r1] of landingEdgeSpans(level, side)) {
          const len = r1 - r0
          if (len < 0.05) continue
          const mid = (r0 + r1) / 2
          const panel = new THREE.Mesh(new THREE.BoxGeometry(len, RAIL_H, 0.06), m.steel)
          panel.position.set(Math.cos(ea) * mid, y + RAIL_H / 2, Math.sin(ea) * mid)
          panel.rotation.y = -ea
          group.add(panel)

          const cap = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.1), edgeMat)
          cap.position.set(Math.cos(ea) * mid, y + RAIL_H, Math.sin(ea) * mid)
          cap.rotation.y = -ea
          group.add(cap)
        }
      }

      // Threshold strip at the lift end: the line you cross to board.
      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.04, SHAFT_CAGE * 1.3),
        edgeMat,
      )
      sill.position.set(Math.cos(a) * (SHAFT_CAGE + 0.1), y + 0.02, Math.sin(a) * (SHAFT_CAGE + 0.1))
      sill.rotation.y = -a
      group.add(sill)

      // Underslung support, so the platform is not floating.
      const strutLen = LANDING_OUTER - LANDING_INNER
      for (const side of [-0.55, 0.55]) {
        const sa = a + side * LANDING_HALF
        const strut = new THREE.Mesh(
          new THREE.BoxGeometry(strutLen, 0.1, 0.1),
          m.steel,
        )
        const r = (LANDING_OUTER + LANDING_INNER) / 2
        strut.position.set(Math.cos(sa) * r, y - LANDING_T - 0.3, Math.sin(sa) * r)
        strut.rotation.set(0, -sa, 0.09)
        group.add(strut)
      }
    })
    return group
  }, [])

  return <primitive object={nodes} />
}

/**
 * A warm light over each gangway, so the route reads from anywhere in the shaft.
 *
 * The emissive housing is drawn on all twelve levels; the actual point light
 * only follows the three you could be standing on. three.js compiles the light
 * count into the material, so twelve live point lights on top of the lamps and
 * the travelling rig lights would recompile every shader in the scene and cost
 * far more than it could ever show at once.
 */
function GangwayLamps() {
  const level = useSilo((s) => s.level)
  const lamps = useMemo(
    () =>
      FLOORS.map((f) => {
        const a = contentAngle(f.level)
        const r = (LANDING_INNER + LANDING_OUTER) / 2
        return {
          level: f.level,
          p: [Math.cos(a) * r, walkY(f.level) + 2.7, Math.sin(a) * r] as [number, number, number],
        }
      }),
    [],
  )

  return (
    <group>
      {lamps.map((lamp) => (
        <group key={lamp.level} position={lamp.p}>
          <mesh>
            <boxGeometry args={[0.9, 0.12, 0.26]} />
            <meshStandardMaterial
              color={PALETTE.brassHot}
              emissive={PALETTE.brassHot}
              emissiveIntensity={1.8}
              roughness={0.4}
            />
          </mesh>
          {Math.abs(lamp.level - level) <= 1 && (
            <pointLight color={PALETTE.brassHot} intensity={3.4} distance={9} decay={2} />
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
