// The typefaces a CV can be set in. Each is an open-licensed family shipped
// with the app (never fetched from a font service), in regular, bold and
// their italics, so that the same files draw the page and are embedded in the
// exported PDF. Several are drop-in stand-ins for the fonts CVs are usually
// written in: Carlito sets like Calibri, Arimo like Arial, Tinos like Times.

export type FontId =
  | 'inter'
  | 'carlito'
  | 'arimo'
  | 'lato'
  | 'open-sans'
  | 'roboto'
  | 'source-sans-3'
  | 'montserrat'
  | 'poppins'
  | 'tinos'
  | 'caladea'
  | 'eb-garamond'
  | 'merriweather'
  | 'playfair-display'

export interface FontInfo {
  id: FontId
  label: string
  /** What it is close to, shown beside the name. */
  note: string
  serif: boolean
  /** The name Word should be given: the font this one stands in for, where there is one. */
  word: string
  /** The names of fonts, as files give them, that this one replaces. */
  like: RegExp
}

export const FONTS: FontInfo[] = [
  { id: 'inter', label: 'Inter', note: 'clean, modern', serif: false, word: 'Inter', like: /inter\b|segoe|sf ?pro|san ?francisco|system|aptos|ubuntu/i },
  { id: 'carlito', label: 'Carlito', note: 'sets like Calibri', serif: false, word: 'Calibri', like: /calibri|carlito|candara|corbel/i },
  { id: 'arimo', label: 'Arimo', note: 'sets like Arial', serif: false, word: 'Arial', like: /arial|helvetica|arimo|liberation ?sans|nimbus ?san|swiss/i },
  { id: 'lato', label: 'Lato', note: 'warm, rounded', serif: false, word: 'Lato', like: /lato|gill|trebuchet|optima|candara/i },
  { id: 'open-sans', label: 'Open Sans', note: 'open, friendly', serif: false, word: 'Open Sans', like: /open ?sans|verdana|tahoma|noto ?sans|droid|dejavu ?sans|lucida/i },
  { id: 'roboto', label: 'Roboto', note: 'neutral, technical', serif: false, word: 'Roboto', like: /roboto|din\b|barlow/i },
  { id: 'source-sans-3', label: 'Source Sans', note: 'crisp, compact', serif: false, word: 'Source Sans 3', like: /source ?sans|myriad|frutiger|fira|computer modern sans|pt ?sans/i },
  { id: 'montserrat', label: 'Montserrat', note: 'geometric, wide', serif: false, word: 'Montserrat', like: /montserrat|gotham|proxima|avenir|futura|century ?gothic|raleway|josefin/i },
  { id: 'poppins', label: 'Poppins', note: 'geometric, soft', serif: false, word: 'Poppins', like: /poppins|nunito|quicksand|comfortaa|work ?sans|dm ?sans|manrope|outfit/i },
  { id: 'tinos', label: 'Tinos', note: 'sets like Times', serif: true, word: 'Times New Roman', like: /times|tinos|liberation ?serif|nimbus ?rom|computer modern|latin modern|cmr\d|stix|libertin/i },
  { id: 'caladea', label: 'Caladea', note: 'sets like Cambria', serif: true, word: 'Cambria', like: /cambria|caladea|constantia|charter/i },
  { id: 'eb-garamond', label: 'EB Garamond', note: 'bookish, elegant', serif: true, word: 'Garamond', like: /garamond|sabon|minion|cormorant|crimson|baskerville|caslon|goudy/i },
  { id: 'merriweather', label: 'Merriweather', note: 'sturdy serif', serif: true, word: 'Georgia', like: /georgia|merriweather|palatino|book ?antiqua|bookman|pt ?serif|noto ?serif|source ?serif|lora|droid ?serif|roboto ?slab|rockwell/i },
  { id: 'playfair-display', label: 'Playfair Display', note: 'high-contrast display', serif: true, word: 'Playfair Display', like: /playfair|didot|bodoni|abril/i },
]

export const fontInfo = (id: FontId): FontInfo => FONTS.find((f) => f.id === id) ?? FONTS[0]

/** The CSS name each family is registered under: its own, so a font of the same name on the device is never used instead. */
export const cssFamily = (id: FontId): string => `CVM ${fontInfo(id).label}`

export const fontStack = (id: FontId): string => `'${cssFamily(id)}', ${fontInfo(id).serif ? 'Georgia, serif' : 'Arial, sans-serif'}`

/** The shipped family closest to a font named in a file; `serif` settles it when the name says nothing. */
export function matchFont(name: string, serif = false): FontId {
  const spaced = name.replace(/([a-z])([A-Z])/g, '$1 $2')
  for (const font of FONTS) if (font.like.test(name) || font.like.test(spaced)) return font.id
  if (/serif|roman|antiqua|book\b/i.test(name) && !/sans/i.test(name)) return 'tinos'
  return serif ? 'tinos' : 'inter'
}
