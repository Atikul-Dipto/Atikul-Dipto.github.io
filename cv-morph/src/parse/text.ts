// Small readers of CV text: bullets, dates, places, and tidy-ups.

/** Marks that open a list item, as files and OCR give them (Word's hollow bullet reads as a lone "o"). */
const BULLET = /^\s*(?:[•‣◦⁃∙▪▫●○■□▸▹►▶➢➤➔→✓✔❖◆◇♦·»›★☆‒–—*+>-]|o(?=\s+[A-Z]))\s+/

export const isBullet = (text: string): boolean => BULLET.test(text)
export const stripBullet = (text: string): string => text.replace(BULLET, '').trim()

/** Collapses the tabs and runs of spaces a line was assembled with. */
export const flat = (text: string): string => text.replace(/[\t ]+/g, ' ').replace(/\s{2,}/g, ' ').trim()

const SMALL = new Set(['and', 'or', 'of', 'in', 'the', 'for', 'to', 'a', 'an', 'at', 'on', 'with', '&'])

/** "WORK EXPERIENCE" and "work experience" both become "Work Experience"; mixed case is left alone. */
export function titleCase(text: string): string {
  const s = flat(text)
  const letters = s.replace(/[^A-Za-z]/g, '')
  if (!letters) return s
  const shouting = letters === letters.toUpperCase()
  const quiet = letters === letters.toLowerCase()
  if (!shouting && !quiet) return s
  return s
    .toLowerCase()
    .split(' ')
    .map((word, i) => (i > 0 && SMALL.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

export const isUpper = (text: string): boolean => {
  const letters = text.replace(/[^A-Za-z]/g, '')
  return letters.length >= 3 && letters === letters.toUpperCase()
}

// ---------------------------------------------------------------- dates

const MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const YEAR = '(?:19|20)\\d{2}'
// "Jan 2020", "January, 2020", "Jan '20", "Summer 2021", "03/2020", "2020"
const POINT = `(?:${MON}\\.?,?\\s*(?:${YEAR}|['’]\\d{2})|(?:spring|summer|fall|autumn|winter)\\s+${YEAR}|\\d{1,2}\\s?[/.]\\s?${YEAR}|${YEAR})`
const NOW = '(?:present|current|now|ongoing|today|running|continuing|onwards?|till\\s+date|till\\s+now|to\\s+date|date)'
const DASH = '\\s*(?:-|–|—|−|‒|to|until|till|through)\\s*'
const RANGE = `${POINT}${DASH}(?:${POINT}|${NOW})`
const RANGE_RE = new RegExp(`(?:(?:since|from)\\s+)?${RANGE}`, 'i')
const POINT_RE = new RegExp(`(?:(?:since|from)\\s+)?${POINT}`, 'i')
/** "(2 yrs 3 mos)", "· 1 year": the length a job site adds after the dates. */
const SPAN_RE = /[\s·•|,(]*\b\d{1,2}\+?\s*(?:yrs?|years?|mos?|months?)\b(?:\s*\d{1,2}\s*(?:mos?|months?)\b)?\)?/gi

export interface DateHit {
  /** The date as it will be printed: "Jan 2020 – Present". */
  date: string
  /** The line with the date taken out. */
  rest: string
  range: boolean
}

/**
 * Finds the dates of a job or course in one of its heading lines. A range is
 * taken wherever it stands; a lone year or month only when it is set apart
 * from the words (at an end of the line, or between separators), since
 * "Hackathon 2021 Winner" is a title, not a date.
 */
export function findDate(text: string): DateHit | null {
  const range = RANGE_RE.exec(text)
  if (range) return hit(text, range.index, range[0], true)
  const point = POINT_RE.exec(text)
  if (!point) return null
  const before = text.slice(0, point.index)
  const after = text.slice(point.index + point[0].length)
  const apart = (s: string, end: boolean) => !s.trim() || (end ? /[\t|•·,(–—-]\s*$/.test(s) : /^\s*[\t|•·,)–—-]/.test(s))
  if (!(apart(before, true) && apart(after, false))) return null
  return hit(text, point.index, point[0], false)
}

function hit(text: string, index: number, match: string, range: boolean): DateHit {
  let before = text.slice(0, index)
  let after = text.slice(index + match.length)
  // Brackets and separators that only framed the date go with it.
  before = before.replace(/[\s([|•·,–—:-]+$/, '')
  after = after.replace(SPAN_RE, '').replace(/^[\s)\]|•·,–—:-]+/, '')
  const rest = [before, after].filter(Boolean).join('\t')
  const date = match
    .replace(/\s*(?:-|–|—|−|‒)\s*/g, ' – ')
    .replace(/\s+(?:to|until|till|through)\s+/gi, ' – ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\b(present|current|now|ongoing|today|running|continuing)\b/i, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .trim()
  return { date, rest, range }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const SEASONS: Record<string, number> = { spring: 3, summer: 6, fall: 9, autumn: 9, winter: 12 }

/** A point in time as months since year 0, or null: for adding up years of experience. */
function monthIndex(text: string, end: boolean, now: Date): number | null {
  const s = text.trim().toLowerCase()
  if (new RegExp(`^${NOW}$`, 'i').test(s)) return now.getFullYear() * 12 + now.getMonth() + 1
  const year = /(?:19|20)\d{2}/.exec(s)
  const short = /['’](\d{2})\b/.exec(s)
  const y = year ? Number(year[0]) : short ? 2000 + Number(short[1]) : null
  if (y === null) return null
  const named = MONTHS.findIndex((m) => s.startsWith(m))
  const season = Object.keys(SEASONS).find((k) => s.startsWith(k))
  const numeric = /^(\d{1,2})\s?[/.]/.exec(s)
  const month = named >= 0 ? named + 1 : season ? SEASONS[season] : numeric ? Math.min(12, Math.max(1, Number(numeric[1]))) : end ? 12 : 1
  return y * 12 + month
}

/** The months a printed date range covers, as [start, end] month indexes; null when it can't be read. */
export function dateSpan(date: string, now = new Date()): [number, number] | null {
  const parts = date.split(/\s+–\s+|\s+-\s+|\s+to\s+/i)
  const start = monthIndex(parts[0] ?? '', false, now)
  if (start === null) return null
  const end = parts.length > 1 ? monthIndex(parts[1], true, now) : monthIndex(parts[0], true, now)
  return [start, Math.max(start, end ?? start)]
}

// ---------------------------------------------------------------- places

const COUNTRIES =
  'afghanistan albania algeria argentina armenia australia austria azerbaijan bahrain bangladesh belarus belgium bhutan bolivia bosnia botswana brazil brunei bulgaria cambodia cameroon canada chile china colombia croatia cuba cyprus czechia denmark ecuador egypt england estonia ethiopia fiji finland france georgia germany ghana greece guatemala hungary iceland india indonesia iran iraq ireland israel italy jamaica japan jordan kazakhstan kenya kuwait kyrgyzstan laos latvia lebanon libya lithuania luxembourg malaysia maldives malta mauritius mexico moldova mongolia morocco myanmar namibia nepal netherlands nigeria norway oman pakistan palestine panama paraguay peru philippines poland portugal qatar romania russia rwanda scotland senegal serbia singapore slovakia slovenia somalia spain sudan sweden switzerland syria taiwan tajikistan tanzania thailand tunisia turkey turkiye uganda ukraine uruguay uzbekistan venezuela vietnam wales yemen zambia zimbabwe uk usa uae ksa'.split(
    ' ',
  )
const COUNTRY_PHRASES = ['united states', 'united kingdom', 'united arab emirates', 'saudi arabia', 'south africa', 'south korea', 'north korea', 'new zealand', 'sri lanka', 'hong kong', 'costa rica', 'czech republic', 'dominican republic', 'el salvador', 'ivory coast', 'puerto rico', 'northern ireland']
const STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC ON QC BC AB MB SK NS NB NL PE'.split(' ')
const PLACE_WORDS = /^(?:remote|hybrid|on-?site|worldwide|anywhere)$/i

/** Whether this is where a job or a person is: "Dhaka, Bangladesh", "Austin, TX", "Remote". */
export function isPlace(text: string): boolean {
  const s = flat(text).replace(/[.]$/, '')
  if (!s || s.length > 48 || /[@:]/.test(s) || /\d{5,}/.test(s.replace(/\b\d{4,6}\b$/, ''))) return false
  if (PLACE_WORDS.test(s)) return true
  const pieces = s.split(/\s*,\s*/)
  const last = pieces[pieces.length - 1].replace(/\s*\(?\b(?:remote|hybrid|on-?site)\b\)?/i, '').replace(/\s*\b\d{4,6}\b$/, '').trim()
  if (!last) return pieces.length > 1
  const lower = last.toLowerCase()
  const named = COUNTRIES.includes(lower) || COUNTRY_PHRASES.includes(lower) || STATES.includes(last)
  if (pieces.length === 1) return COUNTRIES.includes(lower) && lower.length > 3 ? true : COUNTRY_PHRASES.includes(lower)
  return named && pieces.length <= 4 && pieces.every((p) => p.split(/\s+/).length <= 4)
}

// ---------------------------------------------------------------- splitting

/** Splits on commas and the like, but never inside brackets: "Python (Pandas, NumPy), SQL" is two. */
export function splitList(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  const push = () => {
    const item = cur.replace(/^[\s\-–•·:]+|[\s.;,]+$/g, '').trim()
    if (item) out.push(item)
    cur = ''
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    const wide = ch === ' ' && text[i + 1] === ' ' && text[i + 2] === ' '
    if (depth === 0 && (/[,;|•·\t•●▪]/.test(ch) || wide || (ch === '/' && text[i - 1] === ' ' && text[i + 1] === ' '))) push()
    else cur += ch
  }
  push()
  return out
}

// Halves of words that are really written with a hyphen: "large-scale", "e-commerce".
const KEEPS_BEFORE = new Set('e self cross non co multi well large small high low real full part long short data end user year in on off top mid first second third cost client customer decision evidence result detail hands machine deep back front'.split(' '))
const KEEPS_AFTER = new Set('driven based oriented level time scale term functional year month end to related focused facing party depth house site line performance speed volume value impact commerce learning making solving effective quality wide friendly ready first up down in out off free centric specific aware led owned'.split(' '))

/**
 * Joins a wrapped line onto the one before it. A line that ends in a hyphen
 * is a compound word ("data-" + "driven") unless the file breaks words to fit
 * the line, as TeX does (`soft`): then "re-" + "porting" is "reporting", and
 * the hyphen stays only between halves that are written with one.
 */
export function joinWrapped(a: string, b: string, soft = false): string {
  if (!a) return b
  if (!b) return a
  const cut = /([A-Za-z]+)-$/.exec(a)
  const next = /^[a-z]+/.exec(b)
  if (!cut || !next) return `${a} ${b}`
  if (!soft || KEEPS_BEFORE.has(cut[1].toLowerCase()) || KEEPS_AFTER.has(next[0])) return a + b
  return a.slice(0, -1) + b
}

/** Whether a line stops mid-phrase, so the next line must carry it on. */
export const dangles = (text: string): boolean => /(?:[,&(/–-]|\b(?:and|or|of|the|to|in|for|with|a|an|by|on|at|from))$/i.test(text.trim())
