import { floorByLevel } from '../content/floors'
import { identity } from '../content/portfolio'
import { levelRecord, type LevelRecord, type RecordItem } from '../content/records'
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
  const rec = levelRecord(level)
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
          <div className="panel__actions">
            <button type="button" className="btn btn--primary" onClick={enterAirlock}>
              Open the records vault
            </button>
          </div>
          <RecordBody rec={rec} />
        </>
      ) : (
        <>
          <h2>{rec.title}</h2>
          {rec.subtitle && <p className="panel__role">{rec.subtitle}</p>}
          {rec.empty ? (
            <p className="panel__stub">
              Nothing is on record for this level yet. Everything else in the portfolio is on the other
              levels, and on the <a href="/">standard portfolio</a>.
            </p>
          ) : (
            <RecordBody rec={rec} />
          )}
        </>
      )}

      <p className="panel__hint">
        {floor.level === 1
          ? "The vault is in the sheriff's office, behind the round door. The lift and the stair are across the bridge."
          : 'This record is also on the wall the bridge faces. The lift and the stair are across the bridge.'}
      </p>
    </main>
  )
}

function Item({ it }: { it: RecordItem }) {
  return (
    <div className="rec__item">
      {it.title && <h3 className="rec__title">{it.title}</h3>}
      {it.meta && <p className="rec__meta">{it.meta}</p>}
      {it.text && <p className="panel__body">{it.text}</p>}
      {it.figures && (
        <dl className="rec__figures">
          {it.figures.map(([v, l]) => (
            <div key={l}>
              <dt>{v}</dt>
              <dd>{l}</dd>
            </div>
          ))}
        </dl>
      )}
      {it.bullets && (
        <ul className="rec__bullets">
          {it.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {it.tags && (
        <ul className="panel__tags">
          {it.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {it.code && (
        <pre className="rec__code">
          <code>{it.code}</code>
        </pre>
      )}
      {it.links && it.links.length > 0 && (
        <p className="rec__links">
          {it.links.map((l) => (
            <a key={l.href} className="btn" href={l.href} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          ))}
        </p>
      )}
    </div>
  )
}

/** Every section of a level's record -- the panel shows all of it. */
function RecordBody({ rec }: { rec: LevelRecord }) {
  return (
    <>
      {rec.sections.map((sec, i) => (
        <section key={sec.heading ?? i} className="rec__section">
          {sec.heading && <h3 className="rec__heading">{sec.heading}</h3>}
          {sec.items.map((it, k) => (
            <Item key={(it.title ?? '') + k} it={it} />
          ))}
        </section>
      ))}
    </>
  )
}
