import { useEffect, useState } from 'react'
import { aim, aimAccuracy, aimFire, readAimBest, ROUND_SECONDS } from '../lib/aim'
import { isTouchDevice } from '../lib/input'

/**
 * The aim range's HUD: the crosshair, the count in, the clock and the score,
 * then the result. On a touch screen, a fire button.
 */
/** The last round's result shows for a while after it ends. */
const showResult = () => !aim.active && !!aim.last && performance.now() - aim.lastAt < 10_000

export default function AimHud() {
  const [, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    let seen = -1
    let showing = false
    const tick = () => {
      const show = showResult()
      if (aim.version !== seen || show !== showing) {
        seen = aim.version
        showing = show
        setV((v) => v + 1)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!aim.active && !showResult()) return null
  if (!aim.active && aim.last) {
    const best = readAimBest()
    return (
      <div className="aimhud aimhud--result" role="status">
        <strong>{aim.last.score}</strong>
        <span>
          {aim.last.hits} hits · {aimAccuracy(aim.last.hits, aim.last.shots)}% accuracy{best !== null ? ` · best ${best}` : ''}
        </span>
        <small>Press E at the console for another round</small>
      </div>
    )
  }
  return (
    <>
      <div className="aimhud__cross" aria-hidden="true" />
      <div className="aimhud" role="status">
        {aim.countdown > 0 ? (
          <strong className="aimhud__count">{Math.ceil(aim.countdown)}</strong>
        ) : (
          <>
            <span>{Math.max(0, Math.ceil(ROUND_SECONDS - aim.t))} s</span>
            <strong>{aim.score}</strong>
            <span>
              {aim.hits}/{aim.shots}
            </span>
          </>
        )}
      </div>
      {isTouchDevice() && (
        <button type="button" className="aimhud__fire" onPointerDown={() => (aimFire.request = true)}>
          Fire
        </button>
      )}
    </>
  )
}
