import { SHAFT_RADIUS, contentAngle } from './floors'
import { lampAngles } from './layout'
import { openingsOn } from './openings'

/**
 * A flower for every floor, each in a colour of its own: painted in a frame
 * on the floor's wall, and blooming in the planters along its rail. All of
 * them flowers of Bangladesh, the padma last -- the one that also floats on
 * the water at the foot of the silo.
 */
export type FlowerId = 'shimul' | 'krishnachura' | 'surjomukhi' | 'aparajita' | 'jarul' | 'shapla' | 'golap' | 'padma'

export interface FloorFlower {
  level: number
  id: FlowerId
  /** Its name in Bangla, and in English. */
  bn: string
  en: string
  /** The petals' colour, and the colour at the heart of the flower. */
  colour: string
  heart: string
}

export const FLOWERS: FloorFlower[] = [
  { level: 1, id: 'shimul', bn: 'শিমুল', en: 'Silk cotton', colour: '#e0262e', heart: '#3a0b0b' },
  { level: 2, id: 'krishnachura', bn: 'কৃষ্ণচূড়া', en: 'Flame tree', colour: '#ff6a1f', heart: '#ffd34d' },
  { level: 3, id: 'surjomukhi', bn: 'সূর্যমুখী', en: 'Sunflower', colour: '#ffc21a', heart: '#4a2a0e' },
  { level: 4, id: 'aparajita', bn: 'অপরাজিতা', en: 'Butterfly pea', colour: '#2f56e8', heart: '#fff3b0' },
  { level: 5, id: 'jarul', bn: 'জারুল', en: 'Pride of India', colour: '#a463e0', heart: '#ffd84a' },
  { level: 6, id: 'shapla', bn: 'শাপলা', en: 'Water lily', colour: '#f6f4ee', heart: '#f2c215' },
  { level: 7, id: 'golap', bn: 'গোলাপ', en: 'Rose', colour: '#d81b67', heart: '#7a0f3a' },
  { level: 8, id: 'padma', bn: 'পদ্ম', en: 'Lotus', colour: '#f58cbf', heart: '#f0c43a' },
]

export const flowerOn = (level: number) => FLOWERS.find((f) => f.level === level) ?? FLOWERS[0]

const angDist = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)

/** The painting's frame, in metres: it hangs in a bay between two ribs, under
 *  that bay's lamp, above the painted band. */
export const PORTRAIT = { w: 1.52, h: 1.9, bottom: 1.25, r: SHAFT_RADIUS - 0.07 }

/**
 * Where a floor's painting hangs: the bay of plain wall nearest one bay along
 * from the record display -- seen as you step off the bridge -- and clear of
 * every opening in the wall. A few floors have fit-out there, and say so.
 */
const PREFER: Record<number, number> = {}
export function flowerAngle(level: number) {
  const want = contentAngle(level) + (PREFER[level] ?? 0.42)
  const clear = lampAngles(level).filter((a) => openingsOn(level).every((o) => angDist(a, o.angle) > (o.halfW + 1.6) / SHAFT_RADIUS))
  return clear.reduce((best, a) => (angDist(a, want) < angDist(best, want) ? a : best), clear[0])
}
