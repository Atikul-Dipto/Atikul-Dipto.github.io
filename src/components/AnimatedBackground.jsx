import { useEffect, useMemo, useRef } from 'react'

export default function AnimatedBackground() {
  const sceneRef = useRef(null)

  const particles = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => ({
        id: index,
        size: 2 + ((index * 7) % 7) * 0.6,
        left: `${(index * 13 + 9) % 100}%`,
        top: `${(index * 17 + 7) % 100}%`,
        duration: `${8 + (index % 8) * 1.8}s`,
        delay: `${(index % 7) * 0.9}s`,
      })),
    [],
  )

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
    <div className="bg-scene" ref={sceneRef} aria-hidden="true">
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
