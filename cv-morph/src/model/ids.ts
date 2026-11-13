let n = 0

/** A short id, unique within this browser: sections, entries and bullets are told apart by these. */
export function uid(): string {
  n = (n + 1) % 1296
  return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6) + n.toString(36)
}
