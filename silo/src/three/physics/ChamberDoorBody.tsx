import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { CH_DOOR, CH_FRAME, FLOOR6 } from '../../content/level6'
import { chamber, doorRoll } from '../../lib/chamber'

/** Where the rolling door's slab is, in the world, for a given roll. */
export function chamberDoorAt(t: number) {
  const [x, z] = CH_FRAME.to(doorRoll(t), CH_DOOR.d)
  return { x, y: FLOOR6 + CH_DOOR.centre, z }
}

/**
 * The chamber's round door as something a body bumps into: a kinematic slab
 * following the drawn door along its track. Shut, it fills the opening;
 * open, it is in its pocket inside the wall, where no body can reach.
 */
export default function ChamberDoorBody() {
  const rb = useRef<RapierRigidBody>(null)
  const q = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, CH_FRAME.yaw, 0)), [])
  const [start] = useState(() => chamberDoorAt(chamber.door))

  useFrame(() => {
    const b = rb.current
    if (!b) return
    b.setNextKinematicTranslation(chamberDoorAt(chamber.door))
    b.setNextKinematicRotation(q)
  })

  return (
    <RigidBody ref={rb} type="kinematicPosition" colliders={false} position={[start.x, start.y, start.z]} quaternion={q}>
      <CuboidCollider args={[CH_DOOR.radius, CH_DOOR.radius, CH_DOOR.half]} />
    </RigidBody>
  )
}
