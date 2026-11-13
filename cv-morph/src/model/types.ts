// What a CV is, to this app: a name, a line under it, ways to reach the
// person, and sections. Every section keeps all four kinds of content, so
// changing its shape (a list into dated entries, say) loses nothing.

export type SectionKind =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'awards'
  | 'publications'
  | 'volunteer'
  | 'interests'
  | 'references'
  | 'custom'

/** How a section's content is laid out: a paragraph, dated entries, grouped tags, or a plain list. */
export type SectionShape = 'text' | 'entries' | 'tags' | 'list'

export interface Item {
  id: string
  text: string
}

export interface Entry {
  id: string
  /** The role, degree or project. */
  title: string
  /** The employer or school. */
  subtitle: string
  date: string
  location: string
  /** Sentences under the heading lines, before any bullets. */
  summary: string
  bullets: Item[]
}

export interface TagGroup {
  id: string
  /** "Languages", "Tools"; empty for an unlabelled run of tags. */
  label: string
  items: Item[]
}

export interface Section {
  id: string
  kind: SectionKind
  title: string
  shape: SectionShape
  text: string
  entries: Entry[]
  groups: TagGroup[]
  items: Item[]
}

export type ContactKind = 'email' | 'phone' | 'location' | 'linkedin' | 'github' | 'website' | 'other'

export interface Contact {
  id: string
  kind: ContactKind
  /** What is printed: "linkedin.com/in/name". */
  value: string
  /** Where it leads, when it is a link. */
  url: string
}

export interface Cv {
  name: string
  headline: string
  /** A data URL, or '' for no photo. */
  photo: string
  contacts: Contact[]
  sections: Section[]
}

/** The page is a main column and, in two-column designs, a sidebar. */
export type Region = 'main' | 'side'

/**
 * Where each section sits, by id. CONTACT_ID stands for the contact details:
 * placed in a column they print as a section of their own, and otherwise they
 * go under the name.
 */
export interface Arrangement {
  main: string[]
  side: string[]
  hidden: string[]
}

export const CONTACT_ID = 'contact'
