import { useMemo } from 'react'
import * as THREE from 'three'
import { FLOORS, PALETTE, floorByLevel, walkY } from '../../content/floors'
import { RECORD_WALL, recordWallSpan } from '../../content/layout'
import { levelRecord, type LevelRecord, type RecordItem } from '../../content/records'
import { useSilo } from '../../state/useSilo'
import WallDisplay from '../WallDisplay'

/**
 * Each level's record on the wall the bridge lands facing: the same display
 * as the creed wall, painted from `levelRecord` -- the structure the HTML
 * record panel reads too, so the wall and the panel cannot disagree.
 *
 * The wall shows what can be read standing in front of it. Links and code are
 * left to the panel, and the layout picks the largest type and fewest columns
 * that fit, so a level with one posting reads big and the laboratory, with
 * eight entries, still fits.
 */

const TW = 3072
const TH = 1072
const MX = 120
const TOP = 300
const BOTTOM = TH - 70
const GUTTER = 80

const INK = '#f4e8d2'
const DIM = 'rgba(201,153,107,0.62)'
const FAINT = 'rgba(201,153,107,0.28)'
const AMBER = PALETTE.brassHot
const SANS = '"Segoe UI", "Helvetica Neue", Arial, sans-serif'
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace'

type Ctx = CanvasRenderingContext2D

const spacing = (ctx: Ctx, px: number) => {
  // letterSpacing is recent; where it is missing the text is just tighter.
  ;(ctx as unknown as { letterSpacing?: string }).letterSpacing = `${px}px`
}

function wrap(ctx: Ctx, text: string, width: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > width && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** Lay out (and, if `draw`, paint) one item; returns its height. */
function item(ctx: Ctx, it: RecordItem, x: number, y0: number, w: number, s: number, draw: boolean) {
  let y = y0
  const gap = 12 * s
  const text = (str: string, font: string, color: string, lh: number, indent = 0, track = 0) => {
    ctx.font = font
    spacing(ctx, track)
    const lines = wrap(ctx, str, w - indent)
    for (const l of lines) {
      y += lh
      if (draw) {
        ctx.fillStyle = color
        ctx.fillText(l, x + indent, y - lh * 0.24)
      }
    }
    return lines.length
  }

  if (it.title) {
    text(it.title, `700 ${34 * s}px ${SANS}`, INK, 42 * s, 0, 1)
    y += 4 * s
  }
  if (it.meta) {
    text(it.meta, `600 ${20 * s}px ${MONO}`, DIM, 28 * s, 0, 2)
    y += gap * 0.6
  }
  if (it.text) {
    text(it.text, `400 ${26 * s}px ${SANS}`, 'rgba(244,232,210,0.86)', 36 * s)
    y += gap
  }
  if (it.figures?.length) {
    // As many to a row as the column takes without the numbers colliding.
    const per = Math.max(1, Math.min(4, it.figures.length, Math.floor(w / (230 * s))))
    const cw = w / per
    it.figures.forEach(([value, label], i) => {
      const col = i % per
      if (col === 0 && i > 0) y += 96 * s
      if (draw) {
        const fx = x + col * cw
        // Shrunk to its cell if a long figure ("16 of 8,213") would spill.
        let vs = 52 * s
        ctx.font = `700 ${vs}px ${SANS}`
        spacing(ctx, 1)
        while (ctx.measureText(value).width > cw - 20 * s && vs > 20) {
          vs -= 2
          ctx.font = `700 ${vs}px ${SANS}`
        }
        ctx.fillStyle = AMBER
        ctx.fillText(value, fx, y + 52 * s)
        ctx.font = `600 ${17 * s}px ${MONO}`
        spacing(ctx, 2)
        ctx.fillStyle = DIM
        for (const [k, l] of wrap(ctx, label.toUpperCase(), cw - 16 * s).slice(0, 2).entries()) {
          ctx.fillText(l, fx, y + 80 * s + k * 22 * s)
        }
      }
    })
    y += 110 * s + gap
  }
  if (it.bullets?.length) {
    for (const b of it.bullets) {
      const startY = y
      text(b, `400 ${24 * s}px ${SANS}`, 'rgba(244,232,210,0.8)', 33 * s, 26 * s)
      if (draw) {
        ctx.fillStyle = AMBER
        ctx.fillRect(x + 2 * s, startY + 17 * s, 12 * s, 3 * s)
      }
      y += 6 * s
    }
    y += gap * 0.5
  }
  if (it.tags?.length) {
    ctx.font = `600 ${19 * s}px ${MONO}`
    spacing(ctx, 1)
    const h = 34 * s
    const pad = 12 * s
    let cx = x
    let row = 0
    for (const t of it.tags) {
      const tw = ctx.measureText(t).width + pad * 2
      if (cx + tw > x + w && cx > x) {
        cx = x
        row++
      }
      if (draw) {
        const ty = y + row * (h + 8 * s)
        ctx.strokeStyle = FAINT
        ctx.lineWidth = 2
        ctx.strokeRect(cx, ty, tw, h)
        ctx.fillStyle = 'rgba(244,232,210,0.82)'
        ctx.fillText(t, cx + pad, ty + h * 0.68)
      }
      cx += tw + 8 * s
    }
    y += (row + 1) * (h + 8 * s) + gap * 0.4
  }
  return y - y0
}

interface Block {
  heading?: string
  item?: RecordItem
}

function heading(ctx: Ctx, text: string, x: number, y: number, w: number, s: number, draw: boolean) {
  if (draw) {
    ctx.font = `700 ${22 * s}px ${MONO}`
    spacing(ctx, 5 * s)
    ctx.fillStyle = AMBER
    ctx.fillText(text.toUpperCase(), x, y + 24 * s)
    ctx.fillStyle = FAINT
    ctx.fillRect(x, y + 38 * s, w, 2)
  }
  return 62 * s
}

/** Flow the blocks into `cols` columns at scale `s`. False if they overflow. */
function flow(ctx: Ctx, blocks: Block[], cols: number, s: number, draw: boolean) {
  const w = (TW - MX * 2 - GUTTER * (cols - 1)) / cols
  let col = 0
  let y = TOP
  const after = 26 * s
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    // A heading travels with the item under it.
    let h = 0
    if (b.heading) {
      h = heading(ctx, b.heading, 0, 0, w, s, false)
      const next = blocks[i + 1]
      if (next?.item) h += item(ctx, next.item, 0, 0, w, s, false)
    } else if (b.item) h = item(ctx, b.item, 0, 0, w, s, false) + after
    if (h > BOTTOM - TOP) return false
    if (y + h > BOTTOM) {
      col++
      y = TOP
      if (col >= cols) return false
    }
    const x = MX + col * (w + GUTTER)
    if (b.heading) y += heading(ctx, b.heading, x, y, w, s, draw)
    else if (b.item) y += item(ctx, b.item, x, y, w, s, draw) + after
  }
  return true
}

function paintRecord(rec: LevelRecord) {
  const c = document.createElement('canvas')
  c.width = TW
  c.height = TH
  const ctx = c.getContext('2d')!

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, TW, TH)
  // A faint display grid, the only thing that shows the glass is a screen.
  ctx.strokeStyle = 'rgba(201,153,107,0.05)'
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

  // ---- header ---------------------------------------------------------------
  // The level, large, at the right: this is the floor's sign now. The plate
  // that used to stand at the end of the bridge was in the way of this very
  // display and could not be read from the deck.
  const num = String(rec.level).padStart(2, '0')
  ctx.textAlign = 'right'
  ctx.font = `800 210px ${SANS}`
  spacing(ctx, 4)
  ctx.fillStyle = AMBER
  ctx.fillText(num, TW - MX + 4, 236)
  const numW = ctx.measureText(num).width
  ctx.font = `700 26px ${MONO}`
  spacing(ctx, 10)
  ctx.fillStyle = DIM
  ctx.fillText('LEVEL', TW - MX - numW - 34, 236)
  ctx.fillStyle = FAINT
  ctx.fillRect(TW - MX - numW - 18, 70, 2, 170)

  ctx.textAlign = 'left'
  // The floor's name over the record's title -- unless they are the same.
  const name = floorByLevel(rec.level).name
  if (name.toUpperCase() !== rec.title.toUpperCase()) {
    ctx.font = `700 26px ${MONO}`
    spacing(ctx, 7)
    ctx.fillStyle = DIM
    ctx.fillText(name.toUpperCase(), MX, 100)
  }
  ctx.font = `700 72px ${SANS}`
  spacing(ctx, 8)
  ctx.fillStyle = INK
  ctx.fillText(rec.title.toUpperCase(), MX, 186)
  if (rec.subtitle) {
    ctx.font = `600 26px ${MONO}`
    spacing(ctx, 3)
    ctx.fillStyle = DIM
    ctx.fillText(rec.subtitle.toUpperCase(), MX, 236)
  }
  ctx.fillStyle = FAINT
  ctx.fillRect(MX, 266, TW - MX * 2, 2)

  // ---- body -----------------------------------------------------------------
  if (rec.empty) {
    ctx.textAlign = 'center'
    ctx.font = `700 40px ${MONO}`
    spacing(ctx, 10)
    ctx.fillStyle = DIM
    ctx.fillText('NO RECORD ON FILE', TW / 2, TH / 2 + 60)
    ctx.textAlign = 'left'
  } else {
    const blocks: Block[] = []
    for (const sec of rec.sections) {
      const items = sec.items.filter((i) => !i.panelOnly)
      if (!items.length) continue
      if (sec.heading) blocks.push({ heading: sec.heading })
      for (const it of items) blocks.push({ item: it })
    }
    // The largest type, then the fewest columns, that fit.
    let done = false
    // A short record (one posting) can be read from across the deck.
    for (let s = 1.8; s >= 0.4 && !done; s -= 0.05) {
      for (const cols of [1, 2, 3, 4]) {
        // One column only for a short record: lines across 13 m are unreadable.
        if (cols === 1 && blocks.length > 2) continue
        if (flow(ctx, blocks, cols, s, false)) {
          flow(ctx, blocks, cols, s, true)
          done = true
          break
        }
      }
    }
  }

  // Corner registration marks, as on any instrument face.
  ctx.strokeStyle = DIM
  ctx.lineWidth = 3
  for (const [x, y, dx, dy] of [
    [24, 24, 1, 1],
    [TW - 24, 24, -1, 1],
    [24, TH - 24, 1, -1],
    [TW - 24, TH - 24, -1, -1],
  ]) {
    ctx.beginPath()
    ctx.moveTo(x, y + dy * 40)
    ctx.lineTo(x, y)
    ctx.lineTo(x + dx * 40, y)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function RecordWall({ level }: { level: number }) {
  const span = recordWallSpan(level)
  const paint = useMemo(() => () => paintRecord(levelRecord(level)), [level])
  return (
    <WallDisplay
      from={span.from}
      to={span.to}
      r={RECORD_WALL.r}
      floor={walkY(level)}
      plinth={RECORD_WALL.plinth}
      top={RECORD_WALL.top}
      level={level}
      paint={paint}
    />
  )
}

/** The record displays on the level the visitor is on and the two either
 *  side -- the ones close enough to be seen. */
export default function RecordWalls() {
  const level = useSilo((s) => s.level)
  return (
    <>
      {FLOORS.filter((f) => f.level > 1 && Math.abs(f.level - level) <= 1).map((f) => (
        <RecordWall key={f.level} level={f.level} />
      ))}
    </>
  )
}
