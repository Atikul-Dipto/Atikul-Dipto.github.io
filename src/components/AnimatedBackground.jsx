import { useEffect, useRef } from 'react'

export default function AnimatedBackground() {
  const sceneRef = useRef(null)

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
