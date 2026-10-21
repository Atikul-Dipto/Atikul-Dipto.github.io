import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { period } from '../../content/records'
import { skillGroups, sqlQueries } from '../../content/portfolio'
import { toolIcons, type ToolIcon } from '../../content/toolIcons'
import { PLINTH, ROOM, ROOM_GATE, wallRoomsOn, type WallRoom } from '../../content/wallRooms'
import { useSilo } from '../../state/useSilo'
import { canvasTexture, framed, gatePassage, roomShell } from '../roomKit'

/**
 * THE CAREERS AND SKILLS FLOORS, drawn from content/wallRooms.ts.
 *
 * Every room is the same shell -- dark panelling, a gate ringed in the room's
 * own colour, light strips along the walls -- and what is in it depends on
 * its kind: a posting's duties and tools on three screens, the tools' logos
 * floating in the air, the analysis on standing screens, the soft skills in
 * rings round a light. Every word on the screens comes from portfolio.ts.
 */

/** Height of the hologram's centre over the floor. */
const HOLO_Y = PLINTH.h + 0.95
/** Height of the screens' centres: above the hologram, still at reading height. */
const SCREEN_Y = 3.15

const SANS = '"Segoe UI", "Helvetica Neue", Arial, sans-serif'
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace'

// ---- drawing text on a canvas ----------------------------------------------

/** Lines of `text` no wider than `max` in the context's current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > max && line) {
      out.push(line)
      line = word
    } else line = next
  }
  if (line) out.push(line)
  return out
}

/** Pill-shaped chips, flowing left to right; returns the y below them. */
function chips(ctx: CanvasRenderingContext2D, items: string[], x0: number, y0: number, maxX: number, accent: string, size = 30) {
  ctx.font = `600 ${size}px ${SANS}`
  const h = size * 1.7
  let x = x0
  let y = y0
  for (const it of items) {
    const w = ctx.measureText(it).width + size * 1.2
    if (x + w > maxX && x > x0) {
      x = x0
      y += h + size * 0.45
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, h / 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#eef6fb'
    ctx.textBaseline = 'middle'
    ctx.fillText(it, x + size * 0.6, y + h / 2 + 1)
    x += w + size * 0.45
  }
  ctx.textBaseline = 'alphabetic'
  return y + h
}

/** A screen's backdrop: dark glass, a frame line in the accent, scan lines. */
function screenBack(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, heading: string) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#0b1118')
  g.addColorStop(1, '#05080c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.025)'
  for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2)
  ctx.strokeStyle = accent
  ctx.globalAlpha = 0.85
  ctx.lineWidth = 6
  ctx.strokeRect(10, 10, w - 20, h - 20)
  ctx.globalAlpha = 1
  ctx.fillStyle = accent
  ctx.fillRect(10, 10, 220, 10)
  ctx.font = `700 34px ${MONO}`
  ctx.fillText(heading, 60, 90)
  ctx.fillRect(60, 110, 120, 4)
}

/** A flat screen in the room's frame, facing the room's centre. */
function screen(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, pw: number, ph: number) => void, dim: boolean) {
  const pw = 2048
  const ph = Math.round((pw * h) / w)
  const tex = canvasTexture(pw, ph, (ctx) => paint(ctx, pw, ph))
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: dim ? '#9aa3ad' : '#ffffff' })
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
}

/** Put a mesh on a wall of the room: 'back', 'left' or 'right', centred at
 *  `along` (d for the sides, s for the back) and `y`. */
function onWall(m: THREE.Object3D, wall: 'back' | 'left' | 'right' | 'front', along: number, y: number) {
  const inset = 0.04
  if (wall === 'back') {
    m.position.set(along, y, -ROOM.to + inset)
  } else if (wall === 'front') {
    m.position.set(along, y, -ROOM.from - inset)
    m.rotation.y = Math.PI
  } else {
    const side = wall === 'left' ? -1 : 1
    m.position.set(side * (ROOM.half - inset), y, -along)
    m.rotation.y = -side * (Math.PI / 2)
  }
  return m
}

// ---- the shell ---------------------------------------------------------------

/** Dark wall panelling: a grid of panels with fine seams. */
function panelling(color: string) {
  const t = canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 512, 512)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.fillRect(0, 0, 512, 6)
    ctx.fillRect(0, 0, 6, 512)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 252, 512, 4)
  })
  t.repeat.set(ROOM.half / 1.5, ROOM.height / 2)
  return t
}

/** The floor: dark plates with a grid of glowing lines in the accent. */
function floorGrid(accent: string) {
  const make = (lines: boolean) =>
    canvasTexture(512, 512, (ctx) => {
      ctx.fillStyle = lines ? '#000' : '#0c1015'
      ctx.fillRect(0, 0, 512, 512)
      ctx.strokeStyle = lines ? accent : 'rgba(255,255,255,0.06)'
      ctx.lineWidth = lines ? 3 : 2
      ctx.strokeRect(0, 0, 512, 512)
    })
  const map = make(false)
  const glow = make(true)
  for (const t of [map, glow]) t.repeat.set(ROOM.half, ROOM.to / 2)
  return { map, glow }
}

function shell(room: WallRoom) {
  const { theme, lit } = room
  const g = framed(room.frame)
  const wall = new THREE.MeshStandardMaterial({ color: theme.wall, map: panelling(theme.wall), roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide })
  const grid = floorGrid(theme.accent)
  const floor = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: grid.map,
    emissive: new THREE.Color(theme.accent),
    emissiveMap: grid.glow,
    emissiveIntensity: lit ? 0.5 : 0.18,
    roughness: 0.4,
    metalness: 0.5,
  })
  const ceil = new THREE.MeshStandardMaterial({ color: '#0d1117', roughness: 0.8, side: THREE.DoubleSide })
  roomShell(g, ROOM, ROOM_GATE, { wall, floor, ceil })

  // The gate: a dark lining, ringed in the room's colour, which glows.
  const lining = new THREE.MeshStandardMaterial({ color: '#232a33', roughness: 0.5, metalness: 0.6 })
  const ring = new THREE.MeshBasicMaterial({ color: theme.accent, toneMapped: false })
  g.add(gatePassage(ROOM_GATE, lining, ring))

  // Its name over the door, on the deck side.
  const sign = screen(
    4.6,
    0.62,
    (ctx, w, h) => {
      ctx.fillStyle = '#05080c'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = theme.accent
      ctx.font = `700 ${Math.round(h * 0.42)}px ${MONO}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(room.sign, w / 2, h / 2 + 4, w - 60)
    },
    false,
  )
  sign.position.set(0, ROOM_GATE.centre + ROOM_GATE.halfH + 0.62, 0.14)
  g.add(sign)

  // Light strips: along the foot of each wall, and under the ceiling.
  const strip = new THREE.MeshBasicMaterial({ color: theme.accent, toneMapped: false, transparent: true, opacity: lit ? 1 : 0.45 })
  const len = ROOM.to - ROOM.from
  for (const side of [-1, 1]) {
    for (const y of [0.12, ROOM.height - 0.25]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), strip)
      m.position.set(side * (ROOM.half - 0.05), y, -(ROOM.from + ROOM.to) / 2)
      g.add(m)
    }
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(ROOM.half * 2, 0.05, 0.05), strip)
  back.position.set(0, ROOM.height - 0.25, -ROOM.to + 0.05)
  g.add(back)

  // Ceiling panels: lit in a lit room, faint in a dark one.
  const panel = new THREE.MeshBasicMaterial({ color: lit ? '#e8f4ff' : '#1b232c', toneMapped: !lit })
  for (const d of [3.4, 6.8, 10.2]) {
    for (const s of [-3, 3]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.5), panel)
      p.rotation.x = Math.PI / 2
      p.position.set(s, ROOM.height - 0.02, -d)
      g.add(p)
    }
  }

  // The lights themselves. LightPool takes the strongest near the camera.
  const tint = new THREE.Color('#ffffff').lerp(new THREE.Color(theme.accent), 0.35)
  if (lit) {
    for (const d of [4.2, 10.4]) {
      const l = new THREE.PointLight(tint, 26, 15, 2)
      l.position.set(0, ROOM.height - 0.8, -d)
      g.add(l)
    }
  } else {
    const l = new THREE.PointLight(theme.accent, 4, 9, 2)
    l.position.set(0, 2.2, -PLINTH.d)
    g.add(l)
  }

  // The plinth at the centre.
  const metal = new THREE.MeshStandardMaterial({ color: '#2a3038', roughness: 0.35, metalness: 0.85 })
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(PLINTH.r, PLINTH.r + 0.12, PLINTH.h, 48), metal)
  plinth.position.set(0, PLINTH.h / 2, -PLINTH.d)
  g.add(plinth)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(PLINTH.r - 0.08, 0.025, 8, 64), ring)
  rim.rotation.x = Math.PI / 2
  rim.position.set(0, PLINTH.h + 0.01, -PLINTH.d)
  g.add(rim)
  return g
}

// ---- holograms ------------------------------------------------------------------

/** An abstract light over the plinth -- decoration, never a chart. */
function hologram(room: WallRoom) {
  const g = new THREE.Group()
  // Small and low, so it does not stand between the door and the screens.
  g.position.set(0, HOLO_Y, -PLINTH.d)
  g.scale.setScalar(0.62)
  const mat = new THREE.MeshBasicMaterial({ color: room.theme.accent, wireframe: true, transparent: true, opacity: room.lit ? 0.9 : 0.45, toneMapped: false })
  const core =
    room.kind === 'analytics'
      ? new THREE.TorusKnotGeometry(0.55, 0.14, 120, 10)
      : room.kind === 'soft'
        ? new THREE.SphereGeometry(0.6, 18, 12)
        : new THREE.IcosahedronGeometry(0.75, 1)
  const shape = new THREE.Mesh(core, mat)
  shape.name = 'spin'
  g.add(shape)
  const ringMat = new THREE.MeshBasicMaterial({ color: room.theme.accent, transparent: true, opacity: room.lit ? 0.7 : 0.3, toneMapped: false })
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.15 + i * 0.25, 0.012, 6, 96), ringMat)
    r.name = i ? 'orbitB' : 'orbitA'
    r.rotation.x = Math.PI / 2 + (i ? 0.5 : -0.35)
    g.add(r)
  }
  // A cone of light up from the plinth.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, (PLINTH.r - 0.1) / 0.62, 1.6, 40, 1, true),
    new THREE.MeshBasicMaterial({ color: room.theme.accent, transparent: true, opacity: room.lit ? 0.07 : 0.04, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
  )
  beam.position.y = -0.25
  g.add(beam)
  return g
}

// ---- what each kind of room holds ----------------------------------------------

function postingContent(room: WallRoom, g: THREE.Group) {
  const e = room.posting!
  const a = room.theme.accent
  const dim = !room.lit
  // The back wall: who, what, when.
  g.add(
    onWall(
      screen(
        9.4,
        3.4,
        (ctx, w, h) => {
          screenBack(ctx, w, h, a, e.end ? 'POSTING  ·  CONCLUDED' : 'POSTING  ·  CURRENT')
          ctx.fillStyle = '#ffffff'
          ctx.font = `800 150px ${SANS}`
          ctx.fillText(e.org, 60, 330, w - 120)
          ctx.fillStyle = a
          ctx.font = `600 70px ${SANS}`
          ctx.fillText(e.role, 64, 440, w - 120)
          ctx.fillStyle = '#c7d3dd'
          ctx.font = `500 46px ${MONO}`
          ctx.fillText([period(e), e.location].join('   ·   '), 64, 540, w - 120)
          const note = [e.engagement, e.orgNote].filter(Boolean).join('  ·  ')
          if (note) {
            ctx.font = `italic 400 40px ${SANS}`
            ctx.fillText(note, 64, 610, w - 120)
          }
          if (!e.end) {
            ctx.fillStyle = a
            ctx.beginPath()
            ctx.arc(w - 110, 80, 18, 0, Math.PI * 2)
            ctx.fill()
            ctx.font = `700 34px ${MONO}`
            ctx.textAlign = 'right'
            ctx.fillText('ON DUTY', w - 150, 92)
            ctx.textAlign = 'left'
          }
        },
        dim,
      ),
      'back',
      0,
      SCREEN_Y,
    ),
  )
  // The left wall: the role.
  g.add(
    onWall(
      screen(
        8.6,
        3.4,
        (ctx, w, h) => {
          screenBack(ctx, w, h, a, 'THE ROLE')
          ctx.font = `500 50px ${SANS}`
          let y = 210
          for (const r of e.responsibilities) {
            ctx.fillStyle = a
            ctx.fillRect(64, y - 30, 14, 14)
            ctx.fillStyle = '#e8eef3'
            for (const line of wrap(ctx, r, w - 200)) {
              ctx.fillText(line, 110, y)
              y += 64
            }
            y += 30
          }
        },
        dim,
      ),
      'left',
      7.4,
      SCREEN_Y,
    ),
  )
  // The right wall: the tools, and what was accomplished and learned once
  // those are on record.
  const done = [...(e.achievements ?? [])]
  const learned = [...(e.learned ?? [])]
  g.add(
    onWall(
      screen(
        8.6,
        3.4,
        (ctx, w, h) => {
          screenBack(ctx, w, h, a, 'TOOLS ON THE JOB')
          let y = chips(ctx, e.tools ?? [], 64, 170, w - 64, a, 40) + 60
          for (const [heading, list] of [
            ['ACCOMPLISHED', done],
            ['LEARNED', learned],
          ] as const) {
            if (!list.length) continue
            ctx.fillStyle = a
            ctx.font = `700 34px ${MONO}`
            ctx.fillText(heading, 64, y)
            y += 60
            ctx.font = `500 44px ${SANS}`
            ctx.fillStyle = '#e8eef3'
            for (const it of list) {
              for (const line of wrap(ctx, `—  ${it}`, w - 160)) {
                ctx.fillText(line, 64, y)
                y += 56
              }
            }
            y += 30
          }
        },
        dim,
      ),
      'right',
      7.4,
      SCREEN_Y,
    ),
  )
}

/** Skill groups as screens on the walls: a heading and a set of chips each. */
function groupScreens(room: WallRoom, g: THREE.Group, groups: { group: string; items: string[] }[], walls: Array<['back' | 'left' | 'right' | 'front', number]>) {
  groups.forEach((grp, i) => {
    const [wall, along] = walls[i]
    const w = wall === 'back' ? 3.9 : 3.6
    g.add(
      onWall(
        screen(
          w,
          2.3,
          (ctx, pw, ph) => {
            screenBack(ctx, pw, ph, room.theme.accent, grp.group.toUpperCase())
            chips(ctx, grp.items, 64, 180, pw - 64, room.theme.accent, 54)
          },
          false,
        ),
        wall,
        along,
        SCREEN_Y,
      ),
    )
  })
}

function slug(name: string) {
  const s = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return ({ apachesuperset: 'superset', d3js: 'd3', kobotoolbox: 'kobo', microsoftexcel: 'excel' } as Record<string, string>)[s] ?? s
}

/** Every tool's logo in one texture: a dark tile, the glyph in the brand's
 *  colour (or its lettermark), the name under it. */
function logoAtlas(names: string[], accent: string) {
  const cols = 8
  const cell = 256
  const rows = Math.ceil(names.length / cols)
  const tex = canvasTexture(cols * cell, rows * cell, (ctx) => {
    names.forEach((name, i) => {
      const x = (i % cols) * cell
      const y = Math.floor(i / cols) * cell
      const icon: ToolIcon | undefined = toolIcons[slug(name)]
      const colour = `#${icon?.darkHex ?? icon?.hex ?? 'cfd8e0'}`
      ctx.fillStyle = 'rgba(8,14,22,0.92)'
      ctx.strokeStyle = accent
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.roundRect(x + 10, y + 10, cell - 20, cell - 20, 34)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = colour
      if (icon?.path) {
        ctx.save()
        ctx.translate(x + cell / 2 - 60, y + 36)
        ctx.scale(5, 5)
        ctx.fill(new Path2D(icon.path))
        ctx.restore()
      } else {
        const mono = icon?.mono ?? name.slice(0, 2)
        ctx.font = `800 ${mono.length > 2 ? 64 : 92}px ${SANS}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(mono, x + cell / 2, y + 98)
        ctx.textBaseline = 'alphabetic'
        ctx.textAlign = 'left'
      }
      ctx.fillStyle = '#e8eef3'
      ctx.font = `600 28px ${SANS}`
      ctx.textAlign = 'center'
      ctx.fillText(name, x + cell / 2, y + cell - 34, cell - 36)
      ctx.textAlign = 'left'
    })
  })
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return { tex, cols, rows }
}

/** The tools' logos, floating through the room at and above head height. */
function floatingLogos(room: WallRoom, g: THREE.Group) {
  const names = skillGroups.software.flatMap((grp) => grp.items)
  const { tex, cols, rows } = logoAtlas(names, room.theme.accent)
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide })
  const floaters = new THREE.Group()
  floaters.name = 'floaters'
  // A loose lattice through the room, kept off the walls and the plinth's beam.
  names.forEach((_, i) => {
    const geo = new THREE.PlaneGeometry(0.72, 0.72)
    const u0 = (i % cols) / cols
    const v1 = 1 - Math.floor(i / cols) / rows
    const uv = geo.attributes.uv as THREE.BufferAttribute
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / cols, v1 - (1 - uv.getY(k)) / rows)
    const m = new THREE.Mesh(geo, mat)
    // Six across, rows going back from 4.5 m in; heights staggered, all
    // above head height so nobody walks into one.
    const col = i % 6
    const row = Math.floor(i / 6)
    const lines = Math.ceil(names.length / 6)
    const s = -4.2 + (col + (row % 2) * 0.5) * (8.4 / 6.5)
    const d = 4.5 + (row / Math.max(1, lines - 1)) * 8
    m.position.set(s, 2.3 + ((i * 7) % 5) * 0.55, -d)
    m.userData.base = m.position.y
    m.userData.phase = i * 0.7
    floaters.add(m)
  })
  g.add(floaters)
  groupScreens(room, g, skillGroups.software.slice(0, 3), [
    ['left', 3.6],
    ['left', 7.6],
    ['left', 11.6],
  ])
  groupScreens(room, g, skillGroups.software.slice(3), [
    ['right', 3.6],
    ['right', 7.6],
    ['right', 11.6],
  ])
}

/** Words on small glass cards, in a ring round the plinth -- one ring per group. */
function wordRings(room: WallRoom, g: THREE.Group, groups: { group: string; items: string[] }[]) {
  const rings = new THREE.Group()
  rings.name = 'rings'
  rings.position.set(0, 0, -PLINTH.d)
  groups.forEach((grp, gi) => {
    const ring = new THREE.Group()
    ring.position.y = 2.25 + gi * 0.85
    ring.userData.speed = (gi % 2 ? -1 : 1) * (0.07 + gi * 0.02)
    grp.items.forEach((item, i) => {
      const card = screen(
        1.5,
        0.32,
        (ctx, w, h) => {
          ctx.fillStyle = 'rgba(6,12,10,0.9)'
          ctx.fillRect(0, 0, w, h)
          ctx.strokeStyle = room.theme.accent
          ctx.lineWidth = 10
          ctx.strokeRect(5, 5, w - 10, h - 10)
          ctx.fillStyle = '#eafff4'
          ctx.font = `600 ${Math.round(h * 0.42)}px ${SANS}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(item, w / 2, h / 2 + 4, w - 60)
        },
        false,
      )
      const a = (i / grp.items.length) * Math.PI * 2
      const r = 3.0 + gi * 0.35
      card.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
      card.rotation.y = -a - Math.PI / 2
      ;(card.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide
      ring.add(card)
    })
    rings.add(ring)
  })
  g.add(rings)
}

function sqlScreen(room: WallRoom, g: THREE.Group) {
  g.add(
    onWall(
      screen(
        9.4,
        3.0,
        (ctx, w, h) => {
          screenBack(ctx, w, h, room.theme.accent, 'SQL  ·  QUESTIONS ANSWERED IN MY OWN PROJECTS')
          let y = 200
          for (const q of sqlQueries) {
            ctx.fillStyle = room.theme.accent
            ctx.font = `700 40px ${SANS}`
            ctx.fillText(q.title, 64, y, w - 128)
            ctx.fillStyle = '#d9e2ea'
            ctx.font = `400 34px ${SANS}`
            ctx.fillText(`${q.question}   (${q.project}, ${q.dialect})`, 64, y + 46, w - 128)
            y += 120
            if (y > h - 60) break
          }
        },
        false,
      ),
      'back',
      0,
      SCREEN_Y,
    ),
  )
}

function build(room: WallRoom) {
  const g = shell(room)
  const holo = hologram(room)
  holo.name = 'holo'
  g.add(holo)
  if (room.kind === 'posting') postingContent(room, g)
  else if (room.kind === 'tools') floatingLogos(room, g)
  else if (room.kind === 'analytics') {
    groupScreens(room, g, skillGroups.analytics, [
      ['left', 5.5],
      ['right', 5.5],
      ['left', 10.5],
    ])
    sqlScreen(room, g)
  } else {
    wordRings(room, g, skillGroups.soft)
    groupScreens(room, g, skillGroups.soft, [
      ['left', 5.5],
      ['back', 0],
      ['right', 5.5],
    ])
  }
  return g
}

// ---- the component -----------------------------------------------------------

const camPos = new THREE.Vector3()
const roomPos = new THREE.Vector3()

function Room({ room }: { room: WallRoom }) {
  const group = useMemo(() => build(room), [room])
  const phase = useSilo((s) => s.phase)
  const t = useRef(0)

  // Behind the wall, so not drawn on the approach.
  useEffect(() => {
    group.visible = phase !== 'exterior' && phase !== 'boot'
  }, [group, phase])

  useFrame(({ camera }, dt) => {
    if (!group.visible) return
    camera.getWorldPosition(camPos)
    group.getWorldPosition(roomPos)
    // Nobody watching from across the silo: leave it be.
    if (camPos.distanceTo(roomPos) > 45) return
    t.current += dt
    const holo = group.getObjectByName('holo')
    if (holo) {
      holo.getObjectByName('spin')!.rotation.y += dt * (room.lit ? 0.5 : 0.18)
      holo.getObjectByName('orbitA')!.rotation.z += dt * 0.4
      holo.getObjectByName('orbitB')!.rotation.z -= dt * 0.3
      holo.position.y = HOLO_Y + Math.sin(t.current * 1.2) * 0.05
    }
    const floaters = group.getObjectByName('floaters')
    if (floaters) {
      for (const m of floaters.children) {
        m.position.y = m.userData.base + Math.sin(t.current * 0.9 + m.userData.phase) * 0.12
        m.lookAt(camPos)
      }
    }
    const rings = group.getObjectByName('rings')
    if (rings) {
      for (const r of rings.children) {
        r.rotation.y += dt * r.userData.speed
        // Each card turns to whoever is looking, so none reads backwards.
        for (const card of r.children) card.lookAt(camPos)
      }
    }
  })

  return <primitive object={group} />
}

export default function WallRooms({ level }: { level: number }) {
  const rooms = useMemo(() => wallRoomsOn(level), [level])
  return (
    <>
      {rooms.map((r) => (
        <Room key={r.id} room={r} />
      ))}
    </>
  )
}
