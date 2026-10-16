import { useEffect, useRef } from 'react'
import { bodyAt } from '../lib/chamber'
import { drawMazeMap } from '../lib/mazeMap'
import { useSilo } from '../state/useSilo'

/**
 * The map of the maze, opened from the board on the plaza: the whole of level
 * 6 from above -- the maze, the three doors, the rooms behind the wall and the
 * corridors joining them -- with you on it, and which way you are facing.
 */
export default function MazeMapPanel() {
  const open = useSilo((s) => s.panel === 'map')
  const close = useSilo((s) => s.closePanel)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!open) return
    let id = 0
    const draw = () => {
      const c = canvas.current
      if (c) {
        const size = Math.min(c.parentElement?.clientWidth ?? 640, 640)
        if (c.width !== size) {
          c.width = size
          c.height = size
        }
        const g = c.getContext('2d')!
        g.clearRect(0, 0, size, size)
        drawMazeMap(g, { cx: size / 2, cy: size / 2, radius: size / 2 - 4, you: { ...bodyAt } })
      }
      id = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(id)
  }, [open])

  if (!open) return null
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Map of the maze">
      <div className="sheet__panel">
        <div className="sheet__head">
          <div>
            <p className="sheet__eyebrow">Recreation · level 06</p>
            <h2>The maze</h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={close}>
            Close
          </button>
        </div>
        <div className="mazemap">
          <canvas ref={canvas} aria-label="The maze from above, with you marked in red" />
        </div>
        <p className="sheet__note">
          The plaza is at the top. Two ways in, marked in gold; three round doors at the back of the maze. You are the red
          dot, and the line shows which way you face.
        </p>
      </div>
    </div>
  )
}
