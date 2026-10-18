import { DRONE, GATES, GATE_R, PAD, constrain, padPoint } from '../content/drone'

/**
 * The drone in flight: its state, its controls and one step of its flight.
 *
 * Kept out of React and the store, like the doors -- it changes every frame.
 * The store only hears when a flight starts and how it ended.
 */

export type DroneMode = 'free' | 'race'

export const drone = {
  flying: false,
  mode: 'free' as DroneMode,
  /** Seconds in the air. */
  t: 0,
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: 0,
  pitch: -0.08,
  /** Index of the next gate to fly through, in a race. */
  gate: 0,
  /** Race clock: seconds since the first gate, and the finishing time. */
  raceStart: null as number | null,
  finish: null as number | null,
  bumps: 0,
  /** Set when a bump happened this step, for the sound. */
  bumped: false,
  /** Set when a gate was passed this step. */
  passed: -1,
}

/** Held controls, from the keyboard and the on-screen pad. */
export const controls = { fwd: 0, side: 0, lift: 0, turn: 0, look: 0 }

export function launch(mode: DroneMode) {
  const p = padPoint()
  Object.assign(drone, {
    flying: true,
    mode,
    t: 0,
    x: p.x,
    y: p.y,
    z: p.z,
    vx: 0,
    vy: 0,
    vz: 0,
    // Facing in over the void.
    yaw: Math.atan2(p.x, p.z),
    pitch: -0.08,
    gate: 0,
    raceStart: null,
    finish: null,
    bumps: 0,
    bumped: false,
    passed: -1,
  })
  Object.assign(controls, { fwd: 0, side: 0, lift: 0, turn: 0, look: 0 })
}

const ACCEL = 5
const TURN_RATE = 1.9

/** One step of flight. Returns true while the battery lasts and the race is on. */
export function stepDrone(dt: number) {
  if (!drone.flying) return false
  drone.t += dt
  drone.bumped = false
  drone.passed = -1
  drone.yaw += controls.turn * TURN_RATE * dt
  drone.pitch = Math.max(-1.2, Math.min(0.9, drone.pitch + controls.look * dt))

  // Wanted velocity, in the world, from the controls and the heading.
  const f = controls.fwd
  const s = controls.side
  const sin = Math.sin(drone.yaw)
  const cos = Math.cos(drone.yaw)
  const wx = (s * cos - f * sin) * DRONE.speed
  const wz = (-s * sin - f * cos) * DRONE.speed
  const wy = controls.lift * DRONE.climb
  const k = 1 - Math.exp(-ACCEL * dt)
  drone.vx += (wx - drone.vx) * k
  drone.vz += (wz - drone.vz) * k
  drone.vy += (wy - drone.vy) * k

  const px = drone.x
  const py = drone.y
  const pz = drone.z
  const next = constrain(px + drone.vx * dt, py + drone.vy * dt, pz + drone.vz * dt, py)
  if (next.hit) {
    // Lose most of the speed into whatever it hit.
    drone.vx = (next.x - px) / Math.max(dt, 1e-3) * 0.3
    drone.vy = (next.y - py) / Math.max(dt, 1e-3) * 0.3
    drone.vz = (next.z - pz) / Math.max(dt, 1e-3) * 0.3
    if (Math.hypot(drone.vx, drone.vy, drone.vz) > 0.2 || Math.hypot(wx, wy, wz) > 1) {
      drone.bumped = true
      drone.bumps++
    }
  }
  drone.x = next.x
  drone.y = next.y
  drone.z = next.z

  if (drone.mode === 'race' && drone.gate < GATES.length) {
    const g = GATES[drone.gate]
    // Crossed the gate's plane, inside its ring?
    const before = (px - g.x) * g.nx + (pz - g.z) * g.nz
    const after = (drone.x - g.x) * g.nx + (drone.z - g.z) * g.nz
    if (before < 0 && after >= 0) {
      const lat = Math.hypot(drone.x - g.x - g.nx * after, drone.z - g.z - g.nz * after)
      const up = drone.y - g.y
      if (lat * lat + up * up < GATE_R * GATE_R) {
        if (drone.gate === 0) drone.raceStart = drone.t
        drone.passed = drone.gate
        drone.gate++
        if (drone.gate === GATES.length && drone.raceStart !== null) drone.finish = drone.t - drone.raceStart
      }
    }
  }
  const out = drone.t >= DRONE.battery || drone.finish !== null
  return !out
}

// ---------------------------------------------------------------------------
// The board, kept on this device
// ---------------------------------------------------------------------------

export interface BoardEntry {
  name: string
  time: number
  at: number
}
const BOARD = 'silo.drone.board'

export function readBoard(): BoardEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(BOARD) || '[]')
    return Array.isArray(v) ? v.filter((e) => typeof e?.time === 'number' && typeof e?.name === 'string').slice(0, 10) : []
  } catch {
    return []
  }
}

/** Add a time; returns its place (1-based), or null if it did not make the ten. */
export function addToBoard(name: string, time: number) {
  const clean = name.trim().slice(0, 20) || 'Anonymous'
  const entry = { name: clean, time, at: Date.now() }
  const board = [...readBoard(), entry].sort((a, b) => a.time - b.time).slice(0, 10)
  try {
    localStorage.setItem(BOARD, JSON.stringify(board))
  } catch {
    // Storage blocked: the time shows, but is not kept.
  }
  const i = board.indexOf(entry)
  return i < 0 ? null : i + 1
}

/** The touch screen's climb and descend buttons, held. */
export const droneTouch = { up: false, down: false }
/** The level the drone is flying past, for the HUD. */
export const droneLevel = { current: PAD.level }
