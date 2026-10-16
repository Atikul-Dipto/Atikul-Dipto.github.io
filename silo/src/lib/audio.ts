/**
 * The soundscape.
 *
 * Two kinds of sound, mixed so that one never covers the other:
 *
 *   - BEHIND: the score (see music.ts), a recorded track looped very softly,
 *     and under it a synthesised hum and the movement of air in the shaft,
 *     both of which follow the visitor's depth.
 *   - IN FRONT: everything the visitor does. Footsteps, the lift's doors,
 *     motor, buttons and voice, the vault's wheel, bolts and hinge, the
 *     terminal, the sealed door. Each has a sound of its own, and every one
 *     of them is synthesised here from noise and oscillators -- nothing is
 *     sampled -- so they cost nothing to download and can follow the world:
 *     a footstep that changes with what you stand on, a hinge that groans
 *     only while the door is actually moving.
 *
 * The lift's announcement is the browser's own speech synthesis, so the
 * voice is whichever English voice the visitor's system provides.
 *
 * AUTOPLAY. The context is not created until the visitor's first gesture,
 * which browsers require before they will play anything. Nothing here runs
 * before then, and `muted` starts true.
 */

import { attachMusic, detachMusic, duckMusic, musicDebug, playMusic } from './music'

interface Engine {
  ctx: AudioContext
  master: GainNode
  /** Everything the visitor causes, on its own bus above the ambience. */
  fx: GainNode
  /** Steady layers, kept alive for the session. */
  hum: { osc: OscillatorNode[]; gain: GainNode }
  air: { gain: GainNode; filter: BiquadFilterNode }
  motor: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode }
  /** The vault door's hinge, silent until the door moves. */
  grind: { gain: GainNode; groan: OscillatorNode }
  /** Shared noise source for the impulsive sounds. */
  noise: AudioBuffer
}

let engine: Engine | null = null
let wanted = false
/** The score is on with the sound unless the visitor turns it off. */
let musicWanted = true

/** Dev-only counters, so an audit can assert sounds fired without listening. */
export const audioStats = {
  footsteps: 0,
  doors: 0,
  started: 0,
  /** Each named interaction sound, and how many times it has played. */
  played: {} as Record<string, number>,
  /** What the lift last said, and how many times it has spoken. */
  announced: '',
  announcements: 0,
}

const count = (name: string) => {
  audioStats.played[name] = (audioStats.played[name] ?? 0) + 1
}

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
  // A gentle limiter on the way out, so a door and a footstep landing on the
  // same instant can never clip.
  const limit = ctx.createDynamicsCompressor()
  limit.threshold.value = -6
  limit.knee.value = 6
  limit.ratio.value = 8
  limit.attack.value = 0.003
  limit.release.value = 0.2
  master.connect(limit).connect(ctx.destination)

  const fx = ctx.createGain()
  fx.gain.value = 1
  fx.connect(master)

  // --- the hum of a buried structure ------------------------------------
  // Two sines a fraction of a hertz apart, so they swell and fade together
  // about once every three seconds -- a slow breath rather than a drone --
  // with the octave above for warmth. Quiet: felt more than heard.
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
  motorGain.connect(motorFilter).connect(fx)
  const motorOsc = ctx.createOscillator()
  // A triangle, not a saw: the motor is there to be noticed, not to buzz.
  motorOsc.type = 'triangle'
  motorOsc.frequency.value = 62
  motorOsc.connect(motorGain)
  motorOsc.start()

  // --- the vault hinge, silent until the door swings ---------------------
  // Steel dragging on steel under tons of load: low band-passed noise for
  // the scrape, and a low sawtooth that wanders in pitch for the groan.
  const grindGain = ctx.createGain()
  grindGain.gain.value = 0
  grindGain.connect(fx)
  const scrapeSrc = ctx.createBufferSource()
  scrapeSrc.buffer = noise
  scrapeSrc.loop = true
  const scrape = ctx.createBiquadFilter()
  scrape.type = 'bandpass'
  scrape.frequency.value = 210
  scrape.Q.value = 2.2
  const scrapeGain = ctx.createGain()
  scrapeGain.gain.value = 1.4
  scrapeSrc.connect(scrape).connect(scrapeGain).connect(grindGain)
  scrapeSrc.start()
  const groan = ctx.createOscillator()
  groan.type = 'sawtooth'
  groan.frequency.value = 41
  const groanFilter = ctx.createBiquadFilter()
  groanFilter.type = 'lowpass'
  groanFilter.frequency.value = 240
  const groanGain = ctx.createGain()
  groanGain.gain.value = 0.35
  groan.connect(groanFilter).connect(groanGain).connect(grindGain)
  groan.start()
  const wander = ctx.createOscillator()
  wander.frequency.value = 0.7
  const wanderGain = ctx.createGain()
  wanderGain.gain.value = 60 // cents
  wander.connect(wanderGain).connect(groan.detune)
  wander.start()

  // --- the score, on its own chain -----------------------------------------
  attachMusic(ctx, master)

  audioStats.started++
  return {
    ctx,
    master,
    fx,
    hum: { osc, gain: humGain },
    air: { gain: airGain, filter: airFilter },
    motor: { osc: motorOsc, gain: motorGain, filter: motorFilter },
    grind: { gain: grindGain, groan },
    noise,
  }
}

/**
 * Create the context, or resume one the browser suspended. Call it from
 * inside a gesture's handler: Safari only allows sound to start there.
 */
export function enableAudio() {
  wanted = true
  if (!engine) engine = build()
  if (!engine) return
  if (engine.ctx.state === 'suspended') void engine.ctx.resume()
  ramp(engine.master.gain, 0.9, 0.6)
  playMusic(musicWanted)
  primeVoice()
}

export function disableAudio() {
  wanted = false
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
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
  ramp(engine.motor.gain.gain, running ? 0.05 : 0, running ? 0.8 : 1.2)
  ramp(engine.motor.filter.frequency, running ? 700 : 500, 0.8)
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** One short burst of filtered noise: the basis of every knock, step,
 *  scrape and click here. */
function burst(opts: {
  type: BiquadFilterType
  freq: number
  q: number
  gain: number
  attack: number
  decay: number
  sweepTo?: number
  delay?: number
}) {
  if (!engine || !wanted) return
  const { ctx, fx, noise } = engine
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
  const now = ctx.currentTime + (opts.delay ?? 0)
  const end = now + opts.attack + opts.decay
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(opts.gain, now + opts.attack)
  g.gain.exponentialRampToValueAtTime(0.0001, end)
  if (opts.sweepTo !== undefined) {
    filter.frequency.setValueAtTime(opts.freq, now)
    filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, end)
  }
  src.connect(filter).connect(g).connect(fx)
  src.start(now, offset)
  src.stop(end + 0.05)
}

/** One pitched note with a quick attack and a decay, optionally gliding. */
function tone(opts: {
  type: OscillatorType
  freq: number
  gain: number
  attack: number
  decay: number
  to?: number
  delay?: number
  /** Low-pass the note, to take the edge off square and saw waves. */
  soften?: number
}) {
  if (!engine || !wanted) return
  const { ctx, fx } = engine
  const now = ctx.currentTime + (opts.delay ?? 0)
  const end = now + opts.attack + opts.decay
  const o = ctx.createOscillator()
  o.type = opts.type
  o.frequency.setValueAtTime(opts.freq, now)
  if (opts.to !== undefined) o.frequency.exponentialRampToValueAtTime(opts.to, end)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(opts.gain, now + opts.attack)
  g.gain.exponentialRampToValueAtTime(0.0001, end)
  let head: AudioNode = o
  if (opts.soften) {
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = opts.soften
    head = o.connect(f)
  }
  head.connect(g).connect(fx)
  o.start(now)
  o.stop(end + 0.05)
}

const jitter = (v: number, by = 0.12) => v * (1 + (Math.random() * 2 - 1) * by)

// ---------------------------------------------------------------------------
// The visitor's own body
// ---------------------------------------------------------------------------

/**
 * A footfall.
 *
 * `onStair` is not cosmetic: a flight of open steel treads over a 120 m void
 * rings, and a deck plate bedded on a concrete slab thuds. Hearing the change
 * is how you know you have left the floor without looking down. Each step is
 * a heel strike (the weight), the click of the sole on steel (what makes it
 * carry on small speakers), and a little scuff after.
 */
export function footstep(onStair: boolean, running: boolean) {
  audioStats.footsteps++
  if (!engine || !wanted) return
  const loud = (running ? 1.3 : 1) * jitter(1, 0.15)
  if (onStair) {
    burst({ type: 'lowpass', freq: 600, q: 0.7, gain: 0.2 * loud, attack: 0.002, decay: 0.08, sweepTo: 180 })
    burst({ type: 'bandpass', freq: jitter(1500, 0.06), q: 1.6, gain: 0.16 * loud, attack: 0.001, decay: 0.14 })
    // The tread rings on after the foot has gone.
    tone({ type: 'sine', freq: jitter(1180, 0.04), gain: 0.025 * loud, attack: 0.002, decay: 0.45 })
  } else {
    burst({ type: 'lowpass', freq: 900, q: 0.7, gain: 0.26 * loud, attack: 0.002, decay: 0.09, sweepTo: 200 })
    burst({ type: 'bandpass', freq: jitter(2600, 0.1), q: 1.8, gain: 0.09 * loud, attack: 0.001, decay: 0.035 })
    burst({ type: 'bandpass', freq: 4200, q: 0.8, gain: 0.02 * loud, attack: 0.012, decay: 0.07, delay: 0.035 })
  }
}

/** Any button in the interface: a small, dry tick. */
export function uiClick() {
  if (!engine || !wanted) return
  count('ui')
  burst({ type: 'bandpass', freq: 3200, q: 2.5, gain: 0.05, attack: 0.001, decay: 0.025 })
}

// ---------------------------------------------------------------------------
// The lift
// ---------------------------------------------------------------------------

/** Lift doors: a pneumatic slide, and a soft bump as they meet or part. */
export function doorSlide(open: boolean) {
  audioStats.doors++
  if (!engine || !wanted) return
  count(open ? 'lift-doors-open' : 'lift-doors-close')
  burst({
    type: 'bandpass', freq: open ? 700 : 520, q: 1.1, gain: 0.12,
    attack: 0.05, decay: 0.8, sweepTo: open ? 1500 : 260,
  })
  burst({ type: 'highpass', freq: 3500, q: 0.5, gain: 0.025, attack: 0.02, decay: 0.3 })
  burst({ type: 'lowpass', freq: 300, q: 0.7, gain: 0.14, attack: 0.003, decay: 0.12, delay: 0.82 })
  if (open) chime()
}

/** The landing's call button: a press, and an answering tone. */
export function liftCallButton() {
  if (!engine || !wanted) return
  count('lift-call')
  burst({ type: 'bandpass', freq: 2400, q: 2, gain: 0.1, attack: 0.001, decay: 0.03 })
  tone({ type: 'sine', freq: 988, gain: 0.08, attack: 0.005, decay: 0.35, delay: 0.05 })
}

/** The car's control panel coming up, and going away. */
export function panelOpen(open: boolean) {
  if (!engine || !wanted) return
  count(open ? 'panel-open' : 'panel-close')
  const [a, b] = open ? [660, 990] : [990, 660]
  tone({ type: 'triangle', freq: a, gain: 0.06, attack: 0.004, decay: 0.12 })
  tone({ type: 'triangle', freq: b, gain: 0.06, attack: 0.004, decay: 0.18, delay: 0.08 })
}

/** A floor chosen: the button, and the panel's acknowledgement. */
export function levelSelect() {
  if (!engine || !wanted) return
  count('level-select')
  burst({ type: 'bandpass', freq: 2000, q: 2, gain: 0.1, attack: 0.001, decay: 0.03 })
  tone({ type: 'sine', freq: 1046.5, gain: 0.07, attack: 0.004, decay: 0.16, delay: 0.04 })
  tone({ type: 'sine', freq: 1568, gain: 0.06, attack: 0.004, decay: 0.3, delay: 0.16 })
}

/** The brake letting go as the car sets off, or catching as it arrives. */
export function liftJolt(starting: boolean) {
  if (!engine || !wanted) return
  count(starting ? 'lift-start' : 'lift-stop')
  burst({ type: 'lowpass', freq: 380, q: 0.9, gain: 0.2, attack: 0.004, decay: 0.25, sweepTo: 90 })
  burst({ type: 'bandpass', freq: 1700, q: 3, gain: 0.04, attack: 0.002, decay: 0.08, delay: 0.02 })
  if (starting) tone({ type: 'sawtooth', freq: 70, to: 140, gain: 0.03, attack: 0.15, decay: 0.9, soften: 400 })
}

/** Arrival chime. Two notes, a fifth apart, soft. */
function chime() {
  if (!engine || !wanted) return
  tone({ type: 'triangle', freq: 784, gain: 0.07, attack: 0.01, decay: 1.1 })
  tone({ type: 'triangle', freq: 1174.7, gain: 0.07, attack: 0.01, decay: 1.1, delay: 0.11 })
}

let voicePrimed = false
/** Some browsers (iOS Safari) only let speech start from inside a gesture,
 *  and after that from anywhere. Speak nothing once, from the gesture. */
function primeVoice() {
  if (voicePrimed || typeof speechSynthesis === 'undefined') return
  voicePrimed = true
  try {
    speechSynthesis.getVoices()
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    speechSynthesis.speak(u)
  } catch {
    // No voice on this system; the lift simply stays quiet.
  }
}

/** A calm English voice, if the system has one. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang))
  if (!voices.length) return null
  const prefer = [/Google UK English Female/i, /Sonia|Libby|Aria|Jenny/i, /Samantha|Serena|Karen/i, /en-GB/i]
  for (const re of prefer) {
    const v = voices.find((x) => re.test(x.name) || re.test(x.lang))
    if (v) return v
  }
  return voices.find((v) => v.localService) ?? voices[0]
}

/**
 * The lift says where it has arrived. The score dips under the voice and
 * comes back after it.
 */
export function announce(text: string) {
  if (!engine || !wanted || typeof speechSynthesis === 'undefined') return
  audioStats.announced = text
  audioStats.announcements++
  try {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const v = pickVoice()
    if (v) u.voice = v
    u.lang = v?.lang ?? 'en-GB'
    u.rate = 0.92
    u.pitch = 0.95
    u.volume = 1
    let done = false
    const restore = () => {
      if (done) return
      done = true
      duckMusic(false)
    }
    u.onend = restore
    u.onerror = restore
    // In case neither ever fires (some systems drop them).
    window.setTimeout(restore, 6000)
    duckMusic(true)
    speechSynthesis.speak(u)
  } catch {
    duckMusic(false)
  }
}

// ---------------------------------------------------------------------------
// The vault
// ---------------------------------------------------------------------------

/** The lever thrown to open or shut the vault door. */
export function vaultLever() {
  if (!engine || !wanted) return
  count('vault-lever')
  burst({ type: 'bandpass', freq: 1800, q: 2.5, gain: 0.12, attack: 0.001, decay: 0.05 })
  burst({ type: 'lowpass', freq: 500, q: 0.8, gain: 0.14, attack: 0.003, decay: 0.12, sweepTo: 120, delay: 0.06 })
}

/** One click of the wheel's ratchet as it turns. */
export function wheelTick() {
  if (!engine || !wanted) return
  count('vault-wheel')
  burst({ type: 'bandpass', freq: jitter(2300, 0.08), q: 3.5, gain: 0.07, attack: 0.001, decay: 0.03 })
  burst({ type: 'lowpass', freq: 260, q: 0.7, gain: 0.05, attack: 0.002, decay: 0.05 })
}

/**
 * A heavy door's bolts: a low, dull thump with a little metal in it. The
 * vault door makes it as its bolts draw and as it seats.
 */
export function vaultClunk() {
  audioStats.doors++
  if (!engine || !wanted) return
  count('vault-bolts')
  burst({ type: 'lowpass', freq: 420, q: 0.8, gain: 0.28, attack: 0.004, decay: 0.36, sweepTo: 80 })
  burst({ type: 'bandpass', freq: 1100, q: 2.2, gain: 0.05, attack: 0.002, decay: 0.22 })
  tone({ type: 'sine', freq: 62, gain: 0.12, attack: 0.004, decay: 0.4 })
}

/** The door reaching the end of its swing: a dead stop against the hinge. */
export function vaultStop() {
  if (!engine || !wanted) return
  count('vault-stop')
  burst({ type: 'lowpass', freq: 300, q: 0.8, gain: 0.2, attack: 0.004, decay: 0.3, sweepTo: 70 })
}

let lastGrind = 0
/** How hard the hinge is working, 0 to 1. Called every frame by the door. */
export function setVaultGrind(level: number) {
  if (!engine) return
  const target = wanted ? Math.max(0, Math.min(1, level)) * 0.11 : 0
  const g = engine.grind.gain.gain
  // Only touch the parameter when the target really changes: rescheduling a
  // ramp every frame would keep restarting it.
  if (Math.abs(lastGrind - target) < 1e-4) return
  lastGrind = target
  if (target > 0) count('vault-hinge')
  ramp(g, target, target > 0 ? 0.12 : 0.25)
}

let lastWarn = -Infinity
/**
 * The door will not swing through the visitor: a short warning buzz. Once,
 * not every time it catches up with them: as they back away the door creeps
 * after them and is held again and again, and a buzz each time nags.
 */
export function doorWarn() {
  if (!engine || !wanted) return
  const now = engine.ctx.currentTime
  if (now - lastWarn < 2.5) return
  lastWarn = now
  count('vault-blocked')
  tone({ type: 'square', freq: 220, gain: 0.05, attack: 0.005, decay: 0.14, soften: 1200 })
  tone({ type: 'square', freq: 220, gain: 0.05, attack: 0.005, decay: 0.14, soften: 1200, delay: 0.2 })
}

/** The sealed door, tried: two hollow knocks on a ton of steel, and the
 *  lock's refusal. */
export function sealedKnock() {
  audioStats.doors++
  if (!engine || !wanted) return
  count('sealed')
  for (const d of [0, 0.24]) {
    burst({ type: 'lowpass', freq: 650, q: 0.8, gain: 0.26, attack: 0.002, decay: 0.16, sweepTo: 150, delay: d })
    tone({ type: 'sine', freq: 310, gain: 0.05, attack: 0.002, decay: 0.45, delay: d })
  }
  tone({ type: 'square', freq: 147, gain: 0.04, attack: 0.01, decay: 0.4, soften: 900, delay: 0.62 })
}

/** The personnel terminal waking, and going back to sleep. */
export function terminal(open: boolean) {
  if (!engine || !wanted) return
  count(open ? 'record-open' : 'record-close')
  burst({ type: 'bandpass', freq: 3000, q: 2, gain: 0.07, attack: 0.001, decay: 0.02 })
  const notes = open ? [1200, 1600, 2000] : [1600, 1000]
  notes.forEach((f, i) =>
    tone({ type: 'square', freq: f, gain: 0.03, attack: 0.002, decay: 0.06, soften: 2600, delay: 0.05 + i * 0.07 }),
  )
}

/** The floor's record panel sliding in or out. */
export function panelSwish(open: boolean) {
  if (!engine || !wanted) return
  count(open ? 'floor-record-open' : 'floor-record-close')
  burst({
    type: 'bandpass', freq: open ? 1400 : 2600, q: 0.9, gain: 0.05,
    attack: 0.05, decay: 0.22, sweepTo: open ? 2800 : 1200,
  })
}

/**
 * What the graph is actually doing, for tests.
 *
 * Audio cannot be verified by listening in a headless browser, so everything
 * that matters is readable: whether a context exists, what the browser thinks
 * its state is, and the live value of every gain the world drives.
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
    grind: +engine.grind.gain.gain.value.toFixed(4),
    ...musicDebug(),
    ...audioStats,
    played: { ...audioStats.played },
  }
}

/** Tear everything down. Only used on unmount. */
export function stopAudio() {
  detachMusic()
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  if (!engine) return
  void engine.ctx.close()
  engine = null
  wanted = false
  lastGrind = 0
}
