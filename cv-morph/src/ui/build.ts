import { analyze } from '../design/analyze.ts'
import { newProject, type Project } from '../model/project.ts'
import type { DocModel } from '../parse/geometry.ts'
import { arrangementOf, type Parsed } from '../parse/index.ts'

/**
 * Turns a file that has been read into a project. The CV starts out looking
 * like the file it came from: its columns, colours and type are worked out
 * from the page, and its sections sit where they sat.
 */
export function buildProject(doc: DocModel, parsed: Parsed): Project {
  const design = analyze(doc, parsed).design
  const name = doc.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim()
  return newProject(parsed.cv, design, arrangementOf(parsed), parsed.cv.name ? `${parsed.cv.name} CV` : name || 'My CV')
}
