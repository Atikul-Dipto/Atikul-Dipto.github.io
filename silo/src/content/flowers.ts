/**
 * A flower for every floor, each in a colour of its own, blooming in the
 * planters along its rail. All of them flowers of Bangladesh, the padma last
 * -- the one that also floats on the water at the foot of the silo.
 */
export type FlowerId = 'shimul' | 'krishnachura' | 'surjomukhi' | 'aparajita' | 'jarul' | 'shapla' | 'golap' | 'padma'

export interface FloorFlower {
  level: number
  id: FlowerId
  /** The petals' colour, and the colour at the heart of the flower. */
  colour: string
  heart: string
}

export const FLOWERS: FloorFlower[] = [
  { level: 1, id: 'shimul', colour: '#e0262e', heart: '#3a0b0b' },
  { level: 2, id: 'krishnachura', colour: '#ff6a1f', heart: '#ffd34d' },
  { level: 3, id: 'surjomukhi', colour: '#ffc21a', heart: '#4a2a0e' },
  { level: 4, id: 'aparajita', colour: '#2f56e8', heart: '#fff3b0' },
  { level: 5, id: 'jarul', colour: '#a463e0', heart: '#ffd84a' },
  { level: 6, id: 'shapla', colour: '#f6f4ee', heart: '#f2c215' },
  { level: 7, id: 'golap', colour: '#d81b67', heart: '#7a0f3a' },
  { level: 8, id: 'padma', colour: '#f58cbf', heart: '#f0c43a' },
]

export const flowerOn = (level: number) => FLOWERS.find((f) => f.level === level) ?? FLOWERS[0]
