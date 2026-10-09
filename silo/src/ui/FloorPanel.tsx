import { floorByLevel } from '../content/floors'
import { identity } from '../content/portfolio'
import { useSilo } from '../state/useSilo'

/**
 * Real HTML over the canvas. Essential information is never WebGL-only
 * (spec §11), so this is the authoritative copy of each level's content.
 */
export default function FloorPanel() {
  const phase = useSilo((s) => s.phase)
  const level = useSilo((s) => s.level)
  const enterAirlock = useSilo((s) => s.enterAirlock)
  const floor = floorByLevel(level)
  const visible = phase === 'onFloor'

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
              Enter the personnel airlock
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
        Drag to look around · <kbd>&larr;</kbd> <kbd>&rarr;</kbd> turn ·{' '}
        <kbd>&uarr;</kbd> <kbd>&darr;</kbd> ride
      </p>
    </main>
  )
}
