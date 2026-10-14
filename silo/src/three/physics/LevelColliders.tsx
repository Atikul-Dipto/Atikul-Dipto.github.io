import { useMemo } from 'react'
import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import * as THREE from 'three'
import {
  DECK_INNER,
  DECK_OUTER,
  ROOM_HEIGHT,
  VOID_RAIL_H,
  walkY,
} from '../../content/floors'

/**
 * Static collision for one level.
 *
 * Deliberately far simpler than what is drawn: three surfaces, all derived
 * from the same constants the visible structure is built from, so collision
 * cannot drift away from the architecture. Using the decorative meshes as
 * colliders would make the ribs, service runs, railings and signage into
 * obstacles, which is both slow and wrong.
 *
 *   floor    the deck annulus, exactly as drawn: DECK_INNER to DECK_OUTER
 *   void     a barrier ringing the central opening, on the handrail line, so
 *            the visitor cannot walk into the shaft or fall down it
 *   wall     the outer boundary, a full circle including across the cutaway
 *
 * The wall is closed all the way round on purpose. The cutaway sector has no
 * built wall, only the lit edge rail, and an invisible barrier a few
 * centimetres outboard of that rail is the difference between leaning over the
 * edge and falling 120 m into the cavern.
 *
 * Only the level being stood on is built. Twelve levels would be 36 trimeshes
 * for a body that can only ever touch three, and a floor is never removed
 * while it is being stood on -- the mount follows `level`, which changes only
 * after the body has been moved.
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

export function LevelColliders({ level }: { level: number }) {
  const y = walkY(level)

  // Geometries are baked into their final position here rather than being
  // positioned by the collider's transform, so what Rapier receives is exactly
  // what the numbers in floors.ts describe.
  const { floor, voidRail, wall } = useMemo(() => {
    const f = new THREE.RingGeometry(DECK_INNER, DECK_OUTER, SEGMENTS, 1)
    f.rotateX(-Math.PI / 2)
    f.translate(0, y, 0)

    const v = new THREE.CylinderGeometry(
      DECK_INNER, DECK_INNER, VOID_RAIL_H, SEGMENTS, 1, true,
    )
    v.translate(0, y + VOID_RAIL_H / 2, 0)

    const w = new THREE.CylinderGeometry(
      DECK_OUTER, DECK_OUTER, ROOM_HEIGHT, SEGMENTS, 1, true,
    )
    w.translate(0, y + ROOM_HEIGHT / 2, 0)

    return { floor: trimesh(f), voidRail: trimesh(v), wall: trimesh(w) }
  }, [y])

  return (
    <RigidBody type="fixed" colliders={false}>
      <TrimeshCollider args={floor} />
      <TrimeshCollider args={voidRail} />
      <TrimeshCollider args={wall} />
    </RigidBody>
  )
}

export default LevelColliders
