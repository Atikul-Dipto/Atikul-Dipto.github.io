import type { ReactNode } from 'react'
import { isHex } from '../design/color.ts'

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="group">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      {children}
    </div>
  )
}

interface SegProps<T extends string | number> {
  value: T
  options: readonly (readonly [T, string])[]
  onChange(value: T): void
  label: string
}

/** A row of mutually exclusive choices. */
export function Seg<T extends string | number>({ value, options, onChange, label }: SegProps<T>) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([option, text]) => (
        <button key={String(option)} type="button" aria-pressed={option === value} onClick={() => onChange(option)}>
          {text}
        </button>
      ))}
    </div>
  )
}

interface RangeProps {
  value: number
  min: number
  max: number
  step: number
  label: string
  /** How the number reads beside the slider. */
  show?(value: number): string
  onChange(value: number): void
}

export function Range({ value, min, max, step, label, show, onChange }: RangeProps) {
  return (
    <span className="range-wrap">
      <input className="range" type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <output className="range-value">{show ? show(value) : value}</output>
    </span>
  )
}

export function Color({ value, label, onChange }: { value: string; label: string; onChange(value: string): void }) {
  return (
    <span className="swatch" style={{ background: value || 'transparent' }}>
      <input type="color" aria-label={label} value={isHex(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} />
    </span>
  )
}
