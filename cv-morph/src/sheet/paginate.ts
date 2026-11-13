export interface Paging {
  pages: number
  /** Where the full-width header ends on the first page, in sheet pixels. */
  headBottom: number
}

/**
 * Breaks a CV across pages.
 *
 * The sheet is one tall flow; each column is walked top to bottom, and any
 * block that would run past the bottom margin of its page is pushed down to
 * the top margin of the next, by giving it space above (--push, which
 * sheet.css turns into height). A heading is kept with what follows it.
 * Blocks are never split, so no line of text is ever cut by a page edge.
 *
 * Positions are read from the laid-out page, so this runs after every render
 * and whenever a font or picture arriving changes a height.
 */
export function paginate(sheet: HTMLElement, pageHeight: number, gap: number, margin: number): Paging {
  const box = sheet.getBoundingClientRect()
  // The sheet is shown scaled; measurements are wanted in its own pixels.
  const scale = box.width / sheet.offsetWidth || 1
  const stride = pageHeight + gap
  const usable = pageHeight - margin * 2
  let pages = 1

  for (const unit of sheet.querySelectorAll<HTMLElement>('[data-unit]')) unit.style.removeProperty('--push')

  for (const flow of sheet.querySelectorAll<HTMLElement>('[data-flow]')) {
    const units = [...flow.querySelectorAll<HTMLElement>('[data-unit]')]
    const boxes = units.map((unit) => {
      const r = unit.getBoundingClientRect()
      return { top: (r.top - box.top) / scale, bottom: (r.bottom - box.top) / scale }
    })
    let shift = 0
    units.forEach((unit, i) => {
      const top = boxes[i].top + shift
      const bottom = boxes[i].bottom + shift
      if (bottom - top < 0.5) return
      // A heading alone at the foot of a page is no use: measure it with the
      // block after it (and a section heading with the entry title after it,
      // and that with its first line).
      let last = i
      while (units[last].dataset.unit === 'heading' && last + 1 < units.length) last++
      const end = boxes[last].bottom + shift
      const page = Math.floor(top / stride)
      const limit = page * stride + pageHeight - margin
      if (end > limit + 0.5 && end - top <= usable) {
        const push = (page + 1) * stride + margin - top
        unit.style.setProperty('--push', `${push}px`)
        shift += push
      }
      pages = Math.max(pages, Math.floor((boxes[i].bottom + shift - 1) / stride) + 1)
    })
  }

  const head = sheet.querySelector<HTMLElement>('[data-head="top"]')
  const headBottom = head ? (head.getBoundingClientRect().bottom - box.top) / scale : 0
  return { pages, headBottom }
}
