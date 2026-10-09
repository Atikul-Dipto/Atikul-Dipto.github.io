let cached: boolean | null = null

/** One-shot WebGL probe. Drives the 2D fallback route (spec §11). */
export function supportsWebGL(): boolean {
  if (cached !== null) return cached
  try {
    const canvas = document.createElement('canvas')
    cached = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    cached = false
  }
  return cached
}

/** Rough "will this device cope" check, used to pick the quality tier. */
export function isLowPower(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 4
  return cores <= 4 || memory <= 2
}
