import { completeDesign, DEFAULT_DESIGN, type Design } from '../design/design.ts'
import { defaultArrangement, emptyCv, reconcile } from './sections.ts'
import { CONTACT_ID, type Arrangement, type Cv } from './types.ts'

/** The job a CV is being checked against. */
export interface Job {
  title: string
  text: string
}

/** Everything the app keeps: one CV, how it looks, where its sections sit, and the job in hand. */
export interface Project {
  name: string
  cv: Cv
  design: Design
  arrangement: Arrangement
  job: Job
}

export function newProject(cv: Cv = emptyCv(), design: Design = DEFAULT_DESIGN, arrangement?: Arrangement, name = ''): Project {
  const d = structuredClone(design)
  const wanted = arrangement ?? defaultArrangement(cv, d.columns, d.columns === 2)
  return { name: name || cv.name || 'My CV', cv, design: d, arrangement: reconcile(wanted, cv, d.columns), job: { title: '', text: '' } }
}

/** A project read back from storage, with anything missing made good; null if it isn't one. */
export function reviveProject(stored: unknown): Project | null {
  if (!stored || typeof stored !== 'object') return null
  const raw = stored as Partial<Project>
  const cv = raw.cv
  if (!cv || typeof cv !== 'object' || !Array.isArray(cv.sections) || !Array.isArray(cv.contacts)) return null
  const design = completeDesign(raw.design)
  const lists = (raw.arrangement ?? {}) as Partial<Arrangement>
  const arrangement: Arrangement = {
    main: Array.isArray(lists.main) ? lists.main : [],
    side: Array.isArray(lists.side) ? lists.side : [],
    hidden: Array.isArray(lists.hidden) ? lists.hidden : [],
  }
  return {
    name: typeof raw.name === 'string' ? raw.name : cv.name || 'My CV',
    cv: { name: cv.name ?? '', headline: cv.headline ?? '', photo: cv.photo ?? '', contacts: cv.contacts, sections: cv.sections },
    design,
    arrangement: reconcile(arrangement, cv, design.columns),
    job: { title: raw.job?.title ?? '', text: raw.job?.text ?? '' },
  }
}

/** The section ids a design prints, in reading order. */
export const visibleIds = (p: Project): string[] => [...p.arrangement.main, ...p.arrangement.side].filter((id) => id !== CONTACT_ID)

/** Whether the contact details print as a section of their own rather than under the name. */
export const contactPlaced = (a: Arrangement): boolean => a.main.includes(CONTACT_ID) || a.side.includes(CONTACT_ID)
