import * as THREE from 'three'
import { isLowPower } from '../lib/capability'
import { useSilo } from '../state/useSilo'
import { sweepLights } from './LightPool'
import { effectsHandle } from './Effects'

let offscreen: THREE.WebGLRenderTarget | null = null

/**
 * Compile an object's shaders in the background, exactly as the next frames
 * will draw it.
 *
 * "Exactly" matters. With the effects on, the scene is drawn into an
 * off-screen buffer, and three.js compiles a different variant of every shader
 * for that -- no tone mapping, linear colour -- than for drawing straight to
 * the screen. Compiled for the screen, every one of them was compiled again
 * on the first real frame, all at once, freezing the page: on a first visit on
 * an ordinary laptop, for six seconds. So the compile is done with an
 * off-screen target bound whenever the effects will be on.
 */
export function warmUp(gl: THREE.WebGLRenderer, object: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene) {
  sweepLights(scene)
  const viaEffects = useSilo.getState().quality !== 'low' && !isLowPower()
  const prev = gl.getRenderTarget()
  if (viaEffects) {
    offscreen ??= new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType })
    gl.setRenderTarget(offscreen)
  }
  try {
    return gl.compileAsync(object, camera, object === scene ? null : scene)
  } finally {
    gl.setRenderTarget(prev)
  }
}

/** Every material reachable from an object, a few levels deep. */
function materialsIn(root: unknown, out: Set<THREE.Material>, depth = 0, seen = new Set<unknown>()) {
  if (!root || typeof root !== 'object' || seen.has(root) || depth > 4) return
  seen.add(root)
  if ((root as THREE.Material).isMaterial) {
    out.add(root as THREE.Material)
    return
  }
  // Not into the renderer, scenes, textures or render targets: nothing to find
  // there, and a great deal to walk.
  const o = root as Record<string, unknown> & { isWebGLRenderer?: boolean; isScene?: boolean; isTexture?: boolean; isRenderTarget?: boolean }
  if (o.isWebGLRenderer || o.isScene || o.isTexture || o.isRenderTarget || ArrayBuffer.isView(o)) return
  const values = Array.isArray(o) ? o : o instanceof Map ? [...o.values()] : Object.values(o)
  for (const v of values) materialsIn(v, out, depth + 1, seen)
}

/**
 * The screen effects' shaders -- ambient occlusion, bloom, the final pass --
 * compiled in the background too. They live in passes of their own, outside
 * the scene, so compiling the scene never reaches them; on Windows the
 * ambient occlusion's are the slowest shaders on the page.
 */
export function warmEffects(gl: THREE.WebGLRenderer) {
  const composer = effectsHandle.composer
  if (!composer) return Promise.resolve()
  const mats = new Set<THREE.Material>()
  materialsIn((composer as { passes?: unknown }).passes, mats)
  if (!mats.size) return Promise.resolve()
  const scene = new THREE.Scene()
  const tri = new THREE.BufferGeometry()
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
  for (const m of mats) {
    const mesh = new THREE.Mesh(tri, m)
    mesh.frustumCulled = false
    scene.add(mesh)
  }
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  // Both ways they are drawn: into the composer's buffers, and the last pass
  // to the screen.
  const prev = gl.getRenderTarget()
  offscreen ??= new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType })
  gl.setRenderTarget(offscreen)
  const a = gl.compileAsync(scene, cam)
  gl.setRenderTarget(null)
  const b = gl.compileAsync(scene, cam)
  gl.setRenderTarget(prev)
  return Promise.all([a, b]).catch(() => undefined)
}
