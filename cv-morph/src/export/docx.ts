import { AlignmentType, BorderStyle, Document, ExternalHyperlink, LevelFormat, Packer, Paragraph, TabStopType, TextRun, type IParagraphOptions, type ParagraphChild } from 'docx'
import { PAGES } from '../design/design.ts'
import { fontInfo } from '../design/fonts.ts'
import type { Project } from '../model/project.ts'
import type { Contact } from '../model/types.ts'
import { printedSections } from './text.ts'

// The Word file is deliberately plain: one column, real headings, real list
// bullets, dates on a right-hand tab. That is the layout the software that
// screens CVs reads most reliably, and the one a recruiter can still edit.
// It carries the design's fonts and colours, not its columns.

const TWIPS_PER_PX = 15 // 1/20 of a point; a CSS pixel is 0.75 pt
const TWIPS_PER_MM = 56.7
const half = (pt: number) => Math.round(pt * 2) // Word sizes type in half-points
const ink = (hex: string) => hex.replace('#', '').toUpperCase()

export async function exportDocx(project: Project): Promise<Blob> {
  const { cv, design: d } = project
  const size = PAGES[d.page]
  const margin = Math.round(d.margin * TWIPS_PER_MM)
  const width = Math.round(size.width * TWIPS_PER_PX) - margin * 2
  const body = fontInfo(d.fonts.body).word
  const headingFont = fontInfo(d.fonts.heading).word
  const text = ink(d.colors.text)
  const muted = ink(d.colors.muted)
  // On white paper a design's light-on-dark colours would vanish: fall back to the text colour.
  const dark = (hex: string) => (/^#(?:[e-f][0-9a-f]){3}$/i.test(hex) ? d.colors.text : hex)
  const nameColor = ink(dark(d.header.nameColor))
  const headingColor = ink(dark(d.heading.color))
  const align = d.header.align === 'center' ? AlignmentType.CENTER : d.header.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT
  const gap = (pt: number) => Math.round(pt * 20 * d.spacing)

  const run = (value: string, options: Partial<ConstructorParameters<typeof TextRun>[0] & object> = {}) => new TextRun({ text: value, ...(options as object) })
  const para = (children: ParagraphChild[], options: Partial<IParagraphOptions> = {}) => new Paragraph({ children, ...options })

  const contact = (c: Contact): ParagraphChild =>
    c.url ? new ExternalHyperlink({ link: c.url, children: [run(c.value, { color: muted })] }) : run(c.value, { color: muted })

  const children: Paragraph[] = []
  children.push(
    para([run(d.header.nameCase === 'upper' ? cv.name.toUpperCase() : cv.name, { bold: d.header.nameWeight === 700, size: half(d.header.nameSize), font: headingFont, color: nameColor })], {
      alignment: align,
      spacing: { after: 40 },
    }),
  )
  if (cv.headline) children.push(para([run(cv.headline, { size: half(d.fonts.size * 1.15), color: muted })], { alignment: align, spacing: { after: 60 } }))
  const contacts = cv.contacts.filter((c) => c.value.trim())
  if (contacts.length) {
    children.push(
      para(
        contacts.flatMap((c, i) => (i ? [run('  |  ', { color: muted }), contact(c)] : [contact(c)])),
        { alignment: align, spacing: { after: gap(6) } },
      ),
    )
  }

  for (const s of printedSections(project)) {
    const title = d.heading.case === 'upper' ? s.title.toUpperCase() : s.title
    children.push(
      para([run(title, { bold: d.heading.weight === 700, size: half(d.heading.size), font: headingFont, color: headingColor, characterSpacing: Math.round(d.heading.spacing * d.heading.size * 20) })], {
        style: 'Heading2',
        alignment: d.heading.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { before: gap(12), after: gap(4) },
        keepNext: true,
        border: d.heading.rule === 'none' ? undefined : { bottom: { style: BorderStyle.SINGLE, size: 6, space: 2, color: ink(d.colors.rule) } },
      }),
    )
    if (s.shape === 'text') {
      for (const line of s.text.split('\n')) if (line.trim()) children.push(para([run(line)], { spacing: { after: 60 } }))
    } else if (s.shape === 'list') {
      for (const item of s.items) if (item.text.trim()) children.push(para([run(item.text)], { numbering: { reference: 'bullets', level: 0 } }))
    } else if (s.shape === 'tags') {
      for (const g of s.groups) {
        const items = g.items.map((t) => t.text).filter(Boolean).join(', ')
        if (!items) continue
        children.push(para(g.label ? [run(`${g.label}: `, { bold: true }), run(items)] : [run(items)], { spacing: { after: 40 } }))
      }
    } else {
      s.entries.forEach((e, i) => {
        const tab = [{ type: TabStopType.RIGHT, position: width }]
        if (e.title || e.date) {
          children.push(
            para([run(e.title, { bold: true }), ...(e.date ? [run(`\t${e.date}`, { color: muted })] : [])], { tabStops: tab, keepNext: true, spacing: { before: i ? gap(7) : 0 } }),
          )
        }
        if (e.subtitle || e.location) {
          children.push(
            para(
              [run(e.subtitle, { italics: d.entry.subtitle === 'italic', color: d.entry.subtitle === 'accent' ? ink(dark(d.colors.accent)) : text }), ...(e.location ? [run(`\t${e.location}`, { color: muted })] : [])],
              { tabStops: tab, keepNext: true },
            ),
          )
        }
        for (const line of e.summary.split('\n')) if (line.trim()) children.push(para([run(line)]))
        for (const b of e.bullets) if (b.text.trim()) children.push(para([run(b.text)], { numbering: { reference: 'bullets', level: 0 } }))
      })
    }
  }

  const doc = new Document({
    creator: cv.name || 'CV Morph',
    title: cv.name ? `${cv.name} — CV` : 'CV',
    description: cv.headline,
    styles: {
      default: {
        document: {
          run: { font: body, size: half(d.fonts.size), color: text },
          paragraph: { spacing: { line: Math.round(240 * d.fonts.leading * 0.86), after: 0 } },
        },
      },
      paragraphStyles: [{ id: 'Heading2', name: 'heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: headingFont }, paragraph: { outlineLevel: 1 } }],
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: d.entry.bullet === 'dash' ? '–' : '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 200 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: Math.round(size.width * TWIPS_PER_PX), height: Math.round(size.height * TWIPS_PER_PX) }, margin: { top: margin, right: margin, bottom: margin, left: margin } } },
        children,
      },
    ],
  })
  return Packer.toBlob(doc)
}
