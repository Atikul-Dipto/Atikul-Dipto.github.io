import { useEffect, useRef, useState } from 'react'
import { PROBE } from '../../lib/probe'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import {
  CAM_RADIUS,
  CAR_RADIUS,
  DECK_DROP,
  DECK_INNER,
  EYE_OFFSET,
  FLOOR_HEIGHT,
  LEVEL_COUNT,
  PLAYER_HALF,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  SHAFT_RING,
  contentAngle,
  walkY,
} from '../../content/floors'
import { INNER_DOOR, VAULT_ROOM, VAULT_TERMINAL, toVault } from '../../content/level1'
import { LANDING_HALF } from '../../content/stairs'
import { LEVEL as LEVEL6, level6Interact } from '../../content/level6'
import { startAim } from '../../lib/aim'
import { CONTACTS, LEVEL as LEVEL12, level12Interact } from '../../content/level12'
import { drone } from '../../lib/drone'
import { reactor } from '../../lib/reactor'
import { openContact } from '../../lib/contact'
import { footstep, reactorSurge, sealedKnock } from '../../lib/audio'
import { attachWalkInput, inputGate, move, releaseKeys } from '../../lib/input'
import { lift } from '../../lib/lift'
import { vaultDoor } from '../../lib/vault'
import { bodyAt } from '../../lib/chamber'
import { useSilo } from '../../state/useSilo'
import type { Interact } from '../../state/useSilo'

/**
 * The first-person body.
 *
 * A kinematic capsule moved by Rapier's character controller, not a dynamic
 * rigid body. A dynamic body is the wrong tool for a person: it tips over,
 * slides down slopes, bounces off geometry and accumulates angular velocity.
 * The character controller does the one thing wanted here -- take a desired
 * translation, slide it along whatever it collides with, and report back how
 * far it actually got.
 *
 * The camera follows the body, never the reverse: the body is moved first,
 * the physics decides where it ended up, and the camera is placed at the
 * result.
 */

/** Metres per second. The atrium is 44 m across now; a stroll that took two
 *  seconds to cross the old deck would take a fortnight to cross this one. */
const WALK_SPEED = 3.4
const SPRINT_SPEED = 6.0
/**
 * Exponential approach rates, per second. Separate ones for setting off and
 * for stopping, and framerate-independent -- the old `min(1, ACCEL * dt)`
 * reached full speed in a different number of frames at 30 fps than at 144,
 * which is exactly the kind of thing that reads as "not smooth" without
 * anyone being able to say why.
 */
const ACCEL = 9
const DECEL = 12
const GRAVITY = -18
/** Terminal fall speed, so a long drop cannot tunnel through the floor. */
const MAX_FALL = -40
const PITCH_LIMIT = 1.45
/**
 * Look smoothing. Raw mouse deltas arrive in uneven bursts at uneven frame
 * times; a 30 ms time constant evens them out without a lag anyone can feel.
 */
const LOOK_RATE = 32
/**
 * Camera height smoothing. The controller autosteps kerbs and thresholds in a
 * single frame; the camera follows that step over a few, so stepping up reads
 * as a step and not a jolt. Large jumps (a placement) snap.
 */
const STEP_RATE = 18

const CONTROLLER_OFFSET = 0.02
const STEP_HEIGHT = 0.45
const SNAP_TO_GROUND = 0.6

/** Head bob: small, to give the body weight without seasickness. */
const BOB_RISE = 0.04
const BOB_ROLL = 0.005
/** One footfall every 1/BOB_CADENCE metres -- driven by distance, not time. */
const BOB_CADENCE = 1.4

/** Inside the car, a little in from its glass. */
const IN_CAR = CAR_RADIUS - 0.14

/** Yaw that faces a world direction; forward is (-sin yaw, -cos yaw). */
const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz)
const angDist = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)

export default function Player() {
  const body = useRef<RapierRigidBody>(null)
  const { world } = useRapier()
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const mode = useSilo((s) => s.mode)
  const setLocked = useSilo((s) => s.setPointerLocked)

  const vel = useRef(new THREE.Vector3())
  const fall = useRef(0)
  const look = useRef({ yaw: 0, pitch: 0 })
  const lookTarget = useRef({ yaw: 0, pitch: 0 })
  const controller = useRef<ReturnType<typeof world.createCharacterController> | null>(null)
  const grounded = useRef(false)
  const bob = useRef(0)
  const lastStep = useRef(0)
  const camY = useRef<number | null>(null)
  /**
   * Latched for the length of a journey. Whether the body is aboard is
   * decided ONCE, while the car is still standing, and then held until the
   * journey ends. Deciding it every frame from "is the body within 0.6 m of
   * the car floor" lost the visitor on the first slow frame: the car dropped
   * further than that in one step, the test said no, and the body was left
   * standing in mid-air while the car carried on down without it -- measured
   * at 16.8 m behind the car before it fell.
   */
  const pinned = useRef(false)
  /** A placement waiting to be applied by the frame loop -- see below. */
  const place = useRef<{ x: number; y: number; z: number } | null>(null)
  const [spawn] = useState<[number, number, number]>(() => {
    const l = useSilo.getState().level
    const a = contentAngle(l)
    return [Math.cos(a) * CAM_RADIUS, walkY(l) + PLAYER_HEIGHT / 2, Math.sin(a) * CAM_RADIUS]
  })

  useEffect(() => {
    const c = world.createCharacterController(CONTROLLER_OFFSET)
    c.setUp({ x: 0, y: 1, z: 0 })
    c.enableAutostep(STEP_HEIGHT, PLAYER_RADIUS * 0.6, true)
    c.enableSnapToGround(SNAP_TO_GROUND)
    c.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
    c.setMinSlopeSlideAngle((42 * Math.PI) / 180)
    c.setApplyImpulsesToDynamicBodies(false)
    controller.current = c
    return () => {
      world.removeCharacterController(c)
      controller.current = null
    }
  }, [world])

  useEffect(() => {
    if (mode !== 'walk') return
    return attachWalkInput(gl.domElement as HTMLCanvasElement, setLocked)
  }, [mode, gl, setLocked])

  // A panel open over the walk -- the cassettes, the arcade, the drone --
  // has the keys; let go of anything held when one opens.
  useEffect(() => {
    inputGate.blocked = () => useSilo.getState().panel !== null
    const unsub = useSilo.subscribe((s, p) => {
      if (s.panel !== null && p.panel === null) releaseKeys()
    })
    return () => {
      inputGate.blocked = () => false
      unsub()
    }
  }, [])

  /** Point the body (and the camera with it) at a yaw, instantly. */
  const face = (yaw: number) => {
    look.current.yaw = lookTarget.current.yaw = yaw
    look.current.pitch = lookTarget.current.pitch = 0
  }

  /**
   * Arrival. The opening flight ends standing on the promenade just off the
   * level 1 bridge, facing out at the portrait, so the body is put down
   * exactly there and the handover from the scripted camera is invisible.
   *
   * Placement is handed to the frame loop rather than done here. Whether a
   * placement made in an effect survives depends on whether the physics steps
   * before or after this component's frame callback; if after, the frame loop
   * reads the body's old position, queues old + movement, and the placement
   * is silently lost. That is how the body once spawned against a blank
   * handrail with no way off the floor.
   */
  useEffect(() => {
    const s = useSilo.getState()
    const a = contentAngle(s.level)
    place.current = {
      x: Math.cos(a) * CAM_RADIUS,
      y: walkY(s.level) + PLAYER_HEIGHT / 2 + 0.02,
      z: Math.sin(a) * CAM_RADIUS,
    }
    face(yawToward(Math.cos(a), Math.sin(a)))
  }, [])

  // Tell the HUD there is now something for the keys to move.
  useEffect(() => {
    useSilo.getState().setBodyReady(true)
    return () => useSilo.getState().setBodyReady(false)
  }, [])

  // The lift reaches in through these to board the body and to ask whether
  // it is aboard.
  useEffect(() => {
    lift.board = () => {
      const a = contentAngle(useSilo.getState().carLevel)
      place.current = { x: 0, y: lift.y + PLAYER_HEIGHT / 2 + 0.02, z: 0 }
      face(yawToward(Math.cos(a), Math.sin(a)))
      return true
    }
    lift.aboard = () => {
      const b = body.current
      if (!b) return false
      const p = b.translation()
      return Math.hypot(p.x, p.z) < IN_CAR && Math.abs(p.y - PLAYER_HEIGHT / 2 - lift.y) < 0.6
    }
    return () => {
      lift.board = null
      lift.aboard = () => false
    }
  }, [])

  /**
   * DEV-only probes. A headless browser cannot be granted pointer lock, so
   * without a way to aim the body there is no way to drive it into a wall and
   * check that the wall stops it.
   */
  useEffect(() => {
    if (!PROBE) return
    const w = window as unknown as { __silo?: Record<string, unknown> }
    if (!w.__silo) return
    w.__silo.walkLook = (yaw: number, pitch = 0) => {
      look.current.yaw = lookTarget.current.yaw = yaw
      look.current.pitch = lookTarget.current.pitch = pitch
    }
    w.__silo.walkBody = () => body.current?.translation() ?? null
    w.__silo.walkGrounded = () => grounded.current
    w.__silo.world = world
    // Screenshots only: never used by a walkability test, which must get
    // everywhere on its own legs.
    w.__silo.walkTeleport = (x: number, y: number, z: number, yaw?: number) => {
      place.current = { x, y, z }
      if (yaw !== undefined) face(yaw)
    }
    return () => {
      for (const k of ['walkLook', 'walkBody', 'walkGrounded', 'world', 'walkTeleport']) delete w.__silo?.[k]
    }
  }, [world])

  useFrame((_, rawDt) => {
    if (mode !== 'walk') return
    // The drone has the view and the keys; the body stands where it was.
    if (drone.flying) return
    const rb = body.current
    const c = controller.current
    if (!rb || !c) return
    const st = useSilo.getState()

    if (place.current) {
      const at = place.current
      place.current = null
      rb.setTranslation(at, true)
      rb.setNextKinematicTranslation(at)
      vel.current.set(0, 0, 0)
      fall.current = 0
      bob.current = 0
      lastStep.current = 0
      camY.current = at.y + EYE_OFFSET
      camera.position.set(at.x, camY.current, at.z)
      camera.rotation.set(0, 0, 0)
      camera.rotateY(look.current.yaw)
      return
    }

    const dt = Math.min(rawDt, 1 / 30)

    // ---- look -------------------------------------------------------------
    lookTarget.current.yaw += move.yaw
    lookTarget.current.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, lookTarget.current.pitch + move.pitch))
    move.yaw = 0
    move.pitch = 0
    const lk = 1 - Math.exp(-LOOK_RATE * dt)
    look.current.yaw += (lookTarget.current.yaw - look.current.yaw) * lk
    look.current.pitch += (lookTarget.current.pitch - look.current.pitch) * lk

    const now = rb.translation()
    const riding = st.phase === 'riding'
    if (!riding) pinned.current = false
    else if (!pinned.current && !st.carMoving && lift.aboard()) pinned.current = true

    let px = now.x
    let py = now.y
    let pz = now.z

    if (pinned.current) {
      // ---- aboard a moving car: the body rides the floor ------------------
      vel.current.set(0, 0, 0)
      fall.current = 0
      py = lift.y + PLAYER_HEIGHT / 2 + 0.01
      rb.setTranslation({ x: px, y: py, z: pz }, true)
      rb.setNextKinematicTranslation({ x: px, y: py, z: pz })
      grounded.current = true
      move.interact = false
    } else {
      // ---- walking ----------------------------------------------------------
      // Keys and the touch stick add together; the result is clamped to a
      // unit circle so diagonals are not faster, but a half-pushed stick is a
      // half-speed walk.
      const live = !riding
      let f = live ? (move.forward ? 1 : 0) - (move.back ? 1 : 0) + move.axisY : 0
      let s = live ? (move.right ? 1 : 0) - (move.left ? 1 : 0) + move.axisX : 0
      const mag = Math.hypot(f, s)
      if (mag > 1) {
        f /= mag
        s /= mag
      }
      const speed = move.sprint ? SPRINT_SPEED : WALK_SPEED
      const sin = Math.sin(look.current.yaw)
      const cos = Math.cos(look.current.yaw)
      // Forward is (-sin, -cos) and right is (cos, -sin): the camera's own
      // -Z and +X after rotateY(yaw). Right had its sign flipped, so A and D
      // were swapped -- and the touch stick with them.
      const wx = (s * cos - f * sin) * speed
      const wz = (-s * sin - f * cos) * speed
      const rate = mag > 0.01 ? ACCEL : DECEL
      const k = 1 - Math.exp(-rate * dt)
      vel.current.x += (wx - vel.current.x) * k
      vel.current.z += (wz - vel.current.z) * k

      if (grounded.current && fall.current < 0) fall.current = 0
      fall.current = Math.max(MAX_FALL, fall.current + GRAVITY * dt)

      c.computeColliderMovement(rb.collider(0), {
        x: vel.current.x * dt,
        y: fall.current * dt,
        z: vel.current.z * dt,
      })
      const applied = c.computedMovement()
      grounded.current = c.computedGrounded()
      px = now.x + applied.x
      py = now.y + applied.y
      pz = now.z + applied.z
      rb.setNextKinematicTranslation({ x: px, y: py, z: pz })

      // Shed speed into walls rather than storing it up and shooting off.
      const wantX = Math.abs(vel.current.x * dt)
      if (wantX > 1e-5 && Math.abs(applied.x) < wantX * 0.5) vel.current.x *= 0.3
      const wantZ = Math.abs(vel.current.z * dt)
      if (wantZ > 1e-5 && Math.abs(applied.z) < wantZ * 0.5) vel.current.z *= 0.3

      // ---- which level is underfoot -------------------------------------
      // The stair crosses a whole storey, so the level is read from where the
      // body is. The change only commits well past the midpoint of a flight,
      // so it cannot flap.
      if (!riding) {
        const feet = py - PLAYER_HEIGHT / 2
        const raw = (-feet - DECK_DROP) / FLOOR_HEIGHT + 1
        if (Math.abs(raw - st.level) > 0.62) {
          const next = Math.min(LEVEL_COUNT, Math.max(1, Math.round(raw)))
          if (next !== st.level) st.setWalkLevel(next)
        }
      }
    }

    // ---- what E does, right here ------------------------------------------
    const r = Math.hypot(px, pz)
    const ang = Math.atan2(pz, px)
    const feet = py - PLAYER_HEIGHT / 2
    const onDeckOf = Math.abs(feet - walkY(st.level)) < 0.5
    const carHere = st.carLevel === st.level && !st.carMoving
    let here: Interact = null
    if (!riding) {
      if (carHere && st.doorsOpen && lift.aboard()) here = 'lift-controls'
      else if (
        onDeckOf &&
        r < SHAFT_RING + 1.6 &&
        r > CAR_RADIUS &&
        angDist(ang, contentAngle(st.level)) < LANDING_HALF + 0.05 &&
        !(carHere && st.doorsOpen)
      )
        here = 'call-lift'
      else if (st.level === 1 && onDeckOf) {
        // The vault, in its own frame: s across the door, d out through it.
        const v = toVault(px, pz)
        if (v.d > VAULT_ROOM.from && Math.abs(v.s) < VAULT_ROOM.half) {
          if (v.d > INNER_DOOR.d - 1.7) here = 'sealed'
          else if (Math.abs(v.d - VAULT_TERMINAL.d) < 1.3 && v.s < VAULT_TERMINAL.s + 1.9) here = 'record'
        } else if (v.d < -0.3 && v.d > -4.2 && Math.abs(v.s) < 2.8) {
          here = st.vaultOpen ? 'vault-close' : 'vault'
        }
      } else if (st.level === LEVEL6 && onDeckOf) {
        here = level6Interact(px, pz, st.chambersOpen) as Interact
      } else if (st.level === LEVEL12 && onDeckOf) {
        here = level12Interact(px, pz) as Interact
      }
    }
    if (here !== st.interact) st.setInteract(here)
    if (move.interact) {
      move.interact = false
      if (here === 'lift-controls') {
        // The directory is HTML: hand the pointer back first, or the visitor
        // is looking at a panel they cannot click.
        if (document.pointerLockElement) document.exitPointerLock()
        st.toggleDirectory(true)
      } else if (here === 'call-lift') st.callLift(st.level)
      else if (here === 'vault') st.openVault()
      else if (here === 'vault-close') st.sealVault()
      else if (here === 'record') {
        if (document.pointerLockElement) document.exitPointerLock()
        st.openRecord()
      } else if (here === 'sealed') {
        vaultDoor.knock = performance.now()
        sealedKnock()
      } else if (here?.startsWith('chamber:')) st.openChamber(Number(here.slice('chamber:'.length)))
      else if (here?.startsWith('chamber-close:')) st.closeChamber(Number(here.slice('chamber-close:'.length)))
      else if (here === 'maze-map') {
        if (document.pointerLockElement) document.exitPointerLock()
        st.openPanel('map')
      }
      else if (here === 'reactor') {
        reactor.surgeAt = performance.now()
        reactorSurge()
      } else if (here?.startsWith('contact:')) {
        const plate = CONTACTS.find((c) => `contact:${c.id}` === here)
        if (plate) openContact(plate)
      }
      else if (here === 'aim') startAim()
      else if (here?.startsWith('poem:')) {
        if (document.pointerLockElement) document.exitPointerLock()
        st.openPanel('poems', here.slice('poem:'.length))
      }
      else if (here === 'jukebox' || here === 'drone' || here === 'citizen' || here === 'poems' || here === 'soundbox' || here?.startsWith('arcade:')) {
        // A panel: hand the pointer back so it can be used.
        if (document.pointerLockElement) document.exitPointerLock()
        if (here.startsWith('arcade:')) st.openPanel('arcade', here.slice('arcade:'.length))
        else st.openPanel(here as 'jukebox' | 'drone' | 'citizen' | 'poems' | 'soundbox')
      }
    }

    // ---- head bob and footsteps -------------------------------------------
    const horiz = Math.hypot(vel.current.x, vel.current.z)
    const stride = Math.min(1, horiz / WALK_SPEED)
    if (grounded.current) bob.current += horiz * dt * BOB_CADENCE * Math.PI
    const rise = Math.sin(bob.current * 2) * BOB_RISE * stride
    const roll = Math.sin(bob.current) * BOB_ROLL * stride
    const half = Math.floor(bob.current / Math.PI)
    if (half !== lastStep.current && grounded.current && horiz > 0.6) {
      lastStep.current = half
      // On the stair or a bridge the body is inside the void; on a deck it
      // is outside it. Open steel rings, deck plate thuds.
      footstep(r < DECK_INNER, move.sprint)
    }

    // ---- camera sits on the body, never the other way round ---------------
    const eye = py + EYE_OFFSET
    if (camY.current === null || Math.abs(eye - camY.current) > 1.2 || riding) camY.current = eye
    else camY.current += (eye - camY.current) * (1 - Math.exp(-STEP_RATE * dt))
    camera.position.set(px, camY.current + rise, pz)
    bodyAt.x = px
    bodyAt.z = pz
    bodyAt.yaw = look.current.yaw
    camera.rotation.set(0, 0, 0)
    camera.rotateY(look.current.yaw)
    camera.rotateX(look.current.pitch)
    camera.rotateZ(roll)
  })

  if (mode !== 'walk') return null

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      // Mount-time only. It must not follow `level`: walking down the stair
      // changes the level, and a body whose position prop changed under it
      // could be put back at the top of the flight.
      position={spawn}
    >
      <CapsuleCollider args={[PLAYER_HALF, PLAYER_RADIUS]} />
    </RigidBody>
  )
}
