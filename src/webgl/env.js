// Shared runtime checks and theme plumbing for the WebGL scenes.
// Both scenes are progressive enhancement: if anything here says no, the caller
// renders the CSS-only fallback and never loads three.js at all.

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

let webglSupport = null
export function supportsWebGL() {
  if (webglSupport !== null) return webglSupport
  try {
    const canvas = document.createElement('canvas')
    webglSupport = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    webglSupport = false
  }
  return webglSupport
}

// Rough "will this device cope" check. A 4-core phone running a full-screen
// particle field is a worse experience than the CSS gradient it replaces.
export function isLowPower() {
  const cores = navigator.hardwareConcurrency ?? 4
  const memory = navigator.deviceMemory ?? 4
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return cores <= 4 || memory <= 2 || (coarse && window.innerWidth < 760)
}

export function canRenderWebGL() {
  return supportsWebGL() && !prefersReducedMotion()
}

const COLOR_VARS = ['--accent', '--accent-2', '--accent-3']

// The scenes take their palette from the stylesheet rather than hard-coding
// hexes, so the WebGL layer follows the light/dark theme automatically.
export function readPalette() {
  const styles = getComputedStyle(document.documentElement)
  const colors = COLOR_VARS.map((name) => styles.getPropertyValue(name).trim() || '#2563eb')
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  return { colors, dark }
}

export function onThemeChange(handler) {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!mq) return () => {}
  const listener = () => handler(readPalette())
  mq.addEventListener('change', listener)
  return () => mq.removeEventListener('change', listener)
}

// A soft radial dot, used as the sprite for every point cloud. Drawn once and
// shared, since a texture per scene is wasteful for an identical gradient.
let dotTexture = null
export function makeDotTexture(THREE) {
  if (dotTexture) return dotTexture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.65)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  dotTexture = new THREE.CanvasTexture(canvas)
  return dotTexture
}

// Caps device pixel ratio: a 3x retina phone rendering a full-screen particle
// field burns frames for detail nobody sees.
export function cappedDpr(max = 1.75) {
  return Math.min(window.devicePixelRatio || 1, max)
}
