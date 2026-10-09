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
import { gesture } from '../lib/drag'
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
  /** Smoothed values actually applied to the camera each frame. */
  const look = useRef({ yaw: 0, pitch: 0 })
  /** Accumulated from drag gestures. Yaw is unbounded: you can turn all the
   *  way round and keep going. */
  const drag = useRef({ yaw: 0, pitch: 0 })
  /** A small parallax from cursor position, added on top of the drag so the
   *  two never fight for the same value. */
  const parallax = useRef({ yaw: 0, pitch: 0 })
  const tl = useRef<gsap.core.Timeline | null>(null)

  /** Radians per pixel. A full-width drag turns you most of the way around. */
  const MOUSE_SENS = 0.004
  const TOUCH_SENS = 0.006
  const PITCH_LIMIT = 0.85

  // Look: drag to turn, with no limit on yaw. The previous version mapped
  // cursor position straight onto an absolute angle capped at about 45
  // degrees, so half the floor was unreachable and touch did nothing at all.
  useEffect(() => {
    let active = false
    let touch = false
    let lastX = 0
    let lastY = 0
    let moved = 0
    const canvas = () => document.querySelector('.silo canvas') as HTMLCanvasElement | null

    const setCursor = (v: string) => {
      const c = canvas()
      if (c) c.style.cursor = v
    }

    const down = (e: PointerEvent) => {
      // Only the scene turns. Dragging across the HTML panels must not.
      if (!(e.target instanceof HTMLCanvasElement)) return
      active = true
      touch = e.pointerType === 'touch'
      lastX = e.clientX
      lastY = e.clientY
      moved = 0
      gesture.dragging = false
      setCursor('grabbing')
    }

    const move = (e: PointerEvent) => {
      if (!active) {
        if (e.pointerType === 'touch') return
        const nx = (e.clientX / window.innerWidth) * 2 - 1
        const ny = (e.clientY / window.innerHeight) * 2 - 1
        parallax.current.yaw = -nx * 0.1
        parallax.current.pitch = -ny * 0.05
        return
      }
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      moved += Math.abs(dx) + Math.abs(dy)
      // Past a few pixels this is a look, not a click on whatever is under it.
      if (moved > 6) gesture.dragging = true
      const sens = touch ? TOUCH_SENS : MOUSE_SENS
      drag.current.yaw -= dx * sens
      drag.current.pitch = Math.max(
        -PITCH_LIMIT,
        Math.min(PITCH_LIMIT, drag.current.pitch - dy * sens),
      )
    }

    const up = () => {
      if (!active) return
      active = false
      setCursor('grab')
      // Clear a tick later: R3F dispatches its click from this same pointerup.
      setTimeout(() => {
        gesture.dragging = false
      }, 0)
    }

    // Arrow keys turn too, so the whole floor is reachable without a pointer.
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (e.key === 'ArrowLeft') drag.current.yaw += 0.3
      else if (e.key === 'ArrowRight') drag.current.yaw -= 0.3
      else return
      e.preventDefault()
    }

    setCursor('grab')
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', up, { passive: true })
    window.addEventListener('pointercancel', up, { passive: true })
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', key)
    }
  }, [])

  // Face the fit-out again on arrival, however far round you had turned.
  useEffect(() => {
    drag.current.yaw = 0
    drag.current.pitch = 0
  }, [phase, target])

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
    const wantYaw = drag.current.yaw + parallax.current.yaw
    const wantPitch = drag.current.pitch + parallax.current.pitch
    look.current.yaw += (wantYaw - look.current.yaw) * k
    look.current.pitch += (wantPitch - look.current.pitch) * k

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
