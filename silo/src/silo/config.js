// Geometry and palette constants for the silo. Everything downstream derives
// from these, so changing FLOOR_HEIGHT or SHAFT_RADIUS reshapes the whole build
// (stairs, camera path, content placement) consistently.

export const SHAFT_RADIUS = 13
export const FLOOR_HEIGHT = 11
// Deck is a ring: the opening in the middle is the stairwell the stair runs in.
export const DECK_INNER = 4.6

// The camera stands ON the deck ring, outside the stairwell, far enough from
// the wall to see a room rather than a close-up of it. Everything about the
// silo's width exists to buy this distance.
export const CAM_RADIUS = 6.6
export const EYE = 1.6
export const TURN_PER_FLOOR = Math.PI * 0.58
export const BASE_ANGLE = Math.PI * 0.5

export const STAIR_RADIUS = 3.2
export const STAIR_WIDTH = 1.5
export const STEP_RISE = 0.55

// Content sits off to the right of the view so the HTML panel, which is pinned
// left, never covers it.
export const CONTENT_OFFSET = 0.15

/** Camera angle at a given depth. Descending also rotates you, so each floor
 *  arrives at a different face of the wall and the silo feels circular. */
export const angleAt = (y) => BASE_ANGLE + (-y / FLOOR_HEIGHT) * TURN_PER_FLOOR

/** y of floor i's landing. Floor 1 is the top (y = 0) and we descend. */
export const floorY = (index) => -index * FLOOR_HEIGHT

export const PALETTE = {
  // Interior is always underground — lit warm, never a light "theme".
  void: '#17120f',
  concrete: '#6e645c',
  concreteDark: '#4b443e',
  deck: '#453e38',
  steel: '#5c766d',
  steelDark: '#3f5248',
  brass: '#c9996b',
  brassHot: '#f0c493',
  bone: '#ede9e6',
  umber: '#5c4f4a',
}

export const FLOORS = [
  {
    id: 'arrival',
    index: 0,
    level: 'Level 01',
    name: 'Arrival',
    blurb: 'The window, and the person behind it.',
  },
  { id: 'quarters', index: 1, level: 'Level 02', name: 'Quarters', blurb: 'Where the story starts.' },
  { id: 'workshop', index: 2, level: 'Level 03', name: 'Workshop', blurb: 'The tools, racked and ready.' },
  { id: 'offices', index: 3, level: 'Level 04', name: 'Offices', blurb: 'Three doors, three employers.' },
  { id: 'control', index: 4, level: 'Level 05', name: 'Control Room', blurb: 'Every project, on screen.' },
  { id: 'server', index: 5, level: 'Level 06', name: 'Server Deck', blurb: 'Queries, running warm.' },
  { id: 'archive', index: 6, level: 'Level 07', name: 'Archive', blurb: 'What made it into print.' },
  { id: 'radio', index: 7, level: 'Level 08', name: 'Radio Room', blurb: 'How to reach me.' },
]

export const DEPTH = (FLOORS.length - 1) * FLOOR_HEIGHT

export const TOP_MARGIN = 7
export const BOTTOM = -DEPTH - 10
// The shaft has to actually reach the bottom floor. Centring a fixed-height
// cylinder on the origin left the lowest levels with no wall at all.
export const WALL_HEIGHT = TOP_MARGIN - BOTTOM + 14
export const WALL_CENTER = (TOP_MARGIN + BOTTOM) / 2

export const DECK_DROP = 1.9
export const deckY = (index) => floorY(index) - DECK_DROP
