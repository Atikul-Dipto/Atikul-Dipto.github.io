import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { canShare, fileBase, saveBlob, shareBlob } from '../export/download.ts'
import { cvToText } from '../export/text.ts'
import { useStore } from '../state/store.ts'
import { IconCheck, IconDownload, IconFile, IconPrinter, IconShare, IconText, IconX } from './icons.tsx'
import { toast } from './toast.ts'

type Kind = 'pdf' | 'docx' | 'txt'

interface Made {
  kind: Kind
  blob: Blob
  name: string
  note: string
}

const kb = (bytes: number) => (bytes > 900_000 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/** Makes the files: a PDF that looks like the page, a plain Word file, or just the text. */
export default function ExportDialog({ onClose }: { onClose(): void }) {
  const project = useStore((s) => s.project)
  const [busy, setBusy] = useState<Kind | null>(null)
  const [made, setMade] = useState<Made | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!project) return null
  const base = fileBase(project)

  const make = async (kind: Kind) => {
    setBusy(kind)
    setMade(null)
    try {
      let blob: Blob
      let note = ''
      if (kind === 'pdf') {
        const { exportPdf } = await import('../export/pdf.ts')
        const result = await exportPdf(project)
        blob = result.blob
        note = `${result.pages} page${result.pages > 1 ? 's' : ''}, real text`
        if (result.missing) toast(`These characters aren’t in the CV fonts and were left out: ${result.missing.slice(0, 24)}. Use Print to keep them.`, true)
      } else if (kind === 'docx') {
        const { exportDocx } = await import('../export/docx.ts')
        blob = await exportDocx(project)
        note = 'one column, editable'
      } else {
        blob = new Blob([cvToText(project)], { type: 'text/plain' })
        note = 'for pasting into forms'
      }
      const name = `${base}.${kind}`
      saveBlob(blob, name)
      setMade({ kind, blob, name, note })
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : 'That export didn’t work. Try again.', true)
    } finally {
      setBusy(null)
    }
  }

  const options: { kind: Kind; title: string; text: string; icon: typeof IconFile }[] = [
    { kind: 'pdf', title: 'PDF', text: 'Looks exactly like the page. The text is real text, so people and screening software can both read it.', icon: IconFile },
    { kind: 'docx', title: 'Word', text: 'A plain one-column .docx with your fonts and colours. The safest thing to give a strict applicant tracking system.', icon: IconDownload },
    { kind: 'txt', title: 'Plain text', text: 'Just the words, in order. For application forms that ask you to paste your CV.', icon: IconText },
  ]

  return (
    <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal glass" role="dialog" aria-modal="true" aria-label="Export" initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
        <header className="modal-head">
          <h2>Export</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-s" aria-label="Close" onClick={onClose}>
            <IconX />
          </button>
        </header>
        <div className="export-list">
          {options.map((o) => (
            <button key={o.kind} type="button" className="export-card" disabled={busy !== null} data-busy={busy === o.kind || undefined} onClick={() => make(o.kind)}>
              <span className="export-icon">
                <o.icon />
              </span>
              <span className="export-text">
                <b>{o.title}</b>
                <small>{o.text}</small>
              </span>
              <span className="export-beam" aria-hidden="true" />
            </button>
          ))}
        </div>
        <AnimatePresence>
          {made && (
            <motion.div className="export-done" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <span className="export-check">
                <IconCheck />
              </span>
              <span>
                <b>{made.name}</b>
                <small>
                  {kb(made.blob.size)} · {made.note}
                </small>
              </span>
              {canShare(made.blob, made.name) && (
                <button type="button" className="btn btn-s" onClick={() => shareBlob(made.blob, made.name).catch(() => {})}>
                  <IconShare /> Share
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <footer className="modal-foot">
          <button
            type="button"
            className="btn btn-ghost btn-s"
            onClick={async () => {
              const { printCv } = await import('../export/print.tsx')
              await printCv(project)
            }}
          >
            <IconPrinter /> Print, or save as PDF from the print dialog
          </button>
        </footer>
      </motion.div>
    </motion.div>
  )
}
