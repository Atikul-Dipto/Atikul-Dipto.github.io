import { newEntry } from '../model/sections.ts'
import type { Entry } from '../model/types.ts'
import { median, type Ctx, type Line } from './geometry.ts'
import { dangles, findDate, flat, isBullet, isPlace, joinWrapped, stripBullet } from './text.ts'

interface Draft {
  heads: Line[]
  bullets: string[]
  summary: string
}

interface Body {
  kind: 'bullet' | 'prose'
  /** The last line of it read so far. */
  line: Line
  /** Where the bullet's mark sits; its text starts further right. */
  markX: number
}

export interface EntryScan {
  entries: Entry[]
  /** How much structure was found: a section with none of it is a plain list, not entries. */
  dated: number
  bulleted: number
  headed: number
}

const startsLower = (text: string) => /^[a-z(]/.test(text)
const endsSentence = (text: string) => /[.!?:;]["')\]]?$/.test(text.trim())

/**
 * Reads a run of lines as dated entries: jobs, degrees, projects.
 *
 * Each line is a bullet, the rest of a wrapped bullet or sentence, a sentence
 * of description, or a heading line (role, employer, dates, place). Heading
 * lines that follow bullets or description open a new entry; a run of heading
 * lines with nothing between them is cut into entries by its dates and the
 * space between its lines.
 */
export function scanEntries(lines: Line[], ctx: Ctx): EntryScan {
  const { geometry, soft } = ctx
  const gaps = median(lines.map((l) => l.gap).filter((g) => g > 0))
  const right = Math.max(...lines.map((l) => l.x + l.w), 0)
  const leftEdge = Math.min(...lines.map((l) => l.x), Infinity)
  const width = Math.max(1, right - leftEdge)
  // A line that was wrapped fills its column: it ends at the margin and is most of the width.
  const full = (line: Line) => geometry && line.x + line.w > right - width * 0.07 && line.w > width * 0.55
  const wide = (line: Line) => line.gap >= 0 && gaps > 0 && line.gap > Math.max(gaps * 2.2, gaps + line.size * 0.5)

  const drafts: Draft[] = []
  let cur: Draft | null = null
  let body: Body | null = null
  const open = (): Draft => {
    const draft: Draft = { heads: [], bullets: [], summary: '' }
    drafts.push(draft)
    return draft
  }

  const continues = (line: Line, text: string, last: string): boolean => {
    if (!body || wide(line) || findDate(line.text)?.range) return false
    if (dangles(last) && !(line.bold && !body.line.bold)) return true
    if (body.kind === 'bullet') {
      if (geometry) {
        if (line.x > body.markX + line.size * 0.3) return true
        // Flush with the mark: a bullet wrapped without a hanging indent, or a new heading line.
        return startsLower(text) || (!endsSentence(last) && !line.bold && full(body.line))
      }
      return startsLower(text) || (!endsSentence(last) && text.length > 40 && !line.bold)
    }
    if (line.bold && !body.line.bold) return false
    return startsLower(text) || full(body.line) || (!geometry && !endsSentence(last))
  }

  const prose = (line: Line, text: string): boolean => {
    if (line.bold || line.parts.length > 1 || findDate(line.text)) return false
    const words = text.split(/\s+/).length
    return text.length >= 72 || (words >= 9 && endsSentence(text)) || startsLower(text)
  }

  for (const line of lines) {
    const bullet = line.bullet || isBullet(line.text)
    if (bullet) {
      const entry: Draft = cur ?? (cur = open())
      entry.bullets.push(line.bullet && !isBullet(line.text) ? flat(line.text) : stripBullet(flat(line.text)))
      body = { kind: 'bullet', line, markX: line.x }
      continue
    }
    const text = flat(line.text)
    if (!text) continue
    const entry: Draft | null = cur
    if (entry && body) {
      const last = body.kind === 'bullet' ? entry.bullets[entry.bullets.length - 1] : entry.summary
      if (continues(line, text, last)) {
        if (body.kind === 'bullet') entry.bullets[entry.bullets.length - 1] = joinWrapped(last, text, soft)
        else entry.summary = joinWrapped(last, text, soft)
        body = { ...body, line }
        continue
      }
    }
    const afterHeads = entry !== null && entry.heads.length > 0 && entry.bullets.length === 0
    if (entry && afterHeads && (body?.kind === 'prose' || !wide(line)) && prose(line, text)) {
      entry.summary = entry.summary ? `${entry.summary}\n${text}` : text
      body = { kind: 'prose', line, markX: line.x }
      continue
    }
    // A heading line. After a body it opens the next entry.
    const target: Draft = !entry || entry.bullets.length > 0 || entry.summary ? (cur = open()) : entry
    target.heads.push(line)
    body = null
  }

  const entries: Entry[] = []
  let dated = 0
  let bulleted = 0
  let headed = 0
  for (const draft of drafts) {
    const groups = splitHeads(draft.heads, gaps)
    groups.forEach((group, i) => {
      const lastGroup = i === groups.length - 1
      const f = fields(group)
      const summary = [f.extra, lastGroup ? draft.summary : ''].filter(Boolean).join('\n')
      const bullets = lastGroup ? draft.bullets : []
      if (!f.title && !f.subtitle && !f.date && !summary && !bullets.length) return
      if (f.date) dated++
      if (bullets.length) bulleted++
      if (group.length) headed++
      entries.push(newEntry({ title: f.title, subtitle: f.subtitle, date: f.date, location: f.location, summary, bullets }))
    })
  }
  return { entries, dated, bulleted, headed }
}

/**
 * Cuts a run of heading lines into one group per entry. With two or more
 * dates in the run, each entry is the lines around one date, laid out as the
 * first entry is (a date on its first line means every entry starts at its
 * date). Otherwise blank space, or a line set like the first title, starts a
 * new entry.
 */
function splitHeads(heads: Line[], gaps: number): Line[][] {
  if (heads.length <= 1) return heads.length ? [heads] : [[]]
  const cuts = new Set<number>()
  const dated = heads.map((h, i) => (findDate(h.text) ? i : -1)).filter((i) => i >= 0)
  if (dated.length >= 2) {
    const before = dated[0]
    for (let k = 1; k < dated.length; k++) cuts.add(Math.max(dated[k - 1] + 1, dated[k] - before))
  } else {
    const first = heads[0]
    heads.forEach((h, i) => {
      if (i >= 2 && first.bold && h.bold && !heads[i - 1].bold) cuts.add(i)
    })
  }
  heads.forEach((h, i) => {
    if (i > 0 && h.gap >= 0 && gaps > 0 && h.gap > Math.max(gaps * 1.9, gaps + h.size * 0.45)) cuts.add(i)
  })
  const groups: Line[][] = []
  heads.forEach((h, i) => {
    if (i === 0 || cuts.has(i)) groups.push([])
    groups[groups.length - 1].push(h)
  })
  return groups
}

interface Fields {
  title: string
  subtitle: string
  date: string
  location: string
  /** Heading lines beyond the first two: a grade, a team, an employment type. */
  extra: string
}

const SEPARATOR = /\t|\s+[|•·]\s+|\s+[–—]\s+|\s+-\s+|\s+@\s+|\s+at\s+(?=[A-Z])/
const BREAK = /[\s,;:|–—-]/

/** Takes "Dhaka, Bangladesh" off the end of "Cartup Ltd., Dhaka, Bangladesh". */
function peelPlace(text: string): [string, string] {
  if (isPlace(text)) return ['', text]
  const pieces = text.split(/,\s*/)
  for (let take = Math.min(3, pieces.length - 1); take >= 1; take--) {
    const tail = pieces.slice(-take).join(', ')
    if (isPlace(tail)) return [pieces.slice(0, -take).join(', '), tail]
  }
  return [text, '']
}

function fields(group: Line[]): Fields {
  let date = ''
  let location = ''
  const perLine: string[][] = []
  for (const head of group) {
    let text = head.text
    // "**Degree**, University": where the bold stops is where the title stops.
    const lead = head.lead
    if (lead > 2 && lead < text.length - 2 && (BREAK.test(text[lead]) || BREAK.test(text[lead - 1]))) {
      text = `${text.slice(0, lead)}\t${text.slice(lead)}`
    }
    const hit = findDate(text)
    if (hit) {
      date = date ? `${date}, ${hit.date}` : hit.date
      text = hit.rest
    }
    const pieces: string[] = []
    for (const raw of text.split(SEPARATOR)) {
      const piece = flat(raw).replace(/^[,;:\s]+|[,;:\s]+$/g, '')
      if (!piece) continue
      const [rest, place] = peelPlace(piece)
      if (place && !location) {
        location = place
        if (rest) pieces.push(rest)
      } else pieces.push(piece)
    }
    perLine.push(pieces)
  }
  const first = perLine.find((p) => p.length) ?? []
  const firstIndex = perLine.indexOf(first)
  let title = first[0] ?? ''
  let subtitle = first[1] ?? ''
  const extra: string[] = first.slice(2)
  perLine.forEach((pieces, i) => {
    if (i <= firstIndex) return
    if (!subtitle && pieces.length) {
      subtitle = pieces[0]
      extra.push(...pieces.slice(1))
    } else extra.push(...pieces)
  })
  // "Data Analyst, Cartup Ltd." on a single line.
  if (!subtitle && group.length === 1) {
    const comma = /^(.{2,60}?),\s+([A-Z].{1,})$/.exec(title)
    if (comma && comma[1].split(' ').length <= 6) [title, subtitle] = [comma[1], comma[2]]
  }
  return { title, subtitle, date, location, extra: extra.join(' · ') }
}
