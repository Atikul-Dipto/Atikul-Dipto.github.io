import { useSyncExternalStore } from 'react'
import { SONGS } from '../content/songs'
import { onSoundbox, playSong, soundbox, stopSong } from '../lib/soundbox'
import { useSilo } from '../state/useSilo'

const subscribe = (fn: () => void) => onSoundbox(fn)
const snapshot = () => `${soundbox.current?.id ?? ''}|${soundbox.on}|${soundbox.playing}|${soundbox.error ?? ''}`

/** The sound box's song list: play one in the music hall, or stop it. */
export default function SoundboxPanel() {
  const open = useSilo((s) => s.panel === 'soundbox')
  const close = useSilo((s) => s.closePanel)
  useSyncExternalStore(subscribe, snapshot)
  if (!open) return null
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="The sound box">
      <div className="sheet__panel sheet__panel--wide soundbox">
        <div className="sheet__head">
          <div>
            <p className="sheet__eyebrow">Recreation · the music hall</p>
            <h2>The sound box</h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={close}>
            Close
          </button>
        </div>
        <ul className="soundbox__list">
          {SONGS.map((song) => {
            const now = soundbox.on && soundbox.current?.id === song.id
            return (
              <li key={song.id} className={now ? 'is-on' : ''}>
                <div>
                  <strong>{song.title}</strong>
                  <span>{song.artist}</span>
                  {song.note && <small>{song.note}</small>}
                </div>
                <button type="button" className="btn btn--primary" onClick={() => (now ? stopSong() : void playSong(song.id))}>
                  {now ? 'Stop' : 'Play'}
                </button>
              </li>
            )
          })}
        </ul>
        {soundbox.error && <p className="citizen__error">{soundbox.error}</p>}
        <p className="citizen__note">
          Plays in this hall through YouTube's own player, from the artist's official upload. It is loudest by the box, fades as you walk away, and pauses when you leave the floor.
        </p>
      </div>
    </div>
  )
}
