import { toHex, type Rgb } from '../design/color.ts'
import type { Box, Raster } from '../parse/geometry.ts'

/** The pixels of a canvas as a raster at `scale` pixels per page unit. */
export function rasterOf(canvas: HTMLCanvasElement | OffscreenCanvas, scale: number): Raster {
  const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  return { width: canvas.width, height: canvas.height, data: image.data, scale }
}

const bucket = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)

interface Tally {
  count: number
  r: number
  g: number
  b: number
}

/** Counts the colours in a box of the page (in page units), coarsely enough that anti-aliasing doesn't scatter them. */
function tally(raster: Raster, box: Box, budget = 2400): { colors: Tally[]; total: number } {
  const x0 = Math.max(0, Math.floor(box.x * raster.scale))
  const y0 = Math.max(0, Math.floor(box.y * raster.scale))
  const x1 = Math.min(raster.width, Math.ceil((box.x + box.w) * raster.scale))
  const y1 = Math.min(raster.height, Math.ceil((box.y + box.h) * raster.scale))
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / budget)))
  const seen = new Map<number, Tally>()
  let total = 0
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * raster.width + x) * 4
      const [r, g, b] = [raster.data[i], raster.data[i + 1], raster.data[i + 2]]
      const key = bucket(r, g, b)
      const t = seen.get(key)
      if (t) {
        t.count++
        t.r += r
        t.g += g
        t.b += b
      } else seen.set(key, { count: 1, r, g, b })
      total++
    }
  }
  return { colors: [...seen.values()].sort((a, b) => b.count - a.count), total }
}

const mean = (t: Tally): Rgb => [t.r / t.count, t.g / t.count, t.b / t.count]
const far = (a: Rgb, b: Rgb) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])

/** The colour most of a box is: its background. */
export function fillOf(raster: Raster, box: Box): string {
  const { colors } = tally(raster, box)
  return colors.length ? toHex(mean(colors[0])) : '#ffffff'
}

/**
 * The colour of the text in a box: of the colours that are not the
 * background, the one furthest from it that covers more than a speck (the
 * pixels in between are the soft edges of the letters).
 */
export function inkOf(raster: Raster, box: Box): { ink: string; fill: string } {
  const { colors, total } = tally(raster, box)
  if (!colors.length) return { ink: '', fill: '#ffffff' }
  const back = mean(colors[0])
  let best: Tally | null = null
  let bestScore = 0
  for (const c of colors.slice(1)) {
    if (c.count < Math.max(2, total * 0.006)) continue
    const score = far(mean(c), back)
    if (score > bestScore) [best, bestScore] = [c, score]
  }
  return { ink: best && bestScore > 60 ? toHex(mean(best)) : '', fill: toHex(back) }
}

/** A small picture of the page for the reading animation. */
export function previewOf(canvas: HTMLCanvasElement, width = 620): string {
  const scale = Math.min(1, width / canvas.width)
  const small = document.createElement('canvas')
  small.width = Math.round(canvas.width * scale)
  small.height = Math.round(canvas.height * scale)
  small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height)
  return small.toDataURL('image/jpeg', 0.82)
}
