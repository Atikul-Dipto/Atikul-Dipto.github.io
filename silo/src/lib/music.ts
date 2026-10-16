/**
 * The score: "Subterranean Ritual", supplied by the site's owner, looped
 * softly under everything else.
 *
 * STREAMED, NOT DECODED. The track is four minutes twenty. Decoded
 * into an AudioBuffer it would hold about 100 MB of memory; played through
 * an <audio> element it streams as it plays and costs nothing up front. The
 * element is not even created until the visitor's first gesture, so nobody
 * downloads a byte of it just to look at the page.
 *
 * The element is routed into the Web Audio graph rather than played on its
 * own, so the score shares the master gain (one mute for everything), can be
 * ducked under the lift's announcement, and can be metered by a test.
 *
 * KEPT BACK. It is meant to be felt, not listened to: a low level, and the
 * top end rolled off so that footsteps, doors and voices -- which live up
 * there -- always sit clearly on top of it.
 */

const SRC = `${import.meta.env.BASE_URL}audio/subterranean-ritual.mp3`

/** The score's level against the rest of the soundscape. Very soft: the
 *  track is mastered loud, and every interaction must be heard above it. */
export const MUSIC_LEVEL = 0.14
const FADE_IN = 4
const FADE_OUT = 1.2

interface Music {
  el: HTMLAudioElement
  /** On / off, faded. */
  bus: GainNode
  /** Pulled down while the lift speaks. */
  duck: GainNode
  /** Taps the score so a test can tell it is really sounding. */
  meter: AnalyserNode
  on: boolean
  pauseTimer: number | null
}

let music: Music | null = null
let ctxRef: AudioContext | null = null

/** Build the score's chain on an existing context, feeding `out`. Silent
 *  until `playMusic(true)`. */
export function attachMusic(ctx: AudioContext, out: AudioNode) {
  if (music || typeof Audio === 'undefined') return
  ctxRef = ctx
  const el = new Audio()
  el.src = SRC
  el.loop = true
  el.preload = 'auto'
  const src = ctx.createMediaElementSource(el)
  // Roll off the top: it is where the effects and the voice live.
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 5200
  tone.Q.value = 0.5
  const bus = ctx.createGain()
  bus.gain.value = 0
  const duck = ctx.createGain()
  duck.gain.value = 1
  src.connect(tone).connect(bus).connect(duck).connect(out)
  const meter = ctx.createAnalyser()
  meter.fftSize = 2048
  duck.connect(meter)
  music = { el, bus, duck, meter, on: false, pauseTimer: null }
}

export function playMusic(on: boolean) {
  const ctx = ctxRef
  const m = music
  if (!m || !ctx) return
  const g = m.bus.gain
  g.cancelScheduledValues(ctx.currentTime)
  g.setValueAtTime(g.value, ctx.currentTime)
  m.on = on
  if (m.pauseTimer !== null) {
    window.clearTimeout(m.pauseTimer)
    m.pauseTimer = null
  }
  if (on) {
    // play() is refused before a gesture, or if the file cannot be fetched.
    // Either way the rest of the sound carries on without it.
    if (m.el.paused) void m.el.play().catch(() => {})
    g.linearRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + FADE_IN)
  } else {
    g.linearRampToValueAtTime(0, ctx.currentTime + FADE_OUT)
    // Pause once the fade is over -- unless it was turned back on meanwhile.
    // Decided by the flag, not by reading the gain back: on a busy machine
    // the audio thread lags and the gain can still read above zero.
    m.pauseTimer = window.setTimeout(() => {
      m.pauseTimer = null
      if (!m.on) m.el.pause()
    }, FADE_OUT * 1000 + 300)
  }
}

/** Pull the score down (for the lift's voice) and let it back up. */
export function duckMusic(down: boolean) {
  const ctx = ctxRef
  if (!music || !ctx) return
  const g = music.duck.gain
  g.cancelScheduledValues(ctx.currentTime)
  g.setValueAtTime(g.value, ctx.currentTime)
  g.linearRampToValueAtTime(down ? 0.35 : 1, ctx.currentTime + (down ? 0.25 : 1.2))
}

export function musicDebug() {
  if (!music) return { music: 0, musicRunning: false, musicTime: 0, musicDuck: 1, musicRms: 0, musicSrc: '' }
  const buf = new Float32Array(music.meter.fftSize)
  music.meter.getFloatTimeDomainData(buf)
  let sum = 0
  for (const v of buf) sum += v * v
  return {
    music: +music.bus.gain.value.toFixed(4),
    musicRunning: !music.el.paused,
    musicTime: +music.el.currentTime.toFixed(2),
    musicLoop: music.el.loop,
    musicDuck: +music.duck.gain.value.toFixed(3),
    musicRms: +Math.sqrt(sum / buf.length).toFixed(5),
    musicSrc: music.el.currentSrc || music.el.src,
  }
}

export function detachMusic() {
  if (music) {
    if (music.pauseTimer !== null) window.clearTimeout(music.pauseTimer)
    music.el.pause()
    music.el.removeAttribute('src')
    music.el.load()
  }
  music = null
  ctxRef = null
}
