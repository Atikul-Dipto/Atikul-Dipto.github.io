import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import * as THREE from 'three'
import {
  CAM_RADIUS,
  CUT_MID,
  DECK_DROP,
  EYE,
  SHAFT_RADIUS,
  SLOT,
  contentAngle,
  levelY,
} from '../content/floors'
import { useSilo } from '../state/useSilo'

/**
 * Owns the camera. The rig is described by a small pose object that GSAP tweens;
 * useFrame only reads it. That keeps the cinematic timing declarative and stops
 * scroll/stateful logic from fighting the render loop.
 *
 * radius 0 = inside the elevator car. radius CAM_RADIUS = out on the deck.
 * lookRadius 0 = looking at the shaft axis; SHAFT_RADIUS = looking at the wall.
 */
export interface Pose {
  y: number
  radius: number
  angle: number
  lookY: number
  lookRadius: number
}

/** The opening shot: high over the plain, square on to the cutaway. */
const EXTERIOR_START: Pose = {
  y: levelY(1) + 14,
  radius: 48,
  angle: CUT_MID,
  lookY: levelY(1) - 16,
  lookRadius: 0,
}

export default function Rig({ carY }: { carY: React.RefObject<number> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const phase = useSilo((s) => s.phase)
  const target = useSilo((s) => s.target)
  const arrive = useSilo((s) => s.arrive)
  const reduced = useSilo((s) => s.reducedMotion)

  const pose = useRef<Pose>({ ...EXTERIOR_START })
  const look = useRef({ yaw: 0, pitch: 0 })
  const lookTarget = useRef({ yaw: 0, pitch: 0 })
  const tl = useRef<gsap.core.Timeline | null>(null)

  // Mouse look: a gentle parallax, amplified while the button is held.
  useEffect(() => {
    let dragging = false
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1
      const gain = dragging ? 0.8 : 0.26
      lookTarget.current.yaw = -nx * gain
      lookTarget.current.pitch = -ny * gain * 0.55
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') dragging = true
    }
    const up = () => {
      dragging = false
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('pointerup', up, { passive: true })
    window.addEventListener('pointercancel', up, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  // Drive the rig from phase changes.
  useEffect(() => {
    tl.current?.kill()
    const p = pose.current

    if (phase === 'exterior') {
      // Descend into the excavation, square on to the cutaway, so the section
      // reads from the first frame: the camera pushes in and tilts down the
      // twelve decks rather than orbiting a sealed tube.
      const t = gsap.timeline()
      t.to(
        p,
        {
          radius: 30,
          y: levelY(1) + 3,
          lookY: levelY(1) - 24,
          angle: CUT_MID,
          lookRadius: 0,
          duration: reduced ? 0 : 22,
          ease: 'none',
        },
        0,
      )
      tl.current = t
      if (import.meta.env.DEV) {
        ;(window as unknown as { __rig?: unknown }).__rig = {
          seek: (p: number) => t.progress(p).pause(),
        }
      }
      return
    }

    if (phase === 'riding') {
      const destY = levelY(target)
      const distance = Math.abs(destY - p.y)
      // Travel time scales with distance, with a floor so one-level hops still
      // read as a ride rather than a cut.
      const ride = reduced ? 0.2 : Math.min(5.5, 1.1 + distance * 0.045)
      const t = gsap.timeline({ onComplete: () => arrive() })
      // Pull into the car first, then descend, then step out on arrival.
      t.to(
        p,
        {
          radius: 0,
          lookRadius: SHAFT_RADIUS,
          angle: contentAngle(target),
          duration: reduced ? 0 : 0.7,
          ease: 'power2.inOut',
        },
        0,
      )
      t.to(p, { y: destY, duration: ride, ease: reduced ? 'none' : 'power2.inOut' }, reduced ? 0 : 0.35)
      t.to(p, { lookY: destY + 0.4, duration: ride, ease: reduced ? 'none' : 'power2.inOut' }, reduced ? 0 : 0.35)
      tl.current = t
      return
    }

    if (phase === 'airlock') {
      // Walk up to the airlock. The record only opens once the camera has
      // actually arrived, so the transition is the thing that reveals it.
      const a = contentAngle(1) + SLOT.airlock
      const y = levelY(1) - DECK_DROP + EYE
      const t = gsap.timeline({ onComplete: () => useSilo.getState().setCvOpen(true) })
      t.to(
        p,
        {
          angle: a,
          radius: SHAFT_RADIUS - 5.6,
          y,
          lookY: y + 0.15,
          lookRadius: SHAFT_RADIUS,
          duration: reduced ? 0 : 1.7,
          ease: 'power2.inOut',
        },
        0,
      )
      tl.current = t
      return
    }

    if (phase === 'onFloor') {
      const y = levelY(target)
      const t = gsap.timeline()
      t.to(
        p,
        {
          radius: CAM_RADIUS,
          angle: contentAngle(target),
          y: y - DECK_DROP + EYE,
          lookY: y - DECK_DROP + EYE + 0.2,
          lookRadius: SHAFT_RADIUS,
          duration: reduced ? 0 : 1.5,
          ease: 'power3.out',
        },
        0,
      )
      tl.current = t
    }
  }, [phase, target, arrive, reduced])

  const camPos = useRef(new THREE.Vector3())
  const lookPos = useRef(new THREE.Vector3())

  useFrame((_, dt) => {
    const p = pose.current
    // While riding, the camera is the car: keep them locked together.
    if (p.radius < 0.01) carY.current = p.y
    else carY.current = levelY(useSilo.getState().level)

    const k = Math.min(1, dt * 8)
    look.current.yaw += (lookTarget.current.yaw - look.current.yaw) * k
    look.current.pitch += (lookTarget.current.pitch - look.current.pitch) * k

    camPos.current.set(
      Math.cos(p.angle) * p.radius,
      p.y + (p.radius < 0.01 ? EYE : 0),
      Math.sin(p.angle) * p.radius,
    )
    camera.position.copy(camPos.current)

    lookPos.current.set(
      Math.cos(p.angle) * p.lookRadius,
      p.lookY,
      Math.sin(p.angle) * p.lookRadius,
    )
    camera.lookAt(lookPos.current)
    camera.rotateY(look.current.yaw)
    camera.rotateX(look.current.pitch)
  })

  return null
}
