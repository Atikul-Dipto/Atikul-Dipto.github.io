import { lazy, Suspense, useEffect, useState } from 'react'
import { edit, useStore, type Panel } from '../state/store.ts'
import { DesignPanel } from './DesignPanel.tsx'
import { EditBar } from './EditBar.tsx'
import { IconDownload, IconFile, IconLayout, IconPalette, IconRedo, IconTarget, IconUndo, IconWand, IconX } from './icons.tsx'
import { Brand } from './Logo.tsx'
import { SectionsPanel } from './SectionsPanel.tsx'
import { Stage } from './Stage.tsx'
import { useTouch } from './useTouch.ts'

const MatchPanel = lazy(() => import('./MatchPanel.tsx'))
const CloneFlow = lazy(() => import('./CloneFlow.tsx'))
const ExportDialog = lazy(() => import('./ExportDialog.tsx'))

const TABS: { id: Panel; label: string; icon: typeof IconPalette }[] = [
  { id: 'design', label: 'Design', icon: IconPalette },
  { id: 'sections', label: 'Sections', icon: IconLayout },
  { id: 'match', label: 'Job match', icon: IconTarget },
]

/** Where a CV is worked on: the page in the middle, its controls to the side (or, on a phone, in a sheet below). */
export function Studio({ onHome }: { onHome(): void }) {
  const name = useStore((s) => s.project?.name ?? '')
  const panel = useStore((s) => s.panel)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const picked = useStore((s) => s.picked)
  const touch = useTouch()
  // On a narrow screen the panel is a sheet that is opened and closed.
  const [sheet, setSheet] = useState(false)
  const [copying, setCopying] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) useStore.getState().redo()
        else useStore.getState().undo()
      } else if (key === 'y') {
        e.preventDefault()
        useStore.getState().redo()
      } else if (key === 's') {
        e.preventDefault()
        setExporting(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const open = (id: Panel) => {
    useStore.getState().setPanel(id)
    setSheet(true)
  }

  return (
    <div className="studio" data-sheet={sheet || undefined}>
      <header className="topbar">
        <button type="button" className="brand" onClick={onHome} aria-label="Back to the start">
          <Brand />
        </button>
        <input className="docname" value={name} aria-label="Name of this CV" spellCheck={false} onChange={(e) => edit((p) => void (p.name = e.target.value), { key: 'name' })} />
        <div className="topbar-tools">
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => useStore.getState().undo()}>
            <IconUndo />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => useStore.getState().redo()}>
            <IconRedo />
          </button>
          <button type="button" className="btn topbar-copy" onClick={() => setCopying(true)}>
            <IconWand /> <span>Copy a format</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setExporting(true)}>
            <IconDownload /> <span>Export</span>
          </button>
        </div>
      </header>

      <div className="work">
        <Stage />
        <aside className="panel" aria-label="Controls">
          <nav className="tabs" aria-label="Panels">
            {TABS.map((tab) => (
              <button key={tab.id} type="button" className="tab" aria-pressed={panel === tab.id} onClick={() => useStore.getState().setPanel(tab.id)}>
                <tab.icon /> {tab.label}
              </button>
            ))}
            <button type="button" className="btn btn-ghost btn-icon btn-s panel-close" aria-label="Close" onClick={() => setSheet(false)}>
              <IconX />
            </button>
          </nav>
          <div className="panel-scroll" data-drag-scroll>
            {panel === 'design' && <DesignPanel onCopyFormat={() => setCopying(true)} />}
            {panel === 'sections' && <SectionsPanel />}
            {panel === 'match' && (
              <Suspense fallback={<p className="hint panel-wait">Loading…</p>}>
                <MatchPanel />
              </Suspense>
            )}
          </div>
        </aside>
      </div>

      <nav className="dock" aria-label="Panels">
        <button type="button" className="dock-btn" aria-pressed={!sheet} onClick={() => setSheet(false)}>
          <IconFile />
          Page
        </button>
        {TABS.map((tab) => (
          <button key={tab.id} type="button" className="dock-btn" aria-pressed={sheet && panel === tab.id} onClick={() => open(tab.id)}>
            <tab.icon />
            {tab.label}
          </button>
        ))}
      </nav>

      {touch && picked && <EditBar />}
      <Suspense fallback={null}>
        {copying && <CloneFlow onClose={() => setCopying(false)} />}
        {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      </Suspense>
    </div>
  )
}
