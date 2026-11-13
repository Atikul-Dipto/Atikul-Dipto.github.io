import { useEffect, useState } from 'react'

/** Whether fingers, not a mouse, are doing the pointing: text is then edited in the bar, not in place. */
export function useTouch(): boolean {
  const [touch, setTouch] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)')
    const update = () => setTouch(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return touch
}
