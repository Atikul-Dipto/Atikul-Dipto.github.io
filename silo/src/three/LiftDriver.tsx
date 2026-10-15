import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { walkY } from '../content/floors'
import { lift } from '../lib/lift'
import { useSilo } from '../state/useSilo'

/**
 * Moves the lift once the visitor has a body.
 *
 * Two kinds of journey, one machine:
 *
 *   RIDE  the visitor is aboard. Asked for by `goToLevel` -- the car's own
 *         controls, the directory, the call panel. If they are not already
 *         standing in the car (they used the directory from across the deck),
 *         there is one cut: a short fade, during which the car is brought to
 *         their level and they are put aboard. Everything after that is
 *         shown, not cut: the doors shut, the car travels, the doors open.
 *   CALL  the car is empty and comes to whoever called it, so someone who
 *         took the stair down three levels can still get the lift back.
 *
 * The journey is a plain state machine stepped by the frame loop rather than
 * a GSAP timeline. Arrival is what hands the visitor back their legs, so it
 * must not be able to stall on a tween library's idea of a lag spike -- the
 * old guided ride needed a timeout guard for exactly that.
 */

type Stage = 'board' | 'fadeIn' | 'closing' | 'travel' | 'settle'

interface Job {
  to: number
  ride: boolean
  stage: Stage
  t: number
  y0: number
  y1: number
  dur: number
}

const smooth = (t: number) => t * t * (3 - 2 * t)

export default function LiftDriver() {
  const job = useRef<Job | null>(null)
  const mode = useSilo((s) => s.mode)
  const phase = useSilo((s) => s.phase)
  const target = useSilo((s) => s.target)
  const liftCall = useSilo((s) => s.liftCall)
  const pendingDest = useSilo((s) => s.pendingDest)

  // A ride: start as soon as the store says the visitor is travelling.
  useEffect(() => {
    if (mode !== 'walk' || phase !== 'riding') return
    if (job.current?.ride) return
    job.current = { to: target, ride: true, stage: 'board', t: 0, y0: 0, y1: 0, dur: 0 }
  }, [mode, phase, target])

  // A call: only if nothing else is using the car.
  useEffect(() => {
    if (mode !== 'walk' || liftCall === null) return
    const s = useSilo.getState()
    if (job.current || s.phase === 'riding') {
      // Busy; the car will be wherever the ride leaves it, and the visitor
      // can call again.
      s.clearLiftCall()
      return
    }
    job.current = { to: liftCall, ride: false, stage: 'closing', t: 0, y0: 0, y1: 0, dur: 0 }
    s.clearLiftCall()
  }, [mode, liftCall])

  // The opening sequence can be asked to continue somewhere other than
  // level 1 ("Explore projects"). It always lands on level 1 first, then
  // takes the lift like anyone else.
  useEffect(() => {
    if (mode !== 'walk' || phase !== 'onFloor' || pendingDest === null) return
    const id = window.setTimeout(() => {
      const s = useSilo.getState()
      useSilo.setState({ pendingDest: null })
      if (s.phase === 'onFloor') s.goToLevel(pendingDest)
    }, 900)
    return () => window.clearTimeout(id)
  }, [mode, phase, pendingDest])

  useFrame((_, rawDt) => {
    const j = job.current
    if (!j) return
    // Wall-clock time, not a capped frame delta. Capping protects things that
    // integrate physics; the car is just a position along a timed curve, and
    // a cap of 0.1 s a frame turned a 7 s ride into several minutes on a
    // device managing one frame a second. The opening's camera advances by
    // real time for the same reason.
    const dt = Math.min(rawDt, 2)
    const s = useSilo.getState()
    const quick = s.reducedMotion
    j.t += dt

    switch (j.stage) {
      case 'board': {
        if (lift.aboard()) {
          j.stage = 'closing'
          j.t = 0
          return
        }
        // The body may still be loading -- the physics is a separate
        // download. Wait for it rather than riding off without it.
        if (!lift.board) return
        if (!s.fading) s.setFading(true)
        if (j.t < 0.38) return
        // Behind the fade: bring the car to the visitor, put them in it.
        if (s.carLevel !== s.level || s.carMoving) {
          lift.y = walkY(s.level)
          s.setCar(s.level, false)
        }
        lift.board()
        j.stage = 'fadeIn'
        j.t = 0
        return
      }
      case 'fadeIn': {
        if (j.t < 0.12) return
        s.setFading(false)
        j.stage = 'closing'
        j.t = 0
        return
      }
      case 'closing': {
        if (s.doorsOpen) s.setDoors(false)
        if (j.t < (quick ? 0.15 : 1.0)) return
        j.y0 = lift.y
        j.y1 = walkY(j.to)
        const dist = Math.abs(j.y1 - j.y0)
        j.dur = quick ? 0.4 : Math.min(7.5, Math.max(1.8, 1.4 + dist * 0.05))
        s.setCar(j.to, true)
        j.stage = 'travel'
        j.t = 0
        return
      }
      case 'travel': {
        const k = Math.min(1, j.t / j.dur)
        lift.y = j.y0 + (j.y1 - j.y0) * smooth(k)
        if (k < 1) return
        lift.y = j.y1
        j.stage = 'settle'
        j.t = 0
        return
      }
      case 'settle': {
        if (j.t < (quick ? 0.05 : 0.35)) return
        if (j.ride) s.arrive()
        else {
          s.setCar(j.to, false)
          s.setDoors(true)
        }
        job.current = null
        return
      }
    }
  })

  // DEV: let an audit see what the lift is doing without guessing.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __silo?: Record<string, unknown> }
    if (!w.__silo) return
    w.__silo.liftJob = () => (job.current ? { ...job.current } : null)
    w.__silo.liftY = () => lift.y
  }, [])

  return null
}
