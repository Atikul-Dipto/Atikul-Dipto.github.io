import { SONGS, type Song } from '../content/songs'
import { jukebox, onJukebox, stop as stopTape } from './jukebox'
import { holdMusic } from './music'
import { LEVEL as REC_LEVEL } from '../content/level6'
import { useSilo } from '../state/useSilo'

/**
 * The sound box in the music hall. A song plays through YouTube's official
 * embedded player -- loaded only the first time one is played -- shown while
 * it plays as a small window in the corner of the screen, as YouTube asks.
 * Its volume follows how near the visitor stands to the box, and it pauses
 * off the recreation level. While it plays the silo's score is held, and a
 * tape in the gramophone stops it (or it stops the tape).
 */

interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  loadVideoById(id: string): void
  setVolume(v: number): void
  mute(): void
  unMute(): void
  destroy(): void
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number }
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

export const soundbox = {
  current: null as Song | null,
  /** Wanted playing (the visitor pressed play and has not stopped it). */
  on: false,
  /** Actually sounding right now (on the level, and YouTube says playing). */
  playing: false,
  /** 0..1, set each frame by the music hall from the visitor's distance. */
  proximity: 0,
  /** Whether the visitor is on the recreation level. */
  here: false,
  muted: false,
  error: null as string | null,
}

const listeners = new Set<() => void>()
export function onSoundbox(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const notify = () => listeners.forEach((f) => f())

let api: Promise<YTNamespace> | null = null
function loadApi() {
  api ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      if (window.YT) resolve(window.YT)
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => reject(new Error('YouTube could not be reached'))
    document.head.appendChild(s)
  })
  return api
}

let player: YTPlayer | null = null
/** The player object exists before YouTube has wired it up; it takes no
 *  commands until its ready event. */
let ready = false
let box: HTMLDivElement | null = null
let lastVolume = -1

/** The corner window the player lives in. */
function container() {
  if (box) return box
  box = document.createElement('div')
  box.className = 'soundbox-player'
  box.setAttribute('aria-label', 'Now playing in the music hall')
  const slot = document.createElement('div')
  slot.className = 'soundbox-player__video'
  box.appendChild(slot)
  const bar = document.createElement('div')
  bar.className = 'soundbox-player__bar'
  box.appendChild(bar)
  const stopBtn = document.createElement('button')
  stopBtn.type = 'button'
  stopBtn.textContent = 'Stop'
  stopBtn.addEventListener('click', () => stopSong())
  bar.appendChild(document.createElement('span'))
  bar.appendChild(stopBtn)
  document.body.appendChild(box)
  return box
}

function showBox(show: boolean) {
  const b = container()
  b.classList.toggle('is-on', show)
  const label = b.querySelector('.soundbox-player__bar span')
  if (label && soundbox.current) label.textContent = `${soundbox.current.title} · ${soundbox.current.artist}`
}

export async function playSong(id: string) {
  const song = SONGS.find((s) => s.id === id)
  if (!song) return
  if (jukebox.playing) stopTape()
  soundbox.current = song
  soundbox.on = true
  soundbox.error = null
  holdMusic(true)
  showBox(true)
  notify()
  try {
    const YT = await loadApi()
    if (!soundbox.on || soundbox.current !== song) return
    if (player) {
      // Not ready yet: its ready event plays whatever is current.
      if (ready) player.loadVideoById(song.youtube)
    } else {
      const slot = container().querySelector('.soundbox-player__video') as HTMLElement
      const el = document.createElement('div')
      slot.appendChild(el)
      player = new YT.Player(el, {
        width: 320,
        height: 180,
        videoId: song.youtube,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
        events: {
          onReady: () => {
            ready = true
            lastVolume = -1
            applyVolume()
            if (soundbox.on && soundbox.current && soundbox.current.youtube !== song.youtube) player?.loadVideoById(soundbox.current.youtube)
            else if (soundbox.on && soundbox.here) player?.playVideo()
          },
          onStateChange: (e: { data: number }) => {
            soundbox.playing = e.data === YT.PlayerState.PLAYING
            if (e.data === YT.PlayerState.ENDED) stopSong()
            notify()
          },
          onError: () => {
            soundbox.error = 'This song could not be played here.'
            stopSong()
          },
        },
      })
    }
  } catch {
    soundbox.error = 'YouTube could not be reached just now.'
    stopSong()
  }
}

export function stopSong() {
  const was = soundbox.on
  soundbox.on = false
  soundbox.playing = false
  if (ready) player?.stopVideo()
  showBox(false)
  // Not if a tape has just taken over: it holds the score itself.
  if (was && !jukebox.playing) holdMusic(false)
  notify()
}

function applyVolume() {
  if (!player || !ready) return
  const v = soundbox.muted || !soundbox.here ? 0 : Math.round(100 * soundbox.proximity)
  if (Math.abs(v - lastVolume) < 2) return
  lastVolume = v
  player.setVolume(v)
}

/**
 * Called by the music hall every few frames: how near the visitor is, and
 * whether they are on the level at all. Off the level the song pauses, and
 * picks up again on coming back.
 */
export function setSoundboxPlace(proximity: number, here: boolean, muted: boolean) {
  soundbox.proximity = proximity
  soundbox.muted = muted
  if (here !== soundbox.here) {
    soundbox.here = here
    if (soundbox.on && player && ready) {
      if (here) player.playVideo()
      else player.pauseVideo()
    }
    showBox(soundbox.on && here)
  }
  applyVolume()
}

// A tape going into the gramophone stops the sound box.
onJukebox(() => {
  if (jukebox.playing && soundbox.on) stopSong()
})

// Off the recreation level -- or off foot, or flying the drone -- the song
// pauses, whatever the music hall last said: the hall is not drawn from other
// floors, so it cannot say anything.
useSilo.subscribe((st) => {
  const here = st.level === REC_LEVEL && st.mode === 'walk' && !st.droneFlying
  if (!here && soundbox.here) setSoundboxPlace(0, false, st.muted)
})
