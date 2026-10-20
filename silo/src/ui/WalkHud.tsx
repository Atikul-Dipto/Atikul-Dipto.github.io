import { useEffect, useRef, useState } from 'react'
import { isTouchDevice, move, stick } from '../lib/input'
import { useSilo } from '../state/useSilo'
import type { Interact } from '../state/useSilo'
import { ARCADE_GAMES, ROOMS6, ROOM_INFO, type RoomId } from '../content/level6'
import { WRITINGS } from '../content/writings'

const ROOM_NAMES = Object.fromEntries(Object.entries(ROOM_INFO).map(([k, v]) => [k, v.label.toLowerCase()])) as Record<RoomId, string>
import { CONTACTS } from '../content/level12'

/**
 * The walking overlay.
 *
 * DESKTOP. Until the pointer is taken, a small card at the foot of the screen
 * says how. It does not cover the screen -- the overlay it sits in lets clicks
 * fall through to the canvas, which is what takes the pointer, and to the
 * record panel and the top bar, which must keep working. The first version
 * was a full-screen click target, and it swallowed the very click it asked
 * for; a later one sat over the top bar and quietly disabled it.
 *
 * TOUCH. No pointer lock exists, so there is no prompt: a one-off hint, a
 * ring under the left thumb while it walks, and the interact prompt is a
 * button you tap.
 *
 * EVERYWHERE. What E would do right here, said in words, and the state of a
 * lift journey while one is under way.
 */

const LABEL: Record<string, string> = {
  'lift-controls': 'Lift controls',
  'call-lift': 'Call the lift',
  vault: 'Open the records vault',
  'vault-close': 'Swing the vault shut',
  record: 'Read the personnel record',
  sealed: 'Sealed. This door does not open',
  'maze-map': 'Read the map of the maze',
  jukebox: 'Choose a cassette for the gramophone',
  drone: 'Take the drone',
  citizen: 'Become a citizen of the Silo',
  poems: 'Read the poems and writings',
  aim: 'Start a round on the aim range',
  soundbox: 'Play a song on the sound box',
  reactor: 'Run a surge test on the core',
}

function label(i: Exclude<Interact, null>) {
  if (i.startsWith('arcade:')) {
    const game = ARCADE_GAMES.find((g) => `arcade:${g.id}` === i)
    return `Play ${game ? game.title.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : 'the game'}`
  }
  if (i.startsWith('poem:')) {
    const w = WRITINGS.find((p) => `poem:${p.id}` === i)
    return w ? `Read “${w.title}”` : 'Read the poem'
  }
  if (i.startsWith('chamber-close:')) return 'Roll the round door shut'
  if (i.startsWith('chamber:')) {
    const room = ROOMS6[Number(i.slice('chamber:'.length))]
    return `Roll the round door open${room ? ` · ${ROOM_NAMES[room.id]}` : ''}`
  }
  if (i.startsWith('contact:')) {
    const c = CONTACTS.find((p) => `contact:${p.id}` === i)
    return c ? `${c.label} · ${c.value}` : ''
  }
  return LABEL[i] ?? ''
}

function ThumbRing() {
  const ring = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let id = 0
    const tick = () => {
      if (ring.current && knob.current) {
        ring.current.style.opacity = stick.active ? '1' : '0'
        ring.current.style.transform = `translate(${stick.ox - 56}px, ${stick.oy - 56}px)`
        knob.current.style.transform = `translate(${stick.x - stick.ox}px, ${stick.y - stick.oy}px)`
      }
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div ref={ring} className="thumb" aria-hidden="true">
      <div ref={knob} className="thumb__knob" />
    </div>
  )
}

export default function WalkHud() {
  const mode = useSilo((s) => s.mode)
  const phase = useSilo((s) => s.phase)
  const locked = useSilo((s) => s.pointerLocked)
  const level = useSilo((s) => s.level)
  const target = useSilo((s) => s.target)
  const interact = useSilo((s) => s.interact)
  const directoryOpen = useSilo((s) => s.directoryOpen)
  const cvOpen = useSilo((s) => s.cvOpen)
  const bodyReady = useSilo((s) => s.bodyReady)
  const doorBlocked = useSilo((s) => s.doorBlocked)
  const hudNote = useSilo((s) => s.hudNote)
  const panel = useSilo((s) => s.panel)
  const droneFlying = useSilo((s) => s.droneFlying)
  const [touch] = useState(isTouchDevice)
  const [hintSeen, setHintSeen] = useState(false)

  if (mode !== 'walk' || droneFlying) return null
  const riding = phase === 'riding'
  const modal = directoryOpen || cvOpen || panel !== null

  return (
    <>
      {riding && (
        <div className="walk-status" role="status">
          Lift · travelling to level <strong>{String(target).padStart(2, '0')}</strong>
        </div>
      )}

      {hudNote && !doorBlocked && !riding && !modal && (
        <div className="walk-status" role="status">
          {hudNote}
        </div>
      )}

      {doorBlocked && !riding && !modal && (
        <div className="walk-status" role="status">
          Step back · the vault door swings out towards you
        </div>
      )}

      {!touch && !locked && !modal && (
        <div className="walk-prompt">
          <div className="walk-prompt__card">
            <p className="walk-prompt__lead">
              {bodyReady ? (
                <>
                  <strong>Click</strong> to walk level {String(level).padStart(2, '0')}
                </>
              ) : (
                // Said plainly, because otherwise a click here does nothing
                // and looks broken.
                <>Starting the physics…</>
              )}
            </p>
            <dl className="walk-keys">
              <div>
                <dt>
                  <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd>
                </dt>
                <dd>walk</dd>
              </div>
              <div>
                <dt>Mouse</dt>
                <dd>look</dd>
              </div>
              <div>
                <dt>
                  <kbd>Shift</kbd>
                </dt>
                <dd>run</dd>
              </div>
              <div>
                <dt>
                  <kbd>E</kbd>
                </dt>
                <dd>use</dd>
              </div>
              <div>
                <dt>
                  <kbd>Esc</kbd>
                </dt>
                <dd>let go of the mouse</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {!touch && locked && (
        <div className="walk-legend" aria-hidden="true">
          <span>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> walk
          </span>
          <span>
            <kbd>Shift</kbd> run
          </span>
          <span>
            <kbd>E</kbd> use
          </span>
          <span>
            <kbd>Esc</kbd> release
          </span>
        </div>
      )}

      {touch && (
        <>
          <ThumbRing />
          {!hintSeen && !modal && (
            <button type="button" className="walk-hint" onClick={() => setHintSeen(true)}>
              Left thumb walks · right thumb looks · tap to close
            </button>
          )}
        </>
      )}

      {interact && !riding && !modal && (
        // A button, so it works without a keyboard. On desktop it is only
        // clickable while the pointer is free; with the pointer held, E does it.
        <button
          type="button"
          className="walk-interact"
          onClick={() => {
            move.interact = true
          }}
        >
          {!touch && <kbd>E</kbd>} {label(interact)}
        </button>
      )}
    </>
  )
}
