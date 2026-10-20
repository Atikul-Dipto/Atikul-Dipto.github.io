import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  AIM,
  AIM_CONSOLE,
  AIM_FIELD,
  AIM_RAIL,
  CH_OPENING,
  CITIZENS,
  CORRIDOR,
  DRONE,
  DRONE_DESK,
  DRONE_PLINTH,
  KIOSK,
  LECTERN,
  POEM_PAGE,
  poemPages,
  LEVEL as REC_LEVEL,
  MUSIC,
  SOUNDBOX,
  POEMS,
  ROOMS6,
  ROOM_INFO,
  roomPoint,
  roomWallGaps,
  type Room,
} from '../../content/level6'
import { WRITINGS } from '../../content/writings'
import { SONGS } from '../../content/songs'
import { setSoundboxPlace, soundbox } from '../../lib/soundbox'
import { aim, aimFire, fireAim, readAimBest, stepAim, TARGET_R } from '../../lib/aim'
import { aimHit, aimMiss, aimShot } from '../../lib/audio'
import { citizens, loadCitizens } from '../../lib/citizens'
import { move } from '../../lib/input'
import { useSilo } from '../../state/useSilo'
import { droneModel } from '../droneModel'
import { canvasTexture, centreSection, droneScreen, litMaker, roomGroup, roomShell, sectionAt, useRoomLights, WHOLE, type Lit } from './Level06'

/**
 * The newer rooms behind the recreation maze: the citizens' wall, poems and
 * writings, drone control, the aim range. Each is the same round shell as the
 * chamber and the music hall, in its own colour, dark until someone walks in.
 */

const SANS = '"Segoe UI", "Helvetica Neue", Arial, sans-serif'
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace'
/** Bangla text: the system's Bengali faces, then any that can draw it. */
const BANGLA = '"Nirmala UI", "Noto Sans Bengali", "Hind Siliguri", "Vrinda", "Bangla Sangam MN", sans-serif'

type Lights = Array<{ l: THREE.PointLight; max: number; section: number }>

/**
 * A round room in its own colour: a dark shell, a ring of light at the foot of
 * the wall and another at door height, the ceiling's rings in the colour, and
 * three lights round the room plus one in the middle.
 */
type FloorPattern = 'rings' | 'stars' | 'hex' | 'grid'

/** A floor of its own for each room, drawn in the room's colour. */
function floorTexture(pattern: FloorPattern, base: string, accent: string) {
  const t = canvasTexture(1024, 1024, (c) => {
    c.fillStyle = base
    c.fillRect(0, 0, 1024, 1024)
    c.strokeStyle = accent
    c.fillStyle = accent
    c.globalAlpha = 0.5
    c.lineWidth = 3
    if (pattern === 'rings') {
      for (let q = 1; q < 12; q++) {
        c.globalAlpha = q % 3 === 0 ? 0.55 : 0.18
        c.beginPath()
        c.arc(512, 512, q * 44, 0, Math.PI * 2)
        c.stroke()
      }
    } else if (pattern === 'stars') {
      let s = 7
      const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
      for (let i = 0; i < 900; i++) {
        c.globalAlpha = 0.15 + rand() * 0.6
        c.beginPath()
        c.arc(rand() * 1024, rand() * 1024, 0.6 + rand() * 2.2, 0, Math.PI * 2)
        c.fill()
      }
    } else if (pattern === 'hex') {
      const size = 48
      const h = size * Math.sqrt(3)
      c.globalAlpha = 0.4
      for (let row = -1; row < 1024 / h + 1; row++) {
        for (let col = -1; col < 1024 / (size * 1.5) + 1; col++) {
          const x = col * size * 1.5
          const y = row * h + (col % 2 ? h / 2 : 0)
          c.beginPath()
          for (let k = 0; k <= 6; k++) {
            const a = (k / 6) * Math.PI * 2
            const px = x + Math.cos(a) * size * 0.95
            const py = y + Math.sin(a) * size * 0.95
            if (k) c.lineTo(px, py)
            else c.moveTo(px, py)
          }
          c.stroke()
        }
      }
    } else {
      for (let x = 0; x <= 1024; x += 64) {
        c.globalAlpha = x % 256 === 0 ? 0.55 : 0.2
        c.beginPath()
        c.moveTo(x, 0)
        c.lineTo(x, 1024)
        c.moveTo(0, x)
        c.lineTo(1024, x)
        c.stroke()
      }
    }
    c.globalAlpha = 1
  })
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  return t
}

function techRoom(r: Room, wall: string, floor: string, pattern: FloorPattern) {
  const accent = ROOM_INFO[r.id].colour
  const lit: Lit[] = []
  const mat = litMaker(lit)
  const { g, C, place } = roomGroup(r)
  roomShell(r, g, C, mat, { wall: null, wallColor: wall, floor: floorTexture(pattern, floor, accent), floorColor: '#ffffff', ring: accent, ringColor: accent })
  const centre = centreSection(r)
  const glow = mat({ color: accent, emissive: accent, emissiveIntensity: 1.6 }, centre)
  for (const y of [0.08, CORRIDOR.height + 0.12]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r.radius - 0.06, 0.035, 6, 160), glow)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, y, C)
    g.add(ring)
  }
  const lights: Lights = []
  const tint = new THREE.Color('#ffffff').lerp(new THREE.Color(accent), 0.45)
  for (const phi of [-1.6, 0, 1.6]) {
    const l = new THREE.PointLight(tint, 0, r.radius * 1.4, 2)
    l.position.set(Math.sin(phi) * r.radius * 0.5, r.height - 1.4, C - Math.cos(phi) * r.radius * 0.5)
    g.add(l)
    lights.push({ l, max: 20, section: sectionAt(r, phi) })
  }
  const mid = new THREE.PointLight(tint, 0, r.radius * 1.6, 2)
  mid.position.set(0, r.height - 0.8, C)
  g.add(mid)
  lights.push({ l: mid, max: 24, section: centre })
  return { g, C, place, lit, mat, lights, accent, centre }
}

/** A flat screen texture painted once. */
function painted(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
  const t = canvasTexture(w, h, paint)
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  return t
}

// ===========================================================================
// The citizens' room: the whole wall a screen of names
// ===========================================================================

/** The band of names round the wall: from just over the floor to under the
 *  ceiling, in two halves, each a canvas. */
const BAND = { y0: 0.3, gap: 0.35 }
const HALF_W = 4096

/**
 * Lay the names out round the room, as large as they will go: rows across
 * both halves, skipping the door and the corridor mouths below their tops.
 * Sized to hold ten thousand names.
 */
function drawNames(r: Room, canvases: HTMLCanvasElement[], accent: string) {
  const R = r.radius - 0.08
  const bandH = r.height - BAND.y0 - BAND.gap
  const pxPerM = HALF_W / (Math.PI * R)
  const H = canvases[0].height
  // Blocked spans, as [phiCentre, halfAngle, topMetres]: the entrance and each
  // corridor, below their tops.
  const gaps = roomWallGaps(r).map(([c, h], i) => [c, i === 0 ? Math.asin(2.1 / R) : h, i === 0 ? CH_OPENING.centre + CH_OPENING.radius + 0.15 : CORRIDOR.height + 0.2] as const)
  // A canvas column's angle round the room. Half 0 covers theta 0..PI, half 1
  // PI..2PI; the texture is flipped so it reads from inside, and phi = PI - theta.
  const phiAt = (half: number, x: number) => Math.PI - (half * Math.PI + (1 - x / HALF_W) * Math.PI)
  const angDist = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
  const blocked = (half: number, x: number, yTop: number) => {
    const phi = phiAt(half, x)
    const yM = BAND.y0 + bandH - yTop / pxPerM
    return gaps.some(([c, h, top]) => yM < top && angDist(phi, c) < h)
  }
  const names = citizens.list
  const ctxs = canvases.map((cv) => cv.getContext('2d')!)
  const paintBack = () => {
    ctxs.forEach((c, half) => {
      c.clearRect(0, 0, HALF_W, H)
      const grad = c.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#04080d')
      grad.addColorStop(1, '#0a1520')
      c.fillStyle = grad
      c.fillRect(0, 0, HALF_W, H)
      c.fillStyle = 'rgba(143,211,255,0.035)'
      for (let y = 0; y < H; y += 4) c.fillRect(0, y, HALF_W, 1)
      // Cut the door and the corridors out: transparent, so they show through.
      for (let x = 0; x < HALF_W; x += 4) {
        for (const [c0, h, top] of gaps) {
          const phi = phiAt(half, x)
          if (angDist(phi, c0) < h) c.clearRect(x, H - (top - BAND.y0) * pxPerM, 4, H)
        }
      }
    })
  }
  paintBack()

  const centreMessage = (text: string, sub: string) => {
    ctxs.forEach((c) => {
      c.fillStyle = accent
      c.textAlign = 'center'
      c.font = `700 ${Math.round(H * 0.16)}px ${SANS}`
      c.fillText(text, HALF_W / 2, H * 0.4, HALF_W - 200)
      c.fillStyle = '#c9e6f7'
      c.font = `400 ${Math.round(H * 0.06)}px ${SANS}`
      c.fillText(sub, HALF_W / 2, H * 0.4 + H * 0.12, HALF_W - 200)
      c.textAlign = 'left'
    })
  }
  if (citizens.reachable === false && !names.length) {
    centreMessage('THE REGISTER IS OFFLINE', 'The names will show here again once it can be reached.')
    return
  }
  if (!names.length) {
    centreMessage('BE THE FIRST CITIZEN', 'Step up to the kiosk in the middle of the room.')
    return
  }

  // Find the largest font that fits everyone.
  const fits = (font: number, draw: boolean) => {
    const lineH = Math.round(font * 1.35)
    const gap = font * 1.1
    let i = 0
    for (let half = 0; half < 2 && i < names.length; half++) {
      const c = ctxs[half]
      c.font = `600 ${font}px ${SANS}`
      for (let y = Math.round(font * 0.9); y + lineH * 0.3 < H && i < names.length; y += lineH) {
        let x = font
        while (i < names.length) {
          const label = names[i].name
          const w = c.measureText(label).width
          if (x + w > HALF_W - font) break
          if (blocked(half, x, y - font) || blocked(half, x + w, y - font) || blocked(half, x + w / 2, y - font)) {
            x += font * 2
            continue
          }
          if (draw) {
            const isMine = names[i].n === citizens.mine
            c.fillStyle = isMine ? '#ffd27a' : i % 7 === 0 ? accent : '#d6ecfa'
            c.fillText(label, x, y)
          }
          x += w + gap
          i++
        }
      }
    }
    return i >= names.length
  }
  let font = 96
  while (font > 5 && !fits(font, false)) font = Math.floor(font * 0.9)
  fits(font, true)
}

function NamesWall({ r, g, C, mat, centre }: { r: Room; g: THREE.Group; C: number; mat: ReturnType<typeof litMaker>; centre: number }) {
  const parts = useMemo(() => {
    const R = r.radius - 0.08
    const bandH = r.height - BAND.y0 - BAND.gap
    const pxPerM = HALF_W / (Math.PI * R)
    const h = Math.min(2048, Math.round(bandH * pxPerM))
    const canvases = [0, 1].map(() => {
      const cv = document.createElement('canvas')
      cv.width = HALF_W
      cv.height = h
      return cv
    })
    const textures = canvases.map((cv) => {
      const t = new THREE.CanvasTexture(cv)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      return t
    })
    const meshes = textures.map((tex, half) => {
      const geo = new THREE.CylinderGeometry(R, R, bandH, 96, 1, true, half * Math.PI, Math.PI)
      // Read from inside: flip the texture across.
      const uv = geo.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i))
      const m = new THREE.Mesh(geo, mat({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.1, color: '#000000', side: THREE.BackSide, alphaTest: 0.5, transparent: false }, centre))
      m.position.set(0, BAND.y0 + bandH / 2, C)
      g.add(m)
      return m
    })
    return { canvases, textures, meshes }
  }, [r, g, C, mat, centre])
  const drawn = useRef(-1)
  useFrame(() => {
    if (drawn.current === citizens.version) return
    drawn.current = citizens.version
    drawNames(r, parts.canvases, ROOM_INFO[r.id].colour)
    parts.textures.forEach((t) => (t.needsUpdate = true))
  })
  useEffect(() => {
    void loadCitizens(true)
    // Fresh names now and then while the room is near.
    const id = window.setInterval(() => void loadCitizens(), 60_000)
    return () => window.clearInterval(id)
  }, [r])
  return null
}

export function CitizensRoom() {
  const k = ROOMS6.indexOf(CITIZENS)
  const r = CITIZENS
  const parts = useMemo(() => {
    const room = techRoom(r, '#14234a', '#0c1630', 'rings')
    const { g, C, mat, centre } = room
    const metal = mat({ color: '#28323c', roughness: 0.35, metalness: 0.85 }, centre)
    // The kiosk: a pedestal, an angled screen, a seal turning over it.
    const kiosk = new THREE.Group()
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, KIOSK.h, 40), metal)
    base.position.y = KIOSK.h / 2
    kiosk.add(base)
    const screenTex = painted(1024, 640, (c) => {
      c.fillStyle = '#05090e'
      c.fillRect(0, 0, 1024, 640)
      c.strokeStyle = room.accent
      c.lineWidth = 8
      c.strokeRect(14, 14, 996, 612)
      c.fillStyle = room.accent
      c.font = `700 54px ${MONO}`
      c.textAlign = 'center'
      c.fillText('SILO CITIZENSHIP', 512, 150)
      c.fillStyle = '#e7f4fc'
      c.font = `500 46px ${SANS}`
      c.fillText('Would you like to become', 512, 290)
      c.fillText('a member of the Silo?', 512, 350)
      c.fillStyle = '#ffd27a'
      c.font = `700 44px ${MONO}`
      c.fillText('PRESS E', 512, 500)
    })
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }))
    scr.position.set(0, KIOSK.h + 0.36, 0.25)
    scr.rotation.x = -0.55
    kiosk.add(scr)
    // Both ways round: a kiosk you can walk up to from any side.
    const scr2 = scr.clone()
    scr2.position.z = -0.25
    scr2.rotation.set(-0.55, Math.PI, 0, 'YXZ')
    kiosk.add(scr2)
    const seal = new THREE.Group()
    seal.name = 'seal'
    seal.position.y = 3.2
    const sealMat = new THREE.MeshBasicMaterial({ color: '#ffd27a', wireframe: true, transparent: true, opacity: 0.85, toneMapped: false })
    seal.add(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.03, 8, 64), sealMat))
    seal.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), sealMat))
    kiosk.add(seal)
    kiosk.position.set(0, 0, C)
    g.add(kiosk)
    return { ...room, seal }
  }, [r])
  useRoomLights(k, parts.lit, parts.lights)
  useFrame((_, dt) => {
    parts.seal.rotation.y += dt * 0.6
  })
  return (
    <>
      <primitive object={parts.g} />
      <NamesWall r={r} g={parts.g} C={parts.C} mat={parts.mat} centre={parts.centre} />
    </>
  )
}

// ===========================================================================
// Poems and writings
// ===========================================================================

export function PoemsRoom() {
  const k = ROOMS6.indexOf(POEMS)
  const r = POEMS
  const parts = useMemo(() => {
    const room = techRoom(r, '#2a1036', '#180a20', 'stars')
    const { g, place, mat, accent, centre } = room
    const frame = mat({ color: '#2a2335', roughness: 0.4, metalness: 0.7 }, WHOLE)
    // The lectern, at the back.
    const lec = new THREE.Group()
    const stand = new THREE.Mesh(new THREE.BoxGeometry(LECTERN.w * 0.5, LECTERN.h, LECTERN.depth * 0.6), frame)
    stand.position.y = LECTERN.h / 2
    lec.add(stand)
    const top = new THREE.Mesh(new THREE.BoxGeometry(LECTERN.w, 0.06, LECTERN.depth), frame)
    top.position.y = LECTERN.h + 0.05
    top.rotation.x = -0.35
    lec.add(top)
    const page = painted(768, 512, (c) => {
      c.fillStyle = '#0b0812'
      c.fillRect(0, 0, 768, 512)
      c.fillStyle = accent
      c.font = `700 40px ${MONO}`
      c.textAlign = 'center'
      c.fillText('POEMS & WRITINGS', 384, 120)
      c.fillStyle = '#ece6f7'
      c.font = `400 34px ${SANS}`
      c.fillText(WRITINGS.length ? `${WRITINGS.length} piece${WRITINGS.length === 1 ? '' : 's'} to read` : 'The collection is being gathered', 384, 250)
      c.fillStyle = '#ffd27a'
      c.font = `700 34px ${MONO}`
      c.fillText('PRESS E', 384, 400)
    })
    const pg = new THREE.Mesh(new THREE.PlaneGeometry(LECTERN.w * 0.9, LECTERN.depth * 0.85), new THREE.MeshBasicMaterial({ map: page, toneMapped: false }))
    pg.position.set(0, LECTERN.h + 0.09, 0)
    pg.rotation.x = -Math.PI / 2 + 0.35 - 0.0001
    pg.rotation.order = 'YXZ'
    lec.add(pg)
    place(lec, LECTERN.phi, LECTERN.rr)
    // A page on the wall for every poem: its title, its opening lines, its
    // date. Stand at one and press E to read the whole of it.
    for (const pg of poemPages()) {
      const w = WRITINGS.find((x) => x.id === pg.id)!
      const tex = painted(768, 1060, (c) => {
        const grad = c.createLinearGradient(0, 0, 0, 1060)
        grad.addColorStop(0, '#1a0c22')
        grad.addColorStop(1, '#0e0614')
        c.fillStyle = grad
        c.fillRect(0, 0, 768, 1060)
        c.strokeStyle = accent
        c.lineWidth = 6
        c.strokeRect(18, 18, 732, 1024)
        c.textAlign = 'center'
        c.fillStyle = accent
        c.font = `700 28px ${MONO}`
        c.fillText(`${w.kind.toUpperCase()}${w.date ? `  ·  ${w.date.toUpperCase()}` : ''}`, 384, 96)
        c.fillStyle = '#ffffff'
        c.font = `700 58px ${BANGLA}`
        c.fillText(w.title, 384, 200, 680)
        c.fillStyle = 'rgba(211,107,255,0.6)'
        c.fillRect(304, 236, 160, 3)
        c.fillStyle = '#efe6f6'
        c.font = `400 34px ${BANGLA}`
        const lines = w.body.split('\n').filter((l) => l.trim()).slice(0, 13)
        lines.forEach((l, i) => c.fillText(l, 384, 312 + i * 54, 690))
        if (w.body.split('\n').filter((l) => l.trim()).length > lines.length) c.fillText('…', 384, 312 + lines.length * 54)
        c.fillStyle = '#ffd27a'
        c.font = `700 28px ${MONO}`
        c.fillText('PRESS E TO READ', 384, 1010)
      })
      const m = new THREE.Mesh(new THREE.PlaneGeometry(POEM_PAGE.w, POEM_PAGE.h), mat({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.95, color: '#000000' }, sectionAt(r, pg.phi)))
      const holder = new THREE.Group()
      m.position.set(0, POEM_PAGE.y, 0.03)
      holder.add(m)
      const back = new THREE.Mesh(new THREE.BoxGeometry(POEM_PAGE.w + 0.08, POEM_PAGE.h + 0.08, 0.04), frame)
      back.position.set(0, POEM_PAGE.y, 0)
      holder.add(back)
      place(holder, pg.phi, r.radius - 0.12)
    }
    // Pages drifting under the dome.
    const pages = new THREE.Group()
    pages.name = 'pages'
    const pageMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), pageMat)
      const a = (i / 14) * Math.PI * 2
      p.position.set(Math.cos(a) * (2 + (i % 3)), 3.6 + (i % 4) * 0.35, Math.sin(a) * (2 + (i % 3)))
      p.rotation.set(i * 0.7, i * 1.3, 0)
      pages.add(p)
    }
    pages.position.set(0, 0, room.C)
    g.add(pages)
    return { ...room, pages, centre }
  }, [r])
  useRoomLights(k, parts.lit, parts.lights)
  useFrame((state, dt) => {
    parts.pages.rotation.y += dt * 0.05
    const t = state.clock.elapsedTime
    parts.pages.children.forEach((p, i) => {
      p.rotation.x += dt * 0.2
      p.position.y = 3.6 + (i % 4) * 0.35 + Math.sin(t * 0.5 + i) * 0.15
    })
  })
  return <primitive object={parts.g} />
}

// ===========================================================================
// Drone control
// ===========================================================================

export function DroneRoom() {
  const k = ROOMS6.indexOf(DRONE)
  const r = DRONE
  const parts = useMemo(() => {
    const room = techRoom(r, '#1b2610', '#0f1608', 'hex')
    const { place, mat, accent } = room
    const sec = sectionAt(r, DRONE_DESK.phi)
    const deskMat = mat({ color: '#22302a', roughness: 0.5, metalness: 0.6 }, sec)
    const desk = new THREE.Group()
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(DRONE_DESK.w, 0.06, DRONE_DESK.depth), deskMat)
    deskTop.position.y = DRONE_DESK.h
    desk.add(deskTop)
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, DRONE_DESK.h, DRONE_DESK.depth - 0.1), deskMat)
      leg.position.set(sx * (DRONE_DESK.w / 2 - 0.1), DRONE_DESK.h / 2, 0)
      desk.add(leg)
    }
    for (const [kind, sx] of [
      ['board', -1.05],
      ['link', 0],
      ['board', 1.05],
    ] as Array<['link' | 'board', number]>) {
      const tex = droneScreen(kind)
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.58, 0.04), [deskMat, deskMat, deskMat, deskMat, mat({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1 }, sec), deskMat])
      mon.position.set(sx, DRONE_DESK.h + 0.42, -0.18)
      mon.rotation.y = -sx * 0.22
      desk.add(mon)
    }
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.22), deskMat)
    pad.position.set(0, DRONE_DESK.h + 0.055, 0.2)
    desk.add(pad)
    place(desk, DRONE_DESK.phi, DRONE_DESK.rr)
    // Big screens either side of the desk.
    for (const [kind, phi] of [
      ['link', -0.85],
      ['board', 0.85],
    ] as Array<['link' | 'board', number]>) {
      const tex = droneScreen(kind)
      const s = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.0), mat({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1, color: '#000000' }, sectionAt(r, phi)))
      const holder = new THREE.Group()
      s.position.set(0, 2.6, 0.02)
      holder.add(s)
      place(holder, phi, r.radius - 0.12)
    }
    // The drone on its plinth, and over it a hologram of the silo it flies in.
    const plinth = new THREE.Group()
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 1.0, 32), deskMat)
    pl.position.y = 0.5
    plinth.add(pl)
    const model = droneModel(mat({ color: '#d7dde0', roughness: 0.4, metalness: 0.4 }, room.centre), mat({ color: accent, emissive: accent, emissiveIntensity: 1.4 }, room.centre))
    model.position.y = 1.12
    plinth.add(model)
    const holo = new THREE.Group()
    holo.name = 'holo'
    holo.position.y = 2.6
    const lineMat = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.7, toneMapped: false })
    for (let i = 0; i < 8; i++) {
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 48 }, (_, q) => new THREE.Vector3(Math.cos((q / 48) * Math.PI * 2) * 0.9, -i * 0.22, Math.sin((q / 48) * Math.PI * 2) * 0.9))), lineMat)
      holo.add(ring)
    }
    plinth.add(holo)
    place(plinth, DRONE_PLINTH.phi, DRONE_PLINTH.rr)
    return { ...room, holo }
  }, [r])
  useRoomLights(k, parts.lit, parts.lights)
  useFrame((_, dt) => {
    parts.holo.rotation.y += dt * 0.3
  })
  return <primitive object={parts.g} />
}

// ===========================================================================
// The aim range
// ===========================================================================

const ray = new THREE.Vector3()

export function AimRoom() {
  const k = ROOMS6.indexOf(AIM)
  const r = AIM
  const parts = useMemo(() => {
    const room = techRoom(r, '#2b1414', '#170a0a', 'grid')
    const { C, place, mat, accent, centre } = room
    const g = room.g
    const steel = mat({ color: '#2e2627', roughness: 0.35, metalness: 0.85 }, centre)
    // The rail across the room, past its centre.
    const half = Math.sqrt(r.radius ** 2 - AIM_RAIL.f ** 2) - 0.1
    const bar = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.08, 0.12), steel)
    bar.position.set(0, AIM_RAIL.h, C - AIM_RAIL.f)
    g.add(bar)
    const glowBar = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.025, 0.03), new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }))
    glowBar.position.set(0, AIM_RAIL.h - 0.06, C - AIM_RAIL.f + 0.07)
    g.add(glowBar)
    for (let s = -half + 0.4; s <= half - 0.3; s += 1.6) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, AIM_RAIL.h, 0.07), steel)
      post.position.set(s, AIM_RAIL.h / 2, C - AIM_RAIL.f)
      g.add(post)
    }
    // A line on the floor under it.
    const line = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 0.08), new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }))
    line.rotation.x = -Math.PI / 2
    line.position.set(0, 0.01, C - AIM_RAIL.f + 0.4)
    g.add(line)
    // The back of the range: a grid on the wall, and target boards on it.
    const gridTex = painted(2048, 512, (c) => {
      c.fillStyle = '#080404'
      c.fillRect(0, 0, 2048, 512)
      c.strokeStyle = 'rgba(255,90,79,0.55)'
      c.lineWidth = 2
      for (let x = 0; x <= 2048; x += 64) {
        c.beginPath()
        c.moveTo(x, 0)
        c.lineTo(x, 512)
        c.stroke()
      }
      for (let y = 0; y <= 512; y += 64) {
        c.beginPath()
        c.moveTo(0, y)
        c.lineTo(2048, y)
        c.stroke()
      }
      c.fillStyle = 'rgba(255,90,79,0.8)'
      c.font = `700 56px ${MONO}`
      c.textAlign = 'center'
      c.fillText('AIM RANGE', 1024, 90)
    })
    const span = 2.4
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(r.radius - 0.1, r.radius - 0.1, r.height - 1.0, 64, 1, true, Math.PI - span / 2, span),
      mat({ map: gridTex, emissive: '#ffffff', emissiveMap: gridTex, emissiveIntensity: 0.8, color: '#000000', side: THREE.BackSide }, centre),
    )
    const buv = band.geometry.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < buv.count; i++) buv.setX(i, 1 - buv.getX(i))
    band.position.set(0, 0.5 + (r.height - 1.0) / 2, C)
    g.add(band)
    const boardMat = mat({ color: '#1a0c0c', emissive: accent, emissiveIntensity: 0.25 }, centre)
    for (const [phi, y] of [
      [-0.8, 1.6],
      [-0.4, 3.4],
      [0, 2.2],
      [0.4, 3.6],
      [0.8, 1.8],
    ]) {
      const board = new THREE.Group()
      for (const [rad, w] of [
        [0.5, 0.05],
        [0.32, 0.05],
        [0.12, 0.12],
      ]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, w / 2, 6, 40), boardMat)
        board.add(ring)
      }
      board.position.y = y
      place(board, phi, r.radius - 0.25)
    }

    // The console, its screen redrawn with the best score.
    const consoleG = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(AIM_CONSOLE.w, AIM_CONSOLE.h, AIM_CONSOLE.depth), steel)
    body.position.y = AIM_CONSOLE.h / 2
    consoleG.add(body)
    const cv = document.createElement('canvas')
    cv.width = 512
    cv.height = 320
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
    scr.position.set(0, AIM_CONSOLE.h + 0.22, 0.1)
    scr.rotation.x = -0.5
    consoleG.add(scr)
    place(consoleG, AIM_CONSOLE.phi, AIM_CONSOLE.rr)
    // The targets: a pool, shown as they come up.
    const targetMat = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false })
    const coreMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
    const pool = Array.from({ length: 4 }, () => {
      const t = new THREE.Group()
      t.add(new THREE.Mesh(new THREE.TorusGeometry(TARGET_R * 0.85, TARGET_R * 0.12, 8, 40), targetMat))
      t.add(new THREE.Mesh(new THREE.CircleGeometry(TARGET_R * 0.35, 24), coreMat))
      t.visible = false
      g.add(t)
      return t
    })
    // A tracer for each shot.
    const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: '#ffe8d0', transparent: true, opacity: 0, toneMapped: false }))
    tracer.frustumCulled = false
    return { ...room, cv, tex, pool, tracer }
  }, [r])
  useRoomLights(k, parts.lit, parts.lights)

  // A target somewhere in the field past the rail, in world space.
  const spawn = useMemo(() => {
    return () => {
      const phi = (Math.random() * 2 - 1) * AIM_FIELD.phi
      const rr = AIM_FIELD.rr0 + Math.random() * (AIM_FIELD.rr1 - AIM_FIELD.rr0)
      const [x, z] = roomPoint(r, phi, rr)
      const y = parts.g.position.y + AIM_FIELD.y0 + Math.random() * (AIM_FIELD.y1 - AIM_FIELD.y0)
      return { x, y, z }
    }
  }, [r, parts])

  const tracerLife = useRef(0)
  const shooter = useRef<((pos: THREE.Vector3, dir: THREE.Vector3) => void) | null>(null)
  const screenDrawn = useRef(-1)

  // Fire on a click while the pointer is held, or on the HUD's fire button.
  useEffect(() => {
    const shoot = (camPos: THREE.Vector3, dir: THREE.Vector3) => {
      if (!aim.active || aim.countdown > 0) return
      const hit = fireAim(camPos.x, camPos.y, camPos.z, dir.x, dir.y, dir.z)
      if (hit) aimHit()
      else aimShot()
      const end = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : camPos.clone().addScaledVector(dir, 14)
      const start = camPos.clone().addScaledVector(dir, 0.6).add(new THREE.Vector3(0, -0.18, 0))
      parts.tracer.geometry.setFromPoints([start, end])
      ;(parts.tracer.material as THREE.LineBasicMaterial).opacity = 0.9
      tracerLife.current = 0.08
    }
    shooter.current = shoot
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || !move.locked) return
      aimFire.request = true
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      shooter.current = null
    }
  }, [parts])

  useFrame((state, dt) => {
    // The tracer sits in world space; keep it in the scene while it shows.
    if (!parts.tracer.parent) state.scene.add(parts.tracer)
    if (aimFire.request) {
      aimFire.request = false
      state.camera.getWorldDirection(ray)
      shooter.current?.(state.camera.position, ray.clone())
    }
    // Walking away ends the round.
    if (aim.active) {
      const [cx, cz] = roomPoint(r, 0, 0)
      if (useSilo.getState().droneFlying || Math.hypot(state.camera.position.x - cx, state.camera.position.z - cz) > r.radius + 1) {
        aim.active = false
        aim.targets = []
        aim.version++
      }
    }
    const dropped = stepAim(Math.min(dt, 0.1), spawn)
    if (dropped) aimMiss()
    // Targets.
    parts.pool.forEach((m, i) => {
      const tg = aim.targets[i]
      if (!tg) {
        m.visible = false
        return
      }
      m.visible = true
      m.position.set(tg.x, tg.y, tg.z)
      m.parent?.worldToLocal(m.position)
      m.lookAt(state.camera.position)
      const age = tg.hitAt !== null ? aim.t - tg.hitAt : aim.t - tg.born
      m.scale.setScalar(tg.hitAt !== null ? 1 + age * 4 : Math.min(1, age * 6))
    })
    if (tracerLife.current > 0) {
      tracerLife.current -= dt
      if (tracerLife.current <= 0) (parts.tracer.material as THREE.LineBasicMaterial).opacity = 0
    }
    // The console's screen.
    if (screenDrawn.current !== aim.version) {
      screenDrawn.current = aim.version
      const c = parts.cv.getContext('2d')!
      c.fillStyle = '#0b0606'
      c.fillRect(0, 0, 512, 320)
      c.strokeStyle = parts.accent
      c.lineWidth = 6
      c.strokeRect(8, 8, 496, 304)
      c.fillStyle = parts.accent
      c.font = `700 36px ${MONO}`
      c.fillText('AIM RANGE', 30, 64)
      c.fillStyle = '#f5e9e8'
      c.font = `500 28px ${SANS}`
      const best = readAimBest()
      c.fillText(aim.active ? `SCORE  ${aim.score}` : aim.last ? `LAST  ${aim.last.score}` : '30 seconds, as many as you can', 30, 140)
      c.fillText(`BEST ON THIS DEVICE  ${best ?? '—'}`, 30, 200)
      c.fillStyle = '#ffd27a'
      c.font = `700 30px ${MONO}`
      c.fillText(aim.active ? 'CLICK TO FIRE' : 'PRESS E TO START', 30, 280)
      parts.tex.needsUpdate = true
    }
  })
  return <primitive object={parts.g} />
}


// ===========================================================================
// The music hall's sound box
// ===========================================================================

/**
 * A speaker tower on the right of the stage, with a screen on top: the songs
 * it holds, and while one plays, its title and a moving equaliser. It also
 * tells the sound box how near the visitor is, for the volume.
 */
export function SoundBox() {
  const parts = useMemo(() => {
    const { g, place } = roomGroup(MUSIC)
    const cab = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.55, metalness: 0.3 })
    const cone = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.8 })
    const ring = new THREE.MeshStandardMaterial({ color: '#7fe0c4', emissive: '#7fe0c4', emissiveIntensity: 1.2 })
    const tower = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(SOUNDBOX.w, SOUNDBOX.h - 0.7, SOUNDBOX.depth), cab)
    body.position.y = (SOUNDBOX.h - 0.7) / 2
    tower.add(body)
    for (const [y, rad] of [
      [0.55, 0.42],
      [1.35, 0.3],
    ]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 0.08, 40), cone)
      w.rotation.x = Math.PI / 2
      w.position.set(0, y, SOUNDBOX.depth / 2 + 0.01)
      tower.add(w)
      const r = new THREE.Mesh(new THREE.TorusGeometry(rad + 0.03, 0.02, 8, 48), ring)
      r.position.set(0, y, SOUNDBOX.depth / 2 + 0.05)
      tower.add(r)
    }
    const cv = document.createElement('canvas')
    cv.width = 640
    cv.height = 400
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(SOUNDBOX.w - 0.1, 0.62), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
    screen.position.set(0, SOUNDBOX.h - 0.36, SOUNDBOX.depth / 2 - 0.08)
    screen.rotation.x = -0.12
    tower.add(screen)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(SOUNDBOX.w, 0.72, 0.2), cab)
    frame.position.set(0, SOUNDBOX.h - 0.36, SOUNDBOX.depth / 2 - 0.2)
    tower.add(frame)
    place(tower, SOUNDBOX.phi, SOUNDBOX.rr)
    const [bx, bz] = roomPoint(MUSIC, SOUNDBOX.phi, SOUNDBOX.rr)
    return { g, cv, tex, bx, bz }
  }, [])

  const t = useRef(0)
  const frame = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    frame.current++
    if (frame.current % 4) return
    const s = useSilo.getState()
    const p = state.camera.position
    const here = s.level === REC_LEVEL && s.mode === 'walk' && !s.droneFlying
    // Full by the box, fading to nothing thirty metres off.
    const d = Math.hypot(p.x - parts.bx, p.z - parts.bz)
    const near = Math.max(0, Math.min(1, 1 - (d - 4) / 26))
    setSoundboxPlace(near * near, here, s.muted)
    // The screen.
    const c = parts.cv.getContext('2d')!
    c.fillStyle = '#05080a'
    c.fillRect(0, 0, 640, 400)
    c.strokeStyle = '#7fe0c4'
    c.lineWidth = 6
    c.strokeRect(6, 6, 628, 388)
    c.fillStyle = '#7fe0c4'
    c.font = `700 30px ${MONO}`
    c.fillText('SOUND BOX', 30, 56)
    if (soundbox.on && soundbox.current) {
      c.fillStyle = '#ffffff'
      c.font = `700 42px ${SANS}`
      c.fillText(soundbox.current.title, 30, 120, 580)
      c.fillStyle = '#bfe9dc'
      c.font = `400 30px ${SANS}`
      c.fillText(soundbox.current.artist, 30, 162, 580)
      // An equaliser: decoration, moving while it plays.
      for (let i = 0; i < 24; i++) {
        const h = soundbox.playing ? 30 + 120 * Math.abs(Math.sin(t.current * (2 + (i % 5)) + i * 1.7)) : 12
        c.fillStyle = i % 3 ? '#7fe0c4' : '#ffd27a'
        c.fillRect(30 + i * 24, 370 - h, 16, h)
      }
    } else {
      c.fillStyle = '#e9f6f1'
      c.font = `400 30px ${SANS}`
      c.fillText(`${SONGS.length} song${SONGS.length === 1 ? '' : 's'} on request`, 30, 130)
      c.fillStyle = '#ffd27a'
      c.font = `700 32px ${MONO}`
      c.fillText('PRESS E', 30, 340)
    }
    parts.tex.needsUpdate = true
  })
  return <primitive object={parts.g} />
}
