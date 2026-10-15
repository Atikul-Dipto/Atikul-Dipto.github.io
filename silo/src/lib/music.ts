/**
 * The score: an original, light piece in F major, synthesised in the browser
 * like everything else in the soundscape.
 *
 * Soft on purpose. Every voice is a sine or a triangle -- nothing buzzes --
 * the harmony is open major-seventh and added-ninth chords, and the melody
 * keeps to the five-note F major pentatonic, which cannot clash with any of
 * them. It sits under the footsteps rather than over them. No sample, melody
 * or recording from anywhere else is used.
 *
 * FORM. Eight chords, two bars each, at sixty beats a minute: a little over a
 * minute. It is played four ways in turn -- pads alone; pads and bells; pads,
 * bells and a slow harp-like arpeggio; then the arpeggio alone over thinned
 * pads -- so it runs about four and a half minutes before repeating.
 *
 * SCHEDULING. Notes are queued a little ahead on the audio clock by a timer,
 * the standard Web Audio pattern: the timer only decides what to queue, so its
 * jitter never reaches the sound. A throttled background tab simply skips
 * ahead rather than playing a backlog all at once.
 */

const BPM = 60
const BEAT = 60 / BPM
const BAR = BEAT * 4
const LOOKAHEAD = 1.6
const TICK_MS = 250

/** Equal temperament from a MIDI note number. */
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

// Note numbers. C4 = 60.
const C2 = 36, D2 = 38, F2 = 41, A2 = 45, Bb2 = 46
const F3 = 53, G3 = 55, A3 = 57, C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, C5 = 72
const D5 = 74, F5 = 77, G5 = 79, A5 = 81, C6 = 84, D6 = 86

/** Fmaj9 - Am7 - Dm9 - Bbmaj9 - Fmaj9 - Cadd9 - Dm7 - Csus2. */
const CHORDS: Array<{ bass: number; voices: number[] }> = [
  { bass: F2, voices: [A3, C4, E4, G4] },
  { bass: A2, voices: [G3, C4, E4, A4] },
  { bass: D2, voices: [F3, A3, C4, E4] },
  { bass: Bb2, voices: [A3, D4, F4, C5] },
  { bass: F2, voices: [A3, C4, E4, G4] },
  { bass: C2, voices: [G3, D4, E4, G4] },
  { bass: D2, voices: [F3, A3, C4, F4] },
  { bass: C2, voices: [G3, C4, D4, G4] },
]

/** Bells: [chord, beat within its two bars, note]. All pentatonic. */
const MELODY: Array<[number, number, number]> = [
  [0, 0, A5], [0, 3, C6], [0, 5, G5],
  [1, 1, C6], [1, 4, A5],
  [2, 0, F5], [2, 2, A5], [2, 5, C6],
  [3, 1, A5], [3, 4, F5], [3, 6, G5],
  [4, 0, C6], [4, 3, A5],
  [5, 1, G5], [5, 4, D6],
  [6, 0, F5], [6, 2, A5], [6, 5, C6],
  [7, 1, G5], [7, 4, D5],
]

interface Music {
  bus: GainNode
  /** Taps the bus so a test can tell notes are really sounding. */
  meter: AnalyserNode
  timer: number | null
  /** Whether the score is meant to be playing. */
  on: boolean
  /** Audio-clock time of the next bar to queue. */
  nextBar: number
  /** Bars queued since the start, which fixes the section and the chord. */
  bar: number
}

let music: Music | null = null
let ctxRef: AudioContext | null = null

/** A generated hall: two channels of noise dying away over a few seconds. */
function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  let s = 424242
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) % 4294967296
      d[i] = (s / 2147483648 - 1) * Math.pow(1 - i / len, decay)
    }
  }
  return buf
}

/** A soft pad note: a sine with a quieter, slightly detuned triangle for
 *  warmth, faded in and out over seconds. */
function pad(ctx: AudioContext, out: AudioNode, note: number, t: number, dur: number, level: number, pan: number) {
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 1400
  f.Q.value = 0.2
  const g = ctx.createGain()
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  const attack = 2.6
  const release = 3.6
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(level, t + attack)
  g.gain.setValueAtTime(level, t + dur)
  g.gain.linearRampToValueAtTime(0, t + dur + release)
  f.connect(g).connect(p).connect(out)
  const layers: Array<[OscillatorType, number, number]> = [
    ['sine', 0, 1],
    ['triangle', 5, 0.35],
  ]
  for (const [type, cents, amp] of layers) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = hz(note)
    o.detune.value = cents
    const og = ctx.createGain()
    og.gain.value = amp
    o.connect(og).connect(f)
    o.start(t)
    o.stop(t + dur + release + 0.1)
  }
}

/** A low sine under the chords. */
function bass(ctx: AudioContext, out: AudioNode, note: number, t: number, dur: number, level: number) {
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.value = hz(note)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(level, t + 2)
  g.gain.setValueAtTime(level, t + dur)
  g.gain.linearRampToValueAtTime(0, t + dur + 3)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 3.1)
}

/** A glass bell: a sine with faint upper partials, struck and left to ring. */
function bell(ctx: AudioContext, out: AudioNode, note: number, t: number, level: number, pan: number) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(level, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 4)
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  g.connect(p).connect(out)
  for (const [k, a] of [
    [1, 1],
    [2, 0.1],
    [3.01, 0.03],
  ]) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = hz(note) * k
    const pg = ctx.createGain()
    pg.gain.value = a
    o.connect(pg).connect(g)
    o.start(t)
    o.stop(t + 4.1)
  }
}

/** One note of the arpeggio: a soft plucked triangle, like a harp far off. */
function harp(ctx: AudioContext, out: AudioNode, note: number, t: number, level: number) {
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.value = hz(note)
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 1800
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(level, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
  o.connect(f).connect(g).connect(out)
  o.start(t)
  o.stop(t + 1.9)
}

/** Queue one bar. `bar` counts from the start; it picks the chord and the
 *  section. Each chord lasts two bars. */
function queueBar(ctx: AudioContext, out: AudioNode, bar: number, t: number) {
  const section = Math.floor(bar / 16) % 4
  const i = Math.floor(bar / 2) % 8
  const half = bar % 2
  const chord = CHORDS[i]

  if (half === 0) {
    // Pads across both bars; thinner in the last section.
    const voices = section === 3 ? chord.voices.slice(0, 2) : chord.voices
    voices.forEach((n, k) => pad(ctx, out, n, t, BAR * 2, 0.045, (k / (voices.length - 1 || 1)) * 0.6 - 0.3))
    bass(ctx, out, chord.bass, t, BAR * 2, section === 3 ? 0.06 : 0.1)
  }

  if (section === 1 || section === 2) {
    for (const [c, beat, note] of MELODY) {
      if (c !== i || Math.floor(beat / 4) !== half) continue
      // Sparser the second time: every other note.
      if (section === 2 && beat % 2 === 1) continue
      bell(ctx, out, note, t + (beat % 4) * BEAT, 0.05, ((note % 5) / 4) * 0.5 - 0.25)
    }
  }

  if (section === 2 || section === 3) {
    // Up the chord an octave higher, a note a beat.
    const notes = chord.voices.map((n) => n + 12)
    for (let b = 0; b < 4; b++) harp(ctx, out, notes[(b + half * 2) % notes.length], t + b * BEAT, 0.03)
  }
}

function tick() {
  const ctx = ctxRef
  if (!music || !ctx) return
  const now = ctx.currentTime
  // A throttled tab can come back far behind; start again from now rather
  // than queueing every missed bar at once.
  if (music.nextBar < now - 0.1) music.nextBar = now + 0.1
  while (music.nextBar < now + LOOKAHEAD) {
    queueBar(ctx, music.bus, music.bar, music.nextBar)
    music.nextBar += BAR
    music.bar++
  }
}

/**
 * Build the score's bus on an existing context, feeding `out`. Silent until
 * `playMusic(true)`.
 */
export function attachMusic(ctx: AudioContext, out: AudioNode) {
  if (music) return
  ctxRef = ctx
  const bus = ctx.createGain()
  bus.gain.value = 0
  const dry = ctx.createGain()
  dry.gain.value = 0.55
  const verb = ctx.createConvolver()
  verb.buffer = impulse(ctx, 5, 2.2)
  const wet = ctx.createGain()
  wet.gain.value = 0.6
  bus.connect(dry).connect(out)
  bus.connect(verb).connect(wet).connect(out)
  const meter = ctx.createAnalyser()
  meter.fftSize = 2048
  bus.connect(meter)
  music = { bus, meter, timer: null, on: false, nextBar: 0, bar: 0 }
}

/** The score's loudness against the rest of the soundscape. Soft. */
export const MUSIC_LEVEL = 0.4

export function playMusic(on: boolean) {
  const ctx = ctxRef
  if (!music || !ctx) return
  const g = music.bus.gain
  g.cancelScheduledValues(ctx.currentTime)
  g.setValueAtTime(g.value, ctx.currentTime)
  music.on = on
  if (on) {
    if (music.timer === null) {
      music.nextBar = ctx.currentTime + 0.2
      music.timer = window.setInterval(tick, TICK_MS)
      tick()
    }
    g.linearRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + 6)
  } else {
    g.linearRampToValueAtTime(0, ctx.currentTime + 1.2)
    const m = music
    // Stop queueing once the fade is over -- unless it was turned back on
    // meanwhile. Decided by the flag, not by reading the gain back: on a busy
    // machine the audio thread lags and the gain can still read above zero.
    window.setTimeout(() => {
      if (m.timer !== null && !m.on) {
        window.clearInterval(m.timer)
        m.timer = null
      }
    }, 1500)
  }
}

export function musicDebug() {
  if (!music) return { music: 0, musicRunning: false, bars: 0, musicRms: 0 }
  const buf = new Float32Array(music.meter.fftSize)
  music.meter.getFloatTimeDomainData(buf)
  let sum = 0
  for (const v of buf) sum += v * v
  return {
    music: +music.bus.gain.value.toFixed(4),
    musicRunning: music.timer !== null,
    bars: music.bar,
    musicRms: +Math.sqrt(sum / buf.length).toFixed(5),
  }
}

export function detachMusic() {
  if (music?.timer != null) window.clearInterval(music.timer)
  music = null
  ctxRef = null
}
