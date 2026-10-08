import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWebGLScene } from '../hooks/useWebGLScene'
import { createConstellation } from '../webgl/constellation'
import { isLowPower } from '../webgl/env'

export default function AnimatedBackground() {
  const sceneRef = useRef(null)
  // Decided once on mount: `isLowPower` touches window, so it must not run
  // during render if this is ever server-rendered.
  const [webglAllowed, setWebglAllowed] = useState(false)
  useEffect(() => setWebglAllowed(!isLowPower()), [])

  const factory = useCallback(
    (THREE, canvas, opts) =>
      createConstellation(THREE, canvas, { ...opts, count: window.innerWidth < 1100 ? 240 : 420 }),
    [],
  )
  const { canvasRef, active, themeKey } = useWebGLScene(factory, { enabled: webglAllowed, trackScroll: true })

  // CSS fallback particles, used until (or instead of) WebGL.
  const particles = useMemo(
    () =>
      Array.from({ length: 68 }, (_, index) => {
        const layer = index % 3
        const speed = 6 + layer * 3
        return {
          id: index,
          size: 2 + ((index * 11) % 9) * 0.8,
          left: `${(index * 23 + 11) % 100}%`,
          top: `${(index * 31 + 13) % 100}%`,
          duration: `${speed + (index % 5) * 0.9}s`,
          delay: `${(index % 9) * 0.4}s`,
          opacity: 0.35 + layer * 0.15,
          layer,
        }
      }),
    [],
  )

  // The field belongs to the hero. Past it the page is body copy, tables and
  // code — all of which are harder to read over moving lines — so the layer
  // fades out over the first screen and the colour wash takes back over.
  useEffect(() => {
    const el = sceneRef.current
    if (!el) return

    let raf = 0
    const applyFade = () => {
      raf = 0
      const span = window.innerHeight * 0.85
      const t = Math.min(1, Math.max(0, window.scrollY / span))
      // easeOutCubic, so it thins out quickly rather than lingering over About.
      el.style.setProperty('--bg-fade', (1 - (1 - (1 - t) ** 3)).toFixed(3))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(applyFade)
    }

    applyFade()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  useEffect(() => {
    const el = sceneRef.current
    if (!el) return

    let raf = null
    const handlePointerMove = (e) => {
      const x = e.clientX / window.innerWidth
      const y = e.clientY / window.innerHeight
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--mx', x.toFixed(3))
        el.style.setProperty('--my', y.toFixed(3))
      })
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className={`bg-scene${active ? ' bg-scene--webgl' : ''}`} ref={sceneRef} aria-hidden="true">
      {/* Wrapper owns the one-off fade-in when the scene starts; the canvas
          itself owns the scroll fade, which must not be transitioned or it
          lags behind the scroll position. */}
      <div className="bg-canvas-wrap">
        <canvas key={themeKey} className="bg-canvas" ref={canvasRef} />
      </div>

      <div className="bg-particles">
        {particles.map((particle) => (
          <span
            key={particle.id}
            className="bg-particle"
            style={{
              '--size': `${particle.size}px`,
              '--left': particle.left,
              '--top': particle.top,
              '--duration': particle.duration,
              '--delay': particle.delay,
              '--opacity': particle.opacity,
              '--layer': particle.layer,
            }}
          />
        ))}
      </div>
      <div className="bg-parallax bg-parallax--one">
        <span className="bg-blob bg-blob--one" />
      </div>
      <div className="bg-parallax bg-parallax--two">
        <span className="bg-blob bg-blob--two" />
      </div>
      <div className="bg-parallax bg-parallax--three">
        <span className="bg-blob bg-blob--three" />
      </div>
    </div>
  )
}
