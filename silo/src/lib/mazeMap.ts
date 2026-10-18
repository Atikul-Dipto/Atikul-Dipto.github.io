import { DECK_INNER, SHAFT_RADIUS } from '../content/floors'
import { ARRIVAL, CORRIDORS, ENTRANCES, MAZE, PLAZA_HALF, ROOMS6, ROOM_INFO, mazeHedges, sectorMid, type RoomId } from '../content/level6'

/**
 * The map of the maze, drawn on a canvas: for the board on the plaza, and for
 * the panel it opens, where it also shows where you are.
 *
 * Oriented the way the board stands: the plaza at the top, so that "up" on
 * the map is the way you face reading it, out toward the wall.
 */

export const ROOM_LABEL = Object.fromEntries(Object.entries(ROOM_INFO).map(([k, v]) => [k, v.label])) as Record<RoomId, string>
const ROOM_COLOUR = Object.fromEntries(Object.entries(ROOM_INFO).map(([k, v]) => [k, v.colour])) as Record<RoomId, string>

/** How far out the map reaches: past the rooms behind the wall. */
const EXTENT = 44

export interface MapOptions {
  /** The map's centre and radius on the canvas, in pixels. */
  cx: number
  cy: number
  radius: number
  /** Where the walker is, to mark it. */
  you?: { x: number; z: number; yaw: number } | null
  dark?: boolean
}

/** World X, Z to canvas X, Y. */
export function mapPoint(o: MapOptions, x: number, z: number): [number, number] {
  const r = Math.hypot(x, z)
  const a = Math.atan2(z, x)
  const phi = a - ARRIVAL - Math.PI / 2
  const k = (o.radius / EXTENT) * r
  return [o.cx + Math.cos(phi) * k, o.cy + Math.sin(phi) * k]
}

export function drawMazeMap(g: CanvasRenderingContext2D, o: MapOptions) {
  const k = o.radius / EXTENT
  const ring = (r: number) => r * k
  const angleOnMap = (a: number) => a - ARRIVAL - Math.PI / 2

  // Rock round everything, the silo's floor, the void, the core.
  g.fillStyle = o.dark === false ? '#e9e2d4' : '#120f0c'
  g.beginPath()
  g.arc(o.cx, o.cy, o.radius, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#2b2620'
  g.beginPath()
  g.arc(o.cx, o.cy, ring(SHAFT_RADIUS), 0, Math.PI * 2)
  g.fill()
  // The maze's turf, the plaza's deck.
  g.fillStyle = '#29402a'
  g.beginPath()
  g.arc(o.cx, o.cy, ring(SHAFT_RADIUS), 0, Math.PI * 2)
  g.arc(o.cx, o.cy, ring(MAZE.radii[0]), 0, Math.PI * 2, true)
  g.fill()
  g.fillStyle = '#4a433b'
  g.beginPath()
  g.moveTo(o.cx, o.cy)
  g.arc(o.cx, o.cy, ring(SHAFT_RADIUS), angleOnMap(ARRIVAL - PLAZA_HALF), angleOnMap(ARRIVAL + PLAZA_HALF))
  g.closePath()
  g.fill()
  g.fillStyle = '#0a0807'
  g.beginPath()
  g.arc(o.cx, o.cy, ring(DECK_INNER), 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#5a5249'
  g.beginPath()
  g.arc(o.cx, o.cy, ring(5.3), 0, Math.PI * 2)
  g.fill()

  // The rooms behind the wall, and the corridors joining them.
  g.lineCap = 'round'
  for (const c of CORRIDORS) {
    g.strokeStyle = '#3d362e'
    g.lineWidth = ring(2.5)
    const [ax, ay] = mapPoint(o, c.from[0], c.from[1])
    const [bx, by] = mapPoint(o, c.to[0], c.to[1])
    g.beginPath()
    g.moveTo(ax, ay)
    g.lineTo(bx, by)
    g.stroke()
  }
  for (const r of ROOMS6) {
    const [x, z] = r.frame.to(0, r.centre)
    const [px, py] = mapPoint(o, x, z)
    g.fillStyle = '#3d362e'
    g.beginPath()
    g.arc(px, py, ring(r.radius), 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = ROOM_COLOUR[r.id]
    g.lineWidth = Math.max(1.5, ring(0.25))
    g.stroke()
    // Its tunnel and door.
    const [tx, tz] = r.frame.to(0, 0)
    const [qx, qy] = mapPoint(o, tx, tz)
    g.strokeStyle = '#3d362e'
    g.lineWidth = ring(2.4)
    g.beginPath()
    g.moveTo(qx, qy)
    g.lineTo(px, py)
    g.stroke()
    g.fillStyle = ROOM_COLOUR[r.id]
    g.beginPath()
    g.arc(qx, qy, Math.max(4, ring(1.1)), 0, Math.PI * 2)
    g.fill()
    g.font = `bold ${Math.max(11, Math.round(o.radius / 18))}px "Courier New", monospace`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = ROOM_COLOUR[r.id]
    g.fillText(ROOM_LABEL[r.id].toUpperCase(), px, py)
  }

  // The hedges.
  g.strokeStyle = '#a7c48e'
  g.lineWidth = Math.max(1.4, ring(0.45))
  g.beginPath()
  for (const b of mazeHedges()) {
    const ax = Math.cos(b.rotY) * (b.w / 2)
    const az = -Math.sin(b.rotY) * (b.w / 2)
    const [x0, y0] = mapPoint(o, b.x - ax, b.z - az)
    const [x1, y1] = mapPoint(o, b.x + ax, b.z + az)
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
  }
  g.stroke()

  // The ways in, from the plaza.
  g.fillStyle = '#ffd166'
  for (const j of ENTRANCES) {
    const a = sectorMid(j)
    const [ex, ey] = mapPoint(o, Math.cos(a) * (MAZE.radii[0] - 0.9), Math.sin(a) * (MAZE.radii[0] - 0.9))
    g.beginPath()
    g.arc(ex, ey, Math.max(3, ring(0.6)), 0, Math.PI * 2)
    g.fill()
  }
  // The bridge, landing on the plaza.
  const [b0x, b0y] = mapPoint(o, Math.cos(ARRIVAL) * 5.3, Math.sin(ARRIVAL) * 5.3)
  const [b1x, b1y] = mapPoint(o, Math.cos(ARRIVAL) * DECK_INNER, Math.sin(ARRIVAL) * DECK_INNER)
  g.strokeStyle = '#8a8178'
  g.lineWidth = ring(2.2)
  g.beginPath()
  g.moveTo(b0x, b0y)
  g.lineTo(b1x, b1y)
  g.stroke()

  // You.
  if (o.you) {
    const [yx, yy] = mapPoint(o, o.you.x, o.you.z)
    // Facing: forward is (-sin yaw, -cos yaw) in the world.
    const [fx, fy] = mapPoint(o, o.you.x - Math.sin(o.you.yaw) * 2.2, o.you.z - Math.cos(o.you.yaw) * 2.2)
    g.strokeStyle = '#ff6b5b'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(yx, yy)
    g.lineTo(fx, fy)
    g.stroke()
    g.fillStyle = '#ff6b5b'
    g.beginPath()
    g.arc(yx, yy, Math.max(5, ring(0.7)), 0, Math.PI * 2)
    g.fill()
  }
}
