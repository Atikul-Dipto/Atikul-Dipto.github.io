import { uid } from './ids.ts'
import { CONTACT_ID, type Arrangement, type Contact, type ContactKind, type Cv, type Entry, type Item, type Section, type SectionKind, type SectionShape, type TagGroup } from './types.ts'

interface KindInfo {
  title: string
  shape: SectionShape
  /** Whether a two-column design keeps it in the sidebar by default. */
  side: boolean
}

export const KINDS: Record<SectionKind, KindInfo> = {
  summary: { title: 'Summary', shape: 'text', side: false },
  experience: { title: 'Experience', shape: 'entries', side: false },
  education: { title: 'Education', shape: 'entries', side: false },
  skills: { title: 'Skills', shape: 'tags', side: true },
  projects: { title: 'Projects', shape: 'entries', side: false },
  certifications: { title: 'Certifications', shape: 'list', side: true },
  languages: { title: 'Languages', shape: 'tags', side: true },
  awards: { title: 'Awards', shape: 'list', side: true },
  publications: { title: 'Publications', shape: 'list', side: false },
  volunteer: { title: 'Volunteering', shape: 'entries', side: false },
  interests: { title: 'Interests', shape: 'tags', side: true },
  references: { title: 'References', shape: 'list', side: true },
  custom: { title: 'New section', shape: 'list', side: false },
}

/** The kinds offered when adding a section, in the order a CV usually runs. */
export const KIND_ORDER: SectionKind[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
  'awards',
  'publications',
  'volunteer',
  'interests',
  'references',
  'custom',
]

export const newItem = (text = ''): Item => ({ id: uid(), text })

export const newEntry = (fields: Partial<Omit<Entry, 'id' | 'bullets'>> & { bullets?: string[] } = {}): Entry => ({
  id: uid(),
  title: fields.title ?? '',
  subtitle: fields.subtitle ?? '',
  date: fields.date ?? '',
  location: fields.location ?? '',
  summary: fields.summary ?? '',
  bullets: (fields.bullets ?? []).map(newItem),
})

export const newGroup = (label = '', items: string[] = []): TagGroup => ({ id: uid(), label, items: items.map(newItem) })

export const newSection = (kind: SectionKind, title?: string, shape?: SectionShape): Section => ({
  id: uid(),
  kind,
  title: title ?? KINDS[kind].title,
  shape: shape ?? KINDS[kind].shape,
  text: '',
  entries: [],
  groups: [],
  items: [],
})

export const newContact = (kind: ContactKind, value: string, url = ''): Contact => ({ id: uid(), kind, value, url })

export const emptyCv = (): Cv => ({ name: '', headline: '', photo: '', contacts: [], sections: [] })

/** A section with nothing in it prints nothing, and is skipped when a CV is read in. */
export function isEmptySection(s: Section): boolean {
  if (s.shape === 'text') return !s.text.trim()
  if (s.shape === 'entries') return s.entries.length === 0
  if (s.shape === 'tags') return s.groups.every((g) => g.items.length === 0)
  return s.items.length === 0
}

/**
 * Where a CV's sections go when nothing says otherwise: in the order they
 * were written, with the short reference ones (skills, languages, ...) in the
 * sidebar when the design has one.
 */
export function defaultArrangement(cv: Cv, columns: 1 | 2, contactInSidebar: boolean): Arrangement {
  const out: Arrangement = { main: [], side: [], hidden: [] }
  for (const s of cv.sections) (columns === 2 && KINDS[s.kind].side ? out.side : out.main).push(s.id)
  if (columns === 2 && contactInSidebar) out.side.unshift(CONTACT_ID)
  return out
}

/**
 * Keeps an arrangement honest after sections are added or removed: every
 * section appears exactly once, and ids that no longer exist are dropped.
 */
export function reconcile(arrangement: Arrangement, cv: Cv, columns: 1 | 2): Arrangement {
  const known = new Set(cv.sections.map((s) => s.id))
  const seen = new Set<string>()
  const keep = (ids: string[]) =>
    ids.filter((id) => {
      if (seen.has(id) || !(known.has(id) || id === CONTACT_ID)) return false
      seen.add(id)
      return true
    })
  const out: Arrangement = { main: keep(arrangement.main), side: keep(arrangement.side), hidden: keep(arrangement.hidden) }
  for (const s of cv.sections) {
    if (!seen.has(s.id)) (columns === 2 && KINDS[s.kind].side ? out.side : out.main).push(s.id)
  }
  if (columns === 1 && out.side.length) {
    // One column has no sidebar: its sections follow the main ones. The contact
    // details go back under the name.
    out.main.push(...out.side.filter((id) => id !== CONTACT_ID))
    out.side = []
  }
  return out
}
