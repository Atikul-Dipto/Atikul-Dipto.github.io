import { FLOORS, LEVEL_COUNT, floorByLevel } from '../content/floors'
import { MISSING_CONTENT, identity } from '../content/portfolio'
import { useSilo } from '../state/useSilo'

export function TopBar() {
  const phase = useSilo((s) => s.phase)
  const level = useSilo((s) => s.level)
  const target = useSilo((s) => s.target)
  const toggleDirectory = useSilo((s) => s.toggleDirectory)
  const muted = useSilo((s) => s.muted)
  const toggleMute = useSilo((s) => s.toggleMute)
  const reduced = useSilo((s) => s.reducedMotion)
  const setReduced = useSilo((s) => s.setReducedMotion)

  if (phase === 'exterior' || phase === 'boot') return null
  const shown = phase === 'riding' ? target : level

  return (
    <header className="top">
      <a className="chip" href="/">
        <span aria-hidden="true">←</span> Standard portfolio
      </a>

      <div className="top__right">
        <span className="chip chip--read">
          {phase === 'riding' ? 'Travelling to' : 'Level'}{' '}
          <strong>{String(shown).padStart(2, '0')}</strong>
          <i>/ {String(LEVEL_COUNT).padStart(2, '0')}</i>
        </span>
        <button type="button" className="chip" onClick={() => toggleDirectory()}>
          Directory
        </button>
        <button
          type="button"
          className="chip"
          onClick={toggleMute}
          aria-pressed={!muted}
          title="Ambient audio arrives in a later stage"
        >
          {muted ? 'Sound off' : 'Sound on'}
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => setReduced(!reduced)}
          aria-pressed={reduced}
          title="Reduce motion"
        >
          {reduced ? 'Motion reduced' : 'Reduce motion'}
        </button>
      </div>
    </header>
  )
}

/** Elevator call panel — the physical way to move, next to the directory. */
export function CallPanel() {
  const phase = useSilo((s) => s.phase)
  const level = useSilo((s) => s.level)
  const goToLevel = useSilo((s) => s.goToLevel)
  if (phase !== 'onFloor') return null
  const floor = floorByLevel(level)

  return (
    <div className="call">
      <button
        type="button"
        className="call__btn"
        onClick={() => goToLevel(level - 1)}
        disabled={level <= 1}
        aria-label="Ascend one level"
      >
        ▲
      </button>
      <span className="call__read">{floor.name}</span>
      <button
        type="button"
        className="call__btn"
        onClick={() => goToLevel(level + 1)}
        disabled={level >= LEVEL_COUNT}
        aria-label="Descend one level"
      >
        ▼
      </button>
    </div>
  )
}

/** The CV airlock viewer. The record is reachable without any animation. */
export function CvViewer() {
  const open = useSilo((s) => s.cvOpen)
  const setCvOpen = useSilo((s) => s.setCvOpen)
  if (!open) return null

  return (
    <div className="cv" role="dialog" aria-modal="true" aria-label="Personnel record">
      <div className="cv__panel">
        <div className="cv__head">
          <div>
            <p className="cv__eyebrow">Personnel record</p>
            <h2>{identity.name}</h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => setCvOpen(false)}>
            Seal airlock
          </button>
        </div>

        <p className="cv__note">
          {identity.cvNote ?? 'The CV is available as a direct download.'}
        </p>

        <div className="cv__actions">
          {identity.cvUrl && (
            <a className="btn btn--primary" href={identity.cvUrl} download>
              Download CV (PDF)
            </a>
          )}
          {identity.links.map((l) => (
            <a key={l.href} className="btn" href={l.href} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          ))}
          <a className="btn" href={`mailto:${identity.email}`}>
            Email
          </a>
        </div>

        <details className="cv__gaps">
          <summary>Records still outstanding ({MISSING_CONTENT.length})</summary>
          <ul>
            {MISSING_CONTENT.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  )
}

/** Shown when WebGL is unavailable: a usable 2D route to everything. */
export function Fallback() {
  return (
    <div className="fallback">
      <h1>{identity.name}</h1>
      <p className="fallback__headline">{identity.headline}</p>
      <p>{identity.intro}</p>
      <p className="fallback__note">
        This device cannot render the 3D silo. Every level’s content is on the{' '}
        <a href="/">standard portfolio</a>.
      </p>
      <ol className="fallback__levels">
        {FLOORS.map((f) => (
          <li key={f.id}>
            <strong>
              {String(f.level).padStart(2, '0')} · {f.name}
            </strong>
            <span>{f.blurb}</span>
          </li>
        ))}
      </ol>
      <p className="fallback__links">
        {identity.links.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
            {l.label}
          </a>
        ))}
      </p>
    </div>
  )
}
