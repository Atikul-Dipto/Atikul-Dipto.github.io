import { useMemo } from 'react'
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier'
import * as THREE from 'three'
import {
  DECK_INNER,
  DECK_OUTER,
  ELEVATOR_HALF,
  LEVEL_COUNT,
  ROOM_HEIGHT,
  VOID_RAIL_H,
  contentAngle,
  walkY,
} from '../../content/floors'
import {
  LANDING_HALF,
  RAIL_H,
  STAIR_INNER,
  STAIR_OUTER,
  carTransform,
  flightSkirt,
  flightSurface,
  hasFlightDown,
  landingEdgeAngle,
  landingEdgeSpans,
  landingSurface,
  radialPanel,
} from '../../content/stairs'

/**
 * Static collision for the part of the silo a body can currently reach.
 *
 * Deliberately far simpler than what is drawn, and derived from exactly the
 * same constants, so collision cannot drift away from the architecture. Using
 * the decorative meshes as colliders would make every rib, service run, railing
 * and tread into an obstacle, which is both slow and wrong.
 *
 * WHAT IS BUILT, PER DECK
 *   floor     the deck annulus, exactly as drawn: DECK_INNER to DECK_OUTER
 *   void      a barrier ringing the central opening, ON THE HANDRAIL LINE,
 *             with a gap at the gangway so the one way off the deck is the
 *             way the architecture says it is
 *   wall      the outer boundary, a full circle including across the cutaway
 *   gangway   the platform out to the lift, its two edge barriers, and the
 *             lift car's own floor and three walls
 *
 * The wall is closed all the way round on purpose. The cutaway sector has no
 * built wall, only the lit edge rail, and an invisible barrier a few
 * centimetres outboard of that rail is the difference between leaning over the
 * edge and falling 120 m into the cavern.
 *
 * WHAT IS BUILT BETWEEN DECKS
 *   the flight ramp, plus a skirt at each edge of it.
 *
 * THE WINDOW. Three decks are built — the one being stood on and its two
 * neighbours — together with the two flights that join them. That is the
 * minimum that lets someone walk off a deck, down a whole flight, and arrive
 * on the next one without the ground they are standing on ever being rebuilt
 * under them: when `level` ticks over from L to L+1 the window moves from
 * {L-1, L, L+1} to {L, L+1, L+2}, and both L and L+1 survive the move. Each
 * deck is keyed by its own level number so React reuses the ones that stay.
 *
 * The colliders are declared explicitly rather than with `colliders="trimesh"`
 * on a mesh. Automatic generation walks the children looking for meshes and
 * skips ones that are `visible={false}`, so the first version of this produced
 * a rigid body with zero colliders and the visitor fell 1,800 m down the
 * shaft. Building the vertex and index arrays here means the collider cannot
 * silently fail to exist.
 */

/** Radial segments. Enough that the capsule never catches on a facet. */
const SEGMENTS = 72

/** Pull world-space triangles out of a geometry for Rapier. */
function trimesh(geo: THREE.BufferGeometry): [Float32Array, Uint32Array] {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const vertices = new Float32Array(pos.array)
  const index = geo.getIndex()
  if (!index) {
    // Non-indexed: every three vertices are a triangle.
    const indices = new Uint32Array(pos.count)
    for (let i = 0; i < pos.count; i++) indices[i] = i
    return [vertices, indices]
  }
  return [vertices, new Uint32Array(index.array)]
}

/**
 * three.js measures cylinder theta from +Z; this project measures angles from
 * +X. A cylinder arc that must avoid the world-angle range [a0, a1] therefore
 * starts at `PI/2 - a1` and runs the rest of the way round.
 */
function archedRail(y: number, height: number, gapFrom: number, gapTo: number) {
  const g = new THREE.CylinderGeometry(
    DECK_INNER,
    DECK_INNER,
    height,
    SEGMENTS,
    1,
    true,
    // Theta runs opposite to world angle, so the arc starts where the gap
    // ends in theta terms -- at `PI/2 - gapFrom` -- and runs the long way.
    Math.PI / 2 - gapFrom,
    Math.PI * 2 - (gapTo - gapFrom),
  )
  g.translate(0, y + height / 2, 0)
  return trimesh(g)
}

function DeckColliders({ level }: { level: number }) {
  const y = walkY(level)

  // Geometries are baked into their final position here rather than being
  // positioned by the collider's transform, so what Rapier receives is exactly
  // what the numbers in floors.ts and stairs.ts describe.
  const parts = useMemo(() => {
    const a = contentAngle(level)

    const f = new THREE.RingGeometry(DECK_INNER, DECK_OUTER, SEGMENTS, 1)
    f.rotateX(-Math.PI / 2)
    f.translate(0, y, 0)

    const w = new THREE.CylinderGeometry(
      DECK_OUTER, DECK_OUTER, ROOM_HEIGHT, SEGMENTS, 1, true,
    )
    w.translate(0, y + ROOM_HEIGHT / 2, 0)

    const landing = landingSurface(level)

    const edges: Array<[Float32Array, Uint32Array]> = []
    for (const side of [-1, 1] as const) {
      const ea = landingEdgeAngle(level, side)
      for (const [r0, r1] of landingEdgeSpans(level, side)) {
        if (r1 - r0 < 0.05) continue
        edges.push(trimesh(radialPanel(ea, r0, r1, y, RAIL_H)))
      }
    }

    return {
      floor: trimesh(f),
      wall: trimesh(w),
      // The void barrier is open only across the gangway.
      voidRail: archedRail(y, VOID_RAIL_H, a - LANDING_HALF, a + LANDING_HALF),
      landing: trimesh(landing),
      edges,
    }
  }, [level, y])

  const car = carTransform(level)

  return (
    <RigidBody type="fixed" colliders={false}>
      <TrimeshCollider args={parts.floor} />
      <TrimeshCollider args={parts.voidRail} />
      <TrimeshCollider args={parts.wall} />
      <TrimeshCollider args={parts.landing} />
      {parts.edges.map((e, i) => (
        <TrimeshCollider key={i} args={e} />
      ))}

      {/*
        The lift car. It is drawn in Elevator.tsx and, on the level being
        walked, is always parked at this height with its doors open — so a
        visitor who follows the lit gangway walks straight into it. Without a
        floor under it that walk ends 120 m down the shaft. Three walls, no
        fourth: the doorway stays open, which is also how you get back out.
      */}
      <group position={[0, car.y, 0]} rotation={[0, car.rotY, 0]}>
        <CuboidCollider args={[ELEVATOR_HALF, 0.07, ELEVATOR_HALF]} position={[0, -0.07, 0]} />
        <CuboidCollider args={[ELEVATOR_HALF, 1.3, 0.05]} position={[0, 1.3, -ELEVATOR_HALF]} />
        <CuboidCollider args={[0.05, 1.3, ELEVATOR_HALF]} position={[-ELEVATOR_HALF, 1.3, 0]} />
        <CuboidCollider args={[0.05, 1.3, ELEVATOR_HALF]} position={[ELEVATOR_HALF, 1.3, 0]} />
      </group>
    </RigidBody>
  )
}

function FlightColliders({ level }: { level: number }) {
  const parts = useMemo(
    () => ({
      ramp: trimesh(flightSurface(level)),
      inner: trimesh(flightSkirt(level, STAIR_INNER, RAIL_H)),
      outer: trimesh(flightSkirt(level, STAIR_OUTER, RAIL_H)),
    }),
    [level],
  )

  return (
    <RigidBody type="fixed" colliders={false}>
      <TrimeshCollider args={parts.ramp} />
      <TrimeshCollider args={parts.inner} />
      <TrimeshCollider args={parts.outer} />
    </RigidBody>
  )
}

export function LevelColliders({ level }: { level: number }) {
  // The deck being stood on and its two neighbours, and the two flights that
  // join them. Anything further away cannot be reached before `level` ticks
  // over and the window moves with it.
  const decks = [level - 1, level, level + 1].filter((n) => n >= 1 && n <= LEVEL_COUNT)
  const stairs = [level - 1, level].filter((n) => n >= 1 && hasFlightDown(n))

  return (
    <>
      {decks.map((n) => (
        <DeckColliders key={`deck-${n}`} level={n} />
      ))}
      {stairs.map((n) => (
        <FlightColliders key={`flight-${n}`} level={n} />
      ))}
    </>
  )
}

export default LevelColliders
