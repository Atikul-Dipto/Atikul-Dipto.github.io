import * as THREE from 'three'

/**
 * Procedural surfaces, generated once at boot and shared by every mesh that
 * needs them.
 *
 * Untextured MeshStandardMaterial lit by a couple of warm point lights has no
 * detail to catch the light, so concrete and steel both collapse into the same
 * flat brown. These give every surface a normal map and a varying roughness,
 * which is what lets a dim scene still read as made of different materials.
 *
 * Everything here is computed in JavaScript at startup: no texture downloads,
 * and the generators are deterministic so the structure looks identical on
 * every load.
 */

function makeRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Tileable value noise: a lattice of random values, wrapped and interpolated. */
function valueNoise(size: number, cells: number, seed: number) {
  const rand = makeRandom(seed)
  const lattice = new Float32Array(cells * cells)
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand()

  const out = new Float32Array(size * size)
  const scale = cells / size
  for (let y = 0; y < size; y++) {
    const fy = y * scale
    const y0 = Math.floor(fy) % cells
    const y1 = (y0 + 1) % cells
    const ty = smooth(fy - Math.floor(fy))
    for (let x = 0; x < size; x++) {
      const fx = x * scale
      const x0 = Math.floor(fx) % cells
      const x1 = (x0 + 1) % cells
      const tx = smooth(fx - Math.floor(fx))
      const a = lattice[y0 * cells + x0] * (1 - tx) + lattice[y0 * cells + x1] * tx
      const b = lattice[y1 * cells + x0] * (1 - tx) + lattice[y1 * cells + x1] * tx
      out[y * size + x] = a * (1 - ty) + b * ty
    }
  }
  return out
}

/** Octaves of value noise, still tileable because every octave is. */
function fbm(size: number, octaves: number, baseCells: number, seed: number) {
  const out = new Float32Array(size * size)
  let amp = 1
  let total = 0
  for (let o = 0; o < octaves; o++) {
    const layer = valueNoise(size, baseCells * 2 ** o, seed + o * 101)
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp
    total += amp
    amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

function dataTexture(data: Uint8Array, size: number, srgb: boolean) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.anisotropy = 8
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/** Sobel the height field into a tangent-space normal map. */
function normalTexture(height: Float32Array, size: number, strength: number) {
  const data = new Uint8Array(size * size * 4)
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      // Normalise (-dx, -dy, 1) into 0..255.
      const len = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255
      data[i + 2] = (1 / len) * 0.5 * 255 + 127
      data[i + 3] = 255
    }
  }
  return dataTexture(data, size, false)
}

/** A single channel written to all of RGB — for roughness and metalness maps. */
function scalarTexture(values: Float32Array, size: number) {
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < values.length; i++) {
    const v = Math.max(0, Math.min(1, values[i])) * 255
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return dataTexture(data, size, false)
}

function colourTexture(
  size: number,
  shade: (x: number, y: number, i: number) => [number, number, number],
) {
  /* eslint-disable-next-line */
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const [r, g, b] = shade(x, y, i)
      data[i * 4] = r * 255
      data[i * 4 + 1] = g * 255
      data[i * 4 + 2] = b * 255
      data[i * 4 + 3] = 255
    }
  }
  return dataTexture(data, size, true)
}

export interface Surface {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
}

/** Poured concrete: form-work lines, blotching, and streaks down the wall. */
function buildConcrete(): Surface {
  const S = 512
  const grain = fbm(S, 5, 4, 7)
  const blotch = fbm(S, 3, 2, 29)
  const streak = fbm(S, 4, 2, 53)

  const height = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    // Horizontal shutter lines every quarter of the tile.
    const band = Math.abs(((y / S) * 4) % 1 - 0.5)
    const seam = band > 0.47 ? 1 : 0
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      height[i] = grain[i] * 0.55 + blotch[i] * 0.45 - seam * 0.5
    }
  }

  const base = new THREE.Color('#8b8279')
  const dark = new THREE.Color('#4a423b')
  const map = colourTexture(S, (x, y, i) => {
    // Streaks run down the wall, so they follow v, not u.
    const run = streak[((y * 3) % S) * S + x] * 0.5 + streak[i] * 0.5
    const t = Math.min(1, Math.max(0, blotch[i] * 0.7 + (1 - run) * 0.45 - 0.1))
    const c = base.clone().lerp(dark, t)
    return [c.r, c.g, c.b]
  })

  const rough = new Float32Array(S * S)
  for (let i = 0; i < rough.length; i++) rough[i] = 0.78 + grain[i] * 0.22

  return { map, normalMap: normalTexture(height, S, 36), roughnessMap: scalarTexture(rough, S) }
}

/** Tread plate: staggered raised lozenges, worn smooth on top, grimy between. */
function buildDeckPlate(): Surface {
  const S = 256
  const grain = fbm(S, 4, 4, 11)
  const height = new Float32Array(S * S)
  const raised = new Float32Array(S * S)

  // Two rows of lozenges per tile, offset, running opposite ways.
  const lozenge = (u: number, v: number, lean: number) => {
    const a = (u * 4 + v * lean) % 1
    const b = (v * 4) % 1
    const d = Math.abs(a - 0.5) * 1.6 + Math.abs(b - 0.5) * 2.4
    return d < 0.5 ? 1 - d / 0.5 : 0
  }

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      const u = x / S
      const v = y / S
      const l = Math.max(lozenge(u, v, 2), lozenge(u + 0.125, v + 0.125, -2))
      raised[i] = l
      height[i] = l * 0.8 + grain[i] * 0.2
    }
  }

  const steel = new THREE.Color('#6c7d77')
  const grime = new THREE.Color('#2f3833')
  const map = colourTexture(S, (_x, _y, i) => {
    const t = Math.min(1, Math.max(0, 0.75 - raised[i] * 0.8 + grain[i] * 0.3))
    const c = steel.clone().lerp(grime, t)
    return [c.r, c.g, c.b]
  })

  const rough = new Float32Array(S * S)
  for (let i = 0; i < rough.length; i++) {
    // Polished where boots land, rough in the grooves.
    rough[i] = 0.92 - raised[i] * 0.28 + grain[i] * 0.06
  }

  return { map, normalMap: normalTexture(height, S, 26), roughnessMap: scalarTexture(rough, S) }
}

/**
 * Brushed steel: a directional grain for handrails, doors and structure.
 *
 * The first version sampled the noise at `(x * 8) % size`, which is not a
 * brush direction — it is eight copies of the noise crammed across the tile.
 * Minified on a door or a cage panel it aliased into coarse vertical streaks
 * that looked like a rendering fault. The grain here is a low-frequency 1D
 * profile that is constant down the tile, so it mips cleanly.
 */
function buildSteel(): Surface {
  const S = 256
  const rand = makeRandom(17)
  // ~40 brush lines across the tile, wrapped so the tile still repeats.
  const lines = 40
  const lattice = new Float32Array(lines)
  for (let i = 0; i < lines; i++) lattice[i] = rand()
  const profile = new Float32Array(S)
  for (let x = 0; x < S; x++) {
    const f = (x / S) * lines
    const a = lattice[Math.floor(f) % lines]
    const b = lattice[(Math.floor(f) + 1) % lines]
    profile[x] = a + (b - a) * smooth(f - Math.floor(f))
  }

  const mottle = fbm(S, 3, 3, 23)
  const height = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      height[i] = profile[x] * 0.7 + mottle[i] * 0.3
    }
  }

  // Kept deliberately low contrast. A brush grain is a sheen, not stripes:
  // anything stronger reads as banding the moment the surface is minified.
  const base = new THREE.Color('#79887f')
  const dark = new THREE.Color('#67756d')
  const map = colourTexture(S, (_x, _y, i) => {
    const c = base.clone().lerp(dark, Math.min(1, height[i] * 0.9))
    return [c.r, c.g, c.b]
  })
  const rough = new Float32Array(S * S)
  for (let i = 0; i < rough.length; i++) rough[i] = 0.58 + height[i] * 0.1
  return { map, normalMap: normalTexture(height, S, 1.5), roughnessMap: scalarTexture(rough, S) }
}

let concrete: Surface | null = null
let plate: Surface | null = null
let steel: Surface | null = null

export const concreteSurface = () => (concrete ??= buildConcrete())
export const plateSurface = () => (plate ??= buildDeckPlate())
export const steelSurface = () => (steel ??= buildSteel())

/** Clone the shared textures so one mesh can tile them differently. */
export function tiled(surface: Surface, repeatX: number, repeatY: number): Surface {
  const clone = (t: THREE.Texture) => {
    const c = t.clone()
    c.needsUpdate = true
    c.wrapS = THREE.RepeatWrapping
    c.wrapT = THREE.RepeatWrapping
    c.repeat.set(repeatX, repeatY)
    return c
  }
  return {
    map: clone(surface.map),
    normalMap: clone(surface.normalMap),
    roughnessMap: clone(surface.roughnessMap),
  }
}
