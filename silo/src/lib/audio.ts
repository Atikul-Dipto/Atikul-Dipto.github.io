/**
 * The soundscape, synthesised in the browser.
 *
 * Not a single audio file. Three reasons, in order of how much they mattered:
 *
 *   1. Nothing to download. The site already ships 350 kB of three.js before
 *      anyone sees a frame; a minute of ambience would be another megabyte for
 *      something most visitors will never unmute.
 *   2. It is original by construction. Nothing here is sampled from anything.
 *   3. It can follow the world. A hum that gets heavier as you descend, a
 *      footstep that changes with what you are standing on, and a lift motor
 *      that actually tracks the car are all one line of maths each, and none
 *      of them are possible with a looping file.
 *
 * AUTOPLAY. The context is not created until the visitor asks for sound, which
 * is a click, which is the gesture browsers require. Nothing here runs before
 * then, and `muted` starts true.
 */

import { attachMusic, detachMusic, musicDebug, playMusic } from './music'

interface Engine {
  ctx: AudioContext
  master: GainNode
  /** Steady layers, kept alive for the session. */
  hum: { osc: OscillatorNode[]; gain: GainNode }
  air: { gain: GainNode; filter: BiquadFilterNode }
  motor: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode }
  /** Shared noise source for the impulsive sounds. */
  noise: AudioBuffer
}

let engine: Engine | null = null
let wanted = false
/** The score is on with the sound unless the visitor turns it off. */
let musicWanted = true

/** Dev-only counters, so an audit can assert sounds fired without listening. */
export const audioStats = { footsteps: 0, doors: 0, started: 0 }

/** A couple of seconds of white noise, reused by every impulsive sound. */
function makeNoise(ctx: AudioContext) {
  const len = Math.floor(ctx.sampleRate * 2)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  // Deterministic, so the ambience is the same character every session.
  let s = 1234567
  for (let i = 0; i < len; i++) {
    s = (s * 1664525 + 1013904223) % 4294967296
    d[i] = (s / 2147483648 - 1) * 0.5
  }
  return buf
}

function build(): Engine | null {
  const Ctor: typeof AudioContext | undefined =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined
  if (!Ctor) return null

  const ctx = new Ctor()
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  // --- the hum of a buried structure ------------------------------------
  // Two sines a fraction of a hertz apart, so they swell and fade together
  // about once every three seconds -- a slow breath rather than a drone --
  // with the octave above for warmth. It used to add a slightly sharp fifth
  // that beat against the rest and grated; everything here is consonant now,
  // and quiet: felt more than heard.
  const humGain = ctx.createGain()
  humGain.gain.value = 0.018
  const humFilter = ctx.createBiquadFilter()
  humFilter.type = 'lowpass'
  humFilter.frequency.value = 180
  humGain.connect(humFilter).connect(master)
  const osc = [55, 55.35, 110].map((f) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    o.connect(humGain)
    o.start()
    return o
  })

  // --- air moving through the shaft --------------------------------------
  const airSrc = ctx.createBufferSource()
  const noise = makeNoise(ctx)
  airSrc.buffer = noise
  airSrc.loop = true
  const airFilter = ctx.createBiquadFilter()
  // Low-passed, not band-passed: a soft movement of air, not a hiss.
  airFilter.type = 'lowpass'
  airFilter.frequency.value = 300
  airFilter.Q.value = 0.2
  const airGain = ctx.createGain()
  airGain.gain.value = 0.012
  airSrc.connect(airFilter).connect(airGain).connect(master)
  airSrc.start()

  // Slow drift on the air, so it never sits perfectly still.
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.06
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 70
  lfo.connect(lfoGain).connect(airFilter.frequency)
  lfo.start()

  // --- the lift motor, silent until the car moves ------------------------
  const motorGain = ctx.createGain()
  motorGain.gain.value = 0
  const motorFilter = ctx.createBiquadFilter()
  motorFilter.type = 'lowpass'
  motorFilter.frequency.value = 500
  motorGain.connect(motorFilter).connect(master)
  const motorOsc = ctx.createOscillator()
  // A triangle, not a saw: the motor is there to be noticed, not to buzz.
  motorOsc.type = 'triangle'
  motorOsc.frequency.value = 62
  motorOsc.connect(motorGain)
  motorOsc.start()

  // --- the score, on its own bus with its own hall ----------------------
  attachMusic(ctx, master)

  audioStats.started++
  return {
    ctx,
    master,
    hum: { osc, gain: humGain },
    air: { gain: airGain, filter: airFilter },
    motor: { osc: motorOsc, gain: motorGain, filter: motorFilter },
    noise,
  }
}

/** Create the context on a gesture, or resume one the browser suspended. */
export function enableAudio() {
  wanted = true
  if (!engine) engine = build()
  if (!engine) return
  if (engine.ctx.state === 'suspended') void engine.ctx.resume()
  ramp(engine.master.gain, 0.9, 0.6)
  playMusic(musicWanted)
}

export function disableAudio() {
  wanted = false
  if (!engine) return
  ramp(engine.master.gain, 0, 0.35)
  playMusic(false)
}

/** Music on or off, independently of the rest of the sound. */
export function setMusicWanted(on: boolean) {
  musicWanted = on
  if (engine && wanted) playMusic(on)
}

export const audioReady = () => Boolean(engine) && wanted

function ramp(param: AudioParam, to: number, seconds: number) {
  const ctx = engine?.ctx
  if (!ctx) return
  param.cancelScheduledValues(ctx.currentTime)
  param.setValueAtTime(param.value, ctx.currentTime)
  param.linearRampToValueAtTime(to, ctx.currentTime + seconds)
}

/**
 * How the ambience sits at a given depth.
 *
 * Deeper is heavier: the hum comes up and opens out, the air thins. It is the
 * cheapest possible way to make twelve near-identical decks feel like they are
 * at different depths, and it costs two parameter ramps.
 */
export function setDepth(level: number, levels: number) {
  if (!engine || !wanted) return
  const t = Math.min(1, Math.max(0, (level - 1) / Math.max(1, levels - 1)))
  ramp(engine.hum.gain.gain, 0.018 + t * 0.022, 1.6)
  ramp(engine.air.gain.gain, 0.013 - t * 0.006, 1.6)
  const f = engine.hum.osc[0].frequency
  ramp(f, 55 - t * 7, 1.6)
}

/** The lift motor, while the car is actually travelling. */
export function setLiftRunning(running: boolean) {
  if (!engine || !wanted) return
  ramp(engine.motor.gain.gain, running ? 0.022 : 0, running ? 0.8 : 1.2)
  ramp(engine.motor.filter.frequency, running ? 700 : 500, 0.8)
}

/** One short burst of filtered noise. The building block for everything
 *  percussive here: footsteps, doors, the chime. */
function burst(opts: {
  type: BiquadFilterType
  freq: number
  q: number
  gain: number
  attack: number
  decay: number
  sweepTo?: number
}) {
  if (!engine || !wanted) return
  const { ctx, master, noise } = engine
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true
  // Start at a random point so repeated hits are not identical.
  const offset = Math.random() * (noise.duration - 0.3)
  const filter = ctx.createBiquadFilter()
  filter.type = opts.type
  filter.frequency.value = opts.freq
  filter.Q.value = opts.q
  const g = ctx.createGain()
  const now = ctx.currentTime
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(opts.gain, now + opts.attack)
  g.gain.exponentialRampToValueAtTime(0.0001, now + opts.attack + opts.decay)
  if (opts.sweepTo !== undefined) {
    filter.frequency.setValueAtTime(opts.freq, now)
    filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, now + opts.attack + opts.decay)
  }
  src.connect(filter).connect(g).connect(master)
  src.start(now, offset)
  src.stop(now + opts.attack + opts.decay + 0.05)
}

/**
 * A footfall.
 *
 * `onStair` is not cosmetic: a flight of open steel treads over a 120 m void
 * rings, and a deck plate bedded on a concrete slab thuds. Hearing the change
 * is how you know you have left the floor without looking down.
 */
export function footstep(onStair: boolean, running: boolean) {
  audioStats.footsteps++
  if (!engine || !wanted) return
  const loud = running ? 1.5 : 1
  if (onStair) {
    burst({ type: 'bandpass', freq: 1500, q: 1.4, gain: 0.06 * loud, attack: 0.002, decay: 0.16 })
    burst({ type: 'bandpass', freq: 3100, q: 3, gain: 0.012 * loud, attack: 0.001, decay: 0.22 })
  } else {
    burst({
      type: 'lowpass', freq: 700, q: 0.7, gain: 0.08 * loud,
      attack: 0.003, decay: 0.1, sweepTo: 240,
    })
  }
}

/** Lift doors. */
export function doorSlide(open: boolean) {
  audioStats.doors++
  if (!engine || !wanted) return
  burst({
    type: 'bandpass', freq: open ? 700 : 500, q: 1.1, gain: 0.045,
    attack: 0.04, decay: 0.75, sweepTo: open ? 1500 : 260,
  })
  if (open) chime()
}

/**
 * A heavy door's bolts: a low, dull thump with a little metal in it. The
 * vault door makes it as its bolts draw and as it seats, and the sealed door
 * makes it when tried.
 */
export function vaultClunk() {
  audioStats.doors++
  if (!engine || !wanted) return
  burst({ type: 'lowpass', freq: 420, q: 0.8, gain: 0.07, attack: 0.004, decay: 0.32, sweepTo: 90 })
  burst({ type: 'bandpass', freq: 1100, q: 2.2, gain: 0.012, attack: 0.002, decay: 0.2 })
}

/** Arrival chime. Two notes, a fifth apart, soft. */
function chime() {
  if (!engine || !wanted) return
  const { ctx, master } = engine
  const now = ctx.currentTime
  ;[
    [784, 0],
    [1174.7, 0.11],
  ].forEach(([f, t]) => {
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, now + t)
    g.gain.linearRampToValueAtTime(0.05, now + t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, now + t + 1.1)
    o.connect(g).connect(master)
    o.start(now + t)
    o.stop(now + t + 1.2)
  })
}

/**
 * What the graph is actually doing, for tests.
 *
 * Audio cannot be verified by listening in a headless browser, so everything
 * that matters is readable: whether a context exists, what the browser thinks
 * its state is, and the live value of every gain the world drives. A test can
 * then assert that unmuting opens the master, that descending lifts the hum,
 * and that riding runs the motor.
 */
export function audioDebug() {
  if (!engine) return { built: false, wanted }
  return {
    built: true,
    wanted,
    ctxState: engine.ctx.state,
    master: +engine.master.gain.value.toFixed(4),
    hum: +engine.hum.gain.gain.value.toFixed(4),
    humFreq: +engine.hum.osc[0].frequency.value.toFixed(2),
    air: +engine.air.gain.gain.value.toFixed(4),
    motor: +engine.motor.gain.gain.value.toFixed(4),
    ...musicDebug(),
    ...audioStats,
  }
}

/** Tear everything down. Only used on unmount. */
export function stopAudio() {
  detachMusic()
  if (!engine) return
  void engine.ctx.close()
  engine = null
  wanted = false
}
