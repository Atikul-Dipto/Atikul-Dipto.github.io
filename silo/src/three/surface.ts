import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { seeded } from '../content/frame'
import type { Daylight } from '../lib/daylight'

/**
 * The surface, as the silo's camera sees it.
 *
 * A small scene of its own -- a scorched plain, craters, rubble, dead trees,
 * the broken towers of a city on the horizon, haze -- rendered from a fixed
 * camera into a texture, which the cafeteria's screen shows. It is a real
 * view with real depth and light, not a painting; and because the camera is
 * bolted to the top of the silo it does not move as anyone walks past the
 * screen. Only the hour changes it, and the dust on the wind.
 *
 * Rendered a few times a second, not every frame: the light changes over
 * minutes and the dust is slow.
 */

const W = 2048
/** The hall's screen is 20 m by 3.7 m. */
const H = 380

/** Height of the ground at (x, z): rolling, cratered, with a ridge far off. */
function makeGround(rand: () => number) {
  const craters = Array.from({ length: 34 }, () => ({
    x: (rand() - 0.5) * 360,
    z: -20 - rand() * 300,
    r: 4 + rand() * 18,
    d: 0.6 + rand() * 2.2,
  }))
  const n = (x: number, z: number) =>
    Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017) * 2.2 +
    Math.sin(x * 0.067 + z * 0.043) * 0.9 +
    Math.sin(x * 0.19 - z * 0.13) * 0.25
  return (x: number, z: number) => {
    let h = n(x, z)
    // A low ridge across the far distance.
    h += Math.max(0, -z - 180) * 0.06 * (1 + Math.sin(x * 0.03) * 0.5)
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z) / c.r
      if (d < 1.35) h += d < 1 ? -c.d * (1 - d * d) : c.d * 0.35 * Math.sin(((d - 1) / 0.35) * Math.PI)
    }
    return h
  }
}

/** A dead tree: forking limbs as tapered cylinders, merged into one mesh. */
function treeGeometry(rand: () => number, height: number) {
  const parts: THREE.BufferGeometry[] = []
  const limb = (base: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const g = new THREE.CylinderGeometry(r * 0.6, r, len, 5, 1)
    g.translate(0, len / 2, 0)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    g.applyQuaternion(q)
    g.translate(base.x, base.y, base.z)
    parts.push(g)
    if (depth <= 0) return
    const tip = base.clone().addScaledVector(dir, len)
    const n = 2 + (rand() < 0.4 ? 1 : 0)
    for (let i = 0; i < n; i++) {
      const d = dir
        .clone()
        .add(new THREE.Vector3((rand() - 0.5) * 1.4, rand() * 0.5, (rand() - 0.5) * 1.4))
        .normalize()
      limb(tip, d, len * (0.55 + rand() * 0.2), r * 0.6, depth - 1)
    }
  }
  limb(new THREE.Vector3(), new THREE.Vector3((rand() - 0.5) * 0.15, 1, 0).normalize(), height * 0.45, height * 0.03, 3)
  return mergeGeometries(parts)!
}

export interface Surface {
  target: THREE.WebGLRenderTarget
  /** Compile its shaders in the background before it is first drawn. */
  warm: (gl: THREE.WebGLRenderer) => Promise<unknown>
  render: (gl: THREE.WebGLRenderer, d: Daylight, time: number) => void
  dispose: () => void
}

export function buildSurface(): Surface {
  const rand = seeded(5150)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(19, W / H, 0.5, 900)
  camera.position.set(0, 4.2, 6)
  camera.lookAt(0, 3.1, -100)

  const fog = new THREE.Fog('#9aa6a8', 40, 520)
  scene.fog = fog

  // ---- sky ---------------------------------------------------------------
  const skyUniforms = {
    uTop: { value: new THREE.Color() },
    uLow: { value: new THREE.Color() },
    uNight: { value: 0 },
  }
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(800, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uLow; uniform float uNight;
        varying vec3 vDir;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          float e = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(uLow, uTop, smoothstep(0.0, 0.35, e));
          // Stars at night.
          vec2 cell = floor(vec2(atan(vDir.z, vDir.x), asin(vDir.y)) * 300.0);
          float s = step(0.9975, h(cell)) * smoothstep(0.02, 0.12, e);
          col += vec3(s) * uNight * 0.9;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  )
  scene.add(sky)

  // ---- light -------------------------------------------------------------
  const sun = new THREE.DirectionalLight('#ffffff', 2)
  sun.position.set(-120, 90, -200)
  scene.add(sun)
  const hemi = new THREE.HemisphereLight('#c9d2cf', '#6a655c', 1.2)
  scene.add(hemi)

  // ---- ground -------------------------------------------------------------
  const height = makeGround(rand)
  const groundGeo = new THREE.PlaneGeometry(700, 360, 220, 120)
  groundGeo.rotateX(-Math.PI / 2)
  groundGeo.translate(0, 0, -170)
  const pos = groundGeo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const ash = new THREE.Color('#8a857b')
  const soot = new THREE.Color('#3d3a35')
  const rust = new THREE.Color('#6d5a48')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const y = height(x, z)
    pos.setY(i, y)
    const t = Math.min(1, Math.max(0, -y * 0.35 + 0.35 + (rand() - 0.5) * 0.25))
    c.copy(ash).lerp(soot, t).lerp(rust, Math.max(0, Math.sin(x * 0.05 + z * 0.03)) * 0.25)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  groundGeo.computeVertexNormals()
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))
  scene.add(ground)

  // ---- rubble ---------------------------------------------------------------
  const rockGeo = new THREE.DodecahedronGeometry(1, 0)
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: '#6f6b63', roughness: 1, flatShading: true }), 1400)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < rocks.count; i++) {
    const z = -6 - Math.pow(rand(), 1.6) * 220
    const x = (rand() - 0.5) * (40 + -z * 1.6)
    const s = 0.08 + rand() * rand() * (0.5 + -z * 0.004)
    dummy.position.set(x, height(x, z) + s * 0.3, z)
    dummy.rotation.set(rand() * 3, rand() * 3, rand() * 3)
    dummy.scale.set(s * (1 + rand()), s * (0.5 + rand() * 0.5), s * (1 + rand()))
    dummy.updateMatrix()
    rocks.setMatrixAt(i, dummy.matrix)
    rocks.setColorAt(i, new THREE.Color().setHSL(0.08, 0.06, 0.45 + rand() * 0.3))
  }
  scene.add(rocks)

  // ---- dead trees --------------------------------------------------------------
  const bark = new THREE.MeshStandardMaterial({ color: '#2a2521', roughness: 1 })
  const treeKinds = Array.from({ length: 5 }, () => treeGeometry(rand, 7 + rand() * 5))
  for (let i = 0; i < 40; i++) {
    const z = -14 - rand() * 260
    const x = (rand() - 0.5) * (50 + -z * 1.4)
    const t = new THREE.Mesh(treeKinds[i % treeKinds.length], bark)
    const s = 0.6 + rand() * 0.8
    t.position.set(x, height(x, z) - 0.2, z)
    t.rotation.y = rand() * Math.PI * 2
    t.scale.setScalar(s)
    scene.add(t)
  }

  // ---- ruins on the horizon ------------------------------------------------------
  const ruinMat = new THREE.MeshStandardMaterial({ color: '#4a4a4a', roughness: 1 })
  const ruinParts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 26; i++) {
    const w = 6 + rand() * 14
    const h = 10 + rand() * 45
    const g = new THREE.BoxGeometry(w, h, w * (0.6 + rand() * 0.6), 2, 4, 2)
    // Broken tops: knock the top vertices about.
    const p = g.attributes.position
    for (let k = 0; k < p.count; k++) if (p.getY(k) > h / 2 - 0.01) p.setY(k, h / 2 - rand() * h * 0.35)
    g.computeVertexNormals()
    const x = (rand() - 0.5) * 560
    g.rotateY((rand() - 0.5) * 0.4)
    g.translate(x, h / 2 + height(x, -330) - 2, -320 - rand() * 40)
    ruinParts.push(g)
  }
  scene.add(new THREE.Mesh(mergeGeometries(ruinParts)!, ruinMat))
  // A fallen pylon nearer by.
  const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 14, 6), ruinMat)
  pylon.position.set(-14, height(-14, -40) + 0.6, -40)
  pylon.rotation.set(0.2, 0.4, 1.35)
  scene.add(pylon)

  // ---- dust on the wind ---------------------------------------------------------
  const dustCount = 900
  const dustPos = new Float32Array(dustCount * 3)
  for (let i = 0; i < dustCount; i++) dustPos.set([(rand() - 0.5) * 120, rand() * 14, -5 - rand() * 90], i * 3)
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#d8d4ca', size: 0.18, transparent: true, opacity: 0.5, depthWrite: false }))
  scene.add(dust)

  const target = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.HalfFloatType })
  target.texture.colorSpace = THREE.LinearSRGBColorSpace

  const dayFog = new THREE.Color('#a3abaa')
  const nightFog = new THREE.Color('#0d2230')
  return {
    target,
    // Compiled into its own target, as it is drawn: compiled for the screen,
    // every shader was compiled again -- tone mapping off, linear colour --
    // the first time the view was drawn, a fifth of a second in the flight in.
    warm: (gl) => {
      const prev = gl.getRenderTarget()
      gl.setRenderTarget(target)
      try {
        return gl.compileAsync(scene, camera)
      } finally {
        gl.setRenderTarget(prev)
      }
    },
    render(gl, d, time) {
      // Ash-grey by day whatever blue the dome is showing; teal and stars by night.
      skyUniforms.uTop.value.copy(d.sky).lerp(new THREE.Color('#7f8f96'), 0.65 * (1 - d.night)).lerp(new THREE.Color('#061520'), d.night)
      skyUniforms.uLow.value.copy(d.horizon).lerp(new THREE.Color('#c6cdca'), 0.6 * (1 - d.night)).lerp(new THREE.Color('#123447'), d.night)
      skyUniforms.uNight.value = d.night
      fog.color.copy(dayFog).lerp(nightFog, d.night)
      sun.color.copy(d.sun).lerp(new THREE.Color('#ffffff'), 0.4)
      sun.intensity = 0.35 + d.glow * 2.4
      hemi.intensity = 0.35 + d.glow * 1.1
      hemi.color.copy(skyUniforms.uLow.value)
      // Dust drifts left on the wind, and wraps.
      const p = dustGeo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < dustCount; i++) {
        let x = p.getX(i) - 0.05 - (i % 7) * 0.006
        if (x < -60) x += 120
        p.setX(i, x)
        p.setY(i, p.getY(i) + Math.sin(time * 0.7 + i) * 0.004)
      }
      p.needsUpdate = true
      const prev = gl.getRenderTarget()
      const tone = gl.toneMapping
      gl.setRenderTarget(target)
      gl.toneMapping = THREE.NoToneMapping
      gl.render(scene, camera)
      gl.toneMapping = tone
      gl.setRenderTarget(prev)
    },
    dispose() {
      target.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
    },
  }
}

/**
 * The screen the camera feeds: the picture, behind glass. A little grain and
 * a faint raster, the corners falling off, the colours fringing at the edges
 * the way a cheap lens does, and the camera's legend in the corner.
 */
export function screenMaterial(feed: THREE.Texture) {
  const legend = document.createElement('canvas')
  legend.width = 1024
  legend.height = 128
  const g = legend.getContext('2d')!
  g.fillStyle = 'rgba(230,240,235,0.85)'
  g.font = 'bold 30px "Courier New", monospace'
  g.fillText('CAM 01 · SURFACE · NORTH', 24, 52)
  g.fillStyle = 'rgba(255,90,80,0.9)'
  g.beginPath()
  g.arc(996, 40, 10, 0, Math.PI * 2)
  g.fill()
  const legendTex = new THREE.CanvasTexture(legend)
  const uniforms = { uFeed: { value: feed }, uLegend: { value: legendTex }, uTime: { value: 0 } }
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uFeed; uniform sampler2D uLegend; uniform float uTime;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 uv = vUv;
        vec2 c = uv - 0.5;
        float edge = abs(c.x) * 2.0;
        // Colour fringing toward the edges.
        float ca = 0.0012 * edge;
        vec3 col;
        col.r = texture2D(uFeed, uv + vec2(ca, 0.0)).r;
        col.g = texture2D(uFeed, uv).g;
        col.b = texture2D(uFeed, uv - vec2(ca, 0.0)).b;
        // Grain and a faint raster.
        col += (h(uv * vec2(1600.0, 240.0) + fract(uTime * 7.0)) - 0.5) * 0.035;
        col *= 0.96 + 0.04 * sin(uv.y * 900.0);
        // Vignette.
        col *= 1.0 - 0.6 * smoothstep(0.45, 0.75, length(c * vec2(0.9, 1.3)));
        // The camera's legend, top left of the screen.
        vec2 lu = (uv - vec2(0.012, 0.86)) / vec2(0.18, 0.11);
        if (lu.x > 0.0 && lu.x < 1.0 && lu.y > 0.0 && lu.y < 1.0) {
          vec4 l = texture2D(uLegend, vec2(lu.x, lu.y));
          float blink = lu.x > 0.9 ? step(0.5, fract(uTime * 0.8)) : 1.0;
          col = mix(col, l.rgb, l.a * 0.8 * blink);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  return { material, uniforms }
}
