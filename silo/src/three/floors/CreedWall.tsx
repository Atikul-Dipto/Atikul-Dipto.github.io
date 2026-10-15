import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { FLOORS, PALETTE } from '../../content/floors'
import { CREED, CREED_TEXT, FLOOR } from '../../content/level1'
import { useSilo } from '../../state/useSilo'

/**
 * The creed wall: what the silo tells itself, set into the level 1 wall
 * opposite the bridge.
 *
 * Built as a piece of equipment rather than an inscription: a curved display
 * of dark glass on a steel plinth, between two fins, with light lines in the
 * plinth and the header. The words are lit from inside the glass, dimly
 * until someone comes near -- then it wakes, a scan line running down the
 * glass and leaving the text at full brightness behind it. After that a slower scan
 * passes every few seconds, so it never quite sits still.
 *
 * The reveal and the scan are a few lines added to the standard material's
 * shader, masking only the emission: no texture is redrawn after the first
 * frame, so the effect costs nothing on the CPU.
 */

/** Canvas size. The glass is about 13 m by 4.6 m; this keeps the aspect. */
const TW = 3072
const TH = 1072

/** A curved surface on the cylinder r, facing the axis, with u running the
 *  way a visitor reads -- left to right as they face the wall. */
function curvedPanel(r: number, a0: number, a1: number, y0: number, h: number) {
  const segs = Math.max(8, Math.round((a1 - a0) * 60))
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const a = a0 + (a1 - a0) * t
    pos.push(Math.cos(a) * r, y0, Math.sin(a) * r)
    pos.push(Math.cos(a) * r, y0 + h, Math.sin(a) * r)
    // Facing outward at angle a, screen-right is increasing a, so u follows a.
    uv.push(t, 0, t, 1)
    if (i > 0) {
      const b = (i - 1) * 2
      // (bottom, next bottom, top) winds towards the axis.
      idx.push(b, b + 2, b + 1, b + 2, b + 3, b + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** A solid curved bar: the ring sector r0..r1, a0..a1, from y0 up h. */
function arcSolid(r0: number, r1: number, a0: number, a1: number, y0: number, h: number) {
  const segs = Math.max(4, Math.round((a1 - a0) * 60))
  const shape = new THREE.Shape()
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs
    // Drawn in XY with Y = -Z; rotateX(-PI/2) lays it flat.
    if (i === 0) shape.moveTo(Math.cos(a) * r1, -Math.sin(a) * r1)
    else shape.lineTo(Math.cos(a) * r1, -Math.sin(a) * r1)
  }
  for (let i = segs; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / segs
    shape.lineTo(Math.cos(a) * r0, -Math.sin(a) * r0)
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g
}

/** Everything that glows: the creed itself, and the instrument round it. */
function paintDisplay() {
  const c = document.createElement('canvas')
  c.width = TW
  c.height = TH
  const ctx = c.getContext('2d')!
  const ls = (px: number) => {
    // letterSpacing is recent; where it is missing the text is just tighter.
    ;(ctx as unknown as { letterSpacing?: string }).letterSpacing = `${px}px`
  }

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, TW, TH)

  // A faint display grid, the only thing that shows the glass is a screen.
  ctx.strokeStyle = 'rgba(201,153,107,0.06)'
  ctx.lineWidth = 1
  for (let x = 0; x <= TW; x += 48) {
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, TH)
    ctx.stroke()
  }
  for (let y = 0; y <= TH; y += 48) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(TW, y + 0.5)
    ctx.stroke()
  }

  const amber = PALETTE.brassHot
  const dim = 'rgba(201,153,107,0.55)'
  const faint = 'rgba(201,153,107,0.28)'
  const ink = '#f4e8d2'

  // ---- left: the silo in plan ------------------------------------------
  const cx = 360
  const cy = TH / 2 + 10
  const R = 270
  ctx.strokeStyle = dim
  ctx.lineWidth = 3
  // The wall, open at the cutaway.
  ctx.beginPath()
  ctx.arc(cx, cy, R, -Math.PI / 2 + 0.5, -Math.PI / 2 - 0.5 + Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = faint
  for (const k of [0.38, 0.62, 0.86]) {
    ctx.beginPath()
    ctx.arc(cx, cy, R * k, 0, Math.PI * 2)
    ctx.stroke()
  }
  // Ribs.
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2
    if (Math.abs(((a + Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.55) continue
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * R * 0.94, cy + Math.sin(a) * R * 0.94)
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
    ctx.stroke()
  }
  // The stair, a spiral round the core.
  ctx.strokeStyle = dim
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i <= 200; i++) {
    const t = i / 200
    const a = t * Math.PI * 4.2
    const r = R * (0.16 + t * 0.07)
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.fillStyle = amber
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.07, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = '600 22px ui-monospace, "Cascadia Mono", Consolas, monospace'
  ls(4)
  ctx.textAlign = 'center'
  ctx.fillStyle = dim
  ctx.fillText('SECTION A  /  PLAN', cx, cy - R - 46)
  ctx.fillText('Ø 44.0 M', cx, cy + R + 62)

  // ---- right: the levels ------------------------------------------------
  const rx = TW - 690
  ctx.textAlign = 'left'
  ctx.font = '600 22px ui-monospace, "Cascadia Mono", Consolas, monospace'
  ls(4)
  ctx.fillStyle = dim
  ctx.fillText('LEVELS', rx, 150)
  ctx.fillRect(rx, 168, 560, 2)
  FLOORS.forEach((f, i) => {
    const y = 214 + i * 58
    const here = f.level === 1
    ctx.fillStyle = here ? amber : faint
    ctx.fillRect(rx, y - 18, here ? 14 : 8, 22)
    ctx.font = `${here ? 700 : 500} 24px ui-monospace, "Cascadia Mono", Consolas, monospace`
    ls(3)
    ctx.fillStyle = here ? ink : dim
    ctx.fillText(String(f.level).padStart(2, '0'), rx + 30, y)
    ctx.fillText(f.name.toUpperCase().replace('—', '·'), rx + 92, y)
  })
  ctx.font = '600 20px ui-monospace, "Cascadia Mono", Consolas, monospace'
  ctx.fillStyle = amber
  ctx.fillText('◀ YOU ARE HERE', rx + 92, 214 + 26)

  // ---- centre: the creed ---------------------------------------------------
  const mx = TW / 2
  ctx.textAlign = 'center'
  ctx.fillStyle = amber
  ctx.font = '700 70px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  ls(22)
  ctx.fillText(CREED_TEXT.title, mx + 11, 128)
  ctx.font = '600 22px ui-monospace, "Cascadia Mono", Consolas, monospace'
  ls(8)
  ctx.fillStyle = dim
  ctx.fillText(CREED_TEXT.subtitle, mx + 4, 172)
  ctx.fillRect(mx - 300, 198, 600, 2)

  // The creed, sized to the column between the plan and the level index:
  // as large as the longest line allows, up to 52 px.
  const column = 1500
  let size = 52
  const lines = CREED_TEXT.stanzas.flat()
  for (; size > 26; size--) {
    ctx.font = `600 ${size}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`
    ls(size * 0.14)
    if (Math.max(...lines.map((l) => ctx.measureText(l).width)) <= column) break
  }
  const lead = Math.round(size * 1.45)
  let y = 270
  CREED_TEXT.stanzas.forEach((stanza, s) => {
    if (s > 0) {
      // A short rule between stanzas.
      ctx.fillStyle = faint
      ctx.fillRect(mx - 40, y - lead * 0.62, 80, 2)
      y += 18
    }
    for (const line of stanza) {
      ctx.fillStyle = ink
      ctx.fillText(line, mx + 3, y)
      y += lead
    }
    y += 14
  })
  // The credit, small, under the last line.
  ctx.font = '600 22px ui-monospace, "Cascadia Mono", Consolas, monospace'
  ls(8)
  ctx.fillStyle = dim
  ctx.fillText(`—  ${CREED_TEXT.credit}`, mx + 4, Math.min(TH - 70, y + 24))

  // Corner registration marks, as on any instrument face.
  ctx.strokeStyle = dim
  ctx.lineWidth = 3
  for (const [x, yy, dx, dy] of [
    [24, 24, 1, 1],
    [TW - 24, 24, -1, 1],
    [24, TH - 24, 1, -1],
    [TW - 24, TH - 24, -1, -1],
  ]) {
    ctx.beginPath()
    ctx.moveTo(x, yy + dy * 40)
    ctx.lineTo(x, yy)
    ctx.lineTo(x + dx * 40, yy)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.generateMipmaps = true
  return tex
}

export default function CreedWall() {
  const state = useRef({ booted: false, bootAt: 0, scanAt: 0 })

  const parts = useMemo(() => {
    const u = { uReveal: { value: -0.05 }, uScan: { value: -1 } }
    const group = new THREE.Group()
    const { from: a0, to: a1, r } = CREED
    const base = FLOOR
    const glassY = base + CREED.plinth
    const glassH = CREED.top - CREED.plinth

    // ---- the display ------------------------------------------------------
    const display = paintDisplay()
    const glass = new THREE.MeshStandardMaterial({
      color: '#0b1114',
      // Satin, not mirror: glossier glass threw the lamps back as hot spots
      // sitting right on top of the words.
      roughness: 0.42,
      metalness: 0.25,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: display,
      emissiveIntensity: 1.15,
    })
    glass.onBeforeCompile = (shader) => {
      shader.uniforms.uReveal = u.uReveal
      shader.uniforms.uScan = u.uScan
      shader.fragmentShader =
        'uniform float uReveal;\nuniform float uScan;\n' +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            // Distance down the glass from its top edge.
            float down = 1.0 - vEmissiveMapUv.y;
            // Asleep it still shows, faintly, so it can be seen across the
            // atrium and draws people over; waking brings it up to full.
            float shown = mix(0.14, 1.0, smoothstep(uReveal + 0.012, uReveal - 0.012, down));
            float edge = exp(-abs(down - uReveal) * 70.0) * step(uReveal, 1.04);
            float scan = exp(-abs(down - uScan) * 160.0) * 0.22;
            totalEmissiveRadiance = totalEmissiveRadiance * shown
              + emissive * (edge * 0.55 + scan) * vec3(1.0, 0.82, 0.58);
          }`,
        )
    }
    glass.customProgramCacheKey = () => 'creed-glass'
    const panel = new THREE.Mesh(curvedPanel(r, a0, a1, glassY, glassH), glass)
    group.add(panel)

    // ---- the housing --------------------------------------------------------
    const steel = new THREE.MeshStandardMaterial({ color: '#2b3033', roughness: 0.42, metalness: 0.75 })
    const satin = new THREE.MeshStandardMaterial({ color: '#555c60', roughness: 0.32, metalness: 0.85 })
    const led = new THREE.MeshStandardMaterial({
      color: '#fff3dc',
      emissive: new THREE.Color('#ffe2b0'),
      emissiveIntensity: 2.6,
      roughness: 0.4,
    })
    const front = r - 0.18
    const back = r + 0.17
    const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
      const mesh = new THREE.Mesh(g, m)
      mesh.castShadow = shadow
      mesh.receiveShadow = true
      group.add(mesh)
    }
    // Plinth, its top a light line, and a recessed kick at the floor.
    add(arcSolid(front, back, a0, a1, base + 0.08, CREED.plinth - 0.08), steel)
    add(arcSolid(front + 0.06, back, a0, a1, base, 0.08), satin)
    add(arcSolid(front - 0.004, front + 0.02, a0 + 0.004, a1 - 0.004, base + CREED.plinth - 0.05, 0.022), led, false)
    // Header, with a light line along its underside washing down the glass.
    add(arcSolid(front, back, a0, a1, base + CREED.top, 0.26), steel)
    add(arcSolid(front + 0.02, front + 0.06, a0 + 0.004, a1 - 0.004, base + CREED.top - 0.025, 0.025), led, false)
    // Fins at both ends, standing proud of the glass, each with a lit edge.
    const fin = 0.016
    for (const [f0, f1, side] of [
      [a0 - fin, a0, 1],
      [a1, a1 + fin, -1],
    ] as const) {
      add(arcSolid(front - 0.12, back, f0, f1, base, CREED.top + 0.26), satin)
      const edgeA = side === 1 ? f1 - 0.0025 : f0
      add(arcSolid(front - 0.125, front - 0.1, edgeA, edgeA + 0.0025, base + 0.1, CREED.top + 0.06), led, false)
    }
    // Mullions: hairline steel dividers over the glass, so it reads as a run
    // of panels rather than one sheet. Placed clear of the text column.
    const span = a1 - a0
    for (const t of [0.235, 0.765]) {
      const a = a0 + span * t
      add(arcSolid(r - 0.035, r - 0.005, a - 0.0012, a + 0.0012, glassY, glassH), satin, false)
    }
    return { group, glass, u }
  }, [])

  useFrame((s) => {
    const st = state.current
    const t = s.clock.elapsedTime
    const { u, glass } = parts
    const silo = useSilo.getState()
    const reduced = silo.reducedMotion

    if (!st.booted) {
      // Boots when someone on level 1 comes within range.
      const cam = s.camera.position
      const mid = (CREED.from + CREED.to) / 2
      const dx = cam.x - Math.cos(mid) * CREED.r
      const dz = cam.z - Math.sin(mid) * CREED.r
      if (silo.level === 1 && Math.hypot(dx, dz) < CREED.wakeDistance) {
        st.booted = true
        st.bootAt = t
        st.scanAt = t + 9
      }
      u.uReveal.value = -0.05
      return
    }
    if (reduced) {
      u.uReveal.value = 1.1
      u.uScan.value = -1
      return
    }
    // The boot scan, top to bottom over four seconds.
    u.uReveal.value = Math.min(1.1, -0.05 + ((t - st.bootAt) / 4) * 1.15)
    // Then a slow pass every eleven seconds.
    const since = t - st.scanAt
    if (since > 11) st.scanAt = t
    u.uScan.value = since < 3.2 ? -0.05 + (since / 3.2) * 1.1 : -1
    // A faint breath in the light, and now and then -- when two slow waves
    // happen to peak together, every minute or so -- a stutter.
    const rare = Math.sin(t * 0.37) * Math.sin(t * 1.13) > 0.985
    const stutter = rare && Math.sin(t * 57) > 0 ? -0.3 : 0
    glass.emissiveIntensity = 1.1 + Math.sin(t * 0.7) * 0.05 + stutter
  })

  return <primitive object={parts.group} />
}
