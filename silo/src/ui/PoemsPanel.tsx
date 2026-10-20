import { useEffect, useState } from 'react'
import { WRITINGS } from '../content/writings'
import { useSilo } from '../state/useSilo'

/**
 * The poems room: every piece, and one open to read -- set like a page of
 * poetry, each line on its own and the stanzas apart. Opened at the lectern
 * it lists them all; opened at a page on the wall it opens on that poem.
 */
export default function PoemsPanel() {
  const open = useSilo((s) => s.panel === 'poems')
  const wanted = useSilo((s) => s.arcadeGame)
  const close = useSilo((s) => s.closePanel)
  const [reading, setReading] = useState<string | null>(null)
  useEffect(() => {
    if (open) setReading(wanted && WRITINGS.some((w) => w.id === wanted) ? wanted : null)
  }, [open, wanted])
  if (!open) return null
  const i = WRITINGS.findIndex((w) => w.id === reading)
  const piece = i >= 0 ? WRITINGS[i] : null

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Poems and writings">
      <div className="sheet__panel sheet__panel--wide poems">
        <div className="sheet__head">
          <div>
            <p className="sheet__eyebrow">Recreation · poems and writings</p>
            <h2>{piece ? 'Poem' : 'Poems & writings'}</h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={piece ? () => setReading(null) : close}>
            {piece ? 'All poems' : 'Close'}
          </button>
        </div>
        {!WRITINGS.length && <p className="poems__empty">The poems and writings are still being gathered. They will be here soon.</p>}
        {!piece && WRITINGS.length > 0 && (
          <ul className="poems__list">
            {WRITINGS.map((w) => (
              <li key={w.id}>
                <button type="button" className="poems__item" onClick={() => setReading(w.id)} lang={w.lang}>
                  <small>
                    {w.kind}
                    {w.date ? ` · ${w.date}` : ''}
                  </small>
                  <strong>{w.title}</strong>
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
            <h3 className="poems__title">{piece.title}</h3>
            <div className="poems__body">
              {piece.body.split(/\n{2,}/).map((stanza, k) => (
                <p key={k}>
                  {stanza.split('\n').map((line, j) => (
                    <span key={j}>{line}</span>
                  ))}
                </p>
              ))}
            </div>
            <div className="poems__foot">
              <button type="button" className="btn btn--ghost" disabled={i <= 0} onClick={() => setReading(WRITINGS[i - 1].id)}>
                ← Newer
              </button>
              {piece.source && (
                <a className="poems__source" href={piece.source} target="_blank" rel="noopener noreferrer">
                  First published on Bangla Kobita
                </a>
              )}
              <button type="button" className="btn btn--ghost" disabled={i >= WRITINGS.length - 1} onClick={() => setReading(WRITINGS[i + 1].id)}>
                Older →
              </button>
            </div>
          </article>
        )}
      </div>
    </div>
  )
}
