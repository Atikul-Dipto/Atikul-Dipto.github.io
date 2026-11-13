import { bodySize, type Chunk, type Flow, type Line, type PageModel, type Part } from './geometry.ts'
import { findDate, flat, isPlace } from './text.ts'

/** How one page is laid out: one column, or two with an optional full-width band above and below. */
export interface PageLayout {
  /** The empty band between two columns, or null for a single column. */
  gutter: { x0: number; x1: number } | null
  /** Where the columns start and stop; text above and below runs the full width. */
  top: number
  bottom: number
  /** Which column is the narrow one. */
  side: 'left' | 'right' | null
  /** The left and right edges of the text. */
  left: number
  right: number
}

interface Candidate {
  x: number
  z0: number
  z1: number
  x0: number
  x1: number
}

/**
 * Looks for two columns: a vertical band, somewhere in the middle of the
 * page, that no line of text crosses for most of the page's height, with text
 * on both sides of it. Lines above the band (a name across the top) and below
 * it are allowed to cross.
 *
 * A single column with its dates set to the right has such a band too, so the
 * right-hand side must be more than dates and places.
 */
export function findColumns(page: PageModel): PageLayout {
  const chunks = page.chunks.filter((c) => c.text.trim())
  const left = Math.min(...chunks.map((c) => c.x), page.width)
  const right = Math.max(...chunks.map((c) => c.x + c.w), 0)
  const single: PageLayout = { gutter: null, top: 0, bottom: page.height, side: null, left, right }
  if (chunks.length < 10) return single

  const top = Math.min(...chunks.map((c) => c.y))
  const bottom = Math.max(...chunks.map((c) => c.y + c.h))
  const extent = bottom - top
  const body = bodySize(chunks)
  const step = page.width / 320
  const totalChars = chunks.reduce((n, c) => n + c.text.length, 0)

  const found: Candidate[] = []
  for (let x = left + (right - left) * 0.16; x <= left + (right - left) * 0.84; x += step) {
    const crossing = chunks.filter((c) => c.x < x - step && c.x + c.w > x + step).sort((a, b) => a.y - b.y)
    // The tallest stretch of the page that nothing crosses at this x.
    let z0 = top
    let z1 = top
    let cursor = top
    for (const c of crossing) {
      if (c.y - cursor > z1 - z0) [z0, z1] = [cursor, c.y]
      cursor = Math.max(cursor, c.y + c.h)
    }
    if (bottom - cursor > z1 - z0) [z0, z1] = [cursor, bottom]
    if (z1 - z0 < extent * 0.5) continue

    const inside = chunks.filter((c) => c.y + c.h / 2 > z0 && c.y + c.h / 2 < z1)
    const lefts = inside.filter((c) => c.x + c.w <= x + step)
    const rights = inside.filter((c) => c.x >= x - step)
    if (lefts.length < 4 || rights.length < 4) continue
    const chars = (list: Chunk[]) => list.reduce((n, c) => n + c.text.length, 0)
    if (Math.min(chars(lefts), chars(rights)) < totalChars * 0.04) continue
    if (isMostlyDates(rights) || isMostlyDates(lefts)) continue
    const x0 = Math.max(...lefts.map((c) => c.x + c.w))
    const x1 = Math.min(...rights.map((c) => c.x))
    if (x1 - x0 < Math.max(page.width * 0.01, body * 0.6)) continue
    found.push({ x, z0, z1, x0, x1 })
  }
  if (!found.length) return single

  // The tallest free stretch wins; among equals, the widest band.
  found.sort((a, b) => b.z1 - b.z0 - (a.z1 - a.z0) || b.x1 - b.x0 - (a.x1 - a.x0))
  const best = found[0]
  const leftWidth = best.x0 - left
  const rightWidth = right - best.x1
  return {
    gutter: { x0: best.x0, x1: best.x1 },
    top: best.z0 <= top ? 0 : best.z0,
    bottom: best.z1 >= bottom ? page.height : best.z1,
    side: leftWidth < rightWidth * 0.88 ? 'left' : 'right',
    left,
    right,
  }
}

/** Short runs that are dates or places: the right-hand "column" of a one-column CV. */
function isMostlyDates(chunks: Chunk[]): boolean {
  let dateLike = 0
  for (const c of chunks) {
    const text = flat(c.text)
    if (text.length <= 34 && (findDate(text)?.rest.replace(/[^A-Za-z]/g, '').length ?? 99) < 4) dateLike++
    else if (text.length <= 34 && isPlace(text)) dateLike++
  }
  return dateLike >= chunks.length * 0.6
}

/** Chunks on one baseline, left to right, become a line; a wide gap between two is kept as a tab. */
function toLines(chunks: Chunk[], page: number, flow: Flow): Line[] {
  const sorted = [...chunks].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2))
  const rows: Chunk[][] = []
  for (const c of sorted) {
    const row = rows[rows.length - 1]
    const mid = c.y + c.h / 2
    if (row) {
      const rowTop = Math.min(...row.map((r) => r.y))
      const rowBottom = Math.max(...row.map((r) => r.y + r.h))
      const rowMid = (rowTop + rowBottom) / 2
      if (Math.abs(mid - rowMid) < Math.min(c.h, rowBottom - rowTop) * 0.5) {
        row.push(c)
        continue
      }
    }
    rows.push([c])
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x)
    const lead = row[0]
    const main = row.reduce((best, c) => (c.text.length > best.text.length ? c : best), lead)
    let text = ''
    const parts: Part[] = []
    row.forEach((c, i) => {
      if (i > 0) {
        const prev = row[i - 1]
        const gap = c.x - (prev.x + prev.w)
        text += gap > Math.max(prev.size, c.size) * 2.5 ? '\t' : ' '
      }
      text += c.text.trim()
      parts.push({ text: c.text.trim(), x: c.x, w: c.w, bold: c.bold, links: c.links })
    })
    const x = lead.x
    const y = Math.min(...row.map((c) => c.y))
    const boldChars = row.reduce((n, c) => n + (c.bold ? c.text.length : 0), 0)
    const allChars = row.reduce((n, c) => n + c.text.length, 0)
    return {
      text,
      x,
      y,
      w: Math.max(...row.map((c) => c.x + c.w)) - x,
      h: Math.max(...row.map((c) => c.y + c.h)) - y,
      size: main.size,
      bold: lead.bold || boldChars > allChars * 0.6,
      italic: main.italic,
      lead: lead.lead,
      font: main.font,
      color: lead.color || main.color,
      bullet: lead.bullet,
      links: row.flatMap((c) => c.links),
      parts,
      page,
      flow,
      gap: 0,
    }
  })
}

/**
 * Two short blocks set side by side (two referees, an address beside a
 * name) come off the page as lines with a wide gap in the middle. Three or
 * more such lines in a row, with their right halves lined up, are read as
 * the left block and then the right one. Right halves that are only dates
 * and places are left where they are: those belong to the line.
 */
function unweave(lines: Line[], pageWidth: number): Line[] {
  const out: Line[] = []
  const tol = pageWidth * 0.012
  let i = 0
  while (i < lines.length) {
    let j = i
    while (j < lines.length && lines[j].parts.length === 2 && lines[j].text.includes('\t')) j++
    const run = lines.slice(i, j)
    const rights = run.map((l) => l.parts[1])
    const edges = (pick: (p: Part) => number) => Math.max(...rights.map(pick)) - Math.min(...rights.map(pick))
    const aligned = run.length >= 3 && (edges((p) => p.x) <= tol || edges((p) => p.x + p.w) <= tol)
    const datesOnly = rights.filter((p) => p.text.length <= 34 && (isPlace(p.text) || (findDate(p.text)?.rest.replace(/[^A-Za-z]/g, '').length ?? 99) < 4)).length >= rights.length * 0.5
    if (!aligned || datesOnly) {
      out.push(...lines.slice(i, Math.max(j, i + 1)))
      i = Math.max(j, i + 1)
      continue
    }
    const half = (line: Line, part: Part, first: boolean): Line => ({
      ...line,
      text: part.text,
      x: part.x,
      w: part.w,
      bold: part.bold,
      lead: first ? line.lead : 0,
      links: part.links,
      parts: [part],
    })
    out.push(...run.map((l) => half(l, l.parts[0], true)), ...run.map((l) => half(l, l.parts[1], false)))
    i = j
  }
  return out
}

export interface Flows {
  head: Line[]
  main: Line[]
  side: Line[]
  layouts: PageLayout[]
}

/**
 * Puts a document's text in reading order: what runs across the top of the
 * first page, then the main column of every page, then the sidebar of every
 * page. A section that carries over a page break stays in one piece.
 */
export function readingOrder(pages: PageModel[]): Flows {
  const out: Flows = { head: [], main: [], side: [], layouts: [] }
  pages.forEach((page, p) => {
    const layout = findColumns(page)
    out.layouts.push(layout)
    const chunks = page.chunks.filter((c) => c.text.trim())
    if (!layout.gutter) {
      out.main.push(...unweave(toLines(chunks, p, 'main'), page.width))
      return
    }
    const mid = (layout.gutter.x0 + layout.gutter.x1) / 2
    const above: Chunk[] = []
    const below: Chunk[] = []
    const lefts: Chunk[] = []
    const rights: Chunk[] = []
    for (const c of chunks) {
      const cy = c.y + c.h / 2
      if (cy < layout.top) above.push(c)
      else if (cy > layout.bottom) below.push(c)
      else (c.x + c.w / 2 < mid ? lefts : rights).push(c)
    }
    const [main, side] = layout.side === 'left' ? [rights, lefts] : [lefts, rights]
    // Only the first page has a header; a line across the top of a later page continues the text.
    const read = (list: Chunk[], flow: Flow) => unweave(toLines(list, p, flow), page.width)
    if (p === 0) out.head.push(...read(above, 'head'))
    else out.main.push(...read(above, 'main'))
    out.main.push(...read(main, 'main'), ...read(below, 'main'))
    out.side.push(...read(side, 'side'))
  })
  for (const lines of [out.head, out.main, out.side]) {
    lines.forEach((line, i) => {
      const prev = lines[i - 1]
      line.gap = !prev ? 0 : prev.page !== line.page ? -1 : Math.max(0, line.y - (prev.y + prev.h))
    })
  }
  return out
}
