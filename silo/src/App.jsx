import { useCallback, useEffect, useRef, useState } from 'react'
import { profile } from '../../src/data'
import { FLOORS } from './silo/config'
import { createViewer } from './silo/viewer'
import './App.css'

// Scroll distance allotted to each floor. Higher = a slower, more deliberate
// descent; this is the main feel dial.
const VH_PER_FLOOR = 1.45

export default function App() {
  const canvasRef = useRef(null)
  const viewerRef = useRef(null)
  const [floor, setFloor] = useState(0)
  const [ready, setReady] = useState(false)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const viewer = createViewer(canvas, {
      portraitUrl: `${import.meta.env.BASE_URL}profile.jpg`,
      onFloorChange: (index) => setFloor(index),
    })
    viewerRef.current = viewer
    viewer.ready.then(() => setReady(true))

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      viewer.setProgress(max > 0 ? window.scrollY / max : 0)
    }
    const onResize = () => {
      viewer.resize()
      onScroll()
    }

    // Mouse position gives a gentle look-around; holding the button amplifies
    // it. Touch is left alone — a drag there is a scroll, which is the descent.
    let dragging = false
    const onPointerMove = (e) => {
      if (e.pointerType === 'touch') return
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1
      const gain = dragging ? 0.85 : 0.3
      viewer.setLook(-nx * gain, -ny * gain * 0.6)
    }
    const onDown = (e) => {
      if (e.pointerType !== 'touch') dragging = true
    }
    const onUp = () => {
      dragging = false
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      viewer.dispose()
    }
  }, [])

  const goToFloor = useCallback((index) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: (index / (FLOORS.length - 1)) * max, behavior: 'smooth' })
  }, [])

  return (
    <div className="silo">
      <canvas className="silo__canvas" ref={canvasRef} />

      {/* The page is one tall scroller; the canvas is fixed behind it. */}
      <div className="silo__scroll" style={{ height: `${FLOORS.length * VH_PER_FLOOR * 100}vh` }} />

      <div className={`silo__boot${ready ? ' is-done' : ''}`} aria-hidden={ready}>
        <div className="silo__boot-inner">
          <span className="silo__boot-ring" />
          <p>Sealing the hatch…</p>
        </div>
      </div>

      <header className="silo__top">
        <a className="silo__back" href="/">
          <span aria-hidden="true">←</span> Readable version
        </a>
        <span className="silo__depth">
          Depth <strong>{String(floor + 1).padStart(2, '0')}</strong>
          <i>/ {String(FLOORS.length).padStart(2, '0')}</i>
        </span>
      </header>

      <nav className="silo__levels" aria-label="Silo levels">
        {FLOORS.map((f) => (
          <button
            type="button"
            key={f.id}
            className={`silo__level${f.index === floor ? ' is-active' : ''}`}
            onClick={() => goToFloor(f.index)}
            aria-current={f.index === floor ? 'true' : undefined}
          >
            <span className="silo__level-num">{String(f.index + 1).padStart(2, '0')}</span>
            <span className="silo__level-name">{f.name}</span>
          </button>
        ))}
      </nav>

      {/* Real HTML, so the content is selectable, readable and indexable even
          though it sits over a WebGL scene. */}
      <main className="silo__panels">
        <section className={`silo-panel${floor === 0 ? ' is-active' : ''}`} aria-hidden={floor !== 0}>
          <p className="silo-panel__level">{FLOORS[0].level} — {FLOORS[0].name}</p>
          <h1>{profile.name}</h1>
          <p className="silo-panel__role">{profile.title}</p>
          <p className="silo-panel__tagline">{profile.tagline}</p>
          <p className="silo-panel__meta">{profile.location}</p>
          <p className="silo-panel__hint">
            <span className="silo-panel__chev" aria-hidden="true" />
            Scroll to take the stairs
          </p>
        </section>

        {FLOORS.slice(1).map((f) => (
          <section
            className={`silo-panel silo-panel--stub${floor === f.index ? ' is-active' : ''}`}
            key={f.id}
            aria-hidden={floor !== f.index}
          >
            <p className="silo-panel__level">{f.level}</p>
            <h2>{f.name}</h2>
            <p className="silo-panel__tagline">{f.blurb}</p>
            <p className="silo-panel__stub-note">Still being fitted out.</p>
          </section>
        ))}
      </main>

      <footer className={`silo__hint${entered || floor > 0 ? ' is-hidden' : ''}`}>
        <button type="button" onClick={() => { setEntered(true); goToFloor(1) }}>
          Descend
        </button>
        <span>or move the mouse to look around</span>
      </footer>
    </div>
  )
}
