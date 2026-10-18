import { useEffect, useState } from 'react'
import { WRITINGS } from '../content/writings'
import { useSilo } from '../state/useSilo'

/** The lectern in the poems room: the pieces, and one open to read. */
export default function PoemsPanel() {
  const open = useSilo((s) => s.panel === 'poems')
  const close = useSilo((s) => s.closePanel)
  const [reading, setReading] = useState<string | null>(null)
  useEffect(() => {
    if (open) setReading(null)
  }, [open])
  if (!open) return null
  const piece = WRITINGS.find((w) => w.id === reading)

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Poems and writings">
      <div className="sheet__panel sheet__panel--wide poems">
        <div className="sheet__head">
          <div>
            <p className="sheet__eyebrow">Recreation · poems and writings</p>
            <h2>{piece ? piece.title : 'Poems & writings'}</h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={piece ? () => setReading(null) : close}>
            {piece ? 'All pieces' : 'Close'}
          </button>
        </div>
        {!WRITINGS.length && <p className="poems__empty">The poems and writings are still being gathered. They will be here soon.</p>}
        {!piece && WRITINGS.length > 0 && (
          <ul className="poems__list">
            {WRITINGS.map((w) => (
              <li key={w.id}>
                <button type="button" className="poems__item" onClick={() => setReading(w.id)}>
                  <small>{w.kind}</small>
                  <strong>{w.title}</strong>
                  {w.date && <span>{w.date}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {piece && (
          <article className="poems__read" lang={piece.lang}>
            <p className="poems__kind">
              {piece.kind}
              {piece.date ? ` · ${piece.date}` : ''}
            </p>
            <div className="poems__body">{piece.body}</div>
          </article>
        )}
      </div>
    </div>
  )
}
