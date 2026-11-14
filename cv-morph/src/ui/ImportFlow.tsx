import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { readFile, readText, type Progress } from '../ingest/index.ts'
import type { Project } from '../model/project.ts'
import type { DocModel } from '../parse/geometry.ts'
import { parseCv, type Parsed } from '../parse/index.ts'
import { buildProject } from './build.ts'
import { IconAlert, IconCheck, IconLock } from './icons.tsx'

export type Source = { file: File } | { text: string }

interface Props {
  source: Source
  onDone(project: Project): void
  onCancel(): void
}

const STEPS = ['Opening the file', 'Reading the text', 'Finding columns and headings', 'Building your CV'] as const
const stepOf = (p: Progress | null, found: boolean): number => (found ? 3 : !p || p.stage === 'open' ? 0 : p.stage === 'layout' ? 2 : 1)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Reading a CV, shown as it happens: the page under a scanning beam, each
 * line it finds lighting up in the colour of what it turned out to be, and
 * the sections it found counted off beside it. The boxes are the real ones
 * the reader worked from, not decoration.
 */
export function ImportFlow({ source, onDone, onCancel }: Props) {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [found, setFound] = useState<{ doc: DocModel; parsed: Parsed } | null>(null)
  const [error, setError] = useState('')
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useEffect(() => {
    let live = true
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ;(async () => {
      try {
        const doc = 'file' in source ? await readFile(source.file, (p) => live && setProgress(p)) : readText(source.text)
        const parsed = parseCv(doc)
        // A handle for looking at what was read, while developing.
        if (import.meta.env.DEV) Object.assign(window, { cvMorphLast: { doc, parsed } })
        if (!parsed.cv.name && !parsed.cv.sections.length) {
          throw new Error(doc.ocr ? 'No text could be read from that picture. A sharper, straighter picture usually works; a PDF works best.' : 'No text was found in that file.')
        }
        if (!live) return
        setFound({ doc, parsed })
        const project = buildProject(doc, parsed)
        // Long enough to see what was found; it is the point of the screen.
        await wait(calm ? 400 : 2600)
        if (live) done.current(project)
      } catch (e) {
        if (live) setError(e instanceof Error && e.message ? e.message : 'That file couldn’t be read.')
      }
    })()
    return () => {
      live = false
    }
  }, [source])

  const step = stepOf(progress, !!found)
  const page = found?.doc.pages[0]
  const ratio = page ? Math.min(1.5, page.height / page.width) : 1.414
  const marks = found && page ? found.parsed.marks.filter((m) => m.line.page === 0 && m.line.y / page.width < ratio) : []
  const reading = progress?.stage === 'ocr' ? 'Reading the picture' : STEPS[1]
  const sections = found?.parsed.cv.sections ?? []
  const count = (s: (typeof sections)[number]) =>
    s.shape === 'entries' ? `${s.entries.length} ${s.entries.length === 1 ? 'entry' : 'entries'}` : s.shape === 'tags' ? `${s.groups.reduce((n, g) => n + g.items.length, 0)} items` : s.shape === 'list' ? `${s.items.length} items` : `${s.text.split(/\s+/).length} words`

  return (
    <motion.div className="flow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }} role="dialog" aria-modal="true" aria-label="Reading your CV">
      <div className="flow-inner">
        <motion.div className="scan" style={{ aspectRatio: `1 / ${ratio}` }} initial={{ opacity: 0, scale: 0.94, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 22 }} data-found={found ? '' : undefined}>
          {found?.doc.preview ? (
            <img className="scan-page" src={found.doc.preview} alt="" />
          ) : (
            <div className="scan-page scan-blank">
              {Array.from({ length: 16 }, (_, i) => (
                <i key={i} style={{ width: `${[62, 88, 80, 45, 0, 30, 92, 85, 70, 0, 34, 90, 78, 86, 50, 66][i]}%` }} />
              ))}
            </div>
          )}
          {page &&
            marks.map((m, i) => (
              <span
                key={i}
                className={`scan-mark scan-${m.role}`}
                style={{
                  left: `${(m.line.x / page.width) * 100}%`,
                  top: `${(m.line.y / (page.width * ratio)) * 100}%`,
                  width: `${(m.line.w / page.width) * 100}%`,
                  height: `${(Math.max(m.line.h, m.line.size) / (page.width * ratio)) * 100}%`,
                  animationDelay: `${0.15 + (m.line.y / (page.width * ratio)) * 1.25}s`,
                }}
              >
                {m.role === 'heading' && <b>{m.label}</b>}
              </span>
            ))}
          <span className="scan-beam" aria-hidden="true" />
          <span className="scan-corner scan-tl" />
          <span className="scan-corner scan-tr" />
          <span className="scan-corner scan-bl" />
          <span className="scan-corner scan-br" />
        </motion.div>

        <div className="flow-side">
          {error ? (
            <motion.div className="flow-error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <IconAlert />
              <h2>That didn’t work</h2>
              <p>{error}</p>
              <button type="button" className="btn btn-primary" onClick={onCancel}>
                Choose another file
              </button>
            </motion.div>
          ) : (
            <>
              <p className="mono flow-kicker">{found ? 'read' : 'reading'}</p>
              <h2 className="flow-title">{found ? found.parsed.cv.name || 'Your CV' : 'Reading your CV'}</h2>
              <ol className="flow-steps">
                {STEPS.map((label, i) => (
                  <li key={label} data-state={i < step || found ? 'done' : i === step ? 'now' : 'next'}>
                    <span className="flow-dot">{(i < step || found) && <IconCheck />}</span>
                    {i === 1 ? reading : label}
                    {i === 1 && i === step && progress?.stage === 'ocr' && <em>{Math.round((progress.ratio ?? 0) * 100)}%</em>}
                  </li>
                ))}
              </ol>
              <div className="flow-found" aria-live="polite">
                {sections.map((s, i) => (
                  <motion.span key={s.id} className="flow-chip" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.13, type: 'spring', stiffness: 260, damping: 24 }}>
                    <b>{s.title}</b>
                    <small>{count(s)}</small>
                  </motion.span>
                ))}
              </div>
              <p className="flow-private">
                <IconLock /> Read on this device. Nothing is uploaded.
              </p>
              {!found && (
                <button type="button" className="btn btn-ghost btn-s" onClick={onCancel}>
                  Cancel
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}
