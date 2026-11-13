import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { Chunk, DocModel, PageModel, Raster } from '../parse/geometry.ts'

/** The parts of pdf.js this needs; the caller picks the build (browser, or legacy under Node for tests). */
export interface PdfLib {
  getDocument(src: object): { promise: Promise<PDFDocumentProxy>; destroy(): Promise<void> }
  Util: { transform(a: number[], b: number[]): number[] }
}

export interface PdfOptions {
  /** Draws a page and returns its pixels, or null to skip drawing (tests). */
  draw: ((page: PDFPageProxy, scale: number) => Promise<Raster>) | null
  maxPages?: number
  onProgress?: (done: number, total: number) => void
}

/** A scrap of text exactly as a file positions it: one word, or one run in one font. */
export interface Piece {
  text: string
  x: number
  y: number
  w: number
  h: number
  size: number
  bold: boolean
  italic: boolean
  font: string
  links: string[]
  /** Known when the source says (Word); a PDF's is read off its pixels later. */
  color?: string
  /** The source marks this as the start of a list item. */
  bullet?: boolean
}

/** What a PDF's own name for a typeface says about it: "ABCDEF+Calibri-BoldItalic", "CMBX10". */
export function fontStyle(name: string): { family: string; bold: boolean; italic: boolean } {
  const base = name.replace(/^[A-Z]{6}\+/, '')
  // TeX's Computer Modern and its kin name weight and slant in letters: BX is bold, TI italic.
  const tex = /^(?:cm|sf|ec|lm)[a-z]*\d/i.test(base)
  if (tex) return { family: /^(?:cmss|lmsans)/i.test(base) ? 'Computer Modern Sans' : 'Computer Modern', bold: /^(?:cm|sf|ec)\w*b[x\d]|bold/i.test(base), italic: /^(?:cm|sf|ec)\w*(?:ti|sl|it)\d|italic|oblique/i.test(base) }
  const bold = /bold|black|heavy|semibold|demi|extrab|ultra|[-_, ](?:bd|b)$/i.test(base)
  const italic = /italic|oblique|[-_, ](?:it|i)$/i.test(base)
  const family = base
    .split(/[-,]/)[0]
    .replace(/(?:PS)?MT$|PS$/, '')
    .replace(/(?:Bold|Italic|Oblique|Regular|Medium|Light|Semibold|Black)+$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
  return { family, bold, italic }
}

/** Reads a PDF into pages of positioned text (and, when asked, pixels). */
export async function readPdf(lib: PdfLib, data: Uint8Array, name: string, options: PdfOptions): Promise<DocModel> {
  const task = lib.getDocument({ data, useSystemFonts: true, fontExtraProperties: true, verbosity: 0 })
  try {
    const doc = await task.promise
    const meta = await doc.getMetadata().catch(() => null)
    const info = (meta?.info ?? {}) as { Producer?: string; Creator?: string }
    const soft = /tex/i.test(`${info.Producer ?? ''} ${info.Creator ?? ''}`)
    const total = Math.min(doc.numPages, options.maxPages ?? 8)
    const pages: PageModel[] = []
    for (let p = 1; p <= total; p++) {
      const page = await doc.getPage(p)
      pages.push(await readPage(lib, page, options))
      options.onProgress?.(p, total)
      page.cleanup()
    }
    return { kind: 'pdf', name, pages, unit: 1, ocr: false, soft, preview: '' }
  } finally {
    await task.destroy()
  }
}

async function readPage(lib: PdfLib, page: PDFPageProxy, options: PdfOptions): Promise<PageModel> {
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  // Typefaces are only named once the page's drawing instructions have been read.
  await page.getOperatorList().catch(() => null)
  const styles = new Map<string, { family: string; bold: boolean; italic: boolean }>()
  const styleOf = (id: string) => {
    let style = styles.get(id)
    if (!style) {
      let fontName = ''
      try {
        if (page.commonObjs.has(id)) fontName = (page.commonObjs.get(id) as { name?: string } | null)?.name ?? ''
      } catch {
        fontName = ''
      }
      style = fontStyle(fontName)
      styles.set(id, style)
    }
    return style
  }

  const links: { url: string; x0: number; y0: number; x1: number; y1: number }[] = []
  const annotations = (await page.getAnnotations().catch(() => [])) as { subtype?: string; url?: string; rect?: number[] }[]
  for (const a of annotations) {
    if (a.subtype !== 'Link' || !a.url || !a.rect) continue
    const [ax, ay] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]) as number[]
    const [bx, by] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]) as number[]
    links.push({ url: a.url, x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) })
  }

  const pieces: Piece[] = []
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    const t = lib.Util.transform(viewport.transform as number[], item.transform as number[])
    // Text set on its side (a rotated label in a margin) is not part of the reading text.
    if (Math.abs(Math.atan2(t[1], t[0])) > 0.2) continue
    const size = Math.hypot(t[2], t[3])
    if (size < 2) continue
    const style = styleOf(item.fontName)
    const x = t[4]
    const y = t[5] - size * 0.8
    const w = item.width
    const cx = x + w / 2
    const cy = y + size / 2
    // Letter-spaced text arrives as "E X P E R I E N C E": close it up.
    const text = /^(?:\S ){3,}\S$/.test(item.str.trim()) ? item.str.replace(/ /g, '') : item.str
    pieces.push({
      text,
      x,
      y,
      w,
      h: size,
      size,
      bold: style.bold,
      italic: style.italic,
      font: style.family,
      links: links.filter((l) => cx >= l.x0 - 1 && cx <= l.x1 + 1 && cy >= l.y0 - 1 && cy <= l.y1 + 1).map((l) => l.url),
    })
  }

  const chunks = toChunks(pieces)
  const raster = options.draw ? await options.draw(page, Math.min(2.2, 1700 / viewport.width)) : null
  return { width: viewport.width, height: viewport.height, chunks, raster, rules: [], fills: [] }
}

/**
 * Pieces on one baseline that sit a word-space apart are one run of text. A
 * gap wider than that starts a new run: the next cell of a row, or the other
 * column.
 */
export function toChunks(input: Piece[]): Chunk[] {
  // Bold is sometimes faked by printing the same words twice, a hair apart.
  const pieces: Piece[] = []
  for (const p of input) {
    const twin = pieces.find((q) => q.text === p.text && Math.abs(q.x - p.x) < p.size * 0.08 && Math.abs(q.y - p.y) < p.size * 0.08)
    if (twin) twin.bold = true
    else pieces.push({ ...p })
  }
  pieces.sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x)

  const rows: Piece[][] = []
  for (const p of pieces) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(p.y + p.h / 2 - (row[0].y + row[0].h / 2)) < Math.min(p.h, row[0].h) * 0.45) row.push(p)
    else rows.push([p])
  }

  const chunks: Chunk[] = []
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
    let run: Piece[] = []
    let text = ''
    const close = () => {
      if (!run.length) return
      const longest = run.reduce((best, p) => (p.text.length > best.text.length ? p : best), run[0])
      const chars = run.reduce((n, p) => n + p.text.length, 0)
      const boldChars = run.reduce((n, p) => n + (p.bold ? p.text.length : 0), 0)
      const trimmed = text.trimEnd()
      const startTrim = trimmed.length - trimmed.trimStart().length
      let lead = 0
      let at = 0
      for (const p of run) {
        const index = text.indexOf(p.text, at)
        if (!p.bold) break
        lead = index + p.text.length
        at = lead
      }
      const x = run[0].x
      const y = Math.min(...run.map((p) => p.y))
      const last = run[run.length - 1]
      chunks.push({
        text: trimmed.trimStart(),
        x,
        y,
        w: last.x + last.w - x,
        h: Math.max(...run.map((p) => p.y + p.h)) - y,
        size: longest.size,
        bold: boldChars > chars * 0.6,
        italic: longest.italic,
        lead: Math.max(0, Math.min(trimmed.length, lead) - startTrim),
        font: longest.font,
        color: longest.color ?? '',
        bullet: run[0].bullet ?? false,
        links: [...new Set(run.flatMap((p) => p.links))],
      })
      run = []
      text = ''
    }
    for (const p of row) {
      const prev = run[run.length - 1]
      if (prev) {
        const gap = p.x - (prev.x + prev.w)
        const size = Math.max(p.size, prev.size)
        if (gap > size * 0.9) close()
        else if (gap > size * 0.16 && !/\s$/.test(text) && !/^\s/.test(p.text)) text += ' '
      }
      run.push(p)
      text += p.text
    }
    close()
  }
  return chunks
}
