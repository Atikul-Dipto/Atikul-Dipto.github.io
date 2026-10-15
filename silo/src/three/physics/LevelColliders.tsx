import { useMemo } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody, TrimeshCollider } from '@react-three/rapier'
import * as THREE from 'three'
import {
  CAR_HEIGHT,
  CAR_RADIUS,
  DECK_INNER,
  DECK_OUTER,
  LEVEL_COUNT,
  ROOM_HEIGHT,
  SHAFT_RING,
  VOID_RAIL_H,
  contentAngle,
  walkY,
} from '../../content/floors'
import { RIB, recordWallSolids, ribAngles } from '../../content/layout'
import { level1Colliders } from '../../content/level1'
import type { Box } from '../../content/level1'
import {
  BRIDGE_WIDTH,
  RAIL_GAP_HALF,
  RAIL_H,
  STAIR_INNER,
  STAIR_OUTER,
  bridgeFrame,
  bridgePoint,
  flightSkirt,
  flightSurface,
  hasFlightDown,
  landingEdgeAngle,
  landingEdgeSpans,
  landingSurface,
  radialPanel,
} from '../../content/stairs'
import { useSilo } from '../../state/useSilo'
import { DOOR_HALF } from '../Elevator'

/**
 * Static collision for the part of the silo a body can currently reach.
 *
 * Deliberately far simpler than what is drawn, and derived from exactly the
 * same data, so collision cannot drift away from the architecture.
 *
 * PER DECK
 *   floor     the deck annulus, DECK_INNER to DECK_OUTER
 *   void      a barrier on the handrail line round the central opening, open
 *             only where the bridge meets the deck
 *   wall      the outer boundary, closed right round -- across the cutaway it
 *             is the difference between leaning on the edge rail and falling
 *             120 m into the cavern
 *   ribs      the pilasters standing 0.6 m proud of the wall
 *   bridge    deck plate and both parapets
 *   landing   the sector round the core, and its edge barriers
 *   shaft     depends on the lift: if the car is parked here, its floor and
 *             glass; if it is anywhere else, the shut landing doors
 *   level 1   every wall, table, chair, desk and cabinet in content/level1.ts
 *
 * BETWEEN DECKS
 *   the flight ramp, with a skirt along each edge.
 *
 * THE WINDOW. Three decks are built -- the one being stood on and its two
 * neighbours -- with the two flights that join them, keyed by level so React
 * keeps the ones that survive a move. Walking from L to L+1 changes the window
 * from {L-1, L, L+1} to {L, L+1, L+2}: the ground underfoot is never rebuilt.
 *
 * Colliders are declared explicitly rather than generated from meshes.
 * Automatic generation skips meshes that are `visible={false}`, and the first
 * version of this produced a rigid body with zero colliders and a visitor who
 * fell 1,800 m down the shaft.
 */

/** Radial segments. Enough that the capsule never catches on a facet. */
const SEGMENTS = 96

/** Pull world-space triangles out of a geometry for Rapier. */
function trimesh(geo: THREE.BufferGeometry): [Float32Array, Uint32Array] {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const vertices = new Float32Array(pos.array)
  const index = geo.getIndex()
  if (!index) {
    const indices = new Uint32Array(pos.count)
    for (let i = 0; i < pos.count; i++) indices[i] = i
    return [vertices, indices]
  }
  return [vertices, new Uint32Array(index.array)]
}

/**
 * An open cylinder with one angular gap in it. three.js measures theta from
 * +Z and in the opposite sense to world angles, so a cylinder that must avoid
 * world angles [gapFrom, gapTo] starts at PI/2 - gapFrom and runs the rest of
 * the way round.
 */
function gappedRing(radius: number, y: number, height: number, gapFrom: number, gapTo: number) {
  const g = new THREE.CylinderGeometry(
    radius,
    radius,
    height,
    SEGMENTS,
    1,
    true,
    Math.PI / 2 - gapFrom,
    Math.PI * 2 - (gapTo - gapFrom),
  )
  g.translate(0, y + height / 2, 0)
  return trimesh(g)
}

/** A cuboid collider from a plan box. */
function Cuboid({ b }: { b: Box }) {
  return (
    <CuboidCollider
      args={[b.w / 2, b.h / 2, b.d / 2]}
      position={[b.x, b.y, b.z]}
      rotation={[0, b.rotY, 0]}
    />
  )
}

/** A box standing on the floor, tangential to the ring at (a, r). */
function tangentialBox(a: number, r: number, y: number, w: number, h: number, d: number): Box {
  return { x: Math.cos(a) * r, y: y + h / 2, z: Math.sin(a) * r, w, h, d, rotY: -a - Math.PI / 2 }
}

/**
 * The lift's part of a deck. Its own component, subscribed to the lift state,
 * so the car opening or leaving rebuilds three colliders and not the deck.
 */
function ShaftColliders({ level }: { level: number }) {
  const carHere = useSilo((s) => s.carLevel === level && !s.carMoving)
  const doorsOpen = useSilo((s) => s.doorsOpen)
  const y = walkY(level)
  const a = contentAngle(level)

  const carWall = useMemo(
    () => gappedRing(CAR_RADIUS + 0.03, y, CAR_HEIGHT, a - DOOR_HALF, a + DOOR_HALF),
    [y, a],
  )

  if (!carHere) {
    // The car is elsewhere: the landing doors are shut across the shaft.
    const b = tangentialBox(a, SHAFT_RING - 0.03, y, 2 * SHAFT_RING * Math.sin(0.42) + 0.12, 2.85, 0.12)
    return (
      <RigidBody type="fixed" colliders={false}>
        <Cuboid b={b} />
      </RigidBody>
    )
  }

  return (
    <RigidBody type="fixed" colliders={false}>
      <CylinderCollider args={[0.07, CAR_RADIUS]} position={[0, y - 0.07, 0]} />
      <TrimeshCollider args={carWall} />
      {!doorsOpen && (
        <Cuboid b={tangentialBox(a, CAR_RADIUS - 0.02, y, 2 * CAR_RADIUS * Math.sin(DOOR_HALF) + 0.12, CAR_HEIGHT, 0.08)} />
      )}
    </RigidBody>
  )
}

function DeckColliders({ level }: { level: number }) {
  const y = walkY(level)

  const parts = useMemo(() => {
    const a = contentAngle(level)

    const f = new THREE.RingGeometry(DECK_INNER, DECK_OUTER, SEGMENTS, 1)
    f.rotateX(-Math.PI / 2)
    f.translate(0, y, 0)

    const w = new THREE.CylinderGeometry(DECK_OUTER, DECK_OUTER, ROOM_HEIGHT, SEGMENTS, 1, true)
    w.translate(0, y + ROOM_HEIGHT / 2, 0)

    const edges: Array<[Float32Array, Uint32Array]> = []
    for (const side of [-1, 1] as const) {
      const ea = landingEdgeAngle(level, side)
      for (const [r0, r1] of landingEdgeSpans(level, side)) {
        if (r1 - r0 < 0.05) continue
        edges.push(trimesh(radialPanel(ea, r0, r1, y, RAIL_H)))
      }
    }

    // The bridge: deck plate and two parapets, as boxes in its own frame.
    const fr = bridgeFrame(level)
    const solids: Box[] = [
      { x: fr.cx, y: y - 0.09, z: fr.cz, w: fr.length, h: 0.18, d: BRIDGE_WIDTH, rotY: -a },
    ]
    const pLen = fr.parapetTo - fr.parapetFrom
    const pMid = (fr.parapetTo + fr.parapetFrom) / 2
    for (const across of [-1, 1]) {
      const [px, pz] = bridgePoint(level, pMid, across * (BRIDGE_WIDTH / 2 - 0.03))
      solids.push({ x: px, y: y + RAIL_H / 2, z: pz, w: pLen, h: RAIL_H, d: 0.08, rotY: -a })
    }

    // Ribs on the wall.
    for (const ra of ribAngles(level)) {
      solids.push({
        x: Math.cos(ra) * RIB.r,
        y: y + 2,
        z: Math.sin(ra) * RIB.r,
        w: RIB.w,
        h: 4,
        d: RIB.d,
        rotY: Math.atan2(-Math.cos(ra), -Math.sin(ra)),
      })
    }

    if (level === 1) solids.push(...level1Colliders())
    else solids.push(...recordWallSolids(level))

    return {
      floor: trimesh(f),
      wall: trimesh(w),
      voidRail: gappedRing(DECK_INNER, y, VOID_RAIL_H, a - RAIL_GAP_HALF, a + RAIL_GAP_HALF),
      landing: trimesh(landingSurface(level)),
      edges,
      solids,
    }
  }, [level, y])

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider args={parts.floor} />
        <TrimeshCollider args={parts.voidRail} />
        <TrimeshCollider args={parts.wall} />
        <TrimeshCollider args={parts.landing} />
        {parts.edges.map((e, i) => (
          <TrimeshCollider key={i} args={e} />
        ))}
        {parts.solids.map((b, i) => (
          <Cuboid key={i} b={b} />
        ))}
      </RigidBody>
      <ShaftColliders level={level} />
    </>
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
