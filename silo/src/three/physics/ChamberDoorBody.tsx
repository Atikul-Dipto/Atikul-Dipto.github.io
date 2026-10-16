import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { CH_DOOR, FLOOR6, ROOMS6 } from '../../content/level6'
import { chamber, doorRoll } from '../../lib/chamber'

/** Where a rolling door's slab is, in the world, for a given roll. */
export function chamberDoorAt(k: number, t: number) {
  const [x, z] = ROOMS6[k].frame.to(doorRoll(t), CH_DOOR.d)
  return { x, y: FLOOR6 + CH_DOOR.centre, z }
}

/**
 * One of the recreation rooms' round doors as something a body bumps into: a
 * kinematic slab following the drawn door along its track. Shut, it fills the
 * opening; open, it is in its pocket inside the wall, where no body can reach.
 */
export default function ChamberDoorBody({ k }: { k: number }) {
  const rb = useRef<RapierRigidBody>(null)
  const q = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ROOMS6[k].frame.yaw, 0)), [k])
  const [start] = useState(() => chamberDoorAt(k, chamber.doors[k]))

  useFrame(() => {
    const b = rb.current
    if (!b) return
    b.setNextKinematicTranslation(chamberDoorAt(k, chamber.doors[k]))
    b.setNextKinematicRotation(q)
  })

  return (
    <RigidBody ref={rb} type="kinematicPosition" colliders={false} position={[start.x, start.y, start.z]} quaternion={q}>
      <CuboidCollider args={[CH_DOOR.radius, CH_DOOR.radius, CH_DOOR.half]} />
    </RigidBody>
  )
}
