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

let gpu: string | null = null

/** The GPU's name as WebGL reports it, or '' where the browser hides it. */
export function gpuName(): string {
  if (gpu !== null) return gpu
  gpu = ''
  try {
    const gl = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info')
      gpu = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    gpu = ''
  }
  return gpu
}

/**
 * Integrated, phone and software GPUs: on them the shadows and the screen
 * effects cost far more than they show -- inside, they halve the frame rate --
 * so the silo starts without them. Starting there is what matters: deciding
 * later means compiling every shader twice behind the loading screen. Apple's
 * own GPUs are integrated too, but are not short of power.
 */
export function isModestGpu(): boolean {
  const r = gpuName()
  if (/apple/i.test(r)) return false
  return /swiftshader|llvmpipe|softpipe|software|basic render|mali|adreno|powervr|intel(?!.*\barc\b)|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics/i.test(r)
}
