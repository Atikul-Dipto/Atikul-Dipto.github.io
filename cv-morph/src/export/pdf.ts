import fontkit from '@pdf-lib/fontkit'
import {
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  fill,
  lineTo,
  moveTo,
  PDFDocument,
  PDFString,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  setFillingRgbColor,
  type PDFFont,
  type PDFOperator,
  type PDFPage,
} from 'pdf-lib'
import { PAGES } from '../design/design.ts'
import { cssFamily, FONTS, type FontId } from '../design/fonts.ts'
import type { Project } from '../model/project.ts'
import { fontBytes, SUBSETS, type Subset } from '../sheet/fontFiles.ts'
import { withPrintSheet } from './stage.tsx'

// The PDF is not a picture of the page. The page is laid out off-screen by
// the browser, exactly as it is shown, and then every line of text is set in
// the PDF where the browser put it, in the same font file, as real text: it
// can be selected, searched, and read by the software that screens CVs.
// Boxes, rules and the photo are drawn from the same layout.

const PT = 0.75 // points per CSS pixel
const FAMILIES = new Map<string, FontId>(FONTS.map((f) => [cssFamily(f.id), f.id]))

type Rgb = [number, number, number]

interface Face {
  id: FontId
  bold: boolean
  italic: boolean
}

interface Run extends Face {
  page: number
  x: number
  /** The baseline, in pixels from the top of its page. */
  base: number
  width: number
  text: string
  size: number
  spacing: number
  color: Rgb
  subset: Subset
}

interface Block {
  page: number
  x: number
  y: number
  w: number
  h: number
  color: Rgb
  radius: number
  /** A line drawn round the edge rather than a filled shape, this thick. */
  stroke: number
}

interface Picture {
  page: number
  x: number
  y: number
  w: number
  h: number
  src: string
  radius: number
}

interface Link {
  page: number
  x: number
  y: number
  w: number
  h: number
  url: string
}

export interface PdfResult {
  blob: Blob
  pages: number
  /** Characters the shipped fonts have no shape for; these were left out. */
  missing: string
}

interface Glyphs {
  hasGlyphForCodePoint(codePoint: number): boolean
}

const faceKey = (f: Face, subset: Subset) => `${f.id}|${f.bold ? 'b' : 'r'}|${f.italic ? 'i' : 'n'}|${subset}`

function parseColor(value: string): { rgb: Rgb; alpha: number } | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+%?))?\s*\)/.exec(value)
  if (!m) return null
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha }
}

/** WOFF is a font with each table zlib-compressed; a PDF wants the font plain. */
async function unpackWoff(woff: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength)
  if (view.getUint32(0) !== 0x774f4646) return woff
  const count = view.getUint16(12)
  const tables = Array.from({ length: count }, (_, i) => {
    const at = 44 + i * 20
    return { tag: view.getUint32(at), offset: view.getUint32(at + 4), packed: view.getUint32(at + 8), length: view.getUint32(at + 12), checksum: view.getUint32(at + 16) }
  })
  const size = tables.reduce((n, t) => n + ((t.length + 3) & ~3), 12 + 16 * count)
  const out = new Uint8Array(size)
  const head = new DataView(out.buffer)
  const power = 2 ** Math.floor(Math.log2(count))
  head.setUint32(0, view.getUint32(4))
  head.setUint16(4, count)
  head.setUint16(6, power * 16)
  head.setUint16(8, Math.log2(power))
  head.setUint16(10, count * 16 - power * 16)
  let offset = 12 + 16 * count
  for (const [i, t] of tables.entries()) {
    const raw = woff.subarray(t.offset, t.offset + t.packed)
    const data = t.packed < t.length ? new Uint8Array(await new Response(new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()) : raw
    out.set(data, offset)
    const record = 12 + i * 16
    head.setUint32(record, t.tag)
    head.setUint32(record + 4, t.checksum)
    head.setUint32(record + 8, offset)
    head.setUint32(record + 12, t.length)
    offset += (t.length + 3) & ~3
  }
  return out
}

/** The four corners of a rounded box as PDF path operators (y up, origin bottom-left). */
function roundedPath(x: number, y: number, w: number, h: number, r: number): PDFOperator[] {
  const k = 0.5523 * r
  return [
    moveTo(x + r, y),
    lineTo(x + w - r, y),
    appendBezierCurve(x + w - r + k, y, x + w, y + r - k, x + w, y + r),
    lineTo(x + w, y + h - r),
    appendBezierCurve(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h),
    lineTo(x + r, y + h),
    appendBezierCurve(x + r - k, y + h, x, y + h - r + k, x, y + h - r),
    lineTo(x, y + r),
    appendBezierCurve(x, y + r - k, x + r - k, y, x + r, y),
    closePath(),
  ]
}

export async function exportPdf(project: Project): Promise<PdfResult> {
  return withPrintSheet(project, async (sheet) => {
    const size = PAGES[project.design.page]
    const pages = Number(sheet.dataset.pages) || 1
    const origin = sheet.getBoundingClientRect()

    // ---- which font files the page uses, and which characters each one has.
    const faces = new Map<string, Face>()
    for (const el of sheet.querySelectorAll<HTMLElement>('*')) {
      const face = faceOf(getComputedStyle(el))
      if (face) faces.set(faceKey(face, 'latin').slice(0, -6), face)
    }
    const files = new Map<string, Uint8Array>()
    const glyphs = new Map<string, Glyphs>()
    await Promise.all(
      [...faces.values()].flatMap((face) =>
        SUBSETS.map(async (subset) => {
          const woff = await fontBytes(face.id, face.bold, face.italic, subset)
          if (!woff) return
          const plain = await unpackWoff(woff)
          files.set(faceKey(face, subset), plain)
          glyphs.set(faceKey(face, subset), fontkit.create(plain) as unknown as Glyphs)
        }),
      ),
    )

    // ---- read the layout.
    const runs: Run[] = []
    const blocks: Block[] = []
    const pictures: Picture[] = []
    const links: Link[] = []
    const missing = new Set<string>()
    const pageOf = (y: number) => Math.max(0, Math.min(pages - 1, Math.floor((y + 0.5) / size.height)))
    const measure = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
    const ascents = new Map<string, { up: number; down: number }>()
    const range = document.createRange()

    const box = (r: DOMRect, color: Rgb, radius = 0, stroke = 0) => {
      // A box that runs over a page edge is cut there.
      let top = r.top - origin.top
      const bottom = r.bottom - origin.top
      while (top < bottom - 0.01) {
        const page = pageOf(top)
        const end = Math.min(bottom, (page + 1) * size.height)
        blocks.push({ page, x: r.left - origin.left, y: top - page * size.height, w: r.width, h: end - top, color, radius, stroke })
        top = end
      }
    }

    const text = (node: Text, style: CSSStyleDeclaration) => {
      const data = node.data
      if (!data.trim()) return
      const face = faceOf(style)
      const color = parseColor(style.color)
      if (!face || !color) return
      const fontSize = parseFloat(style.fontSize)
      const spacing = style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing) || 0
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      let metric = ascents.get(font)
      if (!metric) {
        measure.font = font
        const m = measure.measureText('Hg')
        metric = { up: m.fontBoundingBoxAscent, down: m.fontBoundingBoxDescent }
        ascents.set(font, metric)
      }
      const { up, down } = metric
      const rectOf = (from: number, to: number): DOMRect[] => {
        range.setStart(node, from)
        range.setEnd(node, to)
        return [...range.getClientRects()].filter((r) => r.width > 0)
      }
      // One piece of a line, in one font file.
      const emit = (from: number, to: number, r: { left: number; right: number; top: number; bottom: number }) => {
        const str = data.slice(from, to)
        // Split where the characters move from one font file to another (é is
        // in the Latin file, ł in the extended one).
        let start = 0
        let current: Subset | 'none' | null = null
        const chars = [...str]
        let offset = 0
        const pieces: { from: number; to: number; subset: Subset | 'none' }[] = []
        for (const ch of chars) {
          const cp = ch.codePointAt(0) as number
          const where: Subset | 'none' | null = /\s/.test(ch)
            ? current
            : glyphs.get(faceKey(face, 'latin'))?.hasGlyphForCodePoint(cp)
              ? 'latin'
              : glyphs.get(faceKey(face, 'latin-ext'))?.hasGlyphForCodePoint(cp)
                ? 'latin-ext'
                : 'none'
          if (where === 'none') missing.add(ch)
          if (current !== null && where !== null && where !== current) {
            pieces.push({ from: start, to: offset, subset: current })
            start = offset
          }
          if (where !== null) current = where
          offset += ch.length
        }
        pieces.push({ from: start, to: str.length, subset: current ?? 'latin' })
        for (const piece of pieces) {
          if (piece.subset === 'none') continue
          const pieceText = str.slice(piece.from, piece.to)
          if (!pieceText.trim()) continue
          const whole = pieces.length === 1
          const rects = whole ? [] : rectOf(from + piece.from, from + piece.to)
          const left = whole ? r.left : Math.min(...rects.map((q) => q.left))
          const right = whole ? r.right : Math.max(...rects.map((q) => q.right))
          if (!Number.isFinite(left)) continue
          const topPx = r.top - origin.top
          const page = pageOf(topPx + (r.bottom - r.top) / 2)
          // The box of a line of text is the font's ascent plus descent; the baseline sits between.
          const base = topPx + (r.bottom - r.top - (up + down)) / 2 + up
          runs.push({ ...face, subset: piece.subset, page, x: left - origin.left, base: base - page * size.height, width: right - left, text: pieceText, size: fontSize, spacing, color: color.rgb })
        }
      }
      // Words are gathered into lines by where the browser put them.
      let line: { from: number; to: number; left: number; right: number; top: number; bottom: number } | null = null
      const flush = () => {
        if (line) emit(line.from, line.to, line)
        line = null
      }
      const place = (from: number, to: number, r: DOMRect) => {
        if (line && Math.abs(r.top - line.top) < 1 && r.left >= line.right - 1) {
          line.to = to
          line.right = r.right
        } else {
          flush()
          line = { from, to, left: r.left, right: r.right, top: r.top, bottom: r.bottom }
        }
      }
      const word = /\S+/g
      for (let m = word.exec(data); m; m = word.exec(data)) {
        const rects = rectOf(m.index, m.index + m[0].length)
        if (rects.length === 1) place(m.index, m.index + m[0].length, rects[0])
        else {
          // A long word broken across lines: place it letter by letter.
          let at = m.index
          for (const ch of m[0]) {
            const r = rectOf(at, at + ch.length)[0]
            if (r) place(at, at + ch.length, r)
            at += ch.length
          }
        }
      }
      flush()
    }

    const walk = (el: Element) => {
      if (el.hasAttribute('data-noexport')) return
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        const radiusRaw = style.borderTopLeftRadius
        const radius = radiusRaw.endsWith('%') ? (Math.min(r.width, r.height) * parseFloat(radiusRaw)) / 100 : Math.min(parseFloat(radiusRaw) || 0, Math.min(r.width, r.height) / 2)
        const background = parseColor(style.backgroundColor)
        if (background && background.alpha > 0.01) box(r, background.rgb, radius)
        const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).map((side) => ({
          side,
          width: style[`border${side}Style`] === 'none' ? 0 : parseFloat(style[`border${side}Width`]) || 0,
          color: parseColor(style[`border${side}Color`]),
        }))
        const even = sides.every((s) => s.width > 0 && s.width === sides[0].width && s.color?.rgb.join() === sides[0].color?.rgb.join())
        if (even && sides[0].color) box(r, sides[0].color.rgb, radius, sides[0].width)
        else {
          for (const s of sides) {
            if (!s.width || !s.color || s.color.alpha < 0.01) continue
            const edge =
              s.side === 'Top'
                ? new DOMRect(r.left, r.top, r.width, s.width)
                : s.side === 'Bottom'
                  ? new DOMRect(r.left, r.bottom - s.width, r.width, s.width)
                  : s.side === 'Left'
                    ? new DOMRect(r.left, r.top, s.width, r.height)
                    : new DOMRect(r.right - s.width, r.top, s.width, r.height)
            box(edge, s.color.rgb)
          }
        }
        if (el instanceof HTMLImageElement) {
          const top = r.top - origin.top
          const page = pageOf(top)
          pictures.push({ page, x: r.left - origin.left, y: top - page * size.height, w: r.width, h: r.height, src: el.currentSrc || el.src, radius })
          return
        }
        if (el instanceof HTMLAnchorElement && /^(?:https?:|mailto:|tel:)/i.test(el.href)) {
          for (const q of el.getClientRects()) {
            const top = q.top - origin.top
            const page = pageOf(top)
            links.push({ page, x: q.left - origin.left, y: top - page * size.height, w: q.width, h: q.height, url: el.href })
          }
        }
      }
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) text(node as Text, style)
        else if (node.nodeType === Node.ELEMENT_NODE) walk(node as Element)
      }
    }
    walk(sheet)

    // ---- write the PDF.
    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)
    const cv = project.cv
    pdf.setTitle(cv.name ? `${cv.name} — CV` : 'CV')
    if (cv.name) pdf.setAuthor(cv.name)
    if (cv.headline) pdf.setSubject(cv.headline)
    pdf.setCreator('CV Morph')
    pdf.setProducer('CV Morph')

    const width = size.width * PT
    const height = size.height * PT
    const sheets: PDFPage[] = Array.from({ length: pages }, () => pdf.addPage([width, height]))
    const paint = (c: Rgb) => rgb(c[0] / 255, c[1] / 255, c[2] / 255)

    for (const b of blocks) {
      const page = sheets[b.page]
      const x = b.x * PT
      const y = height - (b.y + b.h) * PT
      const w = b.w * PT
      const h = b.h * PT
      if (b.stroke) {
        const t = b.stroke * PT
        const r = Math.max(0, b.radius * PT - t / 2)
        page.pushOperators(pushGraphicsState())
        page.drawSvgPath(svgRound(w - t, h - t, r), { x: x + t / 2, y: y + h - t / 2, borderColor: paint(b.color), borderWidth: t })
        page.pushOperators(popGraphicsState())
      } else if (b.radius > 0.5) {
        page.pushOperators(pushGraphicsState(), setFillingRgbColor(b.color[0] / 255, b.color[1] / 255, b.color[2] / 255), ...roundedPath(x, y, w, h, Math.min(b.radius * PT, w / 2, h / 2)), fill(), popGraphicsState())
      } else page.drawRectangle({ x, y, width: w, height: h, color: paint(b.color) })
    }

    for (const p of pictures) {
      const match = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(p.src)
      if (!match) continue
      const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))
      const image = match[1].toLowerCase() === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
      const page = sheets[p.page]
      const x = p.x * PT
      const y = height - (p.y + p.h) * PT
      const w = p.w * PT
      const h = p.h * PT
      // Fill the frame without stretching: scale to cover, and clip to the frame's shape.
      const scale = Math.max(w / image.width, h / image.height)
      const iw = image.width * scale
      const ih = image.height * scale
      page.pushOperators(pushGraphicsState(), ...roundedPath(x, y, w, h, Math.min(p.radius * PT, w / 2, h / 2)), clip(), endPath())
      page.drawImage(image, { x: x - (iw - w) / 2, y: y - (ih - h) / 2, width: iw, height: ih })
      page.pushOperators(popGraphicsState())
    }

    const fonts = new Map<string, PDFFont>()
    for (const run of runs) {
      const key = faceKey(run, run.subset)
      let font = fonts.get(key)
      if (!font) {
        const file = files.get(key)
        if (!file) continue
        // Whole font, and no kerning or ligatures: the page is laid out without them too.
        font = await pdf.embedFont(file, { subset: false, features: { kern: false, liga: false, clig: false, calt: false, dlig: false } })
        fonts.set(key, font)
      }
      const page = sheets[run.page]
      const sizePt = run.size * PT
      const count = [...run.text].length
      // Letter-spacing as asked for, plus whatever sliver keeps the line exactly as wide as the browser set it.
      let spacing = run.spacing * PT
      if (count > 1) {
        const natural = font.widthOfTextAtSize(run.text, sizePt) + count * spacing
        const slack = (run.width * PT - natural) / (count - 1)
        if (Math.abs(slack) < 0.6) spacing += slack
      }
      page.pushOperators(setCharacterSpacing(spacing))
      page.drawText(run.text, { x: run.x * PT, y: height - run.base * PT, size: sizePt, font, color: paint(run.color) })
    }
    for (const page of sheets) page.pushOperators(setCharacterSpacing(0))

    for (const l of links) {
      const page = sheets[l.page]
      const annotation = pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [l.x * PT, height - (l.y + l.h) * PT, (l.x + l.w) * PT, height - l.y * PT],
        Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(l.url) },
      })
      page.node.addAnnot(pdf.context.register(annotation))
    }

    const bytes = await pdf.save()
    return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), pages, missing: [...missing].join('') }
  })
}

/** A rounded rectangle as an SVG path, top-left at the origin (pdf-lib flips it into place). */
function svgRound(w: number, h: number, r: number): string {
  if (r <= 0) return `M0 0H${w}V${h}H0Z`
  return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`
}

function faceOf(style: CSSStyleDeclaration): Face | null {
  const family = style.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  const id = FAMILIES.get(family)
  if (!id) return null
  return { id, bold: (parseInt(style.fontWeight, 10) || 400) >= 600, italic: style.fontStyle === 'italic' || style.fontStyle === 'oblique' }
}
