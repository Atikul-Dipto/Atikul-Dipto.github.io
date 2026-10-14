import { useEffect, useRef } from 'react'
import { LEVEL_COUNT } from '../content/floors'
import { useSilo } from '../state/useSilo'
import {
  audioDebug,
  disableAudio,
  doorSlide,
  enableAudio,
  setDepth,
  setLiftRunning,
  stopAudio,
} from '../lib/audio'

/**
 * Binds the soundscape to the world's state.
 *
 * Deliberately a plain subscriber and not part of the render tree's output:
 * nothing here draws anything, and it must keep working while the canvas is
 * suspended, mid-load, or thrown away by a WebGL context loss.
 *
 * Everything is gated on `muted`, which starts true. The audio context is not
 * even constructed until the visitor turns sound on, which is a click, which
 * is the gesture browsers require before they will play anything.
 */
export default function Soundscape() {
  const muted = useSilo((s) => s.muted)
  const level = useSilo((s) => s.level)
  const phase = useSilo((s) => s.phase)
  const doorsOpen = useSilo((s) => s.doorsOpen)
  const firstDoors = useRef(true)

  useEffect(() => {
    if (muted) disableAudio()
    else enableAudio()
  }, [muted])

  useEffect(() => {
    if (!muted) setDepth(level, LEVEL_COUNT)
  }, [muted, level])

  useEffect(() => {
    if (!muted) setLiftRunning(phase === 'riding')
  }, [muted, phase])

  useEffect(() => {
    // The doors are shut on load, so the first value is the initial state and
    // not a thing that happened -- playing it would open the site with a lift
    // chime nobody caused.
    if (firstDoors.current) {
      firstDoors.current = false
      return
    }
    if (!muted) doorSlide(doorsOpen)
  }, [muted, doorsOpen])

  useEffect(() => () => stopAudio(), [])

  // Dev handle, so an audit can read the graph rather than listen to it.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __siloAudio?: unknown }).__siloAudio = audioDebug
  }, [])

  return null
}
