import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import {
  CAM_RADIUS,
  DECK_DROP,
  DECK_INNER,
  ELEVATOR_HALF,
  EYE_OFFSET,
  FLOOR_HEIGHT,
  LEVEL_COUNT,
  PLAYER_HALF,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  contentAngle,
  walkY,
} from '../../content/floors'
import { footstep } from '../../lib/audio'
import { attachWalkInput, move } from '../../lib/input'
import { useSilo } from '../../state/useSilo'

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
 * The camera follows the body. That ordering matters and is the whole point of
 * this step: in the cinematic rig the camera *is* the position and nothing
 * stops it passing through walls. Here the body is moved first, the physics
 * decides where it ended up, and the camera is placed at the result.
 */

/** Metres per second. */
const WALK_SPEED = 3.2
const SPRINT_SPEED = 5.4
/** How fast the body reaches full speed, and sheds it. Without this, movement
 *  starts and stops like a switch, which reads as sliding. */
const ACCEL = 14
const GRAVITY = -18
/** Terminal fall speed, so a long drop cannot tunnel through the floor. */
const MAX_FALL = -40
const PITCH_LIMIT = 1.45

/**
 * Head bob. Small on purpose: the job is to make the body feel like it has
 * weight, not to make the camera seasick. Amplitude is in metres of vertical
 * travel and the roll is a third of a degree at full stride.
 */
const BOB_RISE = 0.045
const BOB_ROLL = 0.006
/**
 * Stride phase per metre travelled, so the cadence follows speed rather than
 * time: slow to a crawl and the footfalls slow with you, sprint and they speed
 * up, and standing still produces none at all without needing a special case.
 *
 * The phase advances `BOB_CADENCE * PI` radians per metre and a footfall lands
 * every PI, so this is one footfall every 1/BOB_CADENCE metres -- 0.71 m here,
 * which is a stride length for a body moving at a jog.
 */
const BOB_CADENCE = 1.4

/**
 * Standing inside the lift car. Measured from the shaft axis, a little inside
 * the car floor, so the prompt appears once you are actually aboard rather
 * than while still on the gangway.
 */
const IN_CAR_RADIUS = ELEVATOR_HALF - 0.1

/** Rapier's controller works in its own small units of forgiveness. */
const CONTROLLER_OFFSET = 0.02
/** Step height. Generous enough for kerbs and door thresholds. */
const STEP_HEIGHT = 0.45
const SNAP_TO_GROUND = 0.6

export default function Player() {
  const body = useRef<RapierRigidBody>(null)
  const { world, rapier } = useRapier()
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const level = useSilo((s) => s.level)
  const mode = useSilo((s) => s.mode)
  const setLocked = useSilo((s) => s.setPointerLocked)
  const setWalkLevel = useSilo((s) => s.setWalkLevel)
  const setNearLift = useSilo((s) => s.setNearLift)

  /** Smoothed horizontal velocity, and the vertical component separately --
   *  gravity must not be smoothed or the body floats. */
  const vel = useRef(new THREE.Vector3())
  const fall = useRef(0)
  const look = useRef({ yaw: 0, pitch: 0 })
  const controller = useRef<ReturnType<typeof world.createCharacterController> | null>(null)
  const grounded = useRef(false)
  /** Stride phase, advanced by distance travelled rather than by time. */
  const bob = useRef(0)
  /** Which half-stride the last footfall was played on. */
  const lastStep = useRef(0)
  /** A placement waiting to be applied on the next frame, see below. */
  const place = useRef<{ x: number; y: number; z: number } | null>(null)

  // The controller is a world resource, not a React one, so it is created once
  // and disposed explicitly.
  useEffect(() => {
    const c = world.createCharacterController(CONTROLLER_OFFSET)
    c.setUp({ x: 0, y: 1, z: 0 })
    c.enableAutostep(STEP_HEIGHT, PLAYER_RADIUS * 0.6, true)
    c.enableSnapToGround(SNAP_TO_GROUND)
    c.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
    c.setMinSlopeSlideAngle((42 * Math.PI) / 180)
    // The visitor should not be able to shove the scenery about.
    c.setApplyImpulsesToDynamicBodies(false)
    controller.current = c
    return () => {
      world.removeCharacterController(c)
      controller.current = null
    }
  }, [world])

  // Walking controls live on the canvas, and only while walking.
  useEffect(() => {
    if (mode !== 'walk') return
    const canvas = gl.domElement as HTMLCanvasElement
    return attachWalkInput(canvas, setLocked)
  }, [mode, gl, setLocked])

  /**
   * Place the body when walking starts, and when a RIDE has moved the visitor.
   *
   * Putting the body down at the cinematic camera's standing pose means both
   * modes start from the same spot and the handover is not jarring. Walking
   * down the stair also changes `level`, and that must not place anything --
   * see `selfLevel` below.
   */
  /** The level this component last moved the body to by itself. A level change
   *  it caused -- by walking down the stair -- must not then teleport the body
   *  back to the standing pose, which is what a naive [mode, level] effect does
   *  the instant you reach the next deck. */
  const selfLevel = useRef<number | null>(null)
  const wasWalking = useRef(false)

  useEffect(() => {
    if (mode !== 'walk' || !body.current) {
      wasWalking.current = mode === 'walk'
      return
    }
    const entering = !wasWalking.current
    wasWalking.current = true
    // Entering walk mode always places the body. A level change while already
    // walking only places it if something other than this component caused it,
    // i.e. the lift ran and the visitor came back to walking somewhere new.
    if (!entering && selfLevel.current === level) return
    selfLevel.current = level
    const a = contentAngle(level)
    const at = {
      x: Math.cos(a) * CAM_RADIUS,
      y: walkY(level) + PLAYER_HEIGHT / 2,
      z: Math.sin(a) * CAM_RADIUS,
    }
    // Placing from an effect does not work, and the way it fails is quiet.
    // Whether the placement survives depends on whether the physics world
    // steps before or after this component's frame callback: step-after means
    // the frame loop reads the body's CURRENT translation, queues
    // `current + movement`, and overwrites the placement before it ever
    // happens. The body then stays wherever the RigidBody's `position` prop
    // put it -- angle zero -- which on a deck whose only opening is at
    // `contentAngle` is against a blank handrail with no way off the floor.
    //
    // So the placement is handed to the frame loop instead, which applies it
    // at a point where nothing can be queued on top of it.
    place.current = at
    // Face the shaft, which is what the cinematic pose looks at.
    //
    // Forward is derived from yaw below as (-sin, -cos), so facing inward from
    // angle `a` -- a direction of (-cos a, -sin a) -- needs atan2(cos a, sin a).
    // The obvious-looking atan2(-sin a, -cos a) - PI/2 is mirrored in Z and
    // happens to be right only at a = 0 and a = PI, which is exactly the kind
    // of near-miss that survives a spot check.
    look.current.yaw = Math.atan2(Math.cos(a), Math.sin(a))
    look.current.pitch = 0
    fall.current = 0
    vel.current.set(0, 0, 0)
  }, [mode, level])

  /**
   * DEV-only probe. Pointer lock cannot be granted to a headless browser, so
   * without a way to aim the body there is no way to drive it into a wall and
   * check that the wall stops it. Mirrors the window.__silo handle the rest of
   * the scene already exposes.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __silo?: Record<string, unknown> }
    if (!w.__silo) return
    w.__silo.walkLook = (yaw: number, pitch = 0) => {
      look.current.yaw = yaw
      look.current.pitch = pitch
    }
    w.__silo.walkBody = () => body.current?.translation() ?? null
    w.__silo.walkGrounded = () => grounded.current
    // The physics world itself, so an audit can count colliders rather than
    // infer from the body falling.
    w.__silo.world = world
    return () => {
      delete w.__silo?.walkLook
      delete w.__silo?.walkBody
      delete w.__silo?.walkGrounded
      delete w.__silo?.world
    }
  }, [world])

  useFrame((_, rawDt) => {
    if (mode !== 'walk') return
    const rb = body.current
    const c = controller.current
    if (!rb || !c) return

    // Apply a pending placement before anything else can queue movement on
    // top of it, and spend the frame standing still.
    if (place.current) {
      const at = place.current
      place.current = null
      rb.setTranslation(at, true)
      rb.setNextKinematicTranslation(at)
      vel.current.set(0, 0, 0)
      fall.current = 0
      bob.current = 0
      lastStep.current = 0
      camera.position.set(at.x, at.y + EYE_OFFSET, at.z)
      camera.rotation.set(0, 0, 0)
      camera.rotateY(look.current.yaw)
      return
    }

    // A long frame (a tab coming back, a slow load) must not be integrated in
    // one go, or the body moves metres between collision checks and tunnels.
    const dt = Math.min(rawDt, 1 / 30)

    // ---- look ----------------------------------------------------------
    look.current.yaw += move.yaw
    look.current.pitch = Math.max(
      -PITCH_LIMIT,
      Math.min(PITCH_LIMIT, look.current.pitch + move.pitch),
    )
    move.yaw = 0
    move.pitch = 0

    // ---- desired horizontal motion, in the direction being faced --------
    const f = (move.forward ? 1 : 0) - (move.back ? 1 : 0)
    const s = (move.right ? 1 : 0) - (move.left ? 1 : 0)
    const speed = move.sprint ? SPRINT_SPEED : WALK_SPEED
    const want = new THREE.Vector3()
    if (f || s) {
      const sin = Math.sin(look.current.yaw)
      const cos = Math.cos(look.current.yaw)
      // Forward is -Z in camera space; rotate the input into world space.
      want.set(-(s * cos + f * sin), 0, -(s * -sin + f * cos))
      want.normalize().multiplyScalar(speed)
    }
    // Ease towards the target so starting and stopping are not instantaneous.
    const k = Math.min(1, ACCEL * dt)
    vel.current.x += (want.x - vel.current.x) * k
    vel.current.z += (want.z - vel.current.z) * k

    // ---- gravity --------------------------------------------------------
    if (grounded.current && fall.current < 0) fall.current = 0
    fall.current = Math.max(MAX_FALL, fall.current + GRAVITY * dt)

    // ---- let the physics decide where that actually lands ---------------
    const collider = rb.collider(0)
    c.computeColliderMovement(collider, {
      x: vel.current.x * dt,
      y: fall.current * dt,
      z: vel.current.z * dt,
    })
    const applied = c.computedMovement()
    grounded.current = c.computedGrounded()

    const now = rb.translation()
    rb.setNextKinematicTranslation({
      x: now.x + applied.x,
      y: now.y + applied.y,
      z: now.z + applied.z,
    })

    // If the body was blocked horizontally, shed the speed it did not use.
    // Otherwise it keeps "pressing" into the wall and shoots off on release.
    const movedX = Math.abs(applied.x)
    const wantedX = Math.abs(vel.current.x * dt)
    if (wantedX > 1e-5 && movedX < wantedX * 0.5) vel.current.x *= 0.3
    const movedZ = Math.abs(applied.z)
    const wantedZ = Math.abs(vel.current.z * dt)
    if (wantedZ > 1e-5 && movedZ < wantedZ * 0.5) vel.current.z *= 0.3

    const px = now.x + applied.x
    const py = now.y + applied.y
    const pz = now.z + applied.z

    // ---- which level is underfoot ---------------------------------------
    //
    // The stair crosses a whole storey, so the level the visitor is "on" has
    // to be read from where the body actually is, not from the last lift
    // journey. Rounding alone would flap on the exact midpoint of a flight, so
    // the change only commits once the body is comfortably past it.
    const feet = py - PLAYER_HEIGHT / 2
    const raw = (-feet - DECK_DROP) / FLOOR_HEIGHT + 1
    if (Math.abs(raw - level) > 0.62) {
      const next = Math.min(LEVEL_COUNT, Math.max(1, Math.round(raw)))
      if (next !== level) {
        selfLevel.current = next
        setWalkLevel(next)
      }
    }

    // ---- standing in the lift --------------------------------------------
    const inCar = Math.hypot(px, pz) < IN_CAR_RADIUS
    if (inCar !== useSilo.getState().nearLift) setNearLift(inCar)
    if (move.interact) {
      move.interact = false
      if (inCar) {
        // The directory is DOM, so the pointer has to come back first or the
        // visitor is looking at a panel they cannot click.
        if (document.pointerLockElement) document.exitPointerLock()
        useSilo.getState().toggleDirectory(true)
      }
    }

    // ---- head bob ---------------------------------------------------------
    const horiz = Math.hypot(vel.current.x, vel.current.z)
    const stride = Math.min(1, horiz / WALK_SPEED)
    if (grounded.current) bob.current += horiz * dt * BOB_CADENCE * Math.PI
    const rise = Math.sin(bob.current * 2) * BOB_RISE * stride
    const roll = Math.sin(bob.current) * BOB_ROLL * stride

    // A footfall at each half-stride, from the same phase that drives the bob,
    // so what you hear and what you feel are the same stride rather than two
    // timers drifting apart. Standing still never fires one, because the phase
    // only advances with distance travelled.
    const half = Math.floor(bob.current / Math.PI)
    if (half !== lastStep.current && grounded.current && horiz > 0.6) {
      lastStep.current = half
      // On the stair the body is inside the stairwell opening; on a deck it is
      // outside it. One number tells the two surfaces apart.
      footstep(Math.hypot(px, pz) < DECK_INNER, move.sprint)
    }

    // ---- camera sits on the body, never the other way round -------------
    camera.position.set(px, py + EYE_OFFSET + rise, pz)
    camera.rotation.set(0, 0, 0)
    camera.rotateY(look.current.yaw)
    camera.rotateX(look.current.pitch)
    camera.rotateZ(roll)
  })

  // `rapier` is unused directly but keeping the hook's full result makes the
  // dependency explicit for anyone adding raycasts here later.
  void rapier

  if (mode !== 'walk') return null

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[CAM_RADIUS, walkY(1) + PLAYER_HEIGHT / 2, 0]}
    >
      <CapsuleCollider args={[PLAYER_HALF, PLAYER_RADIUS]} />
    </RigidBody>
  )
}
