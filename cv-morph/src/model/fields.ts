// Every piece of text on a CV has an address, a short string, so that the
// page, the phone's edit bar and undo all point at the same thing:
//
//   name, headline            the header
//   c:<contact>               one contact detail
//   st:<section>              a section's title
//   sx:<section>              a section's paragraph
//   e:<section>:<entry>:<f>   an entry's title, subtitle, date, location or summary
//   b:<section>:<entry>:<b>   a bullet
//   i:<section>:<item>        a list item
//   g:<section>:<group>       a tag group's label
//   t:<section>:<group>:<t>   a tag

import type { Cv, Entry, Item, Section, TagGroup } from './types.ts'

export type EntryField = 'title' | 'subtitle' | 'date' | 'location' | 'summary'

interface Slot {
  get(): string
  set(value: string): void
  /** What the phone's edit bar calls it: "Experience · Data Analyst · bullet". */
  label: string
}

const section = (cv: Cv, id: string): Section | undefined => cv.sections.find((s) => s.id === id)
const entry = (s: Section | undefined, id: string): Entry | undefined => s?.entries.find((e) => e.id === id)
const group = (s: Section | undefined, id: string): TagGroup | undefined => s?.groups.find((g) => g.id === id)

const of = <T extends object>(target: T | undefined, key: keyof T, label: string): Slot | null =>
  target ? { get: () => String(target[key] ?? ''), set: (v) => void ((target[key] as unknown) = v), label } : null

const ENTRY_LABELS: Record<EntryField, string> = { title: 'title', subtitle: 'organisation', date: 'dates', location: 'place', summary: 'description' }

function slot(cv: Cv, field: string): Slot | null {
  const [kind, a, b, c] = field.split(':')
  switch (kind) {
    case 'name':
      return of(cv, 'name', 'Name')
    case 'headline':
      return of(cv, 'headline', 'Headline')
    case 'c': {
      const contact = cv.contacts.find((x) => x.id === a)
      return of(contact, 'value', `Contact · ${contact?.kind ?? ''}`)
    }
    case 'st':
      return of(section(cv, a), 'title', 'Section title')
    case 'sx': {
      const s = section(cv, a)
      return of(s, 'text', s?.title ?? '')
    }
    case 'e': {
      const s = section(cv, a)
      const e = entry(s, b)
      return of(e, c as EntryField, [s?.title, e?.title, ENTRY_LABELS[c as EntryField]].filter(Boolean).join(' · '))
    }
    case 'b': {
      const s = section(cv, a)
      const e = entry(s, b)
      return of<Item>(e?.bullets.find((x) => x.id === c), 'text', [s?.title, e?.title, 'bullet'].filter(Boolean).join(' · '))
    }
    case 'i': {
      const s = section(cv, a)
      return of<Item>(s?.items.find((x) => x.id === b), 'text', `${s?.title ?? ''} · item`)
    }
    case 'g': {
      const s = section(cv, a)
      return of(group(s, b), 'label', `${s?.title ?? ''} · group`)
    }
    case 't': {
      const s = section(cv, a)
      const g = group(s, b)
      return of<Item>(g?.items.find((x) => x.id === c), 'text', [s?.title, g?.label].filter(Boolean).join(' · '))
    }
    default:
      return null
  }
}

export const readField = (cv: Cv, field: string): string => slot(cv, field)?.get() ?? ''
export const fieldLabel = (cv: Cv, field: string): string => slot(cv, field)?.label ?? ''
export const hasField = (cv: Cv, field: string): boolean => slot(cv, field) !== null

/** Writes one field; the CV must be a copy the caller is free to change. */
export function writeField(cv: Cv, field: string, value: string): void {
  slot(cv, field)?.set(value)
}

/** Every field of a CV in reading order: the edit bar's "next" walks this. */
export function fieldOrder(cv: Cv, sectionIds: string[]): string[] {
  const out = ['name', 'headline', ...cv.contacts.map((c) => `c:${c.id}`)]
  for (const id of sectionIds) {
    const s = section(cv, id)
    if (!s) continue
    out.push(`st:${s.id}`)
    if (s.shape === 'text') out.push(`sx:${s.id}`)
    if (s.shape === 'entries') {
      for (const e of s.entries) {
        out.push(`e:${s.id}:${e.id}:title`, `e:${s.id}:${e.id}:subtitle`, `e:${s.id}:${e.id}:date`, `e:${s.id}:${e.id}:location`)
        if (e.summary) out.push(`e:${s.id}:${e.id}:summary`)
        out.push(...e.bullets.map((b) => `b:${s.id}:${e.id}:${b.id}`))
      }
    }
    if (s.shape === 'list') out.push(...s.items.map((i) => `i:${s.id}:${i.id}`))
    if (s.shape === 'tags') for (const g of s.groups) out.push(`g:${s.id}:${g.id}`, ...g.items.map((t) => `t:${s.id}:${g.id}:${t.id}`))
  }
  return out
}
