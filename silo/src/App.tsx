import { Suspense, lazy, useEffect } from 'react'
import { useSilo } from './state/useSilo'
import { supportsWebGL } from './lib/capability'
import { DirectoryOverlay, MiniSilo } from './ui/Directory'
import { CallPanel, CvViewer, Fallback, TopBar } from './ui/Chrome'
import FloorPanel from './ui/FloorPanel'
import Intro from './ui/Intro'
import './styles.css'

// The engine is the bulk of the bundle; keep it out of the first paint so the
// boot screen and the fallback can render immediately.
const SiloScene = lazy(() => import('./three/SiloScene'))

export default function App() {
  const phase = useSilo((s) => s.phase)
  const webglFailed = useSilo((s) => s.webglFailed)
  const setWebglFailed = useSilo((s) => s.setWebglFailed)
  const toggleDirectory = useSilo((s) => s.toggleDirectory)
  const closeAirlock = useSilo((s) => s.closeAirlock)
  const goToLevel = useSilo((s) => s.goToLevel)
  const level = useSilo((s) => s.level)
  const progress = useSilo((s) => s.progress)

  useEffect(() => {
    if (!supportsWebGL()) setWebglFailed()
  }, [setWebglFailed])

  // Keyboard navigation (spec §11): arrows ride, D opens the directory.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (e.key === 'Escape') {
        toggleDirectory(false)
        closeAirlock()
      }
      if (useSilo.getState().phase !== 'onFloor') return
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault()
        goToLevel(level + 1)
      }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        goToLevel(level - 1)
      }
      if (e.key.toLowerCase() === 'd') toggleDirectory()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goToLevel, level, toggleDirectory, closeAirlock])

  if (webglFailed) return <Fallback />

  return (
    <div className="silo">
      <Suspense fallback={null}>
        <SiloScene />
      </Suspense>

      <div
        className={`boot${phase === 'boot' ? '' : ' is-done'}`}
        aria-hidden={phase !== 'boot'}
        role="status"
        aria-live="polite"
      >
        <span className="boot__ring" />
        <p>Pressurising…</p>
        <span className="boot__bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} />
        </span>
        <span className="boot__pct">{Math.round(progress * 100)}%</span>
      </div>

      {phase === 'exterior' && <Intro />}

      <TopBar />
      {phase !== 'exterior' && phase !== 'boot' && <MiniSilo />}
      <FloorPanel />
      <CallPanel />
      <DirectoryOverlay />
      <CvViewer />
    </div>
  )
}
