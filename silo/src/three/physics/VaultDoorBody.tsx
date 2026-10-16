import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { VAULT } from '../../content/level1'
import { DOOR_HALF_T, doorPose, doorTransform, vaultDoor } from '../../lib/vault'

/**
 * The vault door as something a body bumps into, wherever it is in its swing:
 * a kinematic slab that follows the drawn door every frame. Shut, it closes
 * the portal; open, it stands out into the office and has to be walked round.
 *
 * It never pushes the body. lib/vault.ts holds the door still rather than let
 * it move into anyone, so all this has to do is be where the door is.
 */
export default function VaultDoorBody() {
  const rb = useRef<RapierRigidBody>(null)
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const [start] = useState(() => {
    const p = doorPose(vaultDoor.t)
    return doorTransform(p.plug, p.swing)
  })

  useFrame(() => {
    const b = rb.current
    if (!b) return
    const p = doorPose(vaultDoor.t)
    const tr = doorTransform(p.plug, p.swing)
    q.setFromEuler(e.set(0, tr.yaw, 0))
    b.setNextKinematicTranslation({ x: tr.x, y: tr.y, z: tr.z })
    b.setNextKinematicRotation(q)
  })

  return (
    <RigidBody ref={rb} type="kinematicPosition" colliders={false} position={[start.x, start.y, start.z]} rotation={[0, start.yaw, 0]}>
      <CuboidCollider args={[VAULT.radius, VAULT.radius, DOOR_HALF_T]} />
    </RigidBody>
  )
}
