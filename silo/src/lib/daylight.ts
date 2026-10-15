import * as THREE from 'three'

/**
 * The time of day outside, as seen through the dome.
 *
 * A full day runs in DAY_SECONDS, starting from the visitor's own clock. Real
 * time was the obvious choice and the wrong one: a visitor arriving at noon
 * would never see the dome go to dusk, and the change of light is the point.
 * Ten minutes is long enough that nobody notices it moving and short enough
 * that anyone who stays a while sees the evening come in.
 *
 * Everything that changes with the hour reads it from here -- the dome glass,
 * the vents, the light falling into the atrium, the view from the cafeteria
 * window -- so they can never disagree about what time it is.
 */
export const DAY_SECONDS = 600

const startPhase = (() => {
  const d = new Date()
  return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400
})()
const t0 = typeof performance !== 'undefined' ? performance.now() : 0
let override: number | null = null

/** 0 is midnight, 0.25 dawn, 0.5 noon, 0.75 dusk. */
export function dayPhase(): number {
  if (override !== null) return override
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  return (startPhase + (now - t0) / 1000 / DAY_SECONDS) % 1
}

/** Pin the hour, for tests and screenshots. `null` lets the clock run again. */
export function setDayPhase(p: number | null) {
  override = p === null ? null : ((p % 1) + 1) % 1
}

interface Key {
  p: number
  sky: string
  horizon: string
  sun: string
  sunI: number
  /** How bright the glass reads, 0..1. */
  glow: number
}

/** The day, as keyframes. Dawn and dusk are short, as they are. */
const KEYS: Key[] = [
  { p: 0.0, sky: '#08122a', horizon: '#18233f', sun: '#5872b0', sunI: 0.35, glow: 0.16 },
  { p: 0.2, sky: '#0a152f', horizon: '#1e2a48', sun: '#5872b0', sunI: 0.35, glow: 0.18 },
  { p: 0.255, sky: '#4f5f8c', horizon: '#ee9566', sun: '#ff9a62', sunI: 1.0, glow: 0.5 },
  { p: 0.32, sky: '#8fb9e2', horizon: '#ead7bf', sun: '#ffe1bb', sunI: 2.2, glow: 0.88 },
  { p: 0.5, sky: '#86b9ea', horizon: '#dbe7f0', sun: '#fff3df', sunI: 2.8, glow: 1.0 },
  { p: 0.68, sky: '#8cb7df', horizon: '#ecd9c1', sun: '#ffe4c0', sunI: 2.3, glow: 0.9 },
  { p: 0.745, sky: '#5d5c8e', horizon: '#ff8a55', sun: '#ff854e', sunI: 1.05, glow: 0.55 },
  { p: 0.8, sky: '#141c3c', horizon: '#2b2c50', sun: '#5872b0', sunI: 0.38, glow: 0.2 },
  { p: 1.0, sky: '#08122a', horizon: '#18233f', sun: '#5872b0', sunI: 0.35, glow: 0.16 },
]

const parsed = KEYS.map((k) => ({
  ...k,
  skyC: new THREE.Color(k.sky),
  horizonC: new THREE.Color(k.horizon),
  sunC: new THREE.Color(k.sun),
}))

export interface Daylight {
  phase: number
  sky: THREE.Color
  horizon: THREE.Color
  sun: THREE.Color
  sunI: number
  glow: number
  /** 1 in full night, 0 in full day: artificial lights come up as this rises. */
  night: number
}

/** One shared result object, so reading the hour every frame allocates nothing. */
const result: Daylight = {
  phase: 0,
  sky: new THREE.Color(),
  horizon: new THREE.Color(),
  sun: new THREE.Color(),
  sunI: 0,
  glow: 0,
  night: 0,
}

const smooth = (t: number) => t * t * (3 - 2 * t)

export function daylight(p = dayPhase()): Daylight {
  let i = 0
  while (i < parsed.length - 2 && p > parsed[i + 1].p) i++
  const a = parsed[i]
  const b = parsed[i + 1]
  const t = smooth(Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p))))
  result.phase = p
  result.sky.copy(a.skyC).lerp(b.skyC, t)
  result.horizon.copy(a.horizonC).lerp(b.horizonC, t)
  result.sun.copy(a.sunC).lerp(b.sunC, t)
  result.sunI = a.sunI + (b.sunI - a.sunI) * t
  result.glow = a.glow + (b.glow - a.glow) * t
  result.night = 1 - Math.min(1, Math.max(0, (result.glow - 0.2) / 0.6))
  return result
}
