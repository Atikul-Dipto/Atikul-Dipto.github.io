import { useEffect } from 'react'
import { LEVEL_COUNT, floorByLevel } from '../content/floors'
import { SOUND_KEY, useSilo } from '../state/useSilo'
import {
  announce,
  audioDebug,
  disableAudio,
  doorSlide,
  doorWarn,
  enableAudio,
  levelSelect,
  liftCallButton,
  liftJolt,
  panelOpen,
  panelSwish,
  setDepth,
  setLiftRunning,
  setMusicWanted,
  stopAudio,
  terminal,
  uiClick,
  vaultLever,
} from '../lib/audio'

/** What the lift says on arrival: the level and what is kept there. */
function arrivalWords(level: number) {
  const name = floorByLevel(level)?.name ?? ''
  const spoken = name.replace(/\s*[—–-]\s*/g, ', ').replace(/&/g, 'and')
  return spoken ? `Level ${level}. ${spoken}.` : `Level ${level}.`
}

/**
 * Binds the soundscape to the world's state.
 *
 * Deliberately a plain subscriber and not part of the render tree's output:
 * nothing here draws anything, and it must keep working while the canvas is
 * suspended, mid-load, or thrown away by a WebGL context loss.
 *
 * SOUND COMES ON WITH THE FIRST GESTURE. Browsers will not play anything
 * before the visitor has clicked, tapped or pressed a key, so `muted` starts
 * true and nothing is even constructed. The first gesture anywhere on the
 * page turns it on -- unless that gesture is on the Sound control itself, or
 * the visitor turned sound off on an earlier visit.
 *
 * Every interaction's sound is played from a change of state, not from the
 * control that caused it, so it sounds the same however it was asked for:
 * the E key, a tap, or a button in the panel.
 */
export default function Soundscape() {
  const muted = useSilo((s) => s.muted)
  const music = useSilo((s) => s.music)
  const level = useSilo((s) => s.level)
  const carMoving = useSilo((s) => s.carMoving)

  useEffect(() => {
    if (muted) disableAudio()
    else enableAudio()
  }, [muted])

  // The first gesture turns the sound on.
  useEffect(() => {
    let chosenOff = false
    try {
      chosenOff = localStorage.getItem(SOUND_KEY) === 'off'
    } catch {
      // Storage blocked: no remembered choice.
    }
    if (chosenOff) return
    const events = ['pointerdown', 'keydown', 'touchend'] as const
    const off = () => events.forEach((e) => window.removeEventListener(e, first, true))
    function first(e: Event) {
      const el = e.target as Element | null
      // A click on the Sound control is the visitor deciding for themselves.
      if (el?.closest?.('[data-sound-toggle]')) {
        off()
        return
      }
      if (e instanceof KeyboardEvent && (e.key === 'Escape' || e.repeat)) return
      off()
      const s = useSilo.getState()
      if (!s.muted) return
      // Start it here, inside the gesture -- Safari will not allow it from
      // an effect a moment later -- then tell the store.
      enableAudio()
      s.setMuted(false)
    }
    events.forEach((e) => window.addEventListener(e, first, true))
    return off
  }, [])

  useEffect(() => {
    setMusicWanted(music)
  }, [music])

  useEffect(() => {
    if (!muted) setDepth(level, LEVEL_COUNT)
  }, [muted, level])

  useEffect(() => {
    if (!muted) setLiftRunning(carMoving)
  }, [muted, carMoving])

  // Each interaction, from the change it makes.
  useEffect(() => {
    let speak: number | null = null
    const unsub = useSilo.subscribe((s, p) => {
      if (s.muted) return
      if (s.doorsOpen !== p.doorsOpen) doorSlide(s.doorsOpen)
      if (s.carMoving !== p.carMoving) liftJolt(s.carMoving)
      if (s.liftCall !== null && p.liftCall === null) liftCallButton()
      if (s.directoryOpen !== p.directoryOpen) panelOpen(s.directoryOpen)
      if (s.phase === 'riding' && p.phase === 'onFloor') levelSelect()
      if (s.vaultOpen !== p.vaultOpen) vaultLever()
      if (s.chambersOpen.some((v, i) => v !== p.chambersOpen[i])) vaultLever()
      if (s.panel !== p.panel) panelOpen(s.panel !== null)
      if (s.doorBlocked && !p.doorBlocked) doorWarn()
      if (s.cvOpen !== p.cvOpen) terminal(s.cvOpen)
      if (s.recordOpen !== p.recordOpen) panelSwish(s.recordOpen)
      // Arrival: once the doors have parted and the chime has sounded, the
      // lift says where you are.
      if (s.phase === 'onFloor' && p.phase === 'riding') {
        if (speak !== null) window.clearTimeout(speak)
        const at = s.level
        speak = window.setTimeout(() => {
          speak = null
          const now = useSilo.getState()
          if (!now.muted && now.level === at) announce(arrivalWords(at))
        }, 900)
      }
    })
    return () => {
      unsub()
      if (speak !== null) window.clearTimeout(speak)
    }
  }, [])

  // Every button in the interface clicks.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null
      if (el?.closest?.('button, [role="button"], a')) uiClick()
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => () => stopAudio(), [])

  // Dev handle, so an audit can read the graph rather than listen to it.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __siloAudio?: unknown }).__siloAudio = audioDebug
  }, [])

  return null
}
