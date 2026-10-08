// The site-wide background: a drifting point cloud wired into a network, the
// visual shorthand this portfolio keeps using for "connected data".
//
// Kept as a plain factory (not a React component) so the React side only has to
// own mount/unmount, and so three.js can be dynamically imported by the caller.
import { makeDotTexture, cappedDpr } from './env'

const EDGE_RADIUS = 2.0
// Fraction of the field's half-width kept clear in the centre, behind the text.
const QUIET_RADIUS = 0.46
const MAX_EDGES_PER_POINT = 2

/** Precompute the network once, from the starting layout. Recomputing nearest
 *  neighbours per frame would be O(n^2) and is invisible at this drift speed. */
function buildEdges(positions, count) {
  const edges = []
  const degree = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    if (degree[i] >= MAX_EDGES_PER_POINT) continue
    const ix = positions[i * 3]
    const iy = positions[i * 3 + 1]
    const iz = positions[i * 3 + 2]
    for (let j = i + 1; j < count; j++) {
      if (degree[i] >= MAX_EDGES_PER_POINT) break
      if (degree[j] >= MAX_EDGES_PER_POINT) continue
      const dx = ix - positions[j * 3]
      const dy = iy - positions[j * 3 + 1]
      const dz = iz - positions[j * 3 + 2]
      if (dx * dx + dy * dy + dz * dz < EDGE_RADIUS * EDGE_RADIUS) {
        edges.push(i, j)
        degree[i]++
        degree[j]++
      }
    }
  }
  return new Uint32Array(edges)
}

export function createConstellation(THREE, canvas, { palette, count = 520 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' })
  renderer.setPixelRatio(cappedDpr())

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  camera.position.set(0, 0, 16)

  const group = new THREE.Group()
  scene.add(group)

  const spread = 26
  const depth = 16
  const positions = new Float32Array(count * 3)
  const base = new Float32Array(count * 3)
  const phase = new Float32Array(count)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)

  const tint = palette.colors.map((hex) => new THREE.Color(hex))

  for (let i = 0; i < count; i++) {
    // Scatter in a ring rather than a filled rectangle: the middle of the
    // viewport is where the headline and body copy sit, and a field of lines
    // running behind text is the fastest way to make a portfolio unreadable.
    const angle = Math.random() * Math.PI * 2
    const radial = QUIET_RADIUS + (1 - QUIET_RADIUS) * Math.sqrt(Math.random())
    const x = Math.cos(angle) * radial * spread * 0.5
    const y = Math.sin(angle) * radial * spread * 0.42
    const z = -Math.random() * depth
    base[i * 3] = x
    base[i * 3 + 1] = y
    base[i * 3 + 2] = z
    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
    phase[i] = Math.random() * Math.PI * 2

    const c = tint[i % tint.length]
    const depthFade = 0.45 + (1 - -z / depth) * 0.55
    colors[i * 3] = c.r * depthFade
    colors[i * 3 + 1] = c.g * depthFade
    colors[i * 3 + 2] = c.b * depthFade
    sizes[i] = 0.06 + Math.random() * 0.14
  }

  const pointGeo = new THREE.BufferGeometry()
  pointGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  pointGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const points = new THREE.Points(
    pointGeo,
    new THREE.PointsMaterial({
      size: 0.26,
      map: makeDotTexture(THREE),
      vertexColors: true,
      transparent: true,
      opacity: palette.dark ? 0.7 : 0.55,
      depthWrite: false,
      blending: palette.dark ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    }),
  )
  group.add(points)

  const edges = buildEdges(positions, count)
  const edgeCount = edges.length / 2
  const linePositions = new Float32Array(edgeCount * 6)
  const lineColors = new Float32Array(edgeCount * 6)
  for (let e = 0; e < edgeCount; e++) {
    for (let side = 0; side < 2; side++) {
      const p = edges[e * 2 + side]
      lineColors[e * 6 + side * 3] = colors[p * 3]
      lineColors[e * 6 + side * 3 + 1] = colors[p * 3 + 1]
      lineColors[e * 6 + side * 3 + 2] = colors[p * 3 + 2]
    }
  }
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3))
  const lines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: palette.dark ? 0.17 : 0.13,
      depthWrite: false,
      blending: palette.dark ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  )
  group.add(lines)

  const pointer = { x: 0, y: 0 }
  const target = { x: 0, y: 0 }
  let progress = 0

  function resize(width, height) {
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  function update(time) {
    // Ease the camera toward the pointer instead of snapping, so a fast mouse
    // move reads as parallax rather than a jolt.
    target.x += (pointer.x - target.x) * 0.045
    target.y += (pointer.y - target.y) * 0.045

    for (let i = 0; i < count; i++) {
      const p = phase[i]
      positions[i * 3] = base[i * 3] + Math.sin(time * 0.00016 + p) * 0.5
      positions[i * 3 + 1] = base[i * 3 + 1] + Math.cos(time * 0.00013 + p * 1.3) * 0.42
      positions[i * 3 + 2] = base[i * 3 + 2] + Math.sin(time * 0.0001 + p * 0.7) * 0.3
    }
    pointGeo.attributes.position.needsUpdate = true

    for (let e = 0; e < edgeCount; e++) {
      const a = edges[e * 2]
      const b = edges[e * 2 + 1]
      linePositions[e * 6] = positions[a * 3]
      linePositions[e * 6 + 1] = positions[a * 3 + 1]
      linePositions[e * 6 + 2] = positions[a * 3 + 2]
      linePositions[e * 6 + 3] = positions[b * 3]
      linePositions[e * 6 + 4] = positions[b * 3 + 1]
      linePositions[e * 6 + 5] = positions[b * 3 + 2]
    }
    lineGeo.attributes.position.needsUpdate = true

    group.rotation.x = target.y * 0.16 + progress * 0.22
    group.rotation.y = target.x * 0.2 - progress * 0.3
    group.position.y = progress * 5
    camera.position.z = 16 - progress * 3

    renderer.render(scene, camera)
  }

  return {
    update,
    resize,
    setPointer(x, y) {
      pointer.x = x
      pointer.y = y
    },
    setProgress(value) {
      progress = value
    },
    dispose() {
      pointGeo.dispose()
      lineGeo.dispose()
      points.material.dispose()
      lines.material.dispose()
      renderer.dispose()
    },
  }
}
