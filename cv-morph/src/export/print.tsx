import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Project } from '../model/project.ts'
import { ensureFonts } from '../sheet/fontFiles.ts'
import { Sheet } from '../sheet/Sheet.tsx'

/**
 * Prints the CV with the browser's own print dialog (where "Save as PDF"
 * lives). The fallback for text the shipped fonts can't draw: the browser
 * prints with whatever font the device has for it.
 */
export async function printCv(project: Project): Promise<void> {
  await ensureFonts([project.design.fonts.body, project.design.fonts.heading])
  const host = document.createElement('div')
  host.id = 'print-root'
  document.body.appendChild(host)
  const root = createRoot(host)
  flushSync(() => root.render(<Sheet cv={project.cv} design={project.design} arrangement={project.arrangement} mode="print" gap={0} />))
  await document.fonts.ready
  await new Promise((resolve) => setTimeout(resolve, 250))
  const page = document.createElement('style')
  page.textContent = `@page { size: ${project.design.page === 'a4' ? 'A4' : 'letter'}; margin: 0 }`
  document.head.appendChild(page)
  const clear = () => {
    root.unmount()
    host.remove()
    page.remove()
    window.removeEventListener('afterprint', clear)
  }
  window.addEventListener('afterprint', clear)
  window.print()
}
