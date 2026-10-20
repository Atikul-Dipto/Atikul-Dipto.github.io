import { Suspense, lazy, useEffect } from 'react'
import { useSilo } from './state/useSilo'
import { supportsWebGL } from './lib/capability'
import { DirectoryOverlay, MiniSilo } from './ui/Directory'
import { CallPanel, CvViewer, Fallback, TopBar } from './ui/Chrome'
import FloorPanel from './ui/FloorPanel'
import Intro from './ui/Intro'
import Soundscape from './ui/Soundscape'
import WalkHud from './ui/WalkHud'
import JukeboxPanel from './ui/JukeboxPanel'
import ArcadePanel from './ui/ArcadePanel'
import MazeMapPanel from './ui/MazeMapPanel'
import DronePanel, { DroneHud } from './ui/DronePanel'
import CitizenPanel from './ui/CitizenPanel'
import PoemsPanel from './ui/PoemsPanel'
import AimHud from './ui/AimHud'
import SoundboxPanel from './ui/SoundboxPanel'
import './styles.css'

// The engine is the bulk of the bundle; keep it out of the first paint so the
// boot screen and the fallback can render immediately.
const SiloScene = lazy(() => import('./three/SiloScene'))

export default function App() {
  const phase = useSilo((s) => s.phase)
  const webglFailed = useSilo((s) => s.webglFailed)
  const setWebglFailed = useSilo((s) => s.setWebglFailed)
  const toggleDirectory = useSilo((s) => s.toggleDirectory)
  const closeRecord = useSilo((s) => s.closeRecord)
  const fading = useSilo((s) => s.fading)
  const progress = useSilo((s) => s.progress)

  useEffect(() => {
    if (!supportsWebGL()) setWebglFailed()
  }, [setWebglFailed])

  // Escape closes whatever is open. The arrow keys and D used to ride the
  // lift and open the directory; on foot they are movement keys, and the
  // directory is one click away in the top bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      toggleDirectory(false)
      closeRecord()
      useSilo.getState().closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleDirectory, closeRecord])

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
      <WalkHud />
      <JukeboxPanel />
      <ArcadePanel />
      <MazeMapPanel />
      <DronePanel />
      <DroneHud />
      <CitizenPanel />
      <PoemsPanel />
      <AimHud />
      <SoundboxPanel />
      <Soundscape />
      <div className={`fade${fading ? ' is-on' : ''}`} aria-hidden="true" />
    </div>
  )
}
