import { useEffect, useState, useSyncExternalStore } from 'react'
import { CASSETTES } from '../content/cassettes'
import { jukebox, onJukebox, play, stop } from '../lib/jukebox'
import { useSilo } from '../state/useSilo'

const subscribe = (fn: () => void) => onJukebox(fn)
const currentId = () => jukebox.current?.id ?? null

/**
 * The cassette closet and the gramophone, as a panel: take a tape off the
 * shelf and it slides across into the gramophone's slot and plays; eject it
 * and the silo's own score comes back.
 */
export default function JukeboxPanel() {
  const open = useSilo((s) => s.panel === 'jukebox')
  const close = useSilo((s) => s.closePanel)
  const muted = useSilo((s) => s.muted)
  const playing = useSyncExternalStore(subscribe, currentId)
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    if (!loading) return
    // The tape travels to the slot, then goes in.
    const id = window.setTimeout(() => {
      play(loading)
      setLoading(null)
    }, 650)
    return () => window.clearTimeout(id)
  }, [loading])

  if (!open) return null
  const now = CASSETTES.find((c) => c.id === playing)

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Cassette closet and gramophone">
      <div className="sheet__panel sheet__panel--wide">
        <div className="sheet__head">
          <div>
            <p className="sheet__eyebrow">Recreation · the music nook</p>
            <h2>Cassette closet</h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={close}>
            Close
          </button>
        </div>

        <div className="jukebox">
          <ul className="jukebox__shelf" aria-label="Cassettes">
            {CASSETTES.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`tape${playing === c.id ? ' is-playing' : ''}${loading === c.id ? ' is-loading' : ''}`}
                  style={{ ['--tape' as string]: c.color }}
                  onClick={() => !loading && setLoading(c.id)}
                  aria-pressed={playing === c.id}
                >
                  <span className="tape__label">
                    <strong>{c.title}</strong>
                    <small>{c.credit}</small>
                  </span>
                  <span className="tape__reels" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className={`gramophone${playing ? ' is-playing' : ''}`} aria-live="polite">
            <svg viewBox="0 0 200 170" className="gramophone__art" aria-hidden="true">
              <path d="M98 92 C 92 60, 70 30, 30 8 C 60 6, 110 10, 150 28 C 128 44, 112 66, 106 92 Z" className="gramophone__horn" />
              <rect x="40" y="96" width="120" height="58" rx="4" className="gramophone__box" />
              <ellipse cx="100" cy="96" rx="52" ry="6" className="gramophone__disc" />
              <rect x="74" y="122" width="52" height="12" rx="2" className="gramophone__slot" />
            </svg>
            {now ? (
              <>
                <p className="gramophone__now">Now playing</p>
                <p className="gramophone__title">{now.title}</p>
                <p className="gramophone__credit">{now.credit}</p>
                <button type="button" className="btn btn--ghost" onClick={() => stop()}>
                  Eject
                </button>
              </>
            ) : (
              <p className="gramophone__now">The slot is empty. Take a tape from the closet.</p>
            )}
            {muted && <p className="gramophone__credit">Sound is off. Turn it on in the top bar to hear the tape.</p>}
          </div>
        </div>
        <p className="sheet__note">The silo’s own score pauses while a tape plays, and comes back when you eject it.</p>
      </div>
    </div>
  )
}
