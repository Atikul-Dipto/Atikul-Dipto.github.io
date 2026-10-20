import { DECK_OUTER, FLOORS, WALL_THICK, walkY } from './floors'
import { wallFrame, type WallFrame } from './frame'
import { gateHalfAt, type Box, type Gate } from './level1'
import { experience, type ExperienceRecord } from './portfolio'

/**
 * THE CAREERS AND SKILLS FLOORS. The plan.
 *
 * Each floor is an open promenade with three rooms behind the silo wall, each
 * entered through a tall round-topped gate -- the same construction as the
 * sheriff's office on level 1: the room is a box cut into the rock, laid out
 * in its gate's wall frame (`s` across the gate, `d` out through it, d = 0 on
 * the wall's inner face).
 *
 * Careers: one room per posting, newest first going round from the bridge.
 * Only the current posting's room has its lights on; the others are dark but
 * for their screens. Skills: the tools, the analysis, and working with people.
 *
 * Described here once and read twice, by the drawing and by the physics.
 */

export const CAREERS_LEVEL = FLOORS.find((f) => f.kind === 'careers')!.level
export const SKILLS_LEVEL = FLOORS.find((f) => f.kind === 'skills')!.level

/** Every room the same size: 13 m wide, 12 m deep, 5.8 m clear. */
export const ROOM = { from: WALL_THICK, to: 13.5, half: 6.5, height: 5.8, wall: 0.35 }
/** A tall gate with a round head, its foot sunk under the floor so the way
 *  through is flat. */
export const ROOM_GATE: Gate = { halfW: 1.7, halfH: 2.6, radius: 1.7, centre: 1.6 }
export const ROOM_PASS = gateHalfAt(ROOM_GATE, 0.05) - 0.05

export interface RoomTheme {
  /** The room's own colour: trim, screens, the hologram. */
  accent: string
  /** Matte panelling. */
  wall: string
  floor: string
}

export type WallRoomKind = 'posting' | 'tools' | 'analytics' | 'soft'

export interface WallRoom {
  id: string
  level: number
  kind: WallRoomKind
  /** Lit up, or dark but for its screens. */
  lit: boolean
  title: string
  /** A line over the door. */
  sign: string
  theme: RoomTheme
  frame: WallFrame
  /** The posting this room is about, on the careers floor. */
  posting?: ExperienceRecord
}

const POSTING_THEMES: Record<string, RoomTheme> = {
  cartup: { accent: '#3fd8ff', wall: '#1b2430', floor: '#11171f' },
  inspira: { accent: '#a58bff', wall: '#211d2e', floor: '#15121e' },
  arced: { accent: '#ffb04a', wall: '#2a2219', floor: '#1a1510' },
}

const room = (level: number, angle: number, r: Omit<WallRoom, 'level' | 'frame'>): WallRoom => ({
  ...r,
  level,
  frame: wallFrame(angle, walkY(level)),
})

const CAREER_ANGLES = [4.35, 5.45, 6.55]
const SKILL_ANGLES = [4.8, 5.85, 6.9]

export const WALL_ROOMS: WallRoom[] = [
  ...experience.map((e, i) =>
    room(CAREERS_LEVEL, CAREER_ANGLES[i], {
      id: `career-${e.id}`,
      kind: 'posting',
      lit: !e.end,
      title: e.org,
      sign: e.end ? e.org.toUpperCase() : `${e.org.toUpperCase()}  ·  NOW`,
      theme: POSTING_THEMES[e.id] ?? POSTING_THEMES.cartup,
      posting: e,
    }),
  ),
  room(SKILLS_LEVEL, SKILL_ANGLES[0], {
    id: 'skills-tools',
    kind: 'tools',
    lit: true,
    title: 'Tools',
    sign: 'TECH  ·  TOOLS I WORK WITH',
    theme: { accent: '#4c6bff', wall: '#141a33', floor: '#0e1122' },
  }),
  room(SKILLS_LEVEL, SKILL_ANGLES[1], {
    id: 'skills-analytics',
    kind: 'analytics',
    lit: true,
    title: 'Analytics',
    sign: 'ANALYTICS  ·  HOW THE WORK IS DONE',
    theme: { accent: '#ff5fa8', wall: '#2a1824', floor: '#1a1017' },
  }),
  room(SKILLS_LEVEL, SKILL_ANGLES[2], {
    id: 'skills-soft',
    kind: 'soft',
    lit: true,
    title: 'Soft skills',
    sign: 'SOFT SKILLS  ·  WORKING WITH PEOPLE',
    theme: { accent: '#5cf2a8', wall: '#15241e', floor: '#0e1813' },
  }),
]

export const wallRoomsOn = (level: number) => WALL_ROOMS.filter((r) => r.level === level)

/** A room's walls and the passage through the silo wall, for the physics. */
export function wallRoomSolids(r: WallRoom): Box[] {
  const F = r.frame
  const R = ROOM
  const pass = ROOM_PASS
  const top = R.height + 0.3
  return [
    // The silo wall either side of the passage, and the room's front.
    F.box(pass, R.half + R.wall, -0.02, R.from + 0.15, 0, top),
    F.box(-R.half - R.wall, -pass, -0.02, R.from + 0.15, 0, top),
    // Sides and back.
    F.box(R.half, R.half + R.wall, R.from, R.to + R.wall, 0, top),
    F.box(-R.half - R.wall, -R.half, R.from, R.to + R.wall, 0, top),
    F.box(-R.half, R.half, R.to, R.to + R.wall, 0, top),
    // The floor, level with the deck.
    F.box(-R.half - R.wall, R.half + R.wall, -0.3, R.to + R.wall, -0.3, 0),
    // The plinth in the middle of the room.
    F.box(-PLINTH.r, PLINTH.r, PLINTH.d - PLINTH.r, PLINTH.d + PLINTH.r, 0, PLINTH.h),
  ]
}

/** The low round plinth at the centre of each room that its hologram stands on. */
export const PLINTH = { d: 7.6, r: 1.1, h: 0.55 }

export const wallRoomColliders = (level: number) => wallRoomsOn(level).flatMap(wallRoomSolids)

/** The gaps the deck's wall collider leaves, and the wall shader's holes. */
export const wallRoomOpenings = () =>
  WALL_ROOMS.map((r) => ({
    level: r.level,
    angle: r.frame.angle,
    centreY: walkY(r.level) + ROOM_GATE.centre,
    halfW: ROOM_GATE.halfW,
    halfH: ROOM_GATE.halfH,
    radius: ROOM_GATE.radius,
    gap: (ROOM_PASS + 0.04) / DECK_OUTER,
  }))

/** Which room, if any, a point is inside. */
export function wallRoomAt(level: number, x: number, z: number) {
  for (const r of wallRoomsOn(level)) {
    const { s, d } = r.frame.from(x, z)
    if (Math.abs(s) < ROOM.half && d > 0 && d < ROOM.to) return r
  }
  return null
}
