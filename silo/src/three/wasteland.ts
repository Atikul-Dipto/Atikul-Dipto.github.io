import * as THREE from 'three'

/**
 * The world outside, as the silo's screens show it: a plain scorched flat
 * by something enormous, under a pale ash sky by day and a hard, clear field
 * of stars by night. Grey rubble, craters, a low ridge, and dead trees with
 * no leaves left on them.
 *
 * Painted once onto a canvas, day and night from the same seed so the hills
 * and the trees stand in the same places in both, and shown as a flat image.
 * Deliberately static: it is a picture on a screen, fed from a camera on the
 * surface, and it does not slide about as you walk past it.
 */

const W = 4096
const H = 512

/** A small deterministic generator, so the view is the same every visit. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Smooth 1-D value noise from a fixed table: for ridgelines. */
function ridge(seed: number) {
  const r = rng(seed)
  const t = Array.from({ length: 512 }, () => r())
  const at = (x: number) => {
    const i = Math.floor(x)
    const f = x - i
    const a = t[((i % 512) + 512) % 512]
    const b = t[(((i + 1) % 512) + 512) % 512]
    return a + (b - a) * (f * f * (3 - 2 * f))
  }
  return (x: number) => at(x) * 0.55 + at(x * 2.1 + 7) * 0.28 + at(x * 4.7 + 13) * 0.17
}

interface Palette {
  skyTop: string
  skyLow: string
  haze: string
  far: string
  mid: string
  groundTop: string
  groundLow: string
  rockLit: string
  rockShade: string
  tree: string
}

const DAY: Palette = {
  skyTop: '#7e9199',
  skyLow: '#c3ccc9',
  haze: 'rgba(214,220,216,0.55)',
  far: '#7f8b8c',
  mid: '#6c6e69',
  groundTop: '#6a6963',
  groundLow: '#3f3e3a',
  rockLit: 'rgba(160,158,150,0.75)',
  rockShade: 'rgba(30,29,27,0.55)',
  tree: '#1f1c1a',
}

const NIGHT: Palette = {
  skyTop: '#06141f',
  skyLow: '#123447',
  haze: 'rgba(40,80,100,0.25)',
  far: '#0c2230',
  mid: '#0a1b25',
  groundTop: '#0b1c26',
  groundLow: '#050d12',
  rockLit: 'rgba(70,110,130,0.35)',
  rockShade: 'rgba(0,0,0,0.5)',
  tree: '#03080b',
}

/** A dead tree: a trunk that forks, and forks again, thinning as it goes. */
function tree(g: CanvasRenderingContext2D, x: number, y: number, h: number, r: () => number, color: string) {
  g.strokeStyle = color
  g.lineCap = 'round'
  const limb = (x0: number, y0: number, len: number, ang: number, w: number, depth: number) => {
    const x1 = x0 + Math.cos(ang) * len
    const y1 = y0 - Math.sin(ang) * len
    g.lineWidth = w
    g.beginPath()
    g.moveTo(x0, y0)
    // A little crook in every limb: nothing dead grows straight.
    g.quadraticCurveTo((x0 + x1) / 2 + (r() - 0.5) * len * 0.25, (y0 + y1) / 2, x1, y1)
    g.stroke()
    if (depth <= 0 || w < 0.6) return
    const n = 2 + (r() < 0.35 ? 1 : 0)
    for (let i = 0; i < n; i++) {
      const spread = (r() - 0.5) * 1.3
      limb(x1, y1, len * (0.55 + r() * 0.2), ang + spread, w * 0.62, depth - 1)
    }
  }
  limb(x, y, h * 0.45, Math.PI / 2 + (r() - 0.5) * 0.15, Math.max(1.2, h * 0.045), 4)
}

function paint(p: Palette, night: boolean) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const r = rng(90210)

  // ---- sky ----------------------------------------------------------------
  const horizon = H * 0.56
  const sky = g.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, p.skyTop)
  sky.addColorStop(1, p.skyLow)
  g.fillStyle = sky
  g.fillRect(0, 0, W, horizon + 4)

  if (night) {
    // Stars: many faint, a few bright, thinning toward the haze at the horizon.
    const sr = rng(4242)
    for (let i = 0; i < 2600; i++) {
      const x = sr() * W
      const y = Math.pow(sr(), 1.4) * horizon * 0.95
      const b = sr()
      const a = (0.25 + b * 0.75) * (1 - y / horizon) ** 0.6
      g.fillStyle = `rgba(235,242,255,${a.toFixed(3)})`
      const s = b > 0.97 ? 2.2 : b > 0.85 ? 1.5 : 1
      g.fillRect(x, y, s, s)
    }
  } else {
    // The sun, lost in the ash: a pale smear, not a disc.
    const sun = g.createRadialGradient(W * 0.68, H * 0.16, 0, W * 0.68, H * 0.16, H * 0.5)
    sun.addColorStop(0, 'rgba(250,248,238,0.55)')
    sun.addColorStop(0.25, 'rgba(240,238,228,0.18)')
    sun.addColorStop(1, 'rgba(240,238,228,0)')
    g.fillStyle = sun
    g.fillRect(0, 0, W, horizon)
  }

  // ---- far hills, hazed --------------------------------------------------
  const far = ridge(11)
  g.fillStyle = p.far
  g.beginPath()
  g.moveTo(0, horizon)
  for (let x = 0; x <= W; x += 8) g.lineTo(x, horizon - 18 - far(x / 260) * 70)
  g.lineTo(W, horizon)
  g.fill()
  g.fillStyle = p.haze
  g.fillRect(0, horizon - 60, W, 70)

  // A nearer, darker range.
  const midR = ridge(23)
  g.fillStyle = p.mid
  g.beginPath()
  g.moveTo(0, horizon + 4)
  for (let x = 0; x <= W; x += 8) g.lineTo(x, horizon - 4 - midR(x / 180) * 38)
  g.lineTo(W, horizon + 4)
  g.fill()

  // ---- the plain ---------------------------------------------------------
  const ground = g.createLinearGradient(0, horizon - 20, 0, H)
  ground.addColorStop(0, p.groundTop)
  ground.addColorStop(1, p.groundLow)
  const near = ridge(37)
  g.fillStyle = ground
  g.beginPath()
  g.moveTo(0, H)
  const ridgeY = (x: number) => horizon + 6 - near(x / 140) * 34
  for (let x = 0; x <= W; x += 6) g.lineTo(x, ridgeY(x))
  g.lineTo(W, H)
  g.fill()

  // Craters: dished rings, darker inside, a lit lip on the far side.
  for (let i = 0; i < 26; i++) {
    const x = r() * W
    const y = horizon + 30 + r() * (H - horizon - 40)
    const s = 18 + r() * 70 * ((y - horizon) / (H - horizon))
    g.fillStyle = p.rockShade
    g.beginPath()
    g.ellipse(x, y, s, s * 0.22, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = p.rockLit
    g.lineWidth = 1.5
    g.beginPath()
    g.ellipse(x, y - s * 0.03, s, s * 0.22, 0, Math.PI * 1.05, Math.PI * 1.95)
    g.stroke()
  }

  // Scorch: long dark smears across the plain, as if blown flat from one side.
  for (let i = 0; i < 40; i++) {
    const x = r() * W
    const y = horizon + 20 + r() * (H - horizon - 20)
    const depth = (y - horizon) / (H - horizon)
    const grad = g.createRadialGradient(x, y, 0, x, y, 120 + depth * 260)
    grad.addColorStop(0, p.rockShade)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.beginPath()
    g.ellipse(x, y, 120 + depth * 260, 10 + depth * 30, 0, 0, Math.PI * 2)
    g.fill()
  }

  // Rubble: thousands of stones, bigger the nearer they lie, heaped in
  // drifts rather than sown evenly.
  const drift = ridge(5)
  for (let i = 0; i < 9000; i++) {
    const y = horizon + Math.pow(r(), 0.8) * (H - horizon)
    const x = r() * W
    if (y < ridgeY(x) + 2) continue
    if (drift(x / 90 + y / 40) < 0.42 + r() * 0.25) continue
    const depth = (y - horizon) / (H - horizon)
    const s = 0.8 + r() * (1 + depth * 9)
    g.fillStyle = p.rockShade
    g.beginPath()
    g.ellipse(x + s * 0.3, y + s * 0.2, s, s * 0.5, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = p.rockLit
    g.beginPath()
    g.ellipse(x, y, s * 0.8, s * 0.38, (r() - 0.5) * 0.6, Math.PI, Math.PI * 2)
    g.fill()
  }

  // ---- dead trees --------------------------------------------------------
  const tr = rng(777)
  for (let i = 0; i < 46; i++) {
    const x = tr() * W
    const front = tr() < 0.25
    const y = front ? horizon + 40 + tr() * (H - horizon - 80) : ridgeY(x) + 2
    const h = front ? 90 + tr() * 140 : 26 + tr() * 60
    tree(g, x, y, h, tr, p.tree)
  }
  // A few broken posts and twisted rebar along the ridge.
  for (let i = 0; i < 30; i++) {
    const x = tr() * W
    const y = ridgeY(x) + 4 + tr() * 30
    g.strokeStyle = p.tree
    g.lineWidth = 1.5 + tr() * 2
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + (tr() - 0.5) * 10, y - 8 - tr() * 22)
    g.stroke()
  }

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.wrapS = THREE.RepeatWrapping
  t.generateMipmaps = true
  return t
}

let cache: { day: THREE.CanvasTexture; night: THREE.CanvasTexture } | null = null

/** The two views, painted once and shared by every screen that shows them. */
export function wasteland() {
  if (!cache) cache = { day: paint(DAY, false), night: paint(NIGHT, true) }
  return cache
}

/** A material showing the outside on any surface with UVs: day and night
 *  blended by the hour, brightened by the light, tinted at dawn and dusk. */
export function wastelandMaterial() {
  const { day, night } = wasteland()
  const uniforms = {
    uDay: { value: day },
    uNightTex: { value: night },
    uNight: { value: 0 },
    uGlow: { value: 1 },
    uHorizon: { value: new THREE.Color('#ffffff') },
    uRepeat: { value: 1 },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDay;
      uniform sampler2D uNightTex;
      uniform float uNight;
      uniform float uGlow;
      uniform vec3 uHorizon;
      uniform float uRepeat;
      varying vec2 vUv;
      void main() {
        vec2 uv = vec2(vUv.x * uRepeat, vUv.y);
        vec3 d = texture2D(uDay, uv).rgb;
        vec3 n = texture2D(uNightTex, uv).rgb;
        // Dawn and dusk warm the day view a little; it stays ash-grey.
        vec3 tint = mix(vec3(1.0), uHorizon * 1.3, 0.18);
        vec3 day = d * tint * (0.45 + uGlow * 0.6);
        vec3 col = mix(day, n * 1.15, uNight);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  return { material, uniforms }
}
