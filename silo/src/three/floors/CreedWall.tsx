import * as THREE from 'three'
import { FLOORS, PALETTE } from '../../content/floors'
import { CREED, CREED_TEXT, FLOOR } from '../../content/level1'
import WallDisplay from '../WallDisplay'

/**
 * The creed wall: what the silo tells itself, set into the level 1 wall
 * opposite the bridge. The display itself -- glass, housing, waking -- is
 * `WallDisplay`; this file paints what it shows.
 */

/** Canvas size. The glass is about 13 m by 4.6 m; this keeps the aspect. */
const TW = 3072
const TH = 1072

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

  // ---- top left: the level, large -----------------------------------------
  // This is the floor's sign: the plate on a post at the end of the bridge
  // stood in front of this wall and could not be read from the deck. The
  // name keeps left of the first mullion, at 0.235 of the width.
  {
    const level = FLOORS[0]
    const num = String(level.level).padStart(2, '0')
    ctx.textAlign = 'left'
    ctx.font = '600 24px ui-monospace, "Cascadia Mono", Consolas, monospace'
    ls(10)
    ctx.fillStyle = dim
    ctx.fillText('LEVEL', 100, 84)
    ctx.font = '800 200px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    ls(4)
    ctx.fillStyle = amber
    ctx.fillText(num, 88, 280)
    const nx = 100 + ctx.measureText(num).width + 24
    ctx.font = '700 34px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    ls(4)
    ctx.fillStyle = ink
    const words = level.name.toUpperCase().split(' ')
    const lines: string[] = []
    for (const w of words) {
      const last = lines[lines.length - 1]
      if (last && ctx.measureText(`${last} ${w}`).width <= 660 - nx) lines[lines.length - 1] = `${last} ${w}`
      else lines.push(w)
    }
    lines.forEach((l, i) => ctx.fillText(l, nx, 196 + i * 46 - (lines.length - 2) * 23))
  }

  // ---- left: the silo in plan ------------------------------------------
  const cx = 360
  const cy = 650
  const R = 200
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
  return (
    <WallDisplay
      from={CREED.from}
      to={CREED.to}
      r={CREED.r}
      floor={FLOOR}
      plinth={CREED.plinth}
      top={CREED.top}
      level={1}
      wakeDistance={CREED.wakeDistance}
      paint={paintDisplay}
      // Clear of the text column, between it and the plan and the index.
      mullions={[0.235, 0.765]}
    />
  )
}
