import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { ACCEPT } from '../ingest/index.ts'
import { useInstall } from '../pwa/install.ts'
import { useStore } from '../state/store.ts'
import { IconArrowRight, IconFile, IconImage, IconLayout, IconLock, IconPencil, IconPhone, IconTarget, IconUpload, IconWand, IconX } from './icons.tsx'
import { Brand } from './Logo.tsx'

interface Props {
  onFile(file: File): void
  onText(text: string): void
  onSample(): void
  onBlank(): void
  onContinue(): void
}

const FEATURES = [
  { icon: IconPencil, title: 'Change anything, where it stands', text: 'Your CV comes in as a real document. Click a line and type. Add, drop or reorder a job, a bullet, a skill.' },
  { icon: IconWand, title: 'Wear any format you like', text: 'Seen a CV whose look you want? Give it the PDF, a screenshot or the Word file. Its layout, colours and headings are copied and your words are poured in.' },
  { icon: IconLayout, title: 'Arrange it by hand', text: 'Drag sections between columns, hide the ones this job doesn’t need, and watch the page settle around them.' },
  { icon: IconTarget, title: 'Check it against the job', text: 'Paste the job advert. See which of its requirements your CV answers, which words are missing, and how well screening software will read it.' },
]

export function Home({ onFile, onText, onSample, onBlank, onContinue }: Props) {
  const saved = useStore((s) => s.project)
  const install = useInstall()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')

  // A file dropped anywhere on the page counts.
  useEffect(() => {
    let depth = 0
    const has = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!has(e)) return
      depth++
      setOver(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setOver(false)
    }
    const hover = (e: DragEvent) => has(e) && e.preventDefault()
    const drop = (e: DragEvent) => {
      if (!has(e)) return
      e.preventDefault()
      depth = 0
      setOver(false)
      const file = e.dataTransfer?.files[0]
      if (file) onFile(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', hover)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', hover)
      window.removeEventListener('drop', drop)
    }
  }, [onFile])

  return (
    <div className="home">
      <div className="home-sky" aria-hidden="true">
        <span className="home-glow home-glow-a" />
        <span className="home-glow home-glow-b" />
        <span className="home-grid" />
      </div>

      <header className="home-top">
        <Brand />
        {install.ready && (
          <button type="button" className="btn btn-s" onClick={install.install}>
            <IconPhone /> Install the app
          </button>
        )}
      </header>

      <main className="home-main">
        <motion.section className="hero" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}>
          <p className="mono hero-kicker">CV editor · format copier · job match</p>
          <h1>
            Your CV, in <span className="grad-text">any shape</span> you like.
          </h1>
          <p className="hero-sub">Drop in the CV you have. Change any part of it, give it the look of one you admire, and check it against the job, all on your own device.</p>

          {saved && (
            <button type="button" className="resume glass" onClick={onContinue}>
              <span>
                <small className="mono">pick up where you left off</small>
                <b>{saved.name}</b>
              </span>
              <IconArrowRight />
            </button>
          )}

          <div className="drop" data-over={over || undefined}>
            <span className="drop-ring" aria-hidden="true" />
            <div className="drop-inner">
              <span className="drop-icons" aria-hidden="true">
                <IconFile />
                <IconImage />
              </span>
              <h2>{over ? 'Let go to read it' : 'Drop your CV here'}</h2>
              <p>PDF works best. Word (.docx) and pictures (PNG, JPG, a photo of the page) work too.</p>
              <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
                <IconUpload /> Choose a file
              </button>
              <input
                ref={input}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) onFile(file)
                }}
              />
              <p className="drop-private">
                <IconLock /> Your file is read in this browser and never uploaded.
              </p>
            </div>
          </div>

          <div className="hero-alts">
            <button type="button" className="btn btn-s" onClick={onSample}>
              Try it with a sample CV
            </button>
            <button type="button" className="btn btn-s btn-ghost" onClick={() => setPasting(true)}>
              Paste the text instead
            </button>
            <button type="button" className="btn btn-s btn-ghost" onClick={onBlank}>
              Start from a blank page
            </button>
          </div>
        </motion.section>

        <section className="features" aria-label="What it does">
          {FEATURES.map((f, i) => (
            <motion.article key={f.title} className="feature glass" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: i * 0.08, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
              <span className="feature-icon">
                <f.icon />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </motion.article>
          ))}
        </section>

        <section className="home-app glass">
          <IconPhone />
          <div>
            <h3>Web and app, the same thing</h3>
            {install.installed ? (
              <p>You are using the installed app. It opens without a connection, and your CV stays on this device.</p>
            ) : install.ios ? (
              <p>
                On an iPhone or iPad, open this page in Safari, tap Share, then <b>Add to Home Screen</b>. It then opens like any app, even offline.
              </p>
            ) : (
              <p>
                Use it here in the browser, or install it: {install.ready ? 'press “Install the app” above.' : 'in Chrome or Edge, open the browser menu and choose “Install app” or “Add to Home screen”.'} Installed, it opens like any app and works offline.
              </p>
            )}
          </div>
        </section>
      </main>

      {pasting && (
        <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && setPasting(false)}>
          <motion.div className="modal glass" role="dialog" aria-modal="true" aria-label="Paste your CV" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <header className="modal-head">
              <h2>Paste your CV’s text</h2>
              <button type="button" className="btn btn-ghost btn-icon btn-s" aria-label="Close" onClick={() => setPasting(false)}>
                <IconX />
              </button>
            </header>
            <textarea className="textarea paste-area" rows={12} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste everything: name, contact details, experience, education, skills…" autoFocus />
            <footer className="modal-foot">
              <button
                type="button"
                className="btn btn-primary"
                disabled={pasted.trim().length < 40}
                onClick={() => {
                  setPasting(false)
                  onText(pasted)
                }}
              >
                Read it
              </button>
            </footer>
          </motion.div>
        </div>
      )}
    </div>
  )
}
