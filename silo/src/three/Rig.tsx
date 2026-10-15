import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import * as THREE from 'three'
import { CAM_RADIUS, CUT_MID, EYE, SHAFT_RADIUS, contentAngle, levelY, walkY } from '../content/floors'
import { lift } from '../lib/lift'
import { useSilo } from '../state/useSilo'

/**
 * The scripted camera. It now does one job: the opening.
 *
 *   exterior   a slow push in on the cutaway from out in the cavern
 *   riding     the flight in -- through the cutaway, along the level 1
 *              promenade with the core and the dome in view, then a turn to
 *              face the portrait on the far wall
 *
 * and it ends standing exactly where the body is put down, facing exactly the
 * way the body faces, so the moment the visitor is handed control is not a
 * visible cut. After that the body owns the camera and this does nothing.
 * There is no guided mode to return to and nothing to drag.
 *
 * The pose is described by a small object GSAP tweens; the frame loop only
 * reads it. `turn` is a yaw applied after aiming at the look point -- the way
 * to swing round 180 degrees without the look point having to pass through
 * the camera, which flips the view.
 */
interface Pose {
  y: number
  radius: number
  angle: number
  lookY: number
  lookRadius: number
  turn: number
}

/**
 * GSAP assumes a frame longer than half a second is a lag spike and holds the
 * playhead rather than jumping. On a slow device that would be an opening
 * that never finishes. Advance by real time instead.
 */
gsap.ticker.lagSmoothing(0)

/** Far enough back that the whole 53 m head of the structure is in frame. */
const EXTERIOR_START: Pose = {
  y: levelY(1) + 18,
  radius: SHAFT_RADIUS * 4.5,
  angle: CUT_MID,
  lookY: levelY(1) - 20,
  lookRadius: 0,
  turn: 0,
}

export default function Rig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const phase = useSilo((s) => s.phase)
  const arrive = useSilo((s) => s.arrive)
  const reduced = useSilo((s) => s.reducedMotion)
  const mode = useSilo((s) => s.mode)

  const pose = useRef<Pose>({ ...EXTERIOR_START })
  const tl = useRef<gsap.core.Timeline | null>(null)
  const guard = useRef<number | null>(null)
  const camPos = useRef(new THREE.Vector3())
  const lookPos = useRef(new THREE.Vector3())

  /** Put the camera at the current pose. */
  const apply = () => {
    const p = pose.current
    camPos.current.set(Math.cos(p.angle) * p.radius, p.y, Math.sin(p.angle) * p.radius)
    camera.position.copy(camPos.current)
    lookPos.current.set(Math.cos(p.angle) * p.lookRadius, p.lookY, Math.sin(p.angle) * p.lookRadius)
    camera.lookAt(lookPos.current)
    if (p.turn) camera.rotateY(p.turn)
  }

  /**
   * Hand over to the body. The final pose is written to the camera HERE, not
   * left to the next frame: on a slow device the timeline can run out between
   * two frames, and the last pose the camera was given is then somewhere
   * mid-flight -- 40 m out in the cavern, measured -- where it stays, because
   * once the visitor is walking this rig no longer draws anything.
   */
  const handOver = () => {
    apply()
    arrive()
  }

  useEffect(() => {
    if (mode === 'walk') return
    tl.current?.kill()
    if (guard.current) window.clearTimeout(guard.current)
    const p = pose.current

    if (phase === 'exterior') {
      const t = gsap.timeline()
      t.to(p, {
        radius: SHAFT_RADIUS * 2.9,
        y: levelY(1) + 5,
        lookY: levelY(1) - 28,
        duration: reduced ? 0 : 22,
        ease: 'none',
      })
      tl.current = t
      if (import.meta.env.DEV) {
        ;(window as unknown as { __rig?: unknown }).__rig = { seek: (q: number) => t.progress(q).pause() }
      }
      return
    }

    if (phase === 'riding') {
      const a1 = contentAngle(1)
      const eye = walkY(1) + EYE
      const t = gsap.timeline({ onComplete: handOver })
      const d = (s: number) => (reduced ? 0 : s)
      // In through the cutaway, high enough to clear the gantry rails.
      t.to(p, {
        angle: CUT_MID,
        radius: SHAFT_RADIUS - 6,
        y: walkY(1) + 3.2,
        lookY: eye + 1.5,
        lookRadius: 0,
        duration: d(2.8),
        ease: 'power2.inOut',
      })
      // Down to eye height and round the promenade, facing the core.
      t.to(p, {
        angle: a1,
        radius: CAM_RADIUS,
        y: eye,
        lookY: eye,
        duration: d(2.6),
        ease: 'power2.inOut',
      })
      // Turn round to face the portrait on the far wall.
      t.to(p, { turn: Math.PI, duration: d(1.3), ease: 'power2.inOut' })
      tl.current = t
      // Arrival hands over the body, so it must not be able to hang on the
      // timeline alone.
      guard.current = window.setTimeout(() => {
        if (useSilo.getState().phase !== 'riding' || useSilo.getState().mode === 'walk') return
        t.progress(1)
      }, (reduced ? 0.5 : 6.7 + 3) * 1000)
    }
    // `apply` and `handOver` only touch refs and stable store actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode, arrive, reduced])

  useFrame(() => {
    if (mode === 'walk') return
    // During the opening the car is parked on level 1.
    lift.y = walkY(1)
    apply()
  })

  return null
}
