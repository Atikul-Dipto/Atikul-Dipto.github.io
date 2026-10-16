import { CASSETTES, type Cassette } from '../content/cassettes'
import { audioGraph, cassetteClick } from './audio'
import { holdMusic } from './music'
import { startSynthScore } from './synthScore'

/**
 * The gramophone in the recreation chamber.
 *
 * A cassette taken from the closet plays through it: through its own chain
 * into the master bus, so the Sound control mutes it like everything else,
 * coloured like an old horn -- the lows and the top rolled off, a little
 * crackle under it -- and louder the nearer you stand. While it plays, the
 * silo's score is held, so two pieces never play over each other.
 */

interface Chain {
  ctx: AudioContext
  /** Distance and volume. */
  level: GainNode
  input: GainNode
  crackle: AudioBufferSourceNode
}

export const jukebox = {
  playing: false,
  /** The cassette in the slot, or null. */
  current: null as Cassette | null,
  /** 0..1, set by the chamber each frame from how near the visitor is. */
  proximity: 1,
}

let chain: Chain | null = null
let stopCurrent: (() => void) | null = null
const elements = new Map<string, { el: HTMLAudioElement; node: MediaElementAudioSourceNode }>()
const listeners = new Set<() => void>()

export function onJukebox(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const notify = () => listeners.forEach((f) => f())

/** Sparse clicks and a faint hiss: the sound of a needle in a groove. */
function crackleBuffer(ctx: AudioContext) {
  const len = ctx.sampleRate * 3
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let s = 777
  const r = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
  for (let i = 0; i < len; i++) {
    d[i] = (r() - 0.5) * 0.04
    if (r() < 0.0009) d[i] += (r() - 0.5) * 1.6
  }
  return buf
}

function buildChain(): Chain | null {
  const g = audioGraph()
  if (!g) return null
  if (chain && chain.ctx === g.ctx) return chain
  const { ctx, master } = g
  const input = ctx.createGain()
  const low = ctx.createBiquadFilter()
  low.type = 'highpass'
  low.frequency.value = 140
  const high = ctx.createBiquadFilter()
  high.type = 'lowpass'
  high.frequency.value = 6500
  const body = ctx.createBiquadFilter()
  body.type = 'peaking'
  body.frequency.value = 1400
  body.gain.value = 3
  const level = ctx.createGain()
  level.gain.value = 0
  input.connect(low).connect(high).connect(body).connect(level).connect(master)
  const crackle = ctx.createBufferSource()
  crackle.buffer = crackleBuffer(ctx)
  crackle.loop = true
  const crackleGain = ctx.createGain()
  crackleGain.gain.value = 0.05
  crackle.connect(crackleGain).connect(level)
  crackle.start()
  chain = { ctx, level, input, crackle }
  return chain
}

/** How loud the gramophone is at full proximity, against the rest. */
const GRAMOPHONE_LEVEL = 0.55

/** Put a cassette in and play it. */
export function play(id: string) {
  const tape = CASSETTES.find((c) => c.id === id)
  if (!tape) return false
  stop(false)
  const c = buildChain()
  jukebox.current = tape
  jukebox.playing = true
  cassetteClick(true)
  notify()
  if (!c) return true // Sound is off: the tape is in, silently.
  holdMusic(true)
  if (tape.src) {
    let e = elements.get(tape.id)
    if (!e) {
      const el = new Audio()
      el.src = `${import.meta.env.BASE_URL}${tape.src}`
      el.loop = true
      el.preload = 'auto'
      e = { el, node: c.ctx.createMediaElementSource(el) }
      elements.set(tape.id, e)
    }
    const { el, node } = e
    node.connect(c.input)
    el.currentTime = 0
    void el.play().catch(() => {})
    stopCurrent = () => {
      el.pause()
      node.disconnect()
    }
  } else if (tape.synth === 'pentatonic-hall') {
    const end = startSynthScore(c.ctx, c.input)
    stopCurrent = end
  }
  setLevel()
  return true
}

/** Take the cassette out. */
export function stop(click = true) {
  if (stopCurrent) stopCurrent()
  stopCurrent = null
  const was = jukebox.playing
  jukebox.playing = false
  jukebox.current = null
  if (chain) chain.level.gain.setTargetAtTime(0, chain.ctx.currentTime, 0.1)
  if (was) {
    if (click) cassetteClick(false)
    holdMusic(false)
    notify()
  }
}

/** Follow the visitor's distance from the horn. */
export function setLevel(proximity = jukebox.proximity) {
  jukebox.proximity = proximity
  if (!chain || !jukebox.playing) return
  chain.level.gain.setTargetAtTime(GRAMOPHONE_LEVEL * proximity, chain.ctx.currentTime, 0.25)
}

/** For tests: is a recorded tape really playing? */
export function jukeboxDebug() {
  const e = jukebox.current?.src ? elements.get(jukebox.current.id) : null
  return {
    playing: jukebox.playing,
    current: jukebox.current?.id ?? null,
    proximity: +jukebox.proximity.toFixed(3),
    level: chain ? +chain.level.gain.value.toFixed(3) : 0,
    elementPlaying: e ? !e.el.paused : null,
    elementTime: e ? +e.el.currentTime.toFixed(2) : null,
  }
}
