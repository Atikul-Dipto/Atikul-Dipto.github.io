import { emptyCv, isEmptySection, newContact, newSection } from '../model/sections.ts'
import { CONTACT_ID, type Arrangement, type Cv, type Section } from '../model/types.ts'
import { isContactLine, scanContacts } from './contacts.ts'
import { readSection } from './content.ts'
import { bodySize, type Ctx, type DocModel, type Flow, type Line } from './geometry.ts'
import { findHeadings, type HeadingKind } from './headings.ts'
import { readingOrder, type Flows } from './layout.ts'
import { findDate, flat, isPlace, isUpper, titleCase } from './text.ts'

export interface ParsedSection {
  /** The section as read; null for the contact details, which live with the name. */
  section: Section | null
  kind: HeadingKind
  flow: Flow
  heading: Line | null
  lines: Line[]
}

export type MarkRole = 'name' | 'headline' | 'contact' | 'heading' | 'text'

/** A line and what it turned out to be: the reading animation lights these up. */
export interface Mark {
  line: Line
  role: MarkRole
  label: string
}

export interface Parsed {
  cv: Cv
  /** Every section found, in reading order, with where it sat on the page. */
  sections: ParsedSection[]
  flows: Flows
  /** The type size of ordinary text, in page units. */
  body: number
  name: Line | null
  headline: Line | null
  /** The lines the contact details came from, when they sat by the name. */
  contactLines: Line[]
  marks: Mark[]
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length

/** Reads a document's text and positions as a CV. */
export function parseCv(doc: DocModel): Parsed {
  const geometry = doc.kind !== 'text'
  const ctx: Ctx = { geometry, soft: doc.soft }
  const flows = readingOrder(doc.pages)
  const body = bodySize(doc.pages.flatMap((p) => p.chunks))
  const marks: Mark[] = []

  // Each column is cut at its headings. What stands before a column's first
  // heading belongs with the name.
  const top: Line[] = [...flows.head]
  const found: ParsedSection[] = []
  for (const flow of ['main', 'side'] as const) {
    const lines = flows[flow]
    const headings = findHeadings(lines, body, geometry)
    const firstAt = headings.length ? headings[0].index : lines.length
    top.push(...lines.slice(0, firstAt))
    headings.forEach((h, i) => {
      const until = headings[i + 1]?.index ?? lines.length
      found.push({ section: null, kind: h.kind, flow, heading: h.line, lines: lines.slice(h.index + 1, until) })
    })
  }

  const cv = emptyCv()

  // No headings anywhere: keep the opening lines as the header and the rest as text.
  let loose: Line[] = []
  if (!found.length && top.length > 6) {
    const cut = Math.max(2, top.findIndex((l, i) => i >= 2 && l.gap > l.size * 1.2))
    loose = top.splice(cut > 2 ? cut : Math.min(6, top.length))
  }

  // ---- the name: the largest line near the top, else the first that reads like one.
  const nameLike = (l: Line) => {
    const text = flat(l.parts[0]?.text ?? l.text)
    return words(text) >= 1 && words(text) <= 5 && text.length <= 48 && !/[@\d:|/]/.test(text) && !isContactLine(l.text) && /[A-Za-z]/.test(text)
  }
  const candidates = top.filter((l) => l.page === 0 && nameLike(l))
  const biggest = Math.max(...candidates.map((l) => l.size), 0)
  let name: Line | null = (geometry && biggest > body * 1.12 ? candidates.find((l) => l.size >= biggest * 0.97) : candidates[0]) ?? null
  let nameText = ''
  let spacedName = false
  const used = new Set<Line>()
  let headline: Line | null = null
  const extraHead: string[] = []
  if (name) {
    used.add(name)
    nameText = flat(name.parts[0]?.text ?? name.text)
    if (name.parts.length > 1) extraHead.push(flat(name.parts.slice(1).map((p) => p.text).join(' ')))
    // A name set on two lines, first name over last.
    const below = top[top.indexOf(name) + 1]
    if (geometry && below && nameLike(below) && Math.abs(below.size - name.size) < name.size * 0.06 && words(nameText) <= 2 && words(below.text) <= 2 && below.flow === name.flow) {
      nameText = `${nameText} ${flat(below.text)}`
      used.add(below)
    }
    cv.name = titleCase(nameText)
    spacedName = !/\s/.test(nameText) && nameText.length >= 8
    marks.push({ line: name, role: 'name', label: 'Name' })
  }

  // ---- contact details and the line under the name.
  const rest = top.filter((l) => !used.has(l))
  const contactLines = rest.filter((l) => isContactLine(l.text) || l.links.length > 0)
  const wordLines = rest.filter((l) => !contactLines.includes(l))
  const scan = scanContacts(contactLines)
  cv.contacts.push(...scan.contacts)
  contactLines.forEach((line) => marks.push({ line, role: 'contact', label: 'Contact' }))

  const prose: string[] = []
  const leftovers: string[] = [...extraHead, ...scan.rest]
  for (const line of wordLines) {
    const text = flat(line.text.replace(/\t/g, ' · '))
    if (!text) continue
    if (!cv.headline && words(text) <= 14 && text.length <= 110 && !/[.!?]$/.test(text) && !isPlace(text)) {
      cv.headline = isUpper(text) ? titleCase(text) : text
      headline = line
      marks.push({ line, role: 'headline', label: 'Headline' })
    } else if (words(text) >= 9 || prose.length) prose.push(text)
    else leftovers.push(text)
  }
  for (const text of leftovers) {
    if (!text) continue
    if (!cv.headline && words(text) <= 14 && !isPlace(text) && !/^\W*$/.test(text)) cv.headline = text
    else if (isPlace(text) && !cv.contacts.some((c) => c.kind === 'location')) cv.contacts.push(newContact('location', text))
    else if (text.length > 1 && text !== cv.headline) cv.contacts.push(newContact('other', text))
  }

  // A letter-spaced name can come off the page with its words run together
  // ("MAYARAHMAN"). An email or profile address that spells the same letters
  // shows where the words part.
  if (spacedName) {
    const letters = cv.name.toLowerCase()
    for (const c of cv.contacts) {
      const handle = (c.kind === 'email' ? c.value.split('@')[0] : c.value.split('/').pop() ?? '').toLowerCase()
      const words = handle.split(/[._-]+/).filter((w) => /^[a-z]+$/.test(w))
      if (words.length >= 2 && words.join('') === letters) {
        cv.name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        break
      }
    }
  }

  // ---- the sections.
  const sections: ParsedSection[] = []
  if (prose.length) {
    const summary = newSection('summary')
    summary.text = prose.join(' ')
    sections.push({ section: summary, kind: 'summary', flow: 'main', heading: null, lines: [] })
  }
  if (loose.length) {
    const section = readSection('custom', 'Details', loose, ctx)
    sections.push({ section, kind: 'custom', flow: 'main', heading: null, lines: loose })
  }
  for (const block of found) {
    const title = block.heading ? titleCase(block.heading.text.replace(/^[^A-Za-z]+/, '').replace(/[\s:.\-–—_|•·]+$/, '')) : ''
    if (block.heading) marks.push({ line: block.heading, role: 'heading', label: title })
    if (block.kind === 'contact') {
      const side = scanContacts(block.lines)
      for (const c of side.contacts) {
        if (!cv.contacts.some((have) => have.kind === c.kind && have.value.toLowerCase() === c.value.toLowerCase())) cv.contacts.push(c)
      }
      for (const text of side.rest) {
        if (isPlace(text) && !cv.contacts.some((c) => c.kind === 'location')) cv.contacts.push(newContact('location', text))
        else if (text.length > 2 && !findDate(text)) cv.contacts.push(newContact('other', text))
      }
      block.lines.forEach((line) => marks.push({ line, role: 'contact', label: 'Contact' }))
      sections.push({ ...block, section: null })
      continue
    }
    const section = readSection(block.kind, title, block.lines, ctx)
    block.lines.forEach((line) => marks.push({ line, role: 'text', label: section.title }))
    if (!isEmptySection(section)) sections.push({ ...block, section })
  }
  // A summary found by the name and one under its own heading are the same thing.
  const summaries = sections.filter((s) => s.section?.kind === 'summary')
  if (summaries.length > 1 && !summaries[0].heading && summaries[0].section && summaries[1].section) {
    summaries[1].section.text = `${summaries[0].section.text}\n${summaries[1].section.text}`
    sections.splice(sections.indexOf(summaries[0]), 1)
  }

  cv.sections = sections.flatMap((s) => (s.section ? [s.section] : []))
  return { cv, sections, flows, body, name, headline, contactLines, marks }
}

/** Where the sections sat in the file that was read: the starting arrangement. */
export function arrangementOf(parsed: Parsed): Arrangement {
  const out: Arrangement = { main: [], side: [], hidden: [] }
  for (const s of parsed.sections) {
    const region = s.flow === 'side' ? out.side : out.main
    if (s.section) region.push(s.section.id)
    else if (s.kind === 'contact' && s.flow === 'side') region.push(CONTACT_ID)
  }
  return out
}
