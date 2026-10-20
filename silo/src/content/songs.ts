/**
 * The music hall's sound box: songs played through YouTube's own player, from
 * the artists' official uploads, so nothing is copied and every play is
 * theirs. Add a line for each song: the video's id is the part after `v=` in
 * its YouTube address.
 */
export interface Song {
  id: string
  title: string
  artist: string
  /** The YouTube video id. */
  youtube: string
  /** A line under the title. */
  note?: string
}

export const SONGS: Song[] = [
  {
    id: 'tomar-isharay',
    title: 'Tomar Isharay',
    artist: '5th December',
    youtube: 'YOhQNspGAOU',
    note: 'Requested by visitors',
  },
]
