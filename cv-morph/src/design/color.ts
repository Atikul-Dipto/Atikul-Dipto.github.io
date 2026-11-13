// Colours are kept as #rrggbb everywhere: a CV's colours end up in a PDF and
// a Word file, and neither wants "rgba(...)".

export type Rgb = [number, number, number]

export function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0')
  return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0]
}

export const toHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`

/** `a` with `amount` of `b` stirred in: 0 is all a, 1 all b. */
export function mix(a: string, b: string, amount: number): string {
  const [x, y] = [parseHex(a), parseHex(b)]
  return toHex([x[0] + (y[0] - x[0]) * amount, x[1] + (y[1] - x[1]) * amount, x[2] + (y[2] - x[2]) * amount])
}

/** How light a colour looks, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const isDark = (hex: string): boolean => luminance(hex) < 0.4

/** The contrast between two colours as WCAG counts it: 1 (none) to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** How vivid a colour is, 0 (grey) to 1. */
export function saturation(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

export const distance = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** A colour for text on `fill` that can be read: `want` if it has the contrast, else black or white. */
export function readable(want: string, fill: string, least = 4.2): string {
  if (contrast(want, fill) >= least) return want
  return isDark(fill) ? '#ffffff' : '#111827'
}

/** Whether a string is a colour this app can use. */
export const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
