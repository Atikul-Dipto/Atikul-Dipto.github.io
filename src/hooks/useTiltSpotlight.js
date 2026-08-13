import { useCallback, useRef } from 'react'

export function useTiltSpotlight({ max = 10 } = {}) {
  const ref = useRef(null)

  const onPointerMove = useCallback(
    (e) => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      el.style.setProperty('--rx', `${((0.5 - py) * max).toFixed(2)}deg`)
      el.style.setProperty('--ry', `${((px - 0.5) * max).toFixed(2)}deg`)
      el.style.setProperty('--sx', `${(px * 100).toFixed(1)}%`)
      el.style.setProperty('--sy', `${(py * 100).toFixed(1)}%`)
    },
    [max],
  )

  const onPointerLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }, [])

  return { ref, onPointerMove, onPointerLeave }
}
