import { useEffect, useRef, useState } from 'react'
import { DRONE, GATES } from '../content/drone'
import { addToBoard, drone, readBoard, type BoardEntry } from '../lib/drone'
import { droneLevel, droneTouch } from '../lib/drone'
import { useSilo } from '../state/useSilo'

const fmt = (s: number) => `${s.toFixed(2)} s`

/**
 * The drone desk: a briefing before take-off, the result after landing, and
 * the board of the best race times -- kept on this device, since a static
 * site has nowhere to keep anyone else's.
 */
export default function DronePanel() {
  const open = useSilo((s) => s.panel === 'drone')
  const close = useSilo((s) => s.closePanel)
  const start = useSilo((s) => s.startDrone)
  const result = useSilo((s) => s.droneResult)
  const [board, setBoard] = useState<BoardEntry[]>(readBoard)
  const [name, setName] = useState('')
  const [saved, setSaved] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    if (!open) return
    setBoard(readBoard())
    setSaved(undefined)
  }, [open, result])

  if (!open) return null
  const raced = result?.mode === 'race' && result.time !== null

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Drone control">
      <div className="sheet__panel sheet__panel--wide drone-panel">
        <div className="sheet__head">
          <div>
            <p className="sheet__eyebrow">Recreation · drone control</p>
            <h2>{result ? 'Landed' : 'Drone link'}</h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={close}>
            Close
          </button>
        </div>

        <div className="drone-panel__grid">
          <div className="drone-panel__main">
            {result && (
              <div className="drone-panel__result">
                {result.mode === 'race' ? (
                  result.time !== null ? (
                    <p>
                      Through all {GATES.length} gates in <b>{fmt(result.time)}</b>
                      {result.bumps ? ` · ${result.bumps} bump${result.bumps > 1 ? 's' : ''}` : ''}.
                    </p>
                  ) : (
                    <p>
                      The battery ran out after gate <b>{result.gates}</b> of {GATES.length}. Try again!
                    </p>
                  )
                ) : (
                  <p>A minute round the silo. The drone flew itself back to its pad.</p>
                )}
                {raced && saved === undefined && (
                  <form
                    className="drone-panel__save"
                    onSubmit={(e) => {
                      e.preventDefault()
                      setSaved(addToBoard(name, result.time as number))
                      setBoard(readBoard())
                    }}
                  >
                    <label>
                      Your name for the board
                      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Anonymous" />
                    </label>
                    <button type="submit" className="btn btn--primary">
                      Post the time
                    </button>
                  </form>
                )}
                {saved !== undefined && <p className="sheet__note">{saved ? `On the board at number ${saved}.` : 'Not in the top ten this time.'}</p>}
              </div>
            )}

            <p>
              The drone waits on its pad on the level 6 promenade. Take it out over the atrium and round the silo for{' '}
              <b>{DRONE.battery} seconds</b> of battery. Your body stays here at the desk.
            </p>
            <ul className="drone-panel__keys">
              <li>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> fly · <kbd>Space</kbd> climb · <kbd>Shift</kbd> descend
              </li>
              <li>
                Mouse or <kbd>Q</kbd>
                <kbd>E</kbd> turn · click the view to steer with the mouse · <kbd>Esc</kbd> lands
              </li>
              <li>On a phone: left thumb flies, right thumb turns, the buttons climb and descend.</li>
            </ul>
            <div className="drone-panel__go">
              <button type="button" className="btn btn--primary" onClick={() => start('free')}>
                Free flight
              </button>
              <button type="button" className="btn btn--primary" onClick={() => start('race')}>
                Shaft race · {GATES.length} gates
              </button>
            </div>
          </div>

          <div className="drone-panel__board">
            <p className="sheet__eyebrow">Shaft race · best times</p>
            {board.length ? (
              <ol>
                {board.map((e, i) => (
                  <li key={`${e.at}-${i}`}>
                    <span>{e.name}</span>
                    <b>{fmt(e.time)}</b>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="sheet__note">No times yet. Be the first.</p>
            )}
            <p className="sheet__note">Times are kept on this device.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Over the drone's camera: battery, the race clock, the next gate. */
export function DroneHud() {
  const flying = useSilo((s) => s.droneFlying)
  const mode = useSilo((s) => s.droneMode)
  const end = useSilo((s) => s.endDrone)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!flying) return
    let id = 0
    const tick = () => {
      const el = ref.current
      if (el) {
        const left = Math.max(0, DRONE.battery - drone.t)
        const clock = drone.raceStart !== null ? drone.t - drone.raceStart : 0
        el.querySelector<HTMLElement>('[data-batt]')!.style.width = `${(left / DRONE.battery) * 100}%`
        el.querySelector<HTMLElement>('[data-left]')!.textContent = `${left.toFixed(0)} s`
        el.querySelector<HTMLElement>('[data-level]')!.textContent = `Level ${String(Math.min(12, Math.max(1, droneLevel.current))).padStart(2, '0')}`
        const race = el.querySelector<HTMLElement>('[data-race]')
        if (race) race.textContent = `Gate ${Math.min(drone.gate + 1, GATES.length)} / ${GATES.length} · ${clock.toFixed(1)} s`
      }
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [flying])

  if (!flying) return null
  const hold = (k: 'up' | 'down', on: boolean) => () => {
    droneTouch[k] = on
  }
  return (
    <div className="drone-hud" ref={ref} aria-live="off">
      <div className="drone-hud__top">
        <span className="drone-hud__rec">● LINK</span>
        <span data-level />
        {mode === 'race' && <span data-race />}
        <span className="drone-hud__batt">
          <i data-batt />
        </span>
        <span data-left />
      </div>
      <div className="drone-hud__reticle" aria-hidden="true" />
      <div className="drone-hud__bottom">
        <button type="button" className="btn btn--ghost" onPointerDown={hold('up', true)} onPointerUp={hold('up', false)} onPointerLeave={hold('up', false)}>
          Climb
        </button>
        <button type="button" className="btn btn--ghost" onPointerDown={hold('down', true)} onPointerUp={hold('down', false)} onPointerLeave={hold('down', false)}>
          Descend
        </button>
        <button type="button" className="btn btn--primary" onClick={() => end('landed')}>
          Land
        </button>
      </div>
    </div>
  )
}
