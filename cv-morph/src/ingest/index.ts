import type { PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { DocModel, PageModel, Raster } from '../parse/geometry.ts'
import { readPdf, type PdfLib } from './pdf.ts'
import { inkOf, previewOf, rasterOf } from './raster.ts'
import { readText } from './text.ts'

export { readText }

export type Stage = 'open' | 'text' | 'ocr' | 'layout'

export interface Progress {
  stage: Stage
  /** 0 to 1 within the stage, when it can be told. */
  ratio?: number
}

export class UnreadableFile extends Error {}

const kindOf = (file: File): 'pdf' | 'image' | 'docx' | 'text' | null => {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/.test(name)) return 'image'
  if (name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  if (file.type.startsWith('text/') || /\.(txt|md)$/.test(name)) return 'text'
  return null
}

export const ACCEPT = '.pdf,.docx,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/*'

/**
 * Reads a CV file, whatever it is, into pages of positioned text. Everything
 * happens in this browser: the file is never sent anywhere.
 */
export async function readFile(file: File, onProgress: (p: Progress) => void = () => {}): Promise<DocModel> {
  const kind = kindOf(file)
  if (!kind) throw new UnreadableFile(file.name.toLowerCase().endsWith('.doc') ? 'Old .doc files can’t be read here. Save it as .docx or PDF and try again.' : 'That file type isn’t one this can read. Use a PDF, a Word .docx file or a picture.')
  if (file.size > 30 * 1024 * 1024) throw new UnreadableFile('That file is over 30 MB. A CV should be far smaller; try exporting it again.')
  onProgress({ stage: 'open' })
  if (kind === 'pdf') return readPdfFile(file, onProgress)
  if (kind === 'image') return (await import('./image.ts')).readImage(file, onProgress)
  if (kind === 'docx') return (await import('./docx.ts')).readDocx(file, onProgress)
  return readText(await file.text(), file.name)
}

async function readPdfFile(file: File, onProgress: (p: Progress) => void): Promise<DocModel> {
  const lib = await import('pdfjs-dist')
  lib.GlobalWorkerOptions.workerSrc = workerUrl
  let preview = ''
  const canvases: HTMLCanvasElement[] = []
  const draw = async (page: PDFPageProxy, scale: number): Promise<Raster> => {
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: context, viewport }).promise
    if (!preview) preview = previewOf(canvas)
    canvases.push(canvas)
    return rasterOf(canvas, scale)
  }
  let doc: DocModel
  try {
    doc = await readPdf(lib as unknown as PdfLib, new Uint8Array(await file.arrayBuffer()), file.name, {
      draw,
      onProgress: (done, total) => onProgress({ stage: 'text', ratio: done / total }),
    })
  } catch (error) {
    const name = (error as { name?: string })?.name
    if (name === 'PasswordException') throw new UnreadableFile('That PDF is locked with a password. Remove the password and try again.')
    throw new UnreadableFile('That PDF couldn’t be opened. It may be damaged; try exporting it again.')
  }
  doc.preview = preview
  const letters = doc.pages.reduce((n, p) => n + p.chunks.reduce((m, c) => m + c.text.length, 0), 0)
  if (letters < 60 * doc.pages.length) {
    // A scan: pages that are pictures of text. Read them the way a picture is read.
    const { ocrPage } = await import('./image.ts')
    for (const [i, page] of doc.pages.entries()) {
      const canvas = canvases[i]
      if (!canvas || !page.raster) continue
      page.chunks = await ocrPage(canvas, page.raster.scale, (ratio) => onProgress({ stage: 'ocr', ratio: (i + ratio) / doc.pages.length }))
    }
    doc.ocr = true
  }
  onProgress({ stage: 'layout' })
  colour(doc.pages)
  return doc
}

/** Gives each run of text the colour it is printed in, read off the page's pixels. */
export function colour(pages: PageModel[]): void {
  for (const page of pages) {
    if (!page.raster) continue
    for (const chunk of page.chunks) {
      if (!chunk.color) chunk.color = inkOf(page.raster, chunk).ink
    }
  }
}
