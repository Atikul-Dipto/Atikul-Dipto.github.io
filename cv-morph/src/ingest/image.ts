import type { Worker as OcrWorker } from 'tesseract.js'
import { luminance, toHex } from '../design/color.ts'
import type { Chunk, DocModel } from '../parse/geometry.ts'
import { colour, type Progress } from './index.ts'
import { toChunks, type Piece } from './pdf.ts'
import { previewOf, rasterOf } from './raster.ts'

// Pictures are read with Tesseract, running in this browser. Its worker,
// engine and English model are served by this site (see vite.config.ts).

/** Page units for a picture: as wide as an A4 sheet in points, so sizes come out in points, near enough. */
const PAGE_WIDTH = 595.28

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
          // Fetching the engine and the model is the first third; reading is the rest.
          if (m.status === 'recognizing text') report(0.35 + m.progress * 0.65)
          else if (/loading|initializing/.test(m.status)) report(Math.min(0.34, 0.05 + m.progress * 0.25))
        },
      })
    })
    engine.catch(() => {
      engine = null
    })
  }
  return engine
}

/**
 * Light text on a dark panel reads poorly: OCR expects dark on light. Where a
 * patch of the page is mostly dark, its pixels are flipped before reading.
 */
function forReading(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = source.width
  out.height = source.height
  const context = out.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  context.drawImage(source, 0, 0)
  const image = context.getImageData(0, 0, out.width, out.height)
  const { data, width, height } = image
  const cell = 28
  for (let cy = 0; cy < height; cy += cell) {
    for (let cx = 0; cx < width; cx += cell) {
      const x1 = Math.min(width, cx + cell)
      const y1 = Math.min(height, cy + cell)
      let dark = 0
      let count = 0
      for (let y = cy; y < y1; y += 3) {
        for (let x = cx; x < x1; x += 3) {
          const i = (y * width + x) * 4
          if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < 110) dark++
          count++
        }
      }
      if (dark < count * 0.6) continue
      for (let y = cy; y < y1; y++) {
        for (let x = cx; x < x1; x++) {
          const i = (y * width + x) * 4
          data[i] = 255 - data[i]
          data[i + 1] = 255 - data[i + 1]
          data[i + 2] = 255 - data[i + 2]
        }
      }
    }
  }
  context.putImageData(image, 0, 0)
  return out
}

/** Reads the text of a page picture. `scale` is the picture's pixels per page unit. */
export async function ocrPage(canvas: HTMLCanvasElement, scale: number, onRatio: (ratio: number) => void): Promise<Chunk[]> {
  report = onRatio
  let worker: OcrWorker
  try {
    worker = await ocr()
  } catch {
    throw new Error('The text reader couldn’t be loaded. Check the connection and try again; after one use it works offline.')
  }
  const { data } = await worker.recognize(forReading(canvas), {}, { blocks: true, text: false })
  report = () => {}
  const pieces: Piece[] = []
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const words = line.words.filter((w) => w.text.trim() && w.confidence > 20)
        if (!words.length) continue
        // The height of a line's letters, top of a "d" to foot of a "p", is its type size, near enough.
        const tall = line.rowAttributes?.rowHeight || line.bbox.y1 - line.bbox.y0
        const size = Math.max(4, tall / scale)
        const top = line.bbox.y0 / scale
        const height = Math.max(size, (line.bbox.y1 - line.bbox.y0) / scale)
        for (const word of words) {
          pieces.push({
            text: word.text,
            x: word.bbox.x0 / scale,
            y: top,
            w: (word.bbox.x1 - word.bbox.x0) / scale,
            h: height,
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
  return toChunks(pieces)
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

/** Whether a colour is dark enough that text on it must be light. */
export const isDarkRgb = (r: number, g: number, b: number): boolean => luminance(toHex([r, g, b])) < 0.4
