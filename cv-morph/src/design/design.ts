// A design is every choice about how a CV looks, and nothing about what it
// says. The built-in templates are designs; so is the one worked out from a
// CV somebody liked the look of; and the design panel edits one field by field.

import type { FontId } from './fonts.ts'

export interface Design {
  name: string
  page: 'a4' | 'letter'
  /** Page margin, in millimetres. */
  margin: number
  columns: 1 | 2
  sidebar: {
    side: 'left' | 'right'
    /** Its share of the page width. */
    width: number
    /** Background colour, or '' for none. */
    fill: string
    text: string
    heading: string
  }
  header: {
    /** Across the top of the page, or at the top of one of the columns. */
    place: 'top' | 'main' | 'side'
    align: 'left' | 'center' | 'right'
    /** A band of colour behind it, or '' for none. */
    fill: string
    nameColor: string
    textColor: string
    /** In points. */
    nameSize: number
    nameWeight: 400 | 700
    nameCase: 'none' | 'upper'
    /** Letter-spacing of the name, in ems. */
    nameSpacing: number
    /** Contact details on one running line, or one to a line. */
    contacts: 'inline' | 'stacked'
    /** A ruled line under the header. */
    rule: boolean
    photo: 'none' | 'round' | 'square'
  }
  colors: {
    paper: string
    text: string
    muted: string
    accent: string
    rule: string
  }
  fonts: {
    body: FontId
    heading: FontId
    /** Body size, in points. */
    size: number
    /** Line height, as a multiple of the size. */
    leading: number
  }
  heading: {
    /** In points. */
    size: number
    weight: 400 | 700
    case: 'none' | 'upper'
    spacing: number
    color: string
    /** A line under or over, a filled band behind, a bar beside, or nothing. */
    rule: 'none' | 'under' | 'over' | 'band' | 'bar'
    align: 'left' | 'center'
  }
  entry: {
    /** Dates at the right of the title, in a column at the left, or on a line of their own. */
    dates: 'right' | 'left' | 'below'
    subtitle: 'italic' | 'plain' | 'accent'
    bullet: 'disc' | 'dash' | 'dot' | 'chevron' | 'none'
  }
  /** Skills on a running line, one to a line, or as chips. */
  skills: 'inline' | 'list' | 'chips'
  /** Space between sections and entries: 0.7 is tight, 1.4 airy. */
  spacing: number
}

export const PAGES = {
  // In CSS pixels: 1/96 of an inch, so that a pixel is exactly 0.75 of a PDF point.
  a4: { width: 793.7008, height: 1122.5197, label: 'A4' },
  letter: { width: 816, height: 1056, label: 'US Letter' },
} as const

export const PX_PER_MM = 96 / 25.4
export const PX_PER_PT = 96 / 72

const BASE: Design = {
  name: 'Modern',
  page: 'a4',
  margin: 16,
  columns: 1,
  sidebar: { side: 'left', width: 0.32, fill: '', text: '#1f2933', heading: '#1d4ed8' },
  header: {
    place: 'top',
    align: 'left',
    fill: '',
    nameColor: '#111827',
    textColor: '#4b5563',
    nameSize: 25,
    nameWeight: 700,
    nameCase: 'none',
    nameSpacing: 0,
    contacts: 'inline',
    rule: false,
    photo: 'none',
  },
  colors: { paper: '#ffffff', text: '#1f2933', muted: '#5b6673', accent: '#1d4ed8', rule: '#cfd6de' },
  fonts: { body: 'inter', heading: 'inter', size: 10, leading: 1.42 },
  heading: { size: 10.5, weight: 700, case: 'upper', spacing: 0.08, color: '#1d4ed8', rule: 'under', align: 'left' },
  entry: { dates: 'right', subtitle: 'plain', bullet: 'disc' },
  skills: 'inline',
  spacing: 1,
}

type Patch = {
  [K in keyof Design]?: Design[K] extends object ? Partial<Design[K]> : Design[K]
}

/** A design made by changing some fields of another. */
export function withDesign(base: Design, patch: Patch): Design {
  const out = structuredClone(base) as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value !== null && typeof value === 'object' ? { ...(out[key] as object), ...value } : value
  }
  return out as unknown as Design
}

/** The templates offered in the design panel. The first is what a new CV starts in. */
export const PRESETS: Design[] = [
  BASE,
  withDesign(BASE, {
    name: 'Classic',
    header: { align: 'center', nameColor: '#111111', textColor: '#333333', nameSize: 22, rule: true },
    colors: { text: '#1a1a1a', muted: '#444444', accent: '#111111', rule: '#111111' },
    fonts: { body: 'tinos', heading: 'tinos', size: 10.5, leading: 1.36 },
    heading: { size: 11.5, color: '#111111', spacing: 0.04, rule: 'under' },
    entry: { subtitle: 'italic' },
  }),
  withDesign(BASE, {
    name: 'Sidebar',
    columns: 2,
    margin: 14,
    sidebar: { side: 'left', width: 0.32, fill: '#16233b', text: '#e6ebf5', heading: '#8fd3ff' },
    header: { place: 'side', nameColor: '#ffffff', textColor: '#c3cee2', nameSize: 22, contacts: 'stacked' },
    colors: { text: '#1c2430', muted: '#5c6675', accent: '#1f4e8c', rule: '#d5dbe5' },
    fonts: { body: 'lato', heading: 'lato', size: 10, leading: 1.42 },
    heading: { color: '#1f4e8c', rule: 'under', spacing: 0.1 },
    skills: 'list',
  }),
  withDesign(BASE, {
    name: 'Banner',
    header: { fill: '#0f766e', nameColor: '#ffffff', textColor: '#d5f2ee', nameSize: 26, align: 'left' },
    colors: { accent: '#0f766e', rule: '#cfe3e0' },
    fonts: { body: 'source-sans-3', heading: 'source-sans-3', size: 10.5, leading: 1.4 },
    heading: { color: '#0f766e', rule: 'bar', case: 'none', spacing: 0, size: 12.5 },
    entry: { subtitle: 'accent' },
    skills: 'chips',
  }),
  withDesign(BASE, {
    name: 'Split',
    columns: 2,
    sidebar: { side: 'right', width: 0.3, fill: '#f1f3f6', text: '#27303b', heading: '#b4532a' },
    header: { place: 'top', align: 'left', nameColor: '#1b1f24', nameSize: 27, rule: true },
    colors: { accent: '#b4532a', rule: '#d9dde3' },
    fonts: { body: 'open-sans', heading: 'montserrat', size: 9.5, leading: 1.45 },
    heading: { color: '#b4532a', rule: 'none', spacing: 0.1, size: 10 },
    skills: 'list',
  }),
  withDesign(BASE, {
    name: 'Timeline',
    margin: 18,
    header: { nameSize: 24, nameWeight: 400, nameCase: 'upper', nameSpacing: 0.08, textColor: '#5a6470' },
    colors: { accent: '#374151', rule: '#d1d5db', muted: '#6b7280' },
    fonts: { body: 'carlito', heading: 'carlito', size: 11, leading: 1.36 },
    heading: { color: '#111827', rule: 'over', spacing: 0.1, size: 10.5 },
    entry: { dates: 'left', subtitle: 'plain', bullet: 'dash' },
    spacing: 1.1,
  }),
  withDesign(BASE, {
    name: 'Executive',
    header: { align: 'center', nameColor: '#1c1917', nameSize: 28, nameWeight: 400, textColor: '#57534e', rule: true },
    colors: { text: '#292524', muted: '#57534e', accent: '#7c2d12', rule: '#a8a29e' },
    fonts: { body: 'eb-garamond', heading: 'playfair-display', size: 11.5, leading: 1.32 },
    heading: { color: '#7c2d12', rule: 'under', align: 'center', spacing: 0.1, size: 11, weight: 400 },
    entry: { subtitle: 'italic', bullet: 'dot' },
  }),
  withDesign(BASE, {
    name: 'Mono band',
    header: { nameSize: 24, nameColor: '#0b1220' },
    colors: { accent: '#0b1220', rule: '#e2e6ec' },
    fonts: { body: 'roboto', heading: 'roboto', size: 10, leading: 1.42 },
    heading: { color: '#0b1220', rule: 'band', spacing: 0.1, size: 10 },
    entry: { subtitle: 'accent', bullet: 'chevron' },
    skills: 'chips',
  }),
]

export const DEFAULT_DESIGN = PRESETS[0]

/** Fills in fields a stored design lacks, so one saved by an older version still opens. */
export function completeDesign(stored: unknown): Design {
  if (!stored || typeof stored !== 'object') return structuredClone(DEFAULT_DESIGN)
  return withDesign(DEFAULT_DESIGN, stored as Patch)
}
