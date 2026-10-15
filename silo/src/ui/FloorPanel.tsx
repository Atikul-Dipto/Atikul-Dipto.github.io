import { floorByLevel } from '../content/floors'
import { identity } from '../content/portfolio'
import { useSilo } from '../state/useSilo'

/**
 * Real HTML over the canvas. Essential information is never WebGL-only
 * (spec §11), so this is the authoritative copy of each level's content.
 */
export default function FloorPanel() {
  const phase = useSilo((s) => s.phase)
  const mode = useSilo((s) => s.mode)
  const level = useSilo((s) => s.level)
  const locked = useSilo((s) => s.pointerLocked)
  const recordOpen = useSilo((s) => s.recordOpen)
  const enterAirlock = useSilo((s) => s.enterAirlock)
  const floor = floorByLevel(level)
  // Up on demand, or whenever the mouse is free on a desktop -- never over
  // the view while someone is actually walking. On a phone the pointer is
  // never "locked", so there it is the Record button alone.
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const visible =
    (phase === 'onFloor' || phase === 'airlock') &&
    (mode !== 'walk' || recordOpen || (!locked && !touch))

  return (
    <main className={`panel${visible ? ' is-visible' : ''}`} aria-hidden={!visible}>
      <p className="panel__level">
        Level {String(floor.level).padStart(2, '0')} — {floor.name}
      </p>

      {floor.level === 1 ? (
        <>
          <h1>{identity.name}</h1>
          <p className="panel__role">{identity.headline}</p>
          <p className="panel__body">{identity.intro}</p>
          <ul className="panel__tags">
            {identity.specialisms.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="panel__meta">{identity.location}</p>
          <div className="panel__actions">
            <button type="button" className="btn btn--primary" onClick={enterAirlock}>
              Open the records vault
            </button>
            {identity.links.map((l) => (
              <a key={l.href} className="btn" href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
          </div>
        </>
      ) : (
        <>
          <h2>{floor.name}</h2>
          <p className="panel__body">{floor.blurb}</p>
          <p className="panel__stub">
            This level is built but not yet fitted out. Its content is live on the{' '}
            <a href="/">standard portfolio</a>.
          </p>
        </>
      )}

      <p className="panel__hint">
        The vault is in the sheriff's office, behind the round door. The lift
        and the stair are across the bridge.
      </p>
    </main>
  )
}
