import * as THREE from 'three'

/**
 * The environment the metal and glass reflect: three.js's "room" environment,
 * filtered for reflections once, offline, and shipped as a 33 kB image.
 *
 * Building it in the browser meant rendering a scene into a cube map and
 * blurring it with shaders that are slow to compile -- about two seconds of
 * a frozen loading screen on a first visit to an ordinary laptop. It never
 * changes, so it is baked: the filtered map, each channel stored as an 8-bit
 * log2 value (the reflections are soft; the precision is plenty), and decoded
 * here back into the half-float texture three.js would have made.
 *
 * To bake it again: generate the map with PMREMGenerator.fromScene(new
 * RoomEnvironment(), 0.04, 0.1, 100, { size: 64 }), read the render target's
 * pixels, and encode them over [LO, HI] stops as below.
 */

const W = 336
const H = 256
const LO = -10
const HI = 6
/** How strongly the scene reflects it. */
export const ENV_INTENSITY = 0.34

let pending: Promise<THREE.DataTexture | null> | null = null

export function loadEnvironment() {
  pending ??= (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}env/room.png`)
      const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const g = canvas.getContext('2d', { willReadFrequently: true })!
      g.drawImage(bmp, 0, 0)
      const px = g.getImageData(0, 0, W, H).data
      const out = new Uint16Array(W * H * 4)
      const one = THREE.DataUtils.toHalfFloat(1)
      // Decoding the 256 possible values once, not 260,000 times.
      const lut = new Uint16Array(256)
      for (let v = 1; v < 256; v++) lut[v] = THREE.DataUtils.toHalfFloat(Math.pow(2, ((v - 1) / 254) * (HI - LO) + LO))
      for (let i = 0; i < W * H; i++) {
        out[i * 4] = lut[px[i * 4]]
        out[i * 4 + 1] = lut[px[i * 4 + 1]]
        out[i * 4 + 2] = lut[px[i * 4 + 2]]
        out[i * 4 + 3] = one
      }
      const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.HalfFloatType)
      t.mapping = THREE.CubeUVReflectionMapping
      t.colorSpace = THREE.LinearSRGBColorSpace
      t.minFilter = THREE.LinearFilter
      t.magFilter = THREE.LinearFilter
      t.generateMipmaps = false
      t.flipY = false
      t.needsUpdate = true
      return t
    } catch {
      // No reflections, rather than no silo.
      return null
    }
  })()
  return pending
}
