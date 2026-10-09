import { certifications, education, experience, methods, projects, skillSystems } from './portfolio'

/**
 * Geometry of the structure. Everything — stairs, decks, the camera rig, the
 * mini-silo overview — derives from these, so the whole silo stays vertically
 * aligned when any one of them changes (spec §4).
 */
export const SHAFT_RADIUS = 13
export const FLOOR_HEIGHT = 11
/** Opening in each deck that the elevator and stair run through. */
export const DECK_INNER = 5.4
export const DECK_DROP = 1.9
export const ELEVATOR_HALF = 1.75
export const STAIR_RADIUS = 3.8
export const STAIR_WIDTH = 1.4
export const STEP_RISE = 0.55
/** Where the camera stands when you step out onto a deck. */
export const CAM_RADIUS = 5.4
export const EYE = 1.62

/** Angular slots within a level, measured from its content angle. Keeping
 *  these apart is what stops the fit-out piling up in the centre of the view. */
export const SLOT = { console: -0.52, window: 0.13, airlock: 0.78 } as const

export const TURN_PER_FLOOR = Math.PI * 0.52
export const BASE_ANGLE = Math.PI * 0.5

export type FloorKind =
  | 'monitoring'
  | 'residence'
  | 'timeline'
  | 'recreation'
  | 'laboratory'
  | 'education'
  | 'certification'
  | 'systems'
  | 'methods'
  | 'core'

export interface FloorDef {
  /** 1-based, matching the signage in the shaft. */
  level: number
  id: string
  name: string
  kind: FloorKind
  blurb: string
  /** Accent used for signage and the mini-silo marker. */
  accent?: 'brass' | 'green' | 'red'
  /** Count shown on the directory, derived from real content. */
  itemCount?: number
  /** Which record this floor is bound to, where it is a one-record floor. */
  recordId?: string
  ready: boolean
}

export const FLOORS: FloorDef[] = [
  {
    level: 1,
    id: 'monitoring',
    name: 'Monitoring & Identity',
    kind: 'monitoring',
    blurb: 'Who is on this record, and the airlock to the personnel file.',
    ready: true,
  },
  {
    level: 2,
    id: 'res-cartup',
    name: 'Residence — Cartup',
    kind: 'residence',
    blurb: experience[0].role,
    recordId: experience[0].id,
    ready: false,
  },
  {
    level: 3,
    id: 'res-inspira',
    name: 'Residence — Inspira',
    kind: 'residence',
    blurb: experience[1].role,
    recordId: experience[1].id,
    ready: false,
  },
  {
    level: 4,
    id: 'res-arced',
    name: 'Residence — ARCED',
    kind: 'residence',
    blurb: experience[2].role,
    recordId: experience[2].id,
    ready: false,
  },
  {
    level: 5,
    id: 'timeline',
    name: 'Career Corridor',
    kind: 'timeline',
    blurb: 'The three postings in sequence.',
    itemCount: experience.length,
    ready: false,
  },
  {
    level: 6,
    id: 'recreation',
    name: 'Recreation',
    kind: 'recreation',
    accent: 'green',
    blurb: 'Optional. Nothing professional is hidden behind it.',
    ready: false,
  },
  {
    level: 7,
    id: 'laboratory',
    name: 'Project Laboratory',
    kind: 'laboratory',
    blurb: 'The main body of work.',
    itemCount: projects.length,
    ready: false,
  },
  {
    level: 8,
    id: 'education',
    name: 'Education Archive',
    kind: 'education',
    blurb: 'Economics, East West University.',
    itemCount: education.length,
    ready: false,
  },
  {
    level: 9,
    id: 'certification',
    name: 'Certification Archive',
    kind: 'certification',
    blurb: 'Credential drawers.',
    itemCount: certifications.length,
    ready: false,
  },
  {
    level: 10,
    id: 'systems',
    name: 'Technical Systems',
    kind: 'systems',
    blurb: 'Tooling, as running subsystems.',
    itemCount: skillSystems.length,
    ready: false,
  },
  {
    level: 11,
    id: 'methods',
    name: 'Analytical Methods',
    kind: 'methods',
    blurb: 'How the analysis is actually done.',
    itemCount: methods.length,
    ready: false,
  },
  {
    level: 12,
    id: 'core',
    name: 'Deep Core & Contact',
    kind: 'core',
    accent: 'red',
    blurb: 'Where the structure converges. Communications terminal.',
    ready: false,
  },
]

export const LEVEL_COUNT = FLOORS.length
export const DEPTH = (LEVEL_COUNT - 1) * FLOOR_HEIGHT
export const TOP_MARGIN = 8
export const BOTTOM = -DEPTH - 12
export const WALL_HEIGHT = TOP_MARGIN - BOTTOM + 16
export const WALL_CENTER = (TOP_MARGIN + BOTTOM) / 2

/** y of a level's deck datum. Level 1 is the top at y = 0. */
export const levelY = (level: number) => -(level - 1) * FLOOR_HEIGHT
export const deckY = (level: number) => levelY(level) - DECK_DROP

/** Each level faces a different arc of the wall, so the silo reads as round. */
export const contentAngle = (level: number) => BASE_ANGLE + (level - 1) * TURN_PER_FLOOR

export const floorByLevel = (level: number) => FLOORS.find((f) => f.level === level) ?? FLOORS[0]

export const PALETTE = {
  void: '#141017',
  concrete: '#6b6159',
  concreteDark: '#473f39',
  deck: '#423b35',
  steel: '#58706a',
  steelDark: '#3c4f48',
  brass: '#c9996b',
  brassHot: '#f2c99b',
  bone: '#ede9e6',
  green: '#7f9b6d',
  red: '#b4584f',
} as const
