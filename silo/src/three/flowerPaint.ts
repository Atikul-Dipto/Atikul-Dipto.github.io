import type { FloorFlower, FlowerId } from '../content/flowers'

/**
 * The floors' flower paintings, painted here on a canvas, petal by petal --
 * no photographs, so nothing of anyone else's is hung on the wall. Each is
 * a portrait of one flower against its own ground: sky, leaves or water,
 * set in a cream mat with its name under it in Bangla and English.
 */

type C = CanvasRenderingContext2D
export const PAINT_W = 640
export const PAINT_H = 800
const MAT = 30
const CAPTION = 92
/** The painted area, inside the mat. */
const AW = PAINT_W - MAT * 2
const AH = PAINT_H - MAT - CAPTION
const BANGLA = '"Nirmala UI", "Noto Sans Bengali", "Hind Siliguri", "Vrinda", "Bangla Sangam MN", sans-serif'

function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const deg = (d: number) => (d * Math.PI) / 180

type Tip = 'point' | 'round'
interface PetalLook {
  base: string
  mid: string
  tip: string
  shape?: Tip
  /** Veins drawn over it, and how strongly. */
  veins?: number
  edge?: string
}

/** One petal, pointing up from the origin. */
function petal(c: C, len: number, wid: number, look: PetalLook) {
  c.beginPath()
  if ((look.shape ?? 'point') === 'point') {
    c.moveTo(0, 0)
    c.bezierCurveTo(wid * 0.9, -len * 0.15, wid * 1.05, -len * 0.62, 0, -len)
    c.bezierCurveTo(-wid * 1.05, -len * 0.62, -wid * 0.9, -len * 0.15, 0, 0)
  } else {
    c.moveTo(0, 0)
    c.bezierCurveTo(wid * 0.45, -len * 0.05, wid * 1.12, -len * 0.5, wid * 0.78, -len * 0.86)
    c.quadraticCurveTo(0, -len * 1.1, -wid * 0.78, -len * 0.86)
    c.bezierCurveTo(-wid * 1.12, -len * 0.5, -wid * 0.45, -len * 0.05, 0, 0)
  }
  c.closePath()
  const g = c.createLinearGradient(0, 0, 0, -len)
  g.addColorStop(0, look.base)
  g.addColorStop(0.5, look.mid)
  g.addColorStop(1, look.tip)
  c.fillStyle = g
  c.fill()
  // Shade toward the edges, so a petal has a curve to it, not a flat cut-out.
  c.save()
  c.clip()
  const sh = c.createLinearGradient(-wid, 0, wid, 0)
  sh.addColorStop(0, 'rgba(0,0,0,0.22)')
  sh.addColorStop(0.35, 'rgba(0,0,0,0)')
  sh.addColorStop(0.6, 'rgba(255,255,255,0.10)')
  sh.addColorStop(1, 'rgba(0,0,0,0.16)')
  c.fillStyle = sh
  c.fillRect(-wid * 1.2, -len * 1.2, wid * 2.4, len * 1.3)
  if (look.veins) {
    c.strokeStyle = `rgba(255,255,255,${look.veins})`
    c.lineWidth = 1.2
    for (let i = -3; i <= 3; i++) {
      c.beginPath()
      c.moveTo(0, -len * 0.04)
      c.quadraticCurveTo(i * wid * 0.22, -len * 0.5, i * wid * 0.3, -len * 0.95)
      c.stroke()
    }
  }
  c.restore()
  c.strokeStyle = look.edge ?? 'rgba(0,0,0,0.18)'
  c.lineWidth = 1.4
  c.stroke()
}

/**
 * A ring of petals round (cx, cy), tilted away by `squash` (1 seen face on,
 * smaller lying back): those pointing away are drawn first, so the near ones
 * lie over them.
 */
function ring(c: C, cx: number, cy: number, n: number, start: number, len: number, wid: number, look: PetalLook, squash = 1, jitter = 0, rand = Math.random) {
  const list = Array.from({ length: n }, (_, i) => start + (i / n) * Math.PI * 2 + (rand() - 0.5) * jitter)
  list.sort((a, b) => Math.cos(b) - Math.cos(a))
  for (const a of list) {
    c.save()
    c.translate(cx, cy)
    c.scale(1, squash)
    c.rotate(a)
    petal(c, len * (1 + (rand() - 0.5) * jitter * 0.5), wid, look)
    c.restore()
  }
}

/** A fan of upright petals, as a cup seen from the side. */
function fan(c: C, cx: number, cy: number, angles: number[], len: number, wid: number, look: PetalLook) {
  for (const a of angles) {
    c.save()
    c.translate(cx, cy)
    c.rotate(deg(a))
    petal(c, len, wid, look)
    c.restore()
  }
}

function vertical(c: C, top: string, bottom: string) {
  const g = c.createLinearGradient(0, 0, 0, AH)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  c.fillStyle = g
  c.fillRect(0, 0, AW, AH)
}

/** Soft out-of-focus shapes, for a ground of leaves or light. */
function bokeh(c: C, rand: () => number, n: number, colours: string[], rMin: number, rMax: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const x = rand() * AW
    const y = rand() * AH
    const r = rMin + rand() * (rMax - rMin)
    const g = c.createRadialGradient(x, y, 0, x, y, r)
    const col = colours[Math.floor(rand() * colours.length)]
    g.addColorStop(0, col)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    c.globalAlpha = alpha
    c.fillStyle = g
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fill()
  }
  c.globalAlpha = 1
}

function leaf(c: C, x: number, y: number, a: number, len: number, wid: number, col: string, vein = 'rgba(255,255,255,0.18)') {
  c.save()
  c.translate(x, y)
  c.rotate(a)
  petal(c, len, wid, { base: col, mid: col, tip: col, edge: 'rgba(0,0,0,0.25)' })
  c.strokeStyle = vein
  c.lineWidth = 1.5
  c.beginPath()
  c.moveTo(0, 0)
  c.lineTo(0, -len * 0.92)
  c.stroke()
  c.restore()
}

/** Still water, darker away from you, with a few long bright ripples. */
function water(c: C, rand: () => number, top: string, bottom: string) {
  vertical(c, top, bottom)
  c.strokeStyle = 'rgba(200,230,255,0.10)'
  for (let i = 0; i < 40; i++) {
    const y = AH * (0.15 + rand() * 0.85)
    const x = rand() * AW
    const w = 30 + rand() * 120 * (y / AH)
    c.lineWidth = 1 + (y / AH) * 2
    c.beginPath()
    c.moveTo(x - w, y)
    c.quadraticCurveTo(x, y + 3, x + w, y)
    c.stroke()
  }
}

/** A round leaf lying on the water, foreshortened, with its notch. */
function pad(c: C, x: number, y: number, r: number, squash: number, turn: number, col: string) {
  c.save()
  c.translate(x, y)
  c.scale(1, squash)
  c.rotate(turn)
  c.beginPath()
  c.moveTo(0, 0)
  c.arc(0, 0, r, 0.18, Math.PI * 2 - 0.18)
  c.closePath()
  const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r)
  g.addColorStop(0, '#6f9c55')
  g.addColorStop(1, col)
  c.fillStyle = g
  c.fill()
  c.strokeStyle = 'rgba(20,40,20,0.5)'
  c.lineWidth = 2
  c.stroke()
  c.strokeStyle = 'rgba(210,240,190,0.18)'
  c.lineWidth = 1.2
  for (let i = 1; i < 12; i++) {
    const a = 0.18 + (i / 12) * (Math.PI * 2 - 0.36)
    c.beginPath()
    c.moveTo(0, 0)
    c.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92)
    c.stroke()
  }
  c.restore()
}

/** Thin filaments out from a centre, each tipped with a pollen dot. */
function stamens(c: C, cx: number, cy: number, n: number, from: number, to: number, len: number, stalk: string, anther: string, rand: () => number, bend = 0.2) {
  for (let i = 0; i < n; i++) {
    const a = deg(from + (to - from) * rand())
    const l = len * (0.7 + rand() * 0.3)
    const ex = cx + Math.sin(a) * l
    const ey = cy - Math.cos(a) * l
    c.strokeStyle = stalk
    c.lineWidth = 1.6
    c.beginPath()
    c.moveTo(cx, cy)
    c.quadraticCurveTo(cx + Math.sin(a + bend) * l * 0.5, cy - Math.cos(a + bend) * l * 0.5, ex, ey)
    c.stroke()
    c.fillStyle = anther
    c.beginPath()
    c.ellipse(ex, ey, 3.2, 2.2, a, 0, Math.PI * 2)
    c.fill()
  }
}

// ---- the flowers -------------------------------------------------------------

/** Silk cotton: fleshy scarlet cups on a bare branch against a clear sky. */
function shimul(c: C, rand: () => number) {
  vertical(c, '#5f8fbf', '#aac6de')
  // The branch, knobbed and bare, as the tree flowers before it leafs.
  c.strokeStyle = '#3b2a22'
  c.lineCap = 'round'
  c.lineWidth = 26
  c.beginPath()
  c.moveTo(AW + 20, AH * 0.86)
  c.bezierCurveTo(AW * 0.75, AH * 0.8, AW * 0.62, AH * 0.7, AW * 0.5, AH * 0.62)
  c.stroke()
  c.lineWidth = 12
  c.beginPath()
  c.moveTo(AW * 0.72, AH * 0.8)
  c.quadraticCurveTo(AW * 0.85, AH * 0.95, AW * 0.95, AH + 10)
  c.stroke()
  c.fillStyle = '#4a372c'
  for (let i = 0; i < 9; i++) {
    const t = 0.15 + i * 0.09
    c.beginPath()
    c.arc(AW * (1 - t * 0.55), AH * (0.86 - t * 0.27), 5 + rand() * 4, 0, Math.PI * 2)
    c.fill()
  }
  const cx = AW * 0.46
  const cy = AH * 0.56
  const red: PetalLook = { base: '#8f0d14', mid: '#d81f26', tip: '#ff5a43', shape: 'round', veins: 0.08 }
  // Back petals first, flung back and out.
  fan(c, cx, cy, [-78, 76], 215, 62, { ...red, base: '#7a0a10', mid: '#b5161c', tip: '#e83a2c' })
  fan(c, cx, cy, [-40, 36], 245, 70, red)
  stamens(c, cx, cy - 10, 70, -30, 30, 165, 'rgba(255,190,170,0.9)', '#2a0808', rand, 0.1)
  fan(c, cx, cy, [-6], 230, 66, { ...red, base: '#a5121a' })
  // The near petal, curled forward and down.
  c.save()
  c.translate(cx, cy + 8)
  c.scale(1, 0.55)
  c.rotate(deg(176))
  petal(c, 150, 74, { ...red, base: '#b3151d', tip: '#ff6b4f' })
  c.restore()
  // The calyx: a squat green cup under it all.
  const g = c.createRadialGradient(cx - 10, cy + 40, 5, cx, cy + 45, 55)
  g.addColorStop(0, '#b9b54e')
  g.addColorStop(1, '#5c5d22')
  c.fillStyle = g
  c.beginPath()
  c.ellipse(cx, cy + 48, 46, 38, 0, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = '#3b2a22'
  c.lineWidth = 10
  c.beginPath()
  c.moveTo(cx, cy + 80)
  c.quadraticCurveTo(cx + 10, cy + 105, AW * 0.53, AH * 0.645)
  c.stroke()
}

/** Flame tree: five spoon-shaped petals, one streaked pale, long stamens. */
function krishnachura(c: C, rand: () => number) {
  vertical(c, '#f3d6a6', '#9fb9a4')
  bokeh(c, rand, 26, ['rgba(70,120,60,1)', 'rgba(40,90,45,1)', 'rgba(255,170,90,1)'], 40, 120, 0.35)
  // Feathery leaves: rows of small leaflets along each stalk.
  for (let k = 0; k < 6; k++) {
    const x0 = rand() * AW
    const y0 = rand() * AH
    const a = rand() * Math.PI * 2
    for (let i = 0; i < 16; i++) {
      const x = x0 + Math.cos(a) * i * 12
      const y = y0 + Math.sin(a) * i * 12
      leaf(c, x, y, a + Math.PI / 2 + 0.6, 22, 6, '#4b7f3e', 'rgba(0,0,0,0)')
      leaf(c, x, y, a - Math.PI / 2 - 0.6, 22, 6, '#4b7f3e', 'rgba(0,0,0,0)')
    }
  }
  const flower = (cx: number, cy: number, s: number, turn: number) => {
    const look: PetalLook = { base: '#ffcf3d', mid: '#ff5b1c', tip: '#e33a18', shape: 'round', veins: 0.12 }
    for (let i = 1; i < 5; i++) {
      c.save()
      c.translate(cx, cy)
      c.rotate(turn + (i / 5) * Math.PI * 2)
      petal(c, 150 * s, 66 * s, look)
      c.restore()
    }
    // The standard: paler, flecked with red.
    c.save()
    c.translate(cx, cy)
    c.rotate(turn)
    petal(c, 140 * s, 60 * s, { base: '#fff6dc', mid: '#ffe58c', tip: '#ff8a2a', shape: 'round' })
    c.fillStyle = 'rgba(200,30,20,0.75)'
    for (let i = 0; i < 40; i++) {
      c.beginPath()
      c.arc((rand() - 0.5) * 50 * s, -(25 + rand() * 80) * s, 1.5 + rand() * 2.5 * s, 0, Math.PI * 2)
      c.fill()
    }
    c.restore()
    // Ten stamens, long and curving down and out.
    for (let i = 0; i < 10; i++) {
      const a = turn + Math.PI + (i - 4.5) * 0.09
      const l = (150 + rand() * 30) * s
      const ex = cx + Math.sin(a) * l
      const ey = cy - Math.cos(a) * l
      c.strokeStyle = '#c4231a'
      c.lineWidth = 2.4 * s
      c.beginPath()
      c.moveTo(cx, cy)
      c.quadraticCurveTo(cx + Math.sin(a - 0.5) * l * 0.6, cy - Math.cos(a - 0.5) * l * 0.6, ex, ey)
      c.stroke()
      c.fillStyle = '#5a1a0c'
      c.beginPath()
      c.ellipse(ex, ey, 5 * s, 3 * s, a, 0, Math.PI * 2)
      c.fill()
    }
  }
  flower(AW * 0.62, AH * 0.3, 0.55, 0.8)
  flower(AW * 0.46, AH * 0.55, 1, -0.25)
  // Buds.
  c.fillStyle = '#d9452a'
  for (const [x, y] of [[0.2, 0.25], [0.26, 0.2], [0.8, 0.72]]) {
    c.beginPath()
    c.ellipse(AW * x, AH * y, 10, 15, 0.4, 0, Math.PI * 2)
    c.fill()
  }
}

/** Sunflower: a ring of gold round a disc of seeds set on the golden angle. */
function surjomukhi(c: C, rand: () => number) {
  vertical(c, '#4f93cf', '#cfe5f4')
  bokeh(c, rand, 10, ['rgba(255,255,255,1)'], 60, 140, 0.35)
  leaf(c, AW * 0.3, AH * 1.02, -0.6, 300, 120, '#3f7a34')
  leaf(c, AW * 0.75, AH * 1.0, 0.7, 260, 110, '#4b8a3a')
  c.strokeStyle = '#4c7f30'
  c.lineWidth = 22
  c.beginPath()
  c.moveTo(AW * 0.55, AH + 10)
  c.quadraticCurveTo(AW * 0.52, AH * 0.75, AW * 0.5, AH * 0.48)
  c.stroke()
  const cx = AW * 0.5
  const cy = AH * 0.42
  const R = 105
  const gold: PetalLook = { base: '#e08a00', mid: '#ffc21a', tip: '#ffdb55', shape: 'point', veins: 0.1 }
  for (const [n, len, wid, off] of [[24, 120, 26, 0], [24, 110, 24, Math.PI / 24]] as const) {
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.06
      c.save()
      c.translate(cx + Math.sin(a) * R * 0.8, cy - Math.cos(a) * R * 0.8)
      c.rotate(a)
      petal(c, len * (0.9 + rand() * 0.2), wid, gold)
      c.restore()
    }
  }
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, R)
  g.addColorStop(0, '#2a160a')
  g.addColorStop(0.75, '#4a2a0e')
  g.addColorStop(1, '#7a4a12')
  c.fillStyle = g
  c.beginPath()
  c.arc(cx, cy, R, 0, Math.PI * 2)
  c.fill()
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < 700; i++) {
    const r = Math.sqrt(i / 700) * (R - 6)
    const a = i * golden
    c.fillStyle = i % 3 === 0 ? '#6b4518' : i > 600 ? '#c88a1a' : '#24120a'
    c.beginPath()
    c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.4, 0, Math.PI * 2)
    c.fill()
  }
}

/** Butterfly pea: one broad petal of deep blue with a pale yellow heart. */
function aparajita(c: C, rand: () => number) {
  vertical(c, '#bcd6ad', '#e8f0dc')
  bokeh(c, rand, 22, ['rgba(80,140,70,1)', 'rgba(120,170,90,1)', 'rgba(255,255,240,1)'], 40, 110, 0.4)
  // The vine: a winding stem, leaflets in pairs, tendrils.
  c.strokeStyle = '#4e7d39'
  c.lineWidth = 6
  c.beginPath()
  c.moveTo(-10, AH * 0.2)
  c.bezierCurveTo(AW * 0.3, AH * 0.05, AW * 0.4, AH * 0.95, AW + 10, AH * 0.8)
  c.stroke()
  for (let i = 0; i < 7; i++) {
    const t = i / 7
    const x = AW * (0.05 + t * 0.95)
    const y = AH * (0.18 + Math.sin(t * Math.PI) * 0.45 + t * 0.15)
    leaf(c, x, y, -0.9 + rand() * 0.4, 70, 26, '#5a9442')
    leaf(c, x, y, 0.9 + rand() * 0.4, 70, 26, '#4f883a')
  }
  c.strokeStyle = '#6fa04f'
  c.lineWidth = 2
  for (let k = 0; k < 4; k++) {
    const x = AW * (0.15 + rand() * 0.7)
    const y = AH * (0.15 + rand() * 0.7)
    c.beginPath()
    for (let i = 0; i < 60; i++) {
      const a = i * 0.25
      const r = 26 - i * 0.4
      c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    }
    c.stroke()
  }
  const one = (cx: number, cy: number, s: number, turn: number) => {
    c.save()
    c.translate(cx, cy)
    c.rotate(turn)
    c.scale(s, s)
    // Wings, low on either side.
    for (const side of [-1, 1]) {
      c.save()
      c.rotate(side * 1.9)
      petal(c, 80, 34, { base: '#1d2fa0', mid: '#3555e0', tip: '#5a7cff', shape: 'round' })
      c.restore()
    }
    // The standard: broad, round, and deep blue, paler at its heart.
    petal(c, 230, 150, { base: '#e8ecff', mid: '#2f56e8', tip: '#1a2c9a', shape: 'round', veins: 0.06 })
    const h = c.createRadialGradient(0, -55, 0, 0, -55, 70)
    h.addColorStop(0, 'rgba(255,240,150,0.95)')
    h.addColorStop(0.45, 'rgba(255,255,255,0.75)')
    h.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = h
    c.beginPath()
    c.ellipse(0, -55, 50, 75, 0, 0, Math.PI * 2)
    c.fill()
    // Calyx.
    c.fillStyle = '#5b8f40'
    c.beginPath()
    c.ellipse(0, 18, 16, 28, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()
  }
  one(AW * 0.24, AH * 0.3, 0.42, -0.5)
  one(AW * 0.52, AH * 0.62, 1, 0.12)
}

/** Pride of India: a spray of crinkled mauve flowers, gold at their hearts. */
function jarul(c: C, rand: () => number) {
  vertical(c, '#86b2dc', '#dfecf6')
  bokeh(c, rand, 18, ['rgba(70,120,70,1)', 'rgba(50,95,60,1)'], 70, 150, 0.45)
  leaf(c, AW * 0.15, AH * 0.98, -0.4, 230, 80, '#3f7445')
  leaf(c, AW * 0.92, AH * 0.95, 0.5, 210, 70, '#4a8250')
  c.strokeStyle = '#5a4630'
  c.lineWidth = 7
  const heads: Array<[number, number, number]> = []
  for (let i = 0; i < 9; i++) {
    const a = -1.2 + (i / 8) * 2.4
    const l = 120 + rand() * 120
    const x = AW * 0.5 + Math.sin(a) * l
    const y = AH * 0.62 - Math.cos(a) * l
    c.beginPath()
    c.moveTo(AW * 0.5, AH * 0.9)
    c.quadraticCurveTo(AW * 0.5, AH * 0.65, x, y)
    c.stroke()
    heads.push([x, y, 0.75 + rand() * 0.4])
  }
  // Round buds tucked between.
  for (let i = 0; i < 14; i++) {
    const [x, y] = heads[Math.floor(rand() * heads.length)]
    c.fillStyle = i % 2 ? '#8c5a9e' : '#7aa05a'
    c.beginPath()
    c.arc(x + (rand() - 0.5) * 90, y + (rand() - 0.5) * 90, 7 + rand() * 4, 0, Math.PI * 2)
    c.fill()
  }
  for (const [x, y, s] of heads) {
    const look: PetalLook = { base: '#6a2fa6', mid: '#a463e0', tip: '#cfa2f5', shape: 'round', veins: 0.16 }
    ring(c, x, y, 6, rand(), 62 * s, 30 * s, look, 0.85 + rand() * 0.15, 0.25, rand)
    // The crinkle: a frilled pale line near each edge.
    c.strokeStyle = 'rgba(240,220,255,0.35)'
    c.lineWidth = 1.4
    c.beginPath()
    c.arc(x, y, 44 * s, 0, Math.PI * 2)
    c.stroke()
    stamens(c, x, y, 18, -180, 180, 18 * s, '#f0d9a0', '#ffcf2a', rand, 0)
  }
}

/** Water lily: white, many-pointed, open on dark water among its leaves. */
function shapla(c: C, rand: () => number) {
  water(c, rand, '#0b2129', '#1d4651')
  pad(c, AW * 0.18, AH * 0.36, 90, 0.42, 0.4, '#2f5a2c')
  pad(c, AW * 0.86, AH * 0.48, 110, 0.4, 2.2, '#2c552a')
  pad(c, AW * 0.3, AH * 0.86, 150, 0.4, 4, '#355f30')
  pad(c, AW * 0.82, AH * 0.9, 120, 0.42, 1, '#2a5028')
  const white: PetalLook = { base: '#dfe6e8', mid: '#ffffff', tip: '#f3f6ff', shape: 'point', veins: 0.25, edge: 'rgba(60,80,100,0.35)' }
  // Its reflection, faint, under it.
  c.save()
  c.globalAlpha = 0.12
  c.translate(0, AH * 0.56 * 2 + 70)
  c.scale(1, -1)
  ring(c, AW * 0.5, AH * 0.56, 14, 0, 205, 40, white, 0.38, 0.3, random(5))
  c.restore()
  // The flower itself, larger than life.
  c.save()
  c.translate(AW * 0.5, AH * 0.56)
  c.scale(1.4, 1.4)
  const cx = 0
  const cy = 0
  ring(c, cx, cy, 14, 0, 150, 30, white, 0.38, 0.3, rand)
  fan(c, cx, cy, [-62, -40, -20, 0, 20, 40, 62], 120, 26, { ...white, base: '#e9eef0' })
  // The golden heart.
  const g = c.createRadialGradient(cx, cy - 18, 0, cx, cy - 18, 40)
  g.addColorStop(0, '#fff2a0')
  g.addColorStop(1, '#e9b20c')
  c.fillStyle = g
  c.beginPath()
  c.ellipse(cx, cy - 16, 38, 18, 0, 0, Math.PI * 2)
  c.fill()
  stamens(c, cx, cy - 14, 40, -55, 55, 40, '#f2c215', '#ffde4a', rand, 0)
  fan(c, cx, cy + 4, [-150, 150, 180], 95, 26, { ...white, base: '#f2f5f6' })
  c.restore()
}

/** Rose: petals wound tight at the heart and loosening outward. */
function golap(c: C, rand: () => number) {
  vertical(c, '#1b0f15', '#3a1d28')
  bokeh(c, rand, 26, ['rgba(255,120,170,1)', 'rgba(255,200,160,1)', 'rgba(120,40,70,1)'], 10, 45, 0.35)
  c.strokeStyle = '#2f5a2a'
  c.lineWidth = 10
  c.beginPath()
  c.moveTo(AW * 0.5, AH * 0.56)
  c.quadraticCurveTo(AW * 0.56, AH * 0.8, AW * 0.5, AH + 10)
  c.stroke()
  for (const [x, y, a] of [[0.5, 0.78, -1.1], [0.53, 0.88, 1.0], [0.48, 0.68, 1.3]]) {
    leaf(c, AW * x, AH * y, a, 110, 42, '#3c6f34')
    // Serrated edge, as a fringe of small teeth.
    c.save()
    c.translate(AW * x, AH * y)
    c.rotate(a)
    c.fillStyle = '#3c6f34'
    for (let i = 1; i < 9; i++) {
      for (const side of [-1, 1]) {
        c.beginPath()
        const t = i / 9
        const w = Math.sin(t * Math.PI) * 42 * 0.92
        c.moveTo(side * w, -110 * t)
        c.lineTo(side * (w + 5), -110 * t - 8)
        c.lineTo(side * (w - 3), -110 * t - 10)
        c.fill()
      }
    }
    c.restore()
  }
  const cx = AW * 0.5
  const cy = AH * 0.4
  const outer: PetalLook = { base: '#6d0b33', mid: '#c2185b', tip: '#ec5b92', shape: 'round', veins: 0.05 }
  ring(c, cx, cy, 6, 0.3, 160, 92, outer, 0.82, 0.2, rand)
  ring(c, cx, cy, 5, 0.9, 125, 80, { ...outer, base: '#5e0a2c', tip: '#e2457f' }, 0.82, 0.2, rand)
  // The heart: smaller and smaller rings of petal, each turned on the last,
  // closing to a tight bud.
  const rings: Array<[number, number, number, number]> = [
    [5, 1.6, 98, 66],
    [4, 2.4, 72, 52],
    [4, 0.5, 50, 40],
    [3, 1.2, 32, 28],
  ]
  rings.forEach(([n, turn, len, wid], i) => {
    const t = i / rings.length
    ring(c, cx, cy - 6 - i * 4, n, turn, len, wid, { base: '#4e0824', mid: t > 0.5 ? '#b0154f' : '#c81c5e', tip: t > 0.5 ? '#e0447e' : '#f06a9c', shape: 'round', edge: 'rgba(60,0,20,0.45)' }, 0.8, 0.15, rand)
  })
  const bud = c.createRadialGradient(cx - 4, cy - 26, 2, cx, cy - 22, 18)
  bud.addColorStop(0, '#e2457f')
  bud.addColorStop(1, '#5e0a2c')
  c.fillStyle = bud
  c.beginPath()
  c.ellipse(cx, cy - 22, 15, 12, 0, 0, Math.PI * 2)
  c.fill()
}

/** Lotus: pointed petals cupped round a gold seed head, on still water. */
function padma(c: C, rand: () => number) {
  water(c, rand, '#0a1d33', '#1d4a6b')
  pad(c, AW * 0.2, AH * 0.3, 120, 0.4, 0.8, '#2d5a45')
  pad(c, AW * 0.85, AH * 0.55, 140, 0.42, 2.5, '#2a5442')
  pad(c, AW * 0.2, AH * 0.9, 170, 0.4, 3.6, '#30604a')
  const cx = AW * 0.5
  const cy = AH * 0.6
  const pink: PetalLook = { base: '#fff1f6', mid: '#ffc3dc', tip: '#ec5c9c', shape: 'point', veins: 0.22, edge: 'rgba(150,40,90,0.3)' }
  const draw = (r: () => number) => {
    ring(c, cx, cy, 10, 0.2, 165, 52, pink, 0.4, 0.25, r)
    fan(c, cx, cy, [-75, -50, 50, 75], 180, 54, { ...pink, base: '#ffe4ee' })
    fan(c, cx, cy, [-28, 28], 195, 56, pink)
  }
  c.save()
  c.globalAlpha = 0.22
  c.translate(0, cy * 2 + 30)
  c.scale(1, -1)
  draw(random(9))
  c.restore()
  draw(rand)
  // The seed head, flat-topped and gold, ringed with stamens.
  stamens(c, cx, cy - 22, 60, -70, 70, 52, '#f7c84a', '#ffe27a', rand, 0)
  const g = c.createLinearGradient(cx, cy - 60, cx, cy - 20)
  g.addColorStop(0, '#f6dd6a')
  g.addColorStop(1, '#c79a1c')
  c.fillStyle = g
  c.beginPath()
  c.ellipse(cx, cy - 46, 30, 12, 0, 0, Math.PI * 2)
  c.fill()
  c.fillRect(cx - 30, cy - 46, 60, 22)
  c.fillStyle = '#9a7a14'
  for (let i = 0; i < 9; i++) {
    c.beginPath()
    c.arc(cx + Math.cos(i * 0.7) * (i ? 16 : 0), cy - 46 + Math.sin(i * 0.7) * (i ? 6 : 0), 2.6, 0, Math.PI * 2)
    c.fill()
  }
  // The near petals, folded forward over the foot of it all.
  fan(c, cx, cy + 6, [-150, 150], 120, 50, pink)
  fan(c, cx, cy + 6, [180], 135, 56, { ...pink, base: '#ffd6e7' })
}

const PAINTERS: Record<FlowerId, (c: C, rand: () => number) => void> = {
  shimul,
  krishnachura,
  surjomukhi,
  aparajita,
  jarul,
  shapla,
  golap,
  padma,
}

/** A whole painting: the flower, its mat, and its name. */
export function paintFlower(f: FloorFlower) {
  const canvas = document.createElement('canvas')
  canvas.width = PAINT_W
  canvas.height = PAINT_H
  const c = canvas.getContext('2d')!
  c.fillStyle = '#efe6d4'
  c.fillRect(0, 0, PAINT_W, PAINT_H)
  c.save()
  c.translate(MAT, MAT)
  c.beginPath()
  c.rect(0, 0, AW, AH)
  c.clip()
  const rand = random(f.level * 7919)
  PAINTERS[f.id](c, rand)
  // Canvas grain: a fine scatter of light and dark, so it reads as paint.
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
    c.fillRect(rand() * AW, rand() * AH, 2, 2)
  }
  c.restore()
  // The inner edge of the mat, and a fine line in the flower's colour.
  c.strokeStyle = 'rgba(0,0,0,0.25)'
  c.lineWidth = 2
  c.strokeRect(MAT - 1, MAT - 1, AW + 2, AH + 2)
  c.strokeStyle = f.colour === '#f6f4ee' ? '#c9b98a' : f.colour
  c.lineWidth = 3
  c.strokeRect(MAT - 9, MAT - 9, AW + 18, AH + 18)
  c.fillStyle = '#2b2622'
  c.textAlign = 'center'
  c.textBaseline = 'alphabetic'
  c.font = `700 40px ${BANGLA}`
  c.fillText(f.bn, PAINT_W / 2, PAINT_H - CAPTION + 50)
  c.font = '600 19px system-ui, "Segoe UI", sans-serif'
  c.fillStyle = '#6a5f55'
  c.fillText(f.en.toUpperCase().split('').join(' '), PAINT_W / 2, PAINT_H - CAPTION + 80)
  return canvas
}
