import { KINDS, newEntry, newGroup, newItem, newSection } from '../model/sections.ts'
import type { Entry, Section, SectionKind, TagGroup } from '../model/types.ts'
import { isContactLine } from './contacts.ts'
import { scanEntries } from './entries.ts'
import { median, type Ctx, type Line } from './geometry.ts'
import { dangles, findDate, flat, isBullet, joinWrapped, splitList, stripBullet, titleCase } from './text.ts'

const startsLower = (text: string) => /^[a-z(]/.test(text)
const endsSentence = (text: string) => /[.!?:;]["')\]]?$/.test(text.trim())
const bulleted = (line: Line) => line.bullet || isBullet(line.text)
const bare = (line: Line) => (isBullet(line.text) ? stripBullet(flat(line.text)) : flat(line.text))

/** A paragraph or a few: wrapped lines are rejoined, and blank space or a bullet starts a new one. */
export function readText(lines: Line[], ctx: Ctx): string {
  const gaps = median(lines.map((l) => l.gap).filter((g) => g > 0))
  const out: string[] = []
  lines.forEach((line, i) => {
    const text = bare(line)
    if (!text) return
    const fresh = i === 0 || bulleted(line) || (line.gap >= 0 && gaps > 0 && line.gap > Math.max(gaps * 2, gaps + line.size * 0.5))
    if (fresh || !out.length) out.push(text)
    else out[out.length - 1] = joinWrapped(out[out.length - 1], text, ctx.soft)
  })
  return out.join('\n')
}

/** One item per bullet or line; a line that carries on a sentence joins the item above. */
export function readList(lines: Line[], ctx: Ctx): string[] {
  const { geometry, soft } = ctx
  const right = Math.max(...lines.map((l) => l.x + l.w), 0)
  const left = Math.min(...lines.map((l) => l.x), Infinity)
  const anyBullets = lines.some(bulleted)
  const out: string[] = []
  let prev: Line | null = null
  let markX = 0
  for (const line of lines) {
    const text = bare(line).replace(/\s*\t\s*/g, ' — ')
    if (!text) continue
    const isItem = bulleted(line)
    const last = out[out.length - 1]
    let joins = false
    if (!isItem && prev && last !== undefined) {
      const full = geometry && prev.x + prev.w > right - (right - left) * 0.07 && prev.w > (right - left) * 0.55
      if (anyBullets) joins = geometry ? line.x > markX + line.size * 0.3 || startsLower(text) : startsLower(text) || !endsSentence(last)
      else joins = startsLower(text) || (full && !endsSentence(last) && !findDate(line.text))
    }
    if (joins) out[out.length - 1] = joinWrapped(last, text, soft)
    else {
      out.push(text)
      if (isItem) markX = line.x
    }
    prev = line
  }
  return out
}

/**
 * Skills and the like: groups of short items. "Tools: Excel, SQL" is a
 * labelled group; a short bold line above a run of items is a label too;
 * anything else is split on commas, bars and wide gaps into one loose group.
 */
export function readTags(lines: Line[], ctx: Ctx): TagGroup[] {
  const groups: TagGroup[] = []
  let cur: TagGroup | null = null
  // A line that runs to the margin and stops without a comma was cut mid-item:
  // "..., KPI" then "Reporting, ..." is "KPI Reporting".
  const right = Math.max(...lines.map((l) => l.x + l.w), 0)
  const left = Math.min(...lines.map((l) => l.x), Infinity)
  const cutShort = (line: Line, text: string) =>
    !/[,;|]\s*$/.test(text) && (ctx.geometry ? line.x + line.w > right - (right - left) * 0.14 : text.length > 60 && /[,;|]/.test(text))
  // In a list a comma ends an item; only a word like "and" left hanging says the item carries on.
  const hangs = (text: string) => !/[,;|]\s*$/.test(text) && dangles(text)
  let carry = false
  const into = (label: string): TagGroup => {
    cur = newGroup(titleCase(label))
    groups.push(cur)
    return cur
  }
  lines.forEach((line, i) => {
    const text = bare(line)
    if (!text) return
    const labelled = /^([^:,;|]{2,44}):\s*(.*)$/.exec(text)
    if (labelled && !/^https?$/i.test(labelled[1])) {
      const group = into(labelled[1])
      for (const item of splitList(labelled[2])) group.items.push(newItem(item))
      // Only a line of several items can have been cut mid-item; one skill to a line is just a list.
      carry = hangs(text) || (group.items.length >= 2 && cutShort(line, text))
      return
    }
    const next = lines[i + 1]
    const words = text.split(/\s+/).length
    const looksLabel = !bulleted(line) && words <= 4 && !/[,;|•·\t]/.test(line.text) && line.bold && next !== undefined && !next.bold
    if (looksLabel) {
      into(text)
      carry = false
      return
    }
    const group: TagGroup = cur ?? into('')
    const above = group.items[group.items.length - 1]
    // One skill wrapped onto a second line ("Stakeholder" / "communication"):
    // it starts in lower case, and would not have fitted on the line above.
    const prevLine = lines[i - 1]
    if (ctx.geometry && above && prevLine && !bulleted(line) && /^[a-z]/.test(text) && !/[,;|]/.test(text)) {
      const firstWord = text.split(' ')[0]
      const wouldFit = prevLine.x + prevLine.w + line.size * 0.3 + (line.w * firstWord.length) / text.length < right
      if (!wouldFit) {
        above.text = joinWrapped(above.text, text, ctx.soft)
        carry = false
        return
      }
    }
    // Chips and columns of skills come as separate runs on one line: each run is its own item.
    const cells = line.parts.length > 1 ? line.parts.map((part) => part.text).filter((cell) => cell.replace(/[^A-Za-z0-9]/g, '')) : [line.text.replace(/^\s*[•●▪◦*-]\s+/, '')]
    const items = cells.flatMap((cell) => splitList(cell)).map(tidyTag)
    if (carry && above && items.length && !bulleted(line)) above.text = joinWrapped(above.text, items.shift() ?? '', ctx.soft)
    const several = items.length >= 2
    for (const item of items) group.items.push(newItem(item))
    carry = hangs(text) || (several && cutShort(line, text))
  })
  for (const group of groups) group.items = group.items.filter((item) => item.text)
  return groups.filter((group) => group.items.length || group.label)
}

/** Drops the stars, dots and bars some designs draw after a skill to rate it. */
const tidyTag = (text: string): string =>
  text
    .replace(/[★☆●○■□⬤⚫⚪]{2,}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

/**
 * Referees: a name, then what they do and how to reach them. Each person
 * starts at a bold name, or after blank space, or at a line that reads like a
 * name once the one before has given a phone or an email.
 */
export function readPeople(lines: Line[]): Entry[] {
  const texts = lines.map((l) => flat(l.text))
  if (lines.length < 3 || texts.some((t) => t.length > 90)) return []
  const gaps = median(lines.map((l) => l.gap).filter((g) => g > 0))
  const someBold = lines.some((l) => l.bold) && !lines.every((l) => l.bold)
  const nameLike = (text: string) => /^(?:[A-Z][\w.'-]*\s?){2,5}$/.test(text) && !/\d|:/.test(text)
  const blocks: string[][] = []
  lines.forEach((line, i) => {
    const text = texts[i]
    if (!text) return
    const prev = texts[i - 1] ?? ''
    const starts =
      i === 0 ||
      (someBold ? line.bold && !lines[i - 1].bold : (line.gap >= 0 && gaps > 0 && line.gap > Math.max(gaps * 2, gaps + line.size * 0.5)) || (nameLike(text) && isContactLine(prev)))
    if (starts) blocks.push([])
    blocks[blocks.length - 1].push(text)
  })
  if (blocks.some((b) => b.length < 2)) return []
  return blocks.map((block) => {
    const second = block[1] && !isContactLine(block[1]) ? block[1] : ''
    return newEntry({ title: block[0], subtitle: second, summary: block.slice(second ? 2 : 1).join('\n') })
  })
}

/** Turns the lines under a heading into a section of the kind the heading names. */
export function readSection(kind: SectionKind, title: string, lines: Line[], ctx: Ctx): Section {
  const section = newSection(kind, title || KINDS[kind].title)
  const want = KINDS[kind].shape
  const dates = lines.filter((l) => !bulleted(l) && findDate(l.text)).length
  const bullets = lines.filter(bulleted).length

  if (want === 'text') {
    section.text = readText(lines, ctx)
    return section
  }
  if (want === 'tags') {
    section.groups = readTags(lines, ctx)
    return section
  }

  if (kind === 'references' && bullets === 0) {
    const people = readPeople(lines)
    if (people.length) {
      section.shape = 'entries'
      section.entries = people
      return section
    }
  }

  // Entries when asked for, or when a free-form section plainly has them
  // (dated heading lines with bullets or description under them).
  const tryEntries = want === 'entries' || (dates >= 1 && (bullets >= 1 || lines.length >= dates * 2))
  if (tryEntries) {
    const scan = scanEntries(lines, ctx)
    const structured = scan.dated > 0 || (scan.bulleted > 0 && scan.headed > 0) || scan.entries.some((e) => e.summary)
    if (structured || (want === 'entries' && scan.entries.length > 0 && scan.entries.every((e) => e.title && e.subtitle))) {
      section.shape = 'entries'
      section.entries = scan.entries
      return section
    }
  }
  if (kind === 'custom' && bullets === 0) {
    // No structure to go by: short comma-separated lines are tags, sentences are text.
    const flatLines = lines.map((l) => flat(l.text)).filter(Boolean)
    const average = flatLines.reduce((n, t) => n + t.length, 0) / Math.max(1, flatLines.length)
    const separators = flatLines.filter((t) => /[,;|•·]/.test(t)).length
    if (separators >= flatLines.length * 0.6 && average < 90 && !flatLines.some((t) => /[.!?]$/.test(t))) {
      section.shape = 'tags'
      section.groups = readTags(lines, ctx)
      return section
    }
    if (average > 70) {
      section.shape = 'text'
      section.text = readText(lines, ctx)
      return section
    }
  }
  section.shape = 'list'
  section.items = readList(lines, ctx).map(newItem)
  return section
}
