// Changes to a project, each written against a copy the store has already
// made: these mutate in place and return what the page should focus next.

import type { Design } from '../design/design.ts'
import { splitList } from '../parse/text.ts'
import type { Project } from './project.ts'
import { KINDS, newContact, newEntry, newGroup, newItem, newSection, reconcile } from './sections.ts'
import { CONTACT_ID, type Arrangement, type ContactKind, type Region, type Section, type SectionKind, type SectionShape } from './types.ts'

const find = (p: Project, id: string): Section | undefined => p.cv.sections.find((s) => s.id === id)
const after = <T extends { id: string }>(list: T[], id: string | undefined, item: T): void => {
  const at = id ? list.findIndex((x) => x.id === id) : -1
  list.splice(at < 0 ? list.length : at + 1, 0, item)
}

export type Place = Region | 'hidden'

/** Moves a section (or the contact details) to a place in a column, or out of sight. */
export function placeSection(p: Project, id: string, to: Place, index: number): void {
  const a = p.arrangement
  for (const key of ['main', 'side', 'hidden'] as const) a[key] = a[key].filter((x) => x !== id)
  // The contact details are never hidden: out of the columns means back under the name.
  if (id === CONTACT_ID && to === 'hidden') return
  const target = p.design.columns === 1 && to === 'side' ? 'main' : to
  a[target].splice(Math.max(0, Math.min(index, a[target].length)), 0, id)
}

export function addSection(p: Project, kind: SectionKind, region: Region): string {
  const section = newSection(kind)
  if (section.shape === 'entries') section.entries.push(newEntry())
  if (section.shape === 'list') section.items.push(newItem())
  if (section.shape === 'tags') section.groups.push(newGroup('', ['']))
  p.cv.sections.push(section)
  const target = p.design.columns === 1 ? 'main' : region
  p.arrangement[target].push(section.id)
  return `st:${section.id}`
}

export function removeSection(p: Project, id: string): void {
  p.cv.sections = p.cv.sections.filter((s) => s.id !== id)
  p.arrangement = reconcile(p.arrangement, p.cv, p.design.columns)
}

export function addEntry(p: Project, sectionId: string, afterId?: string): string {
  const s = find(p, sectionId)
  if (!s) return ''
  const entry = newEntry()
  after(s.entries, afterId, entry)
  return `e:${s.id}:${entry.id}:title`
}

export function removeEntry(p: Project, sectionId: string, entryId: string): void {
  const s = find(p, sectionId)
  if (s) s.entries = s.entries.filter((e) => e.id !== entryId)
}

export function moveEntry(p: Project, sectionId: string, entryId: string, index: number): void {
  const s = find(p, sectionId)
  const at = s?.entries.findIndex((e) => e.id === entryId) ?? -1
  if (!s || at < 0) return
  const [entry] = s.entries.splice(at, 1)
  s.entries.splice(Math.max(0, Math.min(index, s.entries.length)), 0, entry)
}

export function addBullet(p: Project, sectionId: string, entryId: string, afterId?: string, text = ''): string {
  const e = find(p, sectionId)?.entries.find((x) => x.id === entryId)
  if (!e) return ''
  const bullet = newItem(text)
  if (afterId) after(e.bullets, afterId, bullet)
  else e.bullets.unshift(bullet)
  return `b:${sectionId}:${entryId}:${bullet.id}`
}

/** Removes a bullet; focus goes to the one above, or to the entry's title. */
export function removeBullet(p: Project, sectionId: string, entryId: string, bulletId: string): string {
  const e = find(p, sectionId)?.entries.find((x) => x.id === entryId)
  if (!e) return ''
  const at = e.bullets.findIndex((b) => b.id === bulletId)
  e.bullets = e.bullets.filter((b) => b.id !== bulletId)
  const prev = e.bullets[at - 1]
  return prev ? `b:${sectionId}:${entryId}:${prev.id}` : `e:${sectionId}:${entryId}:title`
}

export function addItem(p: Project, sectionId: string, afterId?: string): string {
  const s = find(p, sectionId)
  if (!s) return ''
  const item = newItem()
  after(s.items, afterId, item)
  return `i:${s.id}:${item.id}`
}

export function removeItem(p: Project, sectionId: string, itemId: string): string {
  const s = find(p, sectionId)
  if (!s) return ''
  const at = s.items.findIndex((i) => i.id === itemId)
  s.items = s.items.filter((i) => i.id !== itemId)
  const prev = s.items[at - 1] ?? s.items[0]
  return prev ? `i:${s.id}:${prev.id}` : `st:${s.id}`
}

export function addTag(p: Project, sectionId: string, groupId: string, afterId?: string, text = ''): string {
  const g = find(p, sectionId)?.groups.find((x) => x.id === groupId)
  if (!g) return ''
  const tag = newItem(text)
  after(g.items, afterId, tag)
  return `t:${sectionId}:${groupId}:${tag.id}`
}

export function removeTag(p: Project, sectionId: string, groupId: string, tagId: string): string {
  const g = find(p, sectionId)?.groups.find((x) => x.id === groupId)
  if (!g) return ''
  const at = g.items.findIndex((t) => t.id === tagId)
  g.items = g.items.filter((t) => t.id !== tagId)
  const prev = g.items[at - 1] ?? g.items[0]
  return prev ? `t:${sectionId}:${groupId}:${prev.id}` : `g:${sectionId}:${groupId}`
}

export function addGroup(p: Project, sectionId: string): string {
  const s = find(p, sectionId)
  if (!s) return ''
  const group = newGroup('', [''])
  s.groups.push(group)
  return `g:${s.id}:${group.id}`
}

export function removeGroup(p: Project, sectionId: string, groupId: string): void {
  const s = find(p, sectionId)
  if (s) s.groups = s.groups.filter((g) => g.id !== groupId)
}

export function addContact(p: Project, kind: ContactKind): string {
  const contact = newContact(kind, '')
  p.cv.contacts.push(contact)
  return `c:${contact.id}`
}

export function removeContact(p: Project, id: string): void {
  p.cv.contacts = p.cv.contacts.filter((c) => c.id !== id)
}

/** Recasts a section's content in another shape: a list into dated entries, tags into a paragraph. */
export function setShape(p: Project, sectionId: string, shape: SectionShape): void {
  const s = find(p, sectionId)
  if (!s || s.shape === shape) return
  // Everything the section says, as plain lines, whatever shape it is in now.
  const lines: string[] =
    s.shape === 'text'
      ? s.text.split('\n')
      : s.shape === 'list'
        ? s.items.map((i) => i.text)
        : s.shape === 'tags'
          ? s.groups.map((g) => (g.label ? `${g.label}: ` : '') + g.items.map((t) => t.text).join(', '))
          : s.entries.flatMap((e) => [[e.title, e.subtitle, e.date, e.location].filter(Boolean).join(' — '), ...e.summary.split('\n'), ...e.bullets.map((b) => b.text)])
  const kept = lines.map((l) => l.trim()).filter(Boolean)
  const before = { entries: s.entries, groups: s.groups }
  s.text = ''
  s.items = []
  s.groups = []
  s.entries = []
  s.shape = shape
  if (shape === 'text') s.text = kept.join('\n')
  else if (shape === 'list') s.items = kept.map(newItem)
  else if (shape === 'tags') {
    s.groups = before.groups.length
      ? before.groups
      : kept.some((l) => /^[^:,]{2,40}:\s/.test(l))
        ? kept.map((l) => {
            const m = /^([^:,]{2,40}):\s*(.*)$/.exec(l)
            return m ? newGroup(m[1], splitList(m[2])) : newGroup('', splitList(l))
          })
        : [newGroup('', kept.flatMap(splitList))]
  } else {
    s.entries = before.entries.length ? before.entries : kept.map((l) => newEntry({ title: l }))
    if (!s.entries.length) s.entries.push(newEntry())
  }
}

/** Which kinds sit in the sidebar when a design with one is first applied. */
const sideFirst = (p: Project, id: string): boolean => {
  if (id === CONTACT_ID) return true
  const s = find(p, id)
  return !!s && KINDS[s.kind].side
}

/**
 * Switches the design. Going from one column to two sends the short reference
 * sections to the sidebar; going back to one puts them after the main ones.
 * A given arrangement (from copying a format) is used as it is.
 */
export function applyDesign(p: Project, design: Design, arrangement?: Arrangement): void {
  const was = p.design.columns
  p.design = structuredClone(design)
  if (arrangement) {
    p.arrangement = reconcile(structuredClone(arrangement), p.cv, design.columns)
    return
  }
  const a = p.arrangement
  if (design.columns === 2 && was === 1) {
    a.side = a.main.filter((id) => sideFirst(p, id))
    a.main = a.main.filter((id) => !sideFirst(p, id))
    if (!a.side.includes(CONTACT_ID) && design.header.place !== 'side') a.side.unshift(CONTACT_ID)
  }
  p.arrangement = reconcile(a, p.cv, design.columns)
}
