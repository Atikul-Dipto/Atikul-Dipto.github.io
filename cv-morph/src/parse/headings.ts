import type { SectionKind } from '../model/types.ts'
import { median, type Line } from './geometry.ts'
import { findDate, flat, isBullet, isUpper } from './text.ts'

export type HeadingKind = SectionKind | 'contact'

/** What people call each section. Compared with spaces, case and punctuation removed. */
const NAMES: Record<Exclude<HeadingKind, 'custom'>, string> = {
  summary:
    'summary|professional summary|career summary|executive summary|summary of qualifications|qualifications summary|profile|professional profile|personal profile|career profile|about|about me|objective|career objective|professional objective|personal statement|overview|professional overview|introduction|bio|biography|who i am',
  experience:
    'experience|work experience|professional experience|employment|employment history|work history|career history|relevant experience|professional background|internships|internship|internship experience|industry experience|career experience|working experience|job experience|experiences|professional experiences|employment experience|work|career|teaching experience|research experience|experience highlights',
  education:
    'education|academic background|academic qualifications|academic qualification|qualifications|education and training|academic history|studies|educational background|educational qualifications|educational qualification|academics|academic record|education and qualifications|academic profile|education history',
  skills:
    'skills|technical skills|core skills|key skills|core competencies|competencies|key competencies|areas of expertise|expertise|skills and abilities|technologies|tech stack|tools|tools and technologies|skills and tools|soft skills|hard skills|professional skills|skill set|skillset|skills summary|technical proficiencies|technical expertise|strengths|skills and expertise|skills and competencies|computer skills|it skills|technical skills and tools|top skills|relevant skills|personal skills|software|software skills|technical summary',
  projects:
    'projects|personal projects|academic projects|selected projects|key projects|notable projects|side projects|portfolio|research projects|project experience|projects and research|featured projects|relevant projects|project work|major projects',
  certifications:
    'certifications|certificates|certification|licenses|licenses and certifications|certifications and licenses|professional certifications|courses and certifications|certifications and courses|training|trainings|training and certifications|certifications and training|courses|coursework|relevant coursework|professional development|workshops|training and workshops|online courses|licences|credentials|certificates and courses',
  languages: 'languages|language skills|language proficiency|language|languages known|spoken languages',
  awards:
    'awards|honors|honours|achievements|accomplishments|awards and honors|honors and awards|awards and honours|honours and awards|scholarships|recognition|key achievements|awards and achievements|achievements and awards|awards and recognition|honors and achievements|notable achievements|awards and scholarships|distinctions',
  publications: 'publications|research|papers|research papers|presentations|talks|conferences|patents|publications and presentations|research and publications|selected publications|research interests|writing',
  volunteer:
    'volunteer|volunteering|volunteer experience|volunteer work|community service|leadership|leadership experience|extracurricular activities|extracurriculars|extra curricular activities|extracurricular|activities|leadership and activities|community involvement|memberships|affiliations|professional affiliations|organizations|professional memberships|leadership and involvement|activities and societies|positions of responsibility|co curricular activities|social work|involvement',
  interests: 'interests|hobbies|hobbies and interests|interests and hobbies|personal interests',
  references: 'references|referees|reference',
  contact:
    'contact|contact details|contact information|contact info|contact me|personal details|personal information|personal info|get in touch|details|links|social|socials|social links|find me online|online|reach me|address|personal data',
}

/** Words that are a section's name in one CV and an ordinary line in another; these need to look like a heading too. */
const AMBIGUOUS = new Set(
  'leadership research training tools technologies activities strengths details links social socials courses portfolio about work career software language online address involvement overview studies writing experiences internship expertise organizations recognition bio'.split(
    ' ',
  ),
)

const key = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[&/+]/g, ' and ')
    .replace(/[^a-z]/g, '')

const LOOKUP = new Map<string, Exclude<HeadingKind, 'custom'>>()
for (const [kind, names] of Object.entries(NAMES)) {
  for (const name of names.split('|')) LOOKUP.set(key(name), kind as Exclude<HeadingKind, 'custom'>)
}

/** The section a line names, if it is a heading's worth of text and nothing else. */
export function headingKind(text: string): Exclude<HeadingKind, 'custom'> | null {
  let s = flat(text).replace(/^[^A-Za-z]+/, '').replace(/[\s:.\-–—_|•·]+$/, '')
  if (!s || key(s).length > 40 || /[.!?]\s/.test(s)) return null
  const direct = LOOKUP.get(key(s))
  if (direct) return direct
  // OCR turns an icon in front of a heading into a stray letter or two.
  const tail = s.replace(/^\S{1,2}\s+/, '')
  if (tail !== s && tail.length >= 5) return LOOKUP.get(key(tail)) ?? null
  s = s.replace(/^(?:my|the)\s+/i, '')
  return LOOKUP.get(key(s)) ?? null
}

// For a line that is set like a heading but worded its own way
// ("Extra-curricular Achievements"): the first word it contains decides.
const LOOSE: [RegExp, Exclude<HeadingKind, 'custom'>][] = [
  [/award|honou?r|achievement|accomplishment|scholarship/, 'awards'],
  [/experience|employment|workhistory|career/, 'experience'],
  [/education|academic|qualification/, 'education'],
  [/skill|competenc|expertise|proficienc|technolog|tools/, 'skills'],
  [/project/, 'projects'],
  [/certif|licen|course|training/, 'certifications'],
  [/language/, 'languages'],
  [/publication|research|paper/, 'publications'],
  [/volunteer|extracurricular|cocurricular|leadership|activit|community|membership|affiliation/, 'volunteer'],
  [/interest|hobb/, 'interests'],
  [/referen|referee/, 'references'],
  [/summary|profile|objective|aboutme/, 'summary'],
  [/contact|personaldetail|personalinfo/, 'contact'],
]

const looseKind = (text: string): HeadingKind => LOOSE.find(([re]) => re.test(key(text)))?.[1] ?? 'custom'

interface Look {
  size: number
  bold: boolean
  upper: boolean
  color: string
}

const lookOf = (line: Line, body: number): Look => ({
  size: Math.round((line.size / body) * 10) / 10,
  bold: line.bold,
  upper: isUpper(line.text),
  color: line.color,
})

const sameLook = (a: Look, b: Look): boolean => a.upper === b.upper && a.bold === b.bold && Math.abs(a.size - b.size) <= 0.15

export interface Heading {
  index: number
  kind: HeadingKind
  line: Line
}

/**
 * Finds the headings in one column of text. A line that names a section
 * ("Experience", "Technical Skills") is a heading when it also looks like the
 * other headings: a CV sets them all the same way, and a skill called
 * "Leadership" in the middle of a list is not set like them. Lines set like
 * the headings that name nothing known ("Hackathons") are headings as well,
 * provided that look really is kept for headings.
 */
export function findHeadings(lines: Line[], body: number, styled: boolean): Heading[] {
  const named: Heading[] = []
  lines.forEach((line, index) => {
    if (isBullet(line.text) || line.bullet) return
    const kind = headingKind(line.text)
    if (kind) named.push({ index, kind, line })
  })
  if (!named.length) return []

  const gaps = median(lines.map((l) => l.gap).filter((g) => g > 0))
  const apart = (line: Line) => line.gap < 0 || line.gap > gaps * 1.35 || line === lines[0]
  const soft = (h: Heading) => AMBIGUOUS.has(key(flat(h.line.text)))

  if (!styled) {
    // Plain text has no looks to go by: a doubtful word must at least stand apart or shout.
    return named.filter((h) => !soft(h) || isUpper(h.line.text) || apart(h.line))
  }

  // The look most of the sure headings share is the heading look.
  const sure = named.filter((h) => !soft(h))
  const pool = sure.length ? sure : named
  let look = lookOf(pool[0].line, body)
  let votes = 0
  for (const h of pool) {
    const candidate = lookOf(h.line, body)
    const n = pool.filter((o) => sameLook(lookOf(o.line, body), candidate)).length
    if (n > votes) [look, votes] = [candidate, n]
  }
  const bodyLook: Look = { size: 1, bold: false, upper: false, color: '' }
  const distinct = !sameLook(look, bodyLook)

  const headings = named.filter((h) => {
    const mine = lookOf(h.line, body)
    if (sameLook(mine, look)) return true
    // Close enough: at least as loud as the body in the way the headings are.
    if (!distinct) return !soft(h) || apart(h.line)
    const loud = (mine.bold && look.bold) || (mine.upper && look.upper) || mine.size >= Math.min(look.size, 1.15)
    return loud && (!soft(h) || mine.upper === look.upper)
  })

  if (distinct && votes >= 2) {
    const taken = new Set(headings.map((h) => h.index))
    const extra: Heading[] = []
    lines.forEach((line, index) => {
      if (taken.has(index) || isBullet(line.text) || line.bullet) return
      const text = flat(line.text)
      if (text.length < 3 || text.length > 40 || text.split(' ').length > 5) return
      if (/[@\d,;]|https?:|www\./i.test(text) || /[.!?]$/.test(text) || findDate(text)) return
      if (line.parts.length > 1 || !sameLook(lookOf(line, body), look)) return
      if (look.color && line.color && line.color !== look.color) return
      extra.push({ index, kind: looseKind(text), line })
    })
    // If that look turns up everywhere, it is not a heading look (bold job titles, say).
    if (extra.length <= Math.max(3, headings.length)) headings.push(...extra)
  }
  return headings.sort((a, b) => a.index - b.index)
}
