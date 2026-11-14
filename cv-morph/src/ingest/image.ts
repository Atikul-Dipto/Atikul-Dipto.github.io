import type { PSM, Worker as OcrWorker } from 'tesseract.js'
import type { Chunk, DocModel } from '../parse/geometry.ts'
import { findColumns } from '../parse/layout.ts'
import { colour, type Progress } from './index.ts'
import { toChunks, type Piece } from './pdf.ts'
import { previewOf, rasterOf } from './raster.ts'

// Pictures are read with Tesseract, running in this browser. Its worker,
// engine and English model are served by this site (see vite.config.ts).

/** Page units for a picture: as wide as an A4 sheet in points, so sizes come out in points, near enough. */
const PAGE_WIDTH = 595.28
/** From the top of a "d" to the foot of a "p" is about this much of the type size. */
const LETTER_HEIGHT = 0.95

let engine: Promise<OcrWorker> | null = null
let report: (ratio: number) => void = () => {}

function ocr(): Promise<OcrWorker> {
  if (!engine) {
    engine = import('tesseract.js').then(({ createWorker }) => {
      const base = new URL(`${import.meta.env.BASE_URL}${__OCR_DIR__}`, location.href).href
      return createWorker('eng', 1, {
        workerPath: `${base}/worker.min.js`,
        corePath: base,
        langPath: base,
        workerBlobURL: false,
        logger: (m) => {
          if (m.status === 'recognizing text') report(m.progress)
        },
      })
    })
    engine.catch(() => {
      engine = null
    })
  }
  return engine
}

function crop(source: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(w))
  out.height = Math.max(1, Math.round(h))
  out.getContext('2d')?.drawImage(source, Math.round(x), Math.round(y), out.width, out.height, 0, 0, out.width, out.height)
  return out
}

/**
 * Reads one picture (the page, or a column cut from it) into words with
 * their places. `dx`, `dy` are where the picture sits in the page, in pixels.
 */
async function read(worker: OcrWorker, source: HTMLCanvasElement, mode: '3' | '4', scale: number, dx = 0, dy = 0): Promise<Piece[]> {
  await worker.setParameters({ tessedit_pageseg_mode: mode as unknown as PSM })
  const { data } = await worker.recognize(source, {}, { blocks: true, text: false })
  const pieces: Piece[] = []
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const words = line.words.filter((w) => w.text.trim() && w.confidence > 20)
        if (!words.length) continue
        // A list bullet is read as whatever small shape it most resembles.
        if (words.length > 1 && /^[eo«»¢©®°¤*+~-]$/.test(words[0].text) && /^[A-Z0-9("'“]/.test(words[1].text)) words[0].text = '•'
        const tall = line.rowAttributes?.rowHeight || line.bbox.y1 - line.bbox.y0
        const size = Math.max(4, tall / LETTER_HEIGHT / scale)
        const { x0, y0, x1, y1 } = line.baseline
        const baselineAt = (x: number) => (x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0))
        for (const word of words) {
          const base = (dy + baselineAt((word.bbox.x0 + word.bbox.x1) / 2)) / scale
          pieces.push({
            text: word.text,
            x: (dx + word.bbox.x0) / scale,
            y: base - size * 0.8,
            w: (word.bbox.x1 - word.bbox.x0) / scale,
            h: size,
            size,
            bold: false,
            italic: false,
            font: '',
            links: [],
          })
        }
      }
    }
  }
  return pieces
}

/**
 * Reads the text of a page picture. `scale` is the picture's pixels per page
 * unit.
 *
 * A page in two columns is read twice. Read whole, lines from the two
 * columns that happen to sit level are taken for one line, and where they
 * don't quite sit level the letters come out garbled. So the first reading
 * is only used to find the columns; each column is then cut out and read on
 * its own.
 */
export async function ocrPage(canvas: HTMLCanvasElement, scale: number, onRatio: (ratio: number) => void): Promise<Chunk[]> {
  let worker: OcrWorker
  try {
    worker = await ocr()
  } catch {
    throw new Error('The text reader couldn’t be loaded. Check the connection and try again; after one use it works offline.')
  }
  try {
    report = (ratio) => onRatio(ratio * 0.5)
    const whole = toChunks(await read(worker, canvas, '3', scale))
    const width = canvas.width / scale
    const height = canvas.height / scale
    const layout = findColumns({ width, height, chunks: whole, raster: null, rules: [], fills: [] })
    if (!layout.gutter) return whole

    const middle = ((layout.gutter.x0 + layout.gutter.x1) / 2) * scale
    const top = layout.top * scale
    const bottom = Math.min(canvas.height, layout.bottom * scale)
    const parts: [number, number, number, number][] = [
      [0, 0, canvas.width, top],
      [0, top, middle, bottom - top],
      [middle, top, canvas.width - middle, bottom - top],
      [0, bottom, canvas.width, canvas.height - bottom],
    ]
    const real = parts.filter(([, , w, h]) => w > 20 && h > 20)
    const pieces: Piece[] = []
    for (const [i, [x, y, w, h]] of real.entries()) {
      report = (ratio) => onRatio(0.5 + ((i + ratio) / real.length) * 0.5)
      pieces.push(...(await read(worker, crop(canvas, x, y, w, h), '4', scale, x, y)))
    }
    return toChunks(pieces)
  } finally {
    report = () => {}
  }
}

export async function readImage(file: File, onProgress: (p: Progress) => void): Promise<DocModel> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('That picture couldn’t be opened. Try a PNG or JPEG.')
  }
  // Small pictures are enlarged (letters need about 20 pixels of height to be read), huge ones reduced.
  const factor = bitmap.width < 1500 ? Math.min(3, 1500 / bitmap.width) : bitmap.width > 2600 ? 2600 / bitmap.width : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * factor)
  canvas.height = Math.round(bitmap.height * factor)
  const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const scale = canvas.width / PAGE_WIDTH
  onProgress({ stage: 'ocr', ratio: 0 })
  const chunks = await ocrPage(canvas, scale, (ratio) => onProgress({ stage: 'ocr', ratio }))
  onProgress({ stage: 'layout' })
  const page = { width: PAGE_WIDTH, height: canvas.height / scale, chunks, raster: rasterOf(canvas, scale), rules: [], fills: [] }
  colour([page])
  return { kind: 'image', name: file.name, pages: [page], unit: 1, ocr: true, soft: false, preview: previewOf(canvas) }
}
