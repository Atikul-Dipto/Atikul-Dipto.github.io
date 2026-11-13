// Run with: npm test
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { readPdf, type PdfLib } from '../ingest/pdf.ts'
import { readText } from '../ingest/text.ts'
import type { Section } from '../model/types.ts'
import { parseCv } from './index.ts'
import { dateSpan, findDate, isPlace, joinWrapped, splitList, titleCase } from './text.ts'
import { headingKind } from './headings.ts'

const section = (sections: Section[], title: string): Section => {
  const found = sections.find((s) => s.title === title)
  assert.ok(found, `no section called ${title}`)
  return found
}

test('dates are found in heading lines, and only when they stand apart', () => {
  assert.deepEqual(findDate('Data Analyst\tJul 2025 – Running'), { date: 'Jul 2025 – Running', rest: 'Data Analyst', range: true })
  assert.equal(findDate('Cartup Ltd. | 03/2020 - 05/2022')?.date, '03/2020 – 05/2022')
  assert.equal(findDate('BSc in Economics (2020)')?.date, '2020')
  assert.equal(findDate('Hackathon 2021 Winner'), null)
  assert.equal(findDate('January 2020 to present · 2 yrs 3 mos')?.rest, '')
})

test('a date range knows how many months it spans', () => {
  const now = new Date(2026, 0, 15)
  assert.deepEqual(dateSpan('Jan 2020 – Dec 2021', now), [2020 * 12 + 1, 2021 * 12 + 12])
  assert.deepEqual(dateSpan('2019 – Present', now), [2019 * 12 + 1, 2026 * 12 + 1])
  assert.equal(dateSpan('no date here', now), null)
})

test('places, headings and lists are recognised', () => {
  assert.ok(isPlace('Dhaka, Bangladesh'))
  assert.ok(isPlace('Austin, TX'))
  assert.ok(isPlace('Remote'))
  assert.ok(!isPlace('East West University'))
  assert.equal(headingKind('WORK EXPERIENCE'), 'experience')
  assert.equal(headingKind('E X P E R I E N C E'), 'experience')
  assert.equal(headingKind('Skills & Tools:'), 'skills')
  assert.equal(headingKind('Built dashboards in Power BI.'), null)
  assert.deepEqual(splitList('SQL, Python (Pandas, NumPy), Power BI'), ['SQL', 'Python (Pandas, NumPy)', 'Power BI'])
  assert.equal(titleCase('EXTRA-CURRICULAR ACTIVITIES'), 'Extra-curricular Activities')
})

test('a hyphen at a line end is kept, unless the file breaks words there', () => {
  assert.equal(joinWrapped('data-', 'driven decisions'), 'data-driven decisions')
  assert.equal(joinWrapped('business insights, re-', 'porting automation', true), 'business insights, reporting automation')
  assert.equal(joinWrapped('handling large-', 'scale datasets', true), 'handling large-scale datasets')
})

test('pasted text is read into sections', () => {
  const { cv } = parseCv(
    readText(`Jane Doe
Product Manager
jane@example.com | +1 415 555 0100 | San Francisco, CA

EXPERIENCE
Product Manager, Acme Corp
Jan 2021 - Present
- Launched a billing product used by 2,000 customers.
- Cut onboarding time by 30%.

EDUCATION
BA in Economics, State University
2014 - 2018

SKILLS
Roadmapping, SQL, User research`),
  )
  assert.equal(cv.name, 'Jane Doe')
  assert.equal(cv.headline, 'Product Manager')
  assert.deepEqual(cv.contacts.map((c) => c.kind), ['email', 'phone', 'location'])
  const experience = section(cv.sections, 'Experience')
  assert.equal(experience.entries.length, 1)
  assert.equal(experience.entries[0].title, 'Product Manager')
  assert.equal(experience.entries[0].subtitle, 'Acme Corp')
  assert.equal(experience.entries[0].date, 'Jan 2021 – Present')
  assert.equal(experience.entries[0].bullets.length, 2)
  assert.deepEqual(section(cv.sections, 'Skills').groups[0].items.map((i) => i.text), ['Roadmapping', 'SQL', 'User research'])
})

// The owner's own CV, as shipped with the portfolio: a two-page TeX résumé
// with a photo, labelled contact lines, a page break inside a job, and two
// referees set side by side.
test('the résumé in public/ is read whole', async () => {
  const lib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfLib
  const data = new Uint8Array(readFileSync(new URL('../../../public/Atikul_Islam_Resume.pdf', import.meta.url)))
  const doc = await readPdf(lib, data, 'resume.pdf', { draw: null })
  const { cv, flows } = parseCv(doc)

  assert.equal(doc.soft, true, 'made by TeX: words are broken at line ends')
  assert.equal(flows.layouts.every((l) => l.gutter === null), true, 'one column')
  assert.equal(cv.name, 'Atikul Islam')
  assert.deepEqual(cv.contacts.map((c) => c.kind), ['email', 'phone', 'location', 'linkedin', 'github'])
  assert.match(cv.contacts[3].url, /^https:\/\/www\.linkedin\.com\/in\//, 'the link behind the printed address')
  assert.deepEqual(
    cv.sections.map((s) => [s.title, s.shape]),
    [
      ['Profile', 'text'],
      ['Education', 'entries'],
      ['Skills', 'tags'],
      ['Experience', 'entries'],
      ['Extra-curricular Activities', 'entries'],
      ['Extra-curricular Achievements', 'list'],
      ['Certifications', 'list'],
      ['References', 'entries'],
    ],
  )
  assert.match(section(cv.sections, 'Profile').text, /insights, reporting automation/, 'a word broken across lines is rejoined')

  const education = section(cv.sections, 'Education').entries
  assert.equal(education.length, 3)
  assert.deepEqual([education[0].title, education[0].subtitle, education[0].date], ['Bachelor of Social Science in Economics', 'East West University', '2019 – 2024'])
  assert.match(education[0].summary, /Project Analysis, Law and Economics$/)

  const skills = section(cv.sections, 'Skills').groups
  assert.deepEqual(skills.map((g) => g.label), ['Technical Skills', 'Analytics Skills', 'Other Tools', 'Soft Skills'])
  const technical = skills[0].items.map((i) => i.text)
  assert.deepEqual(technical.slice(-2), ['STATA', 'Apache Superset'], 'a comma ends an item even at a line end')
  assert.ok(skills[1].items.some((i) => i.text === 'KPI Reporting'), 'an item cut by the line end is one item')

  const jobs = section(cv.sections, 'Experience').entries
  assert.deepEqual(jobs.map((e) => [e.title, e.subtitle, e.date, e.location, e.bullets.length]), [
    ['Data Analyst', 'US Bangla Group', 'Jul 2025 – Running', 'Dhaka, Bangladesh', 3],
    ['Associate', 'Inspira Advisory and Consulting Limited', 'Jan 2025 – Jul 2025', 'Dhaka, Bangladesh', 3],
    ['R & D Intern', 'ARCED Foundation', 'April 2024 – July 2024', 'Dhaka, Bangladesh', 3],
  ])
  assert.equal(section(cv.sections, 'References').entries.length, 2, 'two referees, set side by side')
})
