import { useEffect, useRef, useState } from 'react'
import { useReveal } from '../hooks/useReveal'

// Splits "10M+" into "" / 10 / "M+", "4+" into "" / 4 / "+", "৳ 1,200" into
// "৳ " / 1200 / "". Anything without a number is rendered verbatim.
const STAT = /^(\D*?)([\d][\d,]*(?:\.\d+)?)(.*)$/s

function parseStat(raw) {
  const match = STAT.exec(String(raw))
  if (!match) return null
  const [, prefix, digits, suffix] = match
  const decimals = digits.includes('.') ? digits.split('.')[1].length : 0
  return { prefix, value: Number(digits.replace(/,/g, '')), suffix, decimals, grouped: digits.includes(',') }
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3

/**
 * Counts a stat up from zero when it scrolls into view — the one animation that
 * actually belongs on an analyst's portfolio. Falls back to the final value
 * immediately under prefers-reduced-motion, and renders unparseable values as-is.
 */
export default function CountUp({ value, duration = 1400 }) {
  const parsed = parseStat(value)
  const { ref, visible } = useReveal({ threshold: 0.4 })
  const [shown, setShown] = useState(() => (parsed ? 0 : null))
  const raf = useRef(0)

  useEffect(() => {
    if (!parsed || !visible) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(parsed.value)
      return
    }

    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      setShown(parsed.value * easeOutCubic(t))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // parsed is derived from `value`; depending on the object would re-run every render.
  }, [value, visible, duration]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!parsed) return <span ref={ref}>{value}</span>

  const text = shown.toLocaleString(undefined, {
    minimumFractionDigits: parsed.decimals,
    maximumFractionDigits: parsed.decimals,
    useGrouping: parsed.grouped,
  })

  return (
    <span ref={ref} className="countup">
      {parsed.prefix}
      {/* tabular-nums in CSS stops the box twitching as digits change width */}
      <span className="countup__num">{text}</span>
      {parsed.suffix}
    </span>
  )
}
