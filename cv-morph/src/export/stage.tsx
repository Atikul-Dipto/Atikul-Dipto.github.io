import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Project } from '../model/project.ts'
import { ensureFonts } from '../sheet/fontFiles.ts'
import { Sheet } from '../sheet/Sheet.tsx'

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Lays the CV out off-screen at full size, with nothing of the editor on it
 * (no placeholders, no tools, no gaps between pages), hands that page to
 * `read`, and clears it away. Every export reads from this one page, so they
 * all agree with each other and with what the screen shows.
 */
export async function withPrintSheet<T>(project: Project, read: (sheet: HTMLElement) => Promise<T>): Promise<T> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;contain:layout style'
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await ensureFonts([project.design.fonts.body, project.design.fonts.heading])
    flushSync(() => root.render(<Sheet cv={project.cv} design={project.design} arrangement={project.arrangement} mode="print" gap={0} />))
    await document.fonts.ready
    // Page breaks settle over a render or two; a hidden tab gets no frames, so don't wait on them alone.
    await Promise.race([frame().then(frame).then(frame), wait(400)])
    await document.fonts.ready
    await Promise.race([frame(), wait(120)])
    const sheet = host.querySelector<HTMLElement>('.sheet')
    if (!sheet) throw new Error('The page could not be laid out.')
    return await read(sheet)
  } finally {
    root.unmount()
    host.remove()
  }
}
