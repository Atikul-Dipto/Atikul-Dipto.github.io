import { certifications, education, experience, methods, projects, skillSystems } from './portfolio'

/**
 * Geometry of the structure. Everything — stairs, decks, the camera rig, the
 * mini-silo overview — derives from these, so the whole silo stays vertically
 * aligned when any one of them changes (spec §4).
 */
export const SHAFT_RADIUS = 13
export const WALL_THICK = 1.1
export const FLOOR_HEIGHT = 11
/** Opening in each deck that the elevator and stair run through. */
export const DECK_INNER = 5.4
export const DECK_DROP = 1.9
export const ELEVATOR_HALF = 1.75
/** Radius of the elevator shaft cage that encloses the car. */
export const SHAFT_CAGE = ELEVATOR_HALF * 1.28
export const STAIR_RADIUS = 3.8
export const STAIR_WIDTH = 1.4
export const STEP_RISE = 0.55
/** Where the camera stands when you step out onto a deck. */
export const CAM_RADIUS = 5.4
export const EYE = 1.62
/** Radial bays each deck is divided into — the corridor framing. */
export const BAYS = 8

/** Angular slots within a level, measured from its content angle. Keeping
 *  these apart is what stops the fit-out piling up in the centre of the view. */
export const SLOT = { console: -0.52, window: 0.13, airlock: 0.78 } as const

/**
 * THE CUTAWAY. One sector of the wall is simply not built, so the structure
 * reads as an architectural section from outside — twelve decks, the stair
 * helix and the elevator all visible on the approach before you ever go in.
 *
 * Because that sector is missing, nothing may ever be fitted out into it, and
 * no wall rib or corridor bulkhead may be built there either. `contentAngle`
 * below distributes the twelve levels across the arc that remains, and
 * `inCut()` is the one predicate every generator checks.
 */
export const CUT_MID = Math.PI * 0.5
export const CUT_HALF = 0.5
/** Where the wall shell starts, and how far round it runs. */
export const WALL_START = CUT_MID + CUT_HALF
export const WALL_ARC = Math.PI * 2 - CUT_HALF * 2

/**
 * three.js measures cylinder and lathe theta from +Z (x = r*sin t, z = r*cos t);
 * every angle in this project is measured from +X (x = r*cos a, z = r*sin a).
 * Handing a project angle straight to a CylinderGeometry puts the feature 90
 * degrees away from where every cos/cos placement in the scene expects it, so
 * convert here and nowhere else.
 */
export const toTheta = (a: number) => Math.PI / 2 - a
/** thetaStart for the wall shell: the arc runs from one cut edge to the other. */
export const WALL_THETA_START = toTheta(WALL_START + WALL_ARC)
/** thetaStart for a sector that covers the cutaway itself, plus `pad`. */
export const cutTheta = (pad = 0) => toTheta(CUT_MID + CUT_HALF + pad)

/** Normalise any angle to the signed offset from the cut centre. */
const fromCut = (a: number) => ((a - CUT_MID + Math.PI * 3) % (Math.PI * 2)) - Math.PI
/** True if this angle falls in the missing sector (optionally with clearance). */
export const inCut = (a: number, pad = 0) => Math.abs(fromCut(a)) < CUT_HALF + pad

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

/**
 * Each level faces a different arc of the wall, so the silo reads as round as
 * you descend. The arc is bounded by the cutaway: the widest slot offsets are
 * -0.52 and +0.78, so the first level starts a full slot-width clear of one cut
 * edge and the last stops a slot-width clear of the other.
 */
const SLOT_PAD = 0.2
const ARC_FROM = WALL_START - SLOT.console + SLOT_PAD
const ARC_TO = CUT_MID + Math.PI * 2 - CUT_HALF - SLOT.airlock - SLOT_PAD
export const contentAngle = (level: number) =>
  ARC_FROM + ((level - 1) / (LEVEL_COUNT - 1)) * (ARC_TO - ARC_FROM)

export const floorByLevel = (level: number) => FLOORS.find((f) => f.level === level) ?? FLOORS[0]

export const PALETTE = {
  void: '#141017',
  concrete: '#6b6159',
  concreteDark: '#473f39',
  /** Exposed aggregate on the cut faces of the wall. */
  concreteCut: '#8a7f73',
  rock: '#3b322b',
  rockDark: '#2a231e',
  deck: '#423b35',
  steel: '#58706a',
  steelDark: '#3c4f48',
  brass: '#c9996b',
  brassHot: '#f2c99b',
  bone: '#ede9e6',
  green: '#7f9b6d',
  red: '#b4584f',
} as const
