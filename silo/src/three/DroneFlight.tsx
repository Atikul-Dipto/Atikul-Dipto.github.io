import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { DRONE, GATES, GATE_R, PAD, padPoint } from '../content/drone'
import { FLOOR_HEIGHT, DECK_DROP } from '../content/floors'
import { arcadeBlip, droneBump, setDroneHum } from '../lib/audio'
import { controls, drone, droneLevel, droneTouch, stepDrone } from '../lib/drone'
import { move } from '../lib/input'
import { useSilo } from '../state/useSilo'
import { droneModel } from './droneModel'

/**
 * The drone, flown from the desk in the recreation chamber.
 *
 * Parked, it sits on its pad on the level 6 promenade. In flight the camera
 * is its camera: the visitor's body stays standing at the desk, and the walk
 * hands over the keys -- W, A, S and D (or the left thumb) fly it, the mouse
 * (or the right thumb) turns it, Space climbs and Shift descends, Q and E
 * turn too. A minute of battery, then it lands itself back on the pad.
 */

const SPACE = { up: false, down: false, left: false, right: false }

function useFlightKeys(active: boolean) {
  useEffect(() => {
    if (!active) return
    const set = (e: KeyboardEvent, on: boolean) => {
      if (e.code === 'Space') SPACE.up = on
      else if (e.code === 'KeyC' || e.code === 'ControlLeft') SPACE.down = on
      else if (e.code === 'KeyQ') SPACE.left = on
      else if (e.code === 'KeyE') SPACE.right = on
      else return
      e.preventDefault()
    }
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') useSilo.getState().endDrone('landed')
      set(e, true)
    }
    const up = (e: KeyboardEvent) => set(e, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      Object.assign(SPACE, { up: false, down: false, left: false, right: false })
    }
  }, [active])
}

/** The on-screen climb and descend buttons press these. */

function Gates() {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const geo = new THREE.TorusGeometry(GATE_R, 0.07, 10, 48)
    const mats: THREE.MeshStandardMaterial[] = []
    GATES.forEach((g) => {
      const m = new THREE.MeshStandardMaterial({ color: '#2a3a3d', emissive: '#4fd6e0', emissiveIntensity: 0.4, roughness: 0.4 })
      const ring = new THREE.Mesh(geo, m)
      ring.position.set(g.x, g.y, g.z)
      // A torus lies in its XY plane: turn it to face along the course.
      ring.lookAt(g.x + g.nx, g.y, g.z + g.nz)
      group.add(ring)
      mats.push(m)
    })
    return { group, mats }
  }, [])
  useFrame(({ clock }) => {
    parts.mats.forEach((m, i) => {
      const next = i === drone.gate
      const done = i < drone.gate
      m.emissive.set(done ? '#2b6b4a' : next ? '#ffd166' : '#4fd6e0')
      m.emissiveIntensity = next ? 2 + Math.sin(clock.elapsedTime * 8) * 0.8 : done ? 0.4 : 0.7
    })
  })
  return <primitive object={parts.group} />
}

/** The drone parked on its pad, while nobody is flying it. */
function Pad() {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const p = padPoint()
    const deck = p.y - 1.1
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.75, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: '#2e3338', roughness: 0.6, metalness: 0.5 }),
    )
    pad.position.set(p.x, deck + 0.04, p.z)
    group.add(pad)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.02, 6, 48),
      new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb84d', emissiveIntensity: 1.2 }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.set(p.x, deck + 0.09, p.z)
    group.add(ring)
    const model = droneModel(
      new THREE.MeshStandardMaterial({ color: '#d7dde0', roughness: 0.4, metalness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: '#e8553b', emissive: '#e8553b', emissiveIntensity: 1.2 }),
    )
    model.position.set(p.x, deck + 0.16, p.z)
    model.rotation.y = PAD.angle
    group.add(model)
    return { group, model }
  }, [])
  const flying = useSilo((s) => s.droneFlying)
  parts.model.visible = !flying
  return <primitive object={parts.group} />
}

function Flight() {
  const camera = useThree((s) => s.camera)
  const endDrone = useSilo((s) => s.endDrone)
  const roll = useRef(0)
  useFlightKeys(true)

  useEffect(() => {
    move.yaw = 0
    move.pitch = 0
    return () => {
      setDroneHum(0, 0)
      move.interact = false
    }
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20)
    // The walk's controls fly it: the same keys, stick and mouse.
    controls.fwd = Math.max(-1, Math.min(1, (move.forward ? 1 : 0) - (move.back ? 1 : 0) + move.axisY))
    controls.side = Math.max(-1, Math.min(1, (move.right ? 1 : 0) - (move.left ? 1 : 0) + move.axisX))
    controls.lift = (SPACE.up || droneTouch.up ? 1 : 0) - (SPACE.down || move.sprint || droneTouch.down ? 1 : 0)
    controls.turn = (SPACE.left ? 1 : 0) - (SPACE.right ? 1 : 0)
    drone.yaw += move.yaw
    drone.pitch = Math.max(-1.2, Math.min(0.9, drone.pitch + move.pitch))
    move.yaw = 0
    move.pitch = 0
    move.interact = false

    const going = stepDrone(dt)
    if (drone.bumped) droneBump()
    if (drone.passed >= 0) arcadeBlip(drone.passed === GATES.length - 1 ? 'win' : 'select')
    const speed = Math.hypot(drone.vx, drone.vy, drone.vz) / DRONE.speed
    setDroneHum(1, speed)

    // Bank into the turn a little, the way a quad tilts as it moves sideways.
    const sin = Math.sin(drone.yaw)
    const cos = Math.cos(drone.yaw)
    const sideways = drone.vx * cos - drone.vz * sin
    roll.current += (-sideways * 0.03 - roll.current) * (1 - Math.exp(-6 * dt))
    camera.position.set(drone.x, drone.y, drone.z)
    camera.rotation.set(0, 0, 0)
    camera.rotateY(drone.yaw)
    camera.rotateX(drone.pitch)
    camera.rotateZ(roll.current)

    // Keep the store's idea of which level is nearby roughly right, for the HUD.
    const level = Math.round((-(drone.y - 1.1) - DECK_DROP) / FLOOR_HEIGHT + 1)
    if (level !== droneLevel.current) {
      droneLevel.current = level
      const at = Math.min(12, Math.max(1, level))
      if (useSilo.getState().droneAt !== at) useSilo.setState({ droneAt: at })
    }

    if (!going) endDrone(drone.finish !== null ? 'finished' : 'battery')
  })
  return null
}


/** Everything of the drone's that is drawn: its pad, and in a race, the gates. */
export default function DroneFlight() {
  const flying = useSilo((s) => s.droneFlying)
  const mode = useSilo((s) => s.droneMode)
  return (
    <>
      <Pad />
      {flying && mode === 'race' && <Gates />}
      {flying && <Flight />}
    </>
  )
}
