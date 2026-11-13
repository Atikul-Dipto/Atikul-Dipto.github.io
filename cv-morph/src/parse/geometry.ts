// The one shape every kind of file is turned into before it is read as a CV:
// pages of text runs with where they sit, how big they are and how they look.
// A PDF gives this directly, a picture gives it through OCR, and a Word file
// by laying it out in the page. Everything after this point (finding columns,
// headings, entries; copying a design) works from these and nothing else.

/** A run of text on one line: the words of a sentence, or one cell of a row. */
export interface Chunk {
  text: string
  /** The box, from the page's top-left corner, in page units. */
  x: number
  y: number
  w: number
  h: number
  /** Type size, in page units. */
  size: number
  bold: boolean
  italic: boolean
  /** How many of the leading characters are bold: "Tools: Excel, SQL" with a bold label has 6. */
  lead: number
  /** The typeface's name when the file says, else ''. */
  font: string
  /** The ink colour as #rrggbb when known, else ''. */
  color: string
  /** The file itself marks this as a list item (Word). */
  bullet: boolean
  /** Where the links over this run lead. */
  links: string[]
}

/** The page as pixels, for reading colours, rules and fills off it. */
export interface Raster {
  width: number
  height: number
  data: Uint8ClampedArray
  /** Raster pixels per page unit. */
  scale: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Tinted extends Box {
  color: string
}

export interface PageModel {
  width: number
  height: number
  chunks: Chunk[]
  raster: Raster | null
  /** Ruled lines and filled blocks, when the source knows them outright (Word). */
  rules: Tinted[]
  fills: Tinted[]
}

export type DocKind = 'pdf' | 'image' | 'docx' | 'text'

export interface DocModel {
  kind: DocKind
  name: string
  pages: PageModel[]
  /** Points per page unit: 1 for a PDF, and a picture's is worked out from the sheet it shows. */
  unit: number
  /** Whether the text came from OCR, so sizes and weights are estimates. */
  ocr: boolean
  /** Whether the file breaks words across lines with a hyphen, as TeX does. */
  soft: boolean
  /** A small picture of the first page (a data URL), or '' when there is none to show. */
  preview: string
}

export type Flow = 'head' | 'main' | 'side'

export interface Part {
  text: string
  x: number
  w: number
  bold: boolean
  links: string[]
}

/** What the reader needs to know about where the lines came from. */
export interface Ctx {
  /** Positions and looks are real (not pasted text). */
  geometry: boolean
  /** The file breaks words across lines with a hyphen, as TeX does. */
  soft: boolean
}

/** A line of text as a reader sees it, within one column. A tab in `text` marks a wide gap. */
export interface Line {
  text: string
  x: number
  y: number
  w: number
  h: number
  size: number
  bold: boolean
  italic: boolean
  lead: number
  font: string
  color: string
  bullet: boolean
  links: string[]
  parts: Part[]
  page: number
  flow: Flow
  /** The blank space above it, in page units; -1 when it starts a page and there is no telling. */
  gap: number
}

export const blankChunk = (text: string, x: number, y: number, w: number, h: number, size: number): Chunk => ({
  text,
  x,
  y,
  w,
  h,
  size,
  bold: false,
  italic: false,
  lead: 0,
  font: '',
  color: '',
  bullet: false,
  links: [],
})

export const median = (values: number[]): number => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** The type size most of the text is set in: each run counts by its length. */
export function bodySize(chunks: Chunk[]): number {
  const weighted: [number, number][] = chunks.filter((c) => c.text.trim().length > 1).map((c) => [c.size, c.text.length])
  if (!weighted.length) return 10
  weighted.sort((a, b) => a[0] - b[0])
  const half = weighted.reduce((sum, [, n]) => sum + n, 0) / 2
  let run = 0
  for (const [size, n] of weighted) {
    run += n
    if (run >= half) return size
  }
  return weighted[weighted.length - 1][0]
}
