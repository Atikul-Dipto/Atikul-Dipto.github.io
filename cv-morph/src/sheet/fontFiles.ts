import { cssFamily, FONTS, type FontId } from '../design/fonts.ts'

// The font files themselves, straight out of the @fontsource packages: Vite
// copies the ones matched here into the build and hands back their addresses.
// WOFF rather than WOFF2 because the PDF export unpacks the same files to
// embed them, and WOFF is a plain zlib wrapper.
const FILES = import.meta.glob<string>('/node_modules/@fontsource/*/files/*-{latin,latin-ext}-{400,700}-{normal,italic}.woff', {
  query: '?url',
  import: 'default',
  eager: true,
})

export type Subset = 'latin' | 'latin-ext'
export const SUBSETS: Subset[] = ['latin', 'latin-ext']

// Which characters each file holds, as the packages' own stylesheets declare.
const RANGES: Record<Subset, string> = {
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  'latin-ext':
    'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
}

export function fontUrl(id: FontId, bold: boolean, italic: boolean, subset: Subset): string | undefined {
  return FILES[`/node_modules/@fontsource/${id}/files/${id}-${subset}-${bold ? 700 : 400}-${italic ? 'italic' : 'normal'}.woff`]
}

const ready = new Map<FontId, Promise<void>>()

/**
 * Makes a family available to the page. The Latin files are fetched at once,
 * so the first sight of a design is in its own type; the extended ones (for
 * names like Łukasz or Nguyễn) only if the text needs them.
 */
export function ensureFont(id: FontId): Promise<void> {
  let promise = ready.get(id)
  if (!promise) {
    const first: FontFace[] = []
    for (const bold of [false, true]) {
      for (const italic of [false, true]) {
        for (const subset of SUBSETS) {
          const url = fontUrl(id, bold, italic, subset)
          if (!url) continue
          const face = new FontFace(cssFamily(id), `url(${url}) format('woff')`, {
            weight: bold ? '700' : '400',
            style: italic ? 'italic' : 'normal',
            unicodeRange: RANGES[subset],
            display: 'swap',
          })
          document.fonts.add(face)
          if (subset === 'latin') first.push(face)
        }
      }
    }
    promise = Promise.all(first.map((face) => face.load().catch(() => null))).then(() => undefined)
    ready.set(id, promise)
  }
  return promise
}

export const ensureFonts = (ids: FontId[]): Promise<void> => Promise.all([...new Set(ids)].map(ensureFont)).then(() => undefined)

const bytes = new Map<string, Promise<Uint8Array | null>>()

/** The bytes of one font file, for embedding in a PDF; null if the family has no such file. */
export function fontBytes(id: FontId, bold: boolean, italic: boolean, subset: Subset): Promise<Uint8Array | null> {
  const url = fontUrl(id, bold, italic, subset)
  if (!url) return Promise.resolve(null)
  let promise = bytes.get(url)
  if (!promise) {
    promise = fetch(url)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .then((buffer) => (buffer ? new Uint8Array(buffer) : null))
      .catch(() => null)
    bytes.set(url, promise)
  }
  return promise
}

export const ALL_FONT_IDS: FontId[] = FONTS.map((f) => f.id)
