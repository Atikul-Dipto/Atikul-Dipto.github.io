import { useCallback } from 'react'
import { useWebGLScene } from '../hooks/useWebGLScene'
import { createGlobe } from '../webgl/globe'

export default function HeroGlobe() {
  const factory = useCallback((THREE, canvas, opts) => createGlobe(THREE, canvas, opts), [])
  const { canvasRef, active, themeKey } = useWebGLScene(factory)

  return (
    <div className={`hero-globe${active ? ' is-live' : ''}`}>
      <canvas key={themeKey} ref={canvasRef} className="hero-globe__canvas" aria-hidden="true" />
      <span className="hero-globe__ring" aria-hidden="true" />
      <p className="hero-globe__caption">
        <span className="hero-globe__dot" aria-hidden="true" />
        Bangladesh shipment lanes
      </p>
    </div>
  )
}
