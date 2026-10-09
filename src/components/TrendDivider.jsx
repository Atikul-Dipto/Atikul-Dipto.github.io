import { useMemo } from 'react'
import { useReveal } from '../hooks/useReveal'

const W = 1200
const H = 110

// A deterministic series with an upward drift — same shape on every load, so
// the divider is a designed mark rather than noise. Decorative only: it is
// aria-hidden and carries no labels, because it is not anybody's data.
function buildSeries(points, seed) {
  const values = []
  let v = 0.24
  let s = seed
  for (let i = 0; i < points; i++) {
    s = (s * 1103515245 + 12345) % 2147483648
    const noise = (s / 2147483648 - 0.5) * 0.46
    v = Math.min(0.95, Math.max(0.07, v + noise + 0.028))
    values.push(v)
  }
  return values
}

function toPath(values) {
  const step = W / (values.length - 1)
  // Horizontal-tangent cubics: one curve per segment, control points pulled out
  // sideways. The earlier midpoint-quadratic pair flattened every segment into a
  // plateau, which made the whole thing read as a staircase.
  let x0 = 0
  let y0 = (1 - values[0]) * H
  let d = `M ${x0.toFixed(1)} ${y0.toFixed(1)}`
  for (let i = 1; i < values.length; i++) {
    const x = i * step
    const y = (1 - values[i]) * H
    d += ` C ${(x0 + step * 0.5).toFixed(1)} ${y0.toFixed(1)}`
    d += ` ${(x - step * 0.5).toFixed(1)} ${y.toFixed(1)}`
    d += ` ${x.toFixed(1)} ${y.toFixed(1)}`
    x0 = x
    y0 = y
  }
  return d
}

export default function TrendDivider({ seed = 7, points = 26, label }) {
  const { ref, visible } = useReveal({ threshold: 0.3 })
  const { line, area, dots } = useMemo(() => {
    const values = buildSeries(points, seed)
    const d = toPath(values)
    const step = W / (values.length - 1)
    return {
      line: d,
      area: `${d} L ${W} ${H} L 0 ${H} Z`,
      dots: values
        .map((v, i) => ({ x: i * step, y: (1 - v) * H, v }))
        .filter((_, i) => i % 5 === 0),
    }
  }, [points, seed])

  return (
    <div className={`trend-divider${visible ? ' is-visible' : ''}`} ref={ref} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="trend-divider__svg">
        <defs>
          <linearGradient id={`trend-stroke-${seed}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent-3)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
          <linearGradient id={`trend-fill-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-2)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g className="trend-divider__grid">
          <line x1="0" y1={H * 0.33} x2={W} y2={H * 0.33} />
          <line x1="0" y1={H * 0.66} x2={W} y2={H * 0.66} />
        </g>

        <path className="trend-divider__area" d={area} fill={`url(#trend-fill-${seed})`} />
        <path
          className="trend-divider__line"
          d={line}
          fill="none"
          stroke={`url(#trend-stroke-${seed})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {dots.map((dot, i) => (
          <circle
            key={dot.x}
            className="trend-divider__dot"
            style={{ '--delay': `${700 + i * 90}ms` }}
            cx={dot.x}
            cy={dot.y}
            r="3.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {label && <span className="trend-divider__label">{label}</span>}
    </div>
  )
}
