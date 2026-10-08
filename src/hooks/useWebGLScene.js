import { useEffect, useRef, useState } from 'react'
import { canRenderWebGL, onThemeChange, readPalette } from '../webgl/env'

/**
 * Mounts a WebGL scene onto a canvas and owns its whole lifecycle: the dynamic
 * three.js import, the render loop, resize, pointer, pausing when off-screen or
 * backgrounded, theme rebuilds and disposal.
 *
 * `factory(THREE, canvas, { palette })` returns
 * `{ update(time), resize(w, h), setPointer(x, y), setProgress?(p), dispose() }`.
 *
 * Returns `active` — false until the scene is actually running, so the caller
 * can keep its CSS fallback visible (no WebGL, reduced motion, or still
 * loading) — and `themeKey`, which the caller MUST put on the canvas as `key`.
 * A theme flip recolours every material, so the scene is rebuilt; reusing the
 * canvas would mean handing a fresh WebGLRenderer a context that the disposed
 * one still holds, so the canvas element is replaced instead.
 */
export function useWebGLScene(factory, { enabled = true, trackScroll = false, pauseOffscreen = true } = {}) {
  const canvasRef = useRef(null)
  const [active, setActive] = useState(false)
  const [themeKey, setThemeKey] = useState(0)

  useEffect(() => onThemeChange(() => setThemeKey((n) => n + 1)), [])

  useEffect(() => {
    if (!enabled || !canvasRef.current || !canRenderWebGL()) return

    const canvas = canvasRef.current
    let scene = null
    let raf = 0
    let disposed = false
    let visible = true
    const cleanups = []

    const render = (time) => {
      raf = requestAnimationFrame(render)
      if (visible && !document.hidden) scene?.update(time)
    }

    const sizeToParent = () => {
      if (!scene) return
      const parent = canvas.parentElement
      const width = parent?.clientWidth || window.innerWidth
      const height = parent?.clientHeight || window.innerHeight
      scene.resize(width, height)
    }

    import('three')
      .then((THREE) => {
        if (disposed) return
        scene = factory(THREE, canvas, { palette: readPalette() })
        sizeToParent()
        setActive(true)
        raf = requestAnimationFrame(render)

        const ro = new ResizeObserver(sizeToParent)
        if (canvas.parentElement) ro.observe(canvas.parentElement)
        cleanups.push(() => ro.disconnect())

        const onPointer = (e) => {
          scene?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1)
        }
        window.addEventListener('pointermove', onPointer, { passive: true })
        cleanups.push(() => window.removeEventListener('pointermove', onPointer))

        if (trackScroll) {
          const onScroll = () => {
            const max = document.documentElement.scrollHeight - window.innerHeight
            scene?.setProgress?.(max > 0 ? window.scrollY / max : 0)
          }
          onScroll()
          window.addEventListener('scroll', onScroll, { passive: true })
          cleanups.push(() => window.removeEventListener('scroll', onScroll))
        }

        if (pauseOffscreen) {
          const io = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
          })
          io.observe(canvas)
          cleanups.push(() => io.disconnect())
        }
      })
      .catch(() => {
        // three.js failed to load (offline, blocked). The CSS fallback stays.
      })

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      for (const fn of cleanups) fn()
      scene?.dispose()
      setActive(false)
    }
  }, [factory, enabled, trackScroll, pauseOffscreen, themeKey])

  return { canvasRef, active, themeKey }
}
