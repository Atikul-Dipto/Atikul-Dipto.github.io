import { FLOORS, LEVEL_COUNT } from '../content/floors'
import { useSilo } from '../state/useSilo'

/**
 * Architectural cutaway overview (spec §4). Doubles as the floor directory —
 * clicking any level rides the elevator there, so nothing is ever more than
 * one interaction away.
 */
export function MiniSilo() {
  const level = useSilo((s) => s.level)
  const target = useSilo((s) => s.target)
  const phase = useSilo((s) => s.phase)
  const goToLevel = useSilo((s) => s.goToLevel)

  return (
    <nav className="mini" aria-label="Silo levels">
      <span className="mini__shaft" aria-hidden="true">
        <span
          className="mini__car"
          style={{ '--p': String((target - 1) / (LEVEL_COUNT - 1)) } as React.CSSProperties}
        />
      </span>
      <ol className="mini__levels">
        {FLOORS.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className={`mini__level${f.level === level ? ' is-current' : ''}${
                f.level === target && phase === 'riding' ? ' is-target' : ''
              }${f.ready ? '' : ' is-stub'}`}
              onClick={() => goToLevel(f.level)}
              aria-current={f.level === level ? 'true' : undefined}
              title={`${f.name}${f.ready ? '' : ' — not yet fitted out'}`}
            >
              <span className="mini__num">{String(f.level).padStart(2, '0')}</span>
              <span className="mini__name">{f.name}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** Full-screen accessible directory — the keyboard/screen-reader route. */
export function DirectoryOverlay() {
  const open = useSilo((s) => s.directoryOpen)
  const level = useSilo((s) => s.level)
  const goToLevel = useSilo((s) => s.goToLevel)
  const toggle = useSilo((s) => s.toggleDirectory)

  if (!open) return null

  return (
    <div className="directory" role="dialog" aria-modal="true" aria-label="Floor directory">
      <div className="directory__head">
        <h2>Floor directory</h2>
        <button type="button" className="btn btn--ghost" onClick={() => toggle(false)}>
          Close
        </button>
      </div>
      <ol className="directory__grid">
        {FLOORS.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className={`directory__card${f.level === level ? ' is-current' : ''}`}
              onClick={() => goToLevel(f.level)}
            >
              <span className="directory__num">{String(f.level).padStart(2, '0')}</span>
              <strong>{f.name}</strong>
              <small>{f.blurb}</small>
              {typeof f.itemCount === 'number' && <em>{f.itemCount} records</em>}
              {!f.ready && <span className="directory__stub">Not yet fitted out</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
