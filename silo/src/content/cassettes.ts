/**
 * The tapes in the recreation chamber's closet.
 *
 * To add one: put the audio file in `public/audio/tapes/` (mp3, ogg or m4a)
 * and add an entry below with `src: 'audio/tapes/<file>'`. It appears in the
 * closet, and plays through the gramophone, with nothing else to change. Only
 * add music you have the right to publish.
 */
export interface Cassette {
  id: string
  title: string
  /** Who made it, as they should be credited. */
  credit: string
  /** A path under the site's base URL, for a recorded track. */
  src?: string
  /** Or a piece synthesised live in the browser. */
  synth?: 'pentatonic-hall'
  /** The label's colour. */
  color: string
}

export const CASSETTES: Cassette[] = [
  {
    id: 'subterranean-ritual',
    title: 'Subterranean Ritual',
    credit: 'Atikul Islam · made with Suno',
    src: 'audio/subterranean-ritual.mp3',
    color: '#d05a43',
  },
  {
    id: 'pentatonic-hall',
    title: 'Pentatonic Hall',
    credit: 'The silo’s first score · synthesised live',
    synth: 'pentatonic-hall',
    color: '#2f6f8f',
  },
]
