import type { Project } from '../model/project.ts'
import { CONTACT_ID, type Section } from '../model/types.ts'

/** The lines of one section as plain text. */
export function sectionLines(s: Section): string[] {
  if (s.shape === 'text') return s.text.split('\n').filter((l) => l.trim())
  if (s.shape === 'list') return s.items.filter((i) => i.text.trim()).map((i) => `- ${i.text}`)
  if (s.shape === 'tags') return s.groups.filter((g) => g.items.some((t) => t.text.trim())).map((g) => (g.label ? `${g.label}: ` : '') + g.items.map((t) => t.text).filter(Boolean).join(', '))
  return s.entries.flatMap((e) => [
    [e.title, e.subtitle].filter(Boolean).join(' — '),
    [e.date, e.location].filter(Boolean).join(' | '),
    ...e.summary.split('\n').filter((line) => line.trim()),
    ...e.bullets.filter((b) => b.text.trim()).map((b) => `- ${b.text}`),
    '',
  ]).filter((line, i, all) => line || (i > 0 && all[i - 1]))
}

/** The sections a project prints, in reading order: main column, then sidebar. */
export function printedSections(project: Project): Section[] {
  const byId = new Map(project.cv.sections.map((s) => [s.id, s]))
  return [...project.arrangement.main, ...project.arrangement.side].filter((id) => id !== CONTACT_ID).flatMap((id) => byId.get(id) ?? [])
}

/**
 * The CV as plain text, in reading order: for pasting into application forms,
 * and what the job match reads.
 */
export function cvToText(project: Project): string {
  const { cv } = project
  const out: string[] = [cv.name, cv.headline, cv.contacts.map((c) => c.value).filter(Boolean).join(' | ')].filter(Boolean)
  for (const s of printedSections(project)) {
    const lines = sectionLines(s)
    if (!lines.length) continue
    out.push('', s.title.toUpperCase(), ...lines)
    while (out[out.length - 1] === '') out.pop()
  }
  return `${out.join('\n')}\n`
}
