import { fillOf } from '../ingest/raster.ts'
import type { Region } from '../model/types.ts'
import { median, type Box, type DocModel, type Line, type PageModel, type Raster } from '../parse/geometry.ts'
import type { HeadingKind } from '../parse/headings.ts'
import type { Parsed } from '../parse/index.ts'
import { findDate, isBullet, isUpper } from '../parse/text.ts'
import { distance, isDark, mix, parseHex, readable, saturation, toHex } from './color.ts'
import { DEFAULT_DESIGN, type Design } from './design.ts'
import { matchFont } from './fonts.ts'

/** A section the analysed CV has, and the column it sits in. */
export interface Slot {
  kind: HeadingKind
  title: string
  region: Region
}

export interface Analysis {
  design: Design
  slots: Slot[]
  /** What was noticed, in words, for showing to the person. */
  notes: string[]
  /** The colours picked off the page. */
  swatches: string[]
  /** Where the header band and the sidebar are on the first page, as fractions of it. */
  regions: { header: Box | null; side: Box | null }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const round = (v: number, step: number) => Math.round(v / step) * step
const WHITE = '#ffffff'
const near = (a: string, b: string, within = 26) => distance(parseHex(a), parseHex(b)) < within

/** The value most of the weight sits on. */
function most<T>(items: [T, number][]): T | undefined {
  const tally = new Map<T, number>()
  for (const [value, weight] of items) tally.set(value, (tally.get(value) ?? 0) + weight)
  let best: T | undefined
  let bestWeight = -1
  for (const [value, weight] of tally) if (weight > bestWeight) [best, bestWeight] = [value, weight]
  return best
}

function pixel(raster: Raster, x: number, y: number): [number, number, number] {
  const px = clamp(Math.round(x * raster.scale), 0, raster.width - 1)
  const py = clamp(Math.round(y * raster.scale), 0, raster.height - 1)
  const i = (py * raster.width + px) * 4
  return [raster.data[i], raster.data[i + 1], raster.data[i + 2]]
}

/**
 * Looks for a ruled line in a strip of the page: a row most of which is ink
 * rather than background. Returns its colour, or ''.
 */
function ruleIn(raster: Raster, x0: number, x1: number, y0: number, y1: number, back: string): string {
  const bg = parseHex(back)
  const step = 1 / raster.scale
  const samples = 90
  for (let y = y0; y <= y1; y += step) {
    let inked = 0
    const sum = [0, 0, 0]
    for (let i = 0; i < samples; i++) {
      const p = pixel(raster, x0 + ((x1 - x0) * (i + 0.5)) / samples, y)
      if (distance(p, bg) > 42) {
        inked++
        sum[0] += p[0]
        sum[1] += p[1]
        sum[2] += p[2]
      }
    }
    if (inked >= samples * 0.42) return toHex([sum[0] / inked, sum[1] / inked, sum[2] / inked])
  }
  return ''
}

/** Follows a fill sideways from a point to where it stops, in page units. */
function edgeOf(raster: Raster, fromX: number, toX: number, ys: number[], fill: string): number {
  const colour = parseHex(fill)
  const step = Math.sign(toX - fromX) / raster.scale
  let x = fromX
  for (; step > 0 ? x < toX : x > toX; x += step * 2) {
    const off = ys.filter((y) => distance(pixel(raster, x, y), colour) > 30).length
    if (off > ys.length * 0.6) break
  }
  return x
}

/**
 * Works out a design from a CV somebody liked the look of: its columns, its
 * colours, how its headings and entries are set, its type. The result is a
 * Design like any template, so it can be adjusted afterwards.
 *
 * It copies the format, not the artwork: icons, graphics and exact fonts
 * are not reproduced (the nearest shipped typeface is chosen).
 */
export function analyze(doc: DocModel, parsed: Parsed): Analysis {
  const slots: Slot[] = parsed.sections.map((s) => ({ kind: s.kind, title: s.section?.title ?? 'Contact', region: s.flow === 'side' ? 'side' : 'main' }))
  const page = doc.pages[0]
  const layout = parsed.flows.layouts[0]
  if (!page || !layout || doc.kind === 'text') {
    return { design: structuredClone(DEFAULT_DESIGN), slots, notes: [], swatches: [], regions: { header: null, side: null } }
  }

  const d = structuredClone(DEFAULT_DESIGN)
  const notes: string[] = []
  const raster = page.raster
  const all = [...parsed.flows.head, ...parsed.flows.main, ...parsed.flows.side]
  const headings = parsed.sections.flatMap((s) => (s.heading ? [s.heading] : []))
  const mainHeadings = headings.filter((h) => h.flow !== 'side')
  const sideHeadings = headings.filter((h) => h.flow === 'side')
  const headingSet = new Set(headings)
  const bodyLines = parsed.flows.main.filter((l) => !headingSet.has(l) && l !== parsed.name && Math.abs(l.size - parsed.body) < parsed.body * 0.12)
  const two = !!layout.gutter

  d.name = `Like ${doc.name.replace(/\.[a-z0-9]+$/i, '')}`.slice(0, 40)
  d.page = Math.abs(page.height / page.width - 11 / 8.5) < 0.035 ? 'letter' : 'a4'

  // ---- colours of paper and text
  const paper = raster ? fillOf(raster, { x: 0, y: 0, w: page.width, h: page.height }) : WHITE
  d.colors.paper = near(paper, WHITE, 40) ? WHITE : paper
  const text = most(bodyLines.filter((l) => l.color).map((l) => [l.color, l.text.length])) ?? d.colors.text
  d.colors.text = readable(text, d.colors.paper, 3)
  d.colors.muted = mix(d.colors.text, d.colors.paper, 0.3)

  // ---- columns and the sidebar
  const regions: Analysis['regions'] = { header: null, side: null }
  d.columns = two ? 2 : 1
  if (two && layout.gutter && layout.side) {
    const left = layout.side === 'left'
    const top = layout.top
    const bottom = Math.min(layout.bottom, page.height)
    const stripe: Box = left ? { x: 2, y: top + 4, w: Math.max(4, layout.gutter.x0 - 2), h: bottom - top - 8 } : { x: layout.gutter.x1, y: top + 4, w: page.width - layout.gutter.x1 - 2, h: bottom - top - 8 }
    let fill = ''
    const pageFill = page.fills.find((f) => f.h > page.height * 0.4 && f.w < page.width * 0.6 && f.w > page.width * 0.15)
    if (raster) {
      const found = fillOf(raster, stripe)
      if (!near(found, d.colors.paper)) fill = found
    } else if (pageFill) fill = pageFill.color
    let boundary = (layout.gutter.x0 + layout.gutter.x1) / 2
    if (fill && raster) {
      const ys = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => top + (bottom - top) * f)
      boundary = left ? edgeOf(raster, layout.gutter.x0, layout.gutter.x1 + 40, ys, fill) : edgeOf(raster, layout.gutter.x1, layout.gutter.x0 - 40, ys, fill)
    } else if (pageFill) boundary = left ? pageFill.x + pageFill.w : pageFill.x
    d.sidebar.side = layout.side
    d.sidebar.width = clamp(round((left ? boundary : page.width - boundary) / page.width, 0.01), 0.24, 0.46)
    d.sidebar.fill = fill
    const base = fill || d.colors.paper
    const sideText = most(parsed.flows.side.filter((l) => l.color && !headingSet.has(l)).map((l) => [l.color, l.text.length]))
    d.sidebar.text = readable(sideText ?? (isDark(base) ? '#e8edf7' : d.colors.text), base, 3)
    regions.side = { x: left ? 0 : 1 - d.sidebar.width, y: top / page.height, w: d.sidebar.width, h: (bottom - top) / page.height }
    notes.push(`Two columns, with a ${fill ? 'filled ' : ''}sidebar on the ${layout.side} (${Math.round(d.sidebar.width * 100)}% of the page)`)
  } else notes.push('One column')

  // ---- the header: where the name is, how it is set, and any band behind it
  const name = parsed.name
  const headLines = [name, parsed.headline, ...parsed.contactLines].filter((l): l is Line => !!l)
  if (name) {
    d.header.place = two ? (name.flow === 'head' ? 'top' : name.flow === 'side' ? 'side' : 'main') : 'top'
    d.header.nameSize = clamp(round(name.size, 1), 16, 40)
    d.header.nameCase = isUpper(name.text) ? 'upper' : 'none'
    d.header.nameWeight = doc.ocr || name.bold ? 700 : 400
    const [colLeft, colRight] = d.header.place === 'top' ? [layout.left, layout.right] : columnOf(name, parsed)
    const centre = name.x + name.w / 2
    const middle = (colLeft + colRight) / 2
    const width = colRight - colLeft
    d.header.align = Math.abs(centre - middle) < width * 0.06 && name.x - colLeft > width * 0.1 ? 'center' : name.x - colLeft > width * 0.55 ? 'right' : 'left'
    if (d.header.nameCase === 'upper') d.header.nameSpacing = clamp(round(name.w / (name.text.replace(/\s/g, '').length * name.size) - 0.7, 0.01), 0, 0.1)
  }
  d.header.contacts = parsed.contactLines.length >= 3 ? 'stacked' : 'inline'
  const headBottom = Math.max(0, ...headLines.filter((l) => l.page === 0).map((l) => l.y + l.h))
  let band = ''
  if (raster && d.header.place === 'top' && headBottom > 0) {
    const found = fillOf(raster, { x: page.width * 0.04, y: 2, w: page.width * 0.92, h: Math.max(6, headBottom) })
    if (!near(found, d.colors.paper)) band = found
  } else if (!raster) band = page.fills.find((f) => f.y < 20 && f.w > page.width * 0.7 && f.h < page.height * 0.4)?.color ?? ''
  d.header.fill = band
  const headBase = d.header.place === 'side' ? d.sidebar.fill || d.colors.paper : band || d.colors.paper
  d.header.nameColor = readable(name?.color || (isDark(headBase) ? WHITE : '#111827'), headBase, 3)
  d.header.textColor = readable(parsed.headline?.color || parsed.contactLines[0]?.color || mix(d.header.nameColor, headBase, 0.3), headBase, 3)
  if (band) {
    regions.header = { x: 0, y: 0, w: 1, h: clamp((headBottom + 14) / page.height, 0.04, 0.4) }
    notes.push('A band of colour behind the name')
  }
  if (raster && !band && headBottom > 0 && mainHeadings[0]) {
    d.header.rule = !!ruleIn(raster, layout.left, layout.right, headBottom + 1, Math.min(mainHeadings[0].y - 2, headBottom + parsed.body * 3), d.colors.paper)
  }

  // ---- section headings
  const sample = mainHeadings.length ? mainHeadings : headings
  if (sample.length) {
    d.heading.case = sample.filter((h) => isUpper(h.text)).length >= sample.length / 2 ? 'upper' : 'none'
    d.heading.size = clamp(round(median(sample.map((h) => h.size)), 0.5), 9, 16)
    d.heading.weight = doc.ocr || sample.filter((h) => h.bold).length >= sample.length / 2 ? 700 : 400
    const colour = most(sample.filter((h) => h.color).map((h) => [h.color, 1]))
    d.heading.color = readable(colour ?? d.colors.text, d.colors.paper, 2.5)
    const centred = sample.filter((h) => {
      const [l, r] = columnOf(h, parsed)
      return Math.abs(h.x + h.w / 2 - (l + r) / 2) < (r - l) * 0.06 && h.x - l > (r - l) * 0.12
    })
    d.heading.align = centred.length > sample.length / 2 ? 'center' : 'left'
    if (d.heading.case === 'upper') {
      const perLetter = median(sample.map((h) => h.w / (Math.max(1, h.text.replace(/\s/g, '').length) * h.size)))
      d.heading.spacing = clamp(round(perLetter - 0.7, 0.01), 0, 0.12)
    } else d.heading.spacing = 0

    // A line under or over them, or a band behind: read off the pixels (or, for Word, the borders).
    const votes: Record<string, number> = { none: 0, under: 0, over: 0, band: 0 }
    let ruleColour = ''
    for (const h of sample.slice(0, 6)) {
      const [l, r] = columnOf(h, parsed)
      if (raster && h.page === 0) {
        const around = fillOf(raster, { x: h.x - 2, y: h.y - h.size * 0.15, w: h.w + 4, h: h.size * 1.2 })
        const beside = fillOf(raster, { x: l, y: h.y + h.size * 2.2, w: (r - l) * 0.5, h: h.size })
        const under = ruleIn(raster, l, r, h.y + h.size * 0.95, h.y + h.size * 1.9, around)
        const over = ruleIn(raster, l, r, h.y - h.size * 0.9, h.y - h.size * 0.08, around)
        if (!near(around, beside, 18) && !near(around, d.colors.paper, 18) && !near(around, d.sidebar.fill || '#000001', 18)) votes.band++
        else if (under) {
          votes.under++
          ruleColour = under
        } else if (over) {
          votes.over++
          ruleColour = over
        } else votes.none++
      } else if (!raster) {
        const under = page.rules.find((rule) => rule.y > h.y + h.size * 0.6 && rule.y < h.y + h.size * 2 && rule.x < h.x + h.w && rule.x + rule.w > h.x)
        if (under) {
          votes.under++
          ruleColour = under.color
        } else votes.none++
      }
    }
    d.heading.rule = (Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0] as Design['heading']['rule']) ?? 'none'
    if (ruleColour) d.colors.rule = ruleColour
    else d.colors.rule = mix(d.colors.text, d.colors.paper, 0.75)
    notes.push(`Headings in ${d.heading.case === 'upper' ? 'capitals' : 'ordinary case'}${d.heading.rule === 'none' ? '' : d.heading.rule === 'band' ? ', on a band' : `, with a line ${d.heading.rule}`}${d.heading.align === 'center' ? ', centred' : ''}`)
  }
  const sideHeading = most(sideHeadings.filter((h) => h.color).map((h) => [h.color, 1]))
  d.sidebar.heading = readable(sideHeading ?? (d.sidebar.fill && isDark(d.sidebar.fill) ? mix(d.heading.color, WHITE, 0.6) : d.heading.color), d.sidebar.fill || d.colors.paper, 2.5)

  // The accent is whichever of the heading, name or band colour is a colour and not a grey.
  const vivid = [d.heading.color, band, d.header.nameColor, d.sidebar.fill, d.sidebar.heading].filter((c) => c && saturation(c) > 0.25 && !near(c, WHITE, 60))
  d.colors.accent = vivid[0] ? readable(vivid[0], d.colors.paper, 2.5) : d.heading.color

  // ---- type
  const font = most(bodyLines.filter((l) => l.font).map((l) => [l.font, l.text.length]))
  const headFont = most(sample.filter((h) => h.font).map((h) => [h.font, 1])) ?? name?.font
  d.fonts.body = font ? matchFont(font) : 'inter'
  d.fonts.heading = headFont ? matchFont(headFont, false) : d.fonts.body
  // OCR measures the height of the letters, which runs a little over the type size.
  d.fonts.size = clamp(round(parsed.body * (doc.ocr ? 0.94 : 1), 0.25), 8, 12.5)
  const pitches: number[] = []
  bodyLines.forEach((l, i) => {
    const next = bodyLines[i + 1]
    if (next && next.page === l.page && next.y - l.y > l.size * 0.9 && next.y - l.y < l.size * 2) pitches.push((next.y - l.y) / l.size)
  })
  if (pitches.length > 3) d.fonts.leading = clamp(round(median(pitches), 0.01), 1.15, 1.7)
  if (font) notes.push(`Set in ${font.replace(/([a-z])([A-Z])/g, '$1 $2')}; the nearest font here is used`)

  // ---- entries, bullets, skills
  const dated = all.filter((l) => !isBullet(l.text) && findDate(l.text) && l.flow !== 'side')
  const votes = { right: 0, left: 0, below: 0 }
  for (const l of dated) {
    const [cl, cr] = columnOf(l, parsed)
    const datePart = l.parts.findIndex((p) => findDate(p.text))
    if (l.parts.length > 1 && datePart === l.parts.length - 1 && l.parts[datePart].x > cl + (cr - cl) * 0.5) votes.right++
    else if (l.parts.length > 1 && datePart === 0) votes.left++
    else if (l.parts.length === 1 && findDate(l.text)?.rest.replace(/[^A-Za-z]/g, '').length === 0) votes.below++
    else votes.right += 0.4
  }
  if (dated.length) d.entry.dates = (Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0] as Design['entry']['dates']) ?? 'right'
  const mark = all.map((l) => /^\s*(\S)\s/.exec(l.text)?.[1]).find((m) => m && isBullet(`${m} x`))
  d.entry.bullet = !mark ? 'disc' : /[-–—‒]/.test(mark) ? 'dash' : /[·∙]/.test(mark) ? 'dot' : /[›»>➢➤►▸▶→]/.test(mark) ? 'chevron' : 'disc'
  const italics = dated.filter((l) => l.italic).length
  d.entry.subtitle = italics > dated.length * 0.3 ? 'italic' : 'plain'
  const skills = parsed.sections.find((s) => s.kind === 'skills')
  if (skills?.lines.length) {
    const lines = skills.lines
    const commas = lines.filter((l) => /[,;|]/.test(l.text)).length
    const cells = lines.filter((l) => l.parts.length > 1).length
    d.skills = commas >= lines.length * 0.5 ? 'inline' : cells >= lines.length * 0.5 ? 'chips' : 'list'
  }

  // ---- margins: the gap between the text and the edge of the paper
  const edge = two && d.sidebar.fill ? (layout.side === 'left' ? page.width - layout.right : layout.left) : Math.min(layout.left, page.width - layout.right)
  d.margin = clamp(Math.round((edge * 25.4) / 72), 8, 26)

  const swatches = [...new Set([d.colors.accent, d.heading.color, d.header.nameColor, d.sidebar.fill, band, d.colors.text].filter(Boolean))]
  return { design: d, slots, notes, swatches, regions }
}

/** The left and right edges of the column a line is in. */
function columnOf(line: Line, parsed: Parsed): [number, number] {
  const layout = parsed.flows.layouts[line.page] ?? parsed.flows.layouts[0]
  if (!layout?.gutter || line.flow === 'head') return [layout?.left ?? 0, layout?.right ?? 600]
  const leftColumn = (line.flow === 'side') === (layout.side === 'left')
  return leftColumn ? [layout.left, layout.gutter.x0] : [layout.gutter.x1, layout.right]
}

/** Whether a page has anything for the design to be read from. */
export const hasLooks = (page: PageModel | undefined): boolean => !!page && (page.raster !== null || page.fills.length > 0 || page.chunks.some((c) => c.color !== ''))
