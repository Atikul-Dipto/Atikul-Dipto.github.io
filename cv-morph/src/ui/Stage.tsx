import { useEffect, useRef, useState } from 'react'
import { PAGES } from '../design/design.ts'
import * as ops from '../model/ops.ts'
import { CONTACT_ID } from '../model/types.ts'
import { Sheet, type SheetHooks } from '../sheet/Sheet.tsx'
import type { Paging } from '../sheet/paginate.ts'
import { useStore } from '../state/store.ts'
import { startDrag } from './dnd.ts'
import { useTouch } from './useTouch.ts'
import { IconZoomIn, IconZoomOut } from './icons.tsx'

const GAP = 30

/** The page, scaled to fit, in a scrolling area; and the dragging of its blocks. */
export function Stage() {
  const project = useStore((s) => s.project)
  const epoch = useStore((s) => s.epoch)
  const scroller = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(900)
  const [zoom, setZoom] = useState<number | null>(null)
  const [paging, setPaging] = useState<Paging>({ pages: 1, headBottom: 0 })
  const [dragging, setDragging] = useState<string | null>(null)
  const touch = useTouch()

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(() => setRoom(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!project) return null
  const page = PAGES[project.design.page]
  const padding = room < 700 ? 12 : 44
  const fit = Math.max(0.2, Math.min(1.25, (room - padding * 2) / page.width))
  const scale = zoom ?? fit
  const height = paging.pages * page.height + (paging.pages - 1) * GAP

  const hooks: SheetHooks = {
    dragging,
    onGrip: (event, what) => {
      const state = useStore.getState()
      const before = state.project
      const section = before?.cv.sections.find((s) => s.id === what.section)
      const done = (cancelled: boolean) => {
        setDragging(null)
        useStore.getState().settle(before, !cancelled)
      }
      if (what.entry) {
        const entryId = what.entry
        const entry = section?.entries.find((e) => e.id === entryId)
        startDrag(event, {
          id: entryId,
          group: `entry:${what.section}`,
          label: entry?.title || 'Entry',
          onStart: () => setDragging(entryId),
          onMove: (landing) => landing && state.edit((p) => ops.moveEntry(p, what.section, entryId, landing.index), { quiet: true, moves: true }),
          onEnd: (_, cancelled) => done(cancelled),
        })
        return
      }
      startDrag(event, {
        id: what.section,
        group: 'section',
        label: what.section === CONTACT_ID ? 'Contact' : section?.title || 'Section',
        onStart: () => setDragging(what.section),
        onMove: (landing) => landing && state.edit((p) => ops.placeSection(p, what.section, landing.zone as ops.Place, landing.index), { quiet: true, moves: true }),
        onEnd: (_, cancelled) => done(cancelled),
      })
    },
  }

  return (
    <div className="stage" ref={scroller} data-drag-scroll>
      <div className="stage-pad" style={{ padding }}>
        <div className="stage-sheet" style={{ width: page.width * scale, height: height * scale }}>
          <div className="stage-scale" style={{ transform: `scale(${scale})`, width: page.width }}>
            <Sheet
              cv={project.cv}
              design={project.design}
              arrangement={project.arrangement}
              mode={touch ? 'touch' : 'edit'}
              gap={GAP}
              hooks={hooks}
              motion={epoch}
              onPaging={(next) => setPaging((prev) => (prev.pages === next.pages ? prev : next))}
            />
          </div>
          {Array.from({ length: paging.pages }, (_, i) => (
            <span key={i} className="stage-tag mono" style={{ top: (i * (page.height + GAP) + page.height) * scale + 6 }}>
              page {String(i + 1).padStart(2, '0')} / {String(paging.pages).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>
      <div className="stage-zoom glass" role="group" aria-label="Zoom">
        <button type="button" className="btn btn-ghost btn-icon btn-s" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.3, Math.round((scale - 0.15) * 20) / 20))}>
          <IconZoomOut />
        </button>
        <button type="button" className="btn btn-ghost btn-s mono" aria-label="Fit the page to the width" onClick={() => setZoom(null)}>
          {Math.round(scale * 100)}%
        </button>
        <button type="button" className="btn btn-ghost btn-icon btn-s" aria-label="Zoom in" onClick={() => setZoom(Math.min(2.5, Math.round((scale + 0.15) * 20) / 20))}>
          <IconZoomIn />
        </button>
      </div>
    </div>
  )
}
