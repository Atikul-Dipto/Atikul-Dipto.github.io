import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { buildSurface, screenMaterial } from '../surface'
import { PALETTE, SHAFT_RADIUS, WALL_THICK } from '../../content/floors'
import {
  CAFE_COUNTER,
  CAFE_TABLE,
  CHAIR,
  CONSOLE_ANGLE,
  FLOOR,
  HALL,
  HALL_F,
  HALL_GATE,
  HALL_PASS,
  HALL_SILL,
  OFFICE,
  OFFICE_F,
  OFFICE_GATE,
  PORTRAIT_ANGLE,
  SCREEN,
  SHERIFF_DESK,
  VAULT,
  VAULT_PORTAL,
  cafeChairs,
  cafeTables,
  sheriffCabinets,
  sheriffChairs,
  sheriffDesks,
  tableAxes,
  tableBox,
} from '../../content/level1'
import type { Box, Gate, Seat, Table } from '../../content/level1'
import { identity } from '../../content/portfolio'
import { daylight } from '../../lib/daylight'
import { useSilo } from '../../state/useSilo'
import { claddingSurface, concreteSurface, plateSurface, steelSurface, tiled } from '../materials'
import CreedWall from './CreedWall'
import Vault from './Vault'

const BASE = import.meta.env.BASE_URL

/**
 * LEVEL 1, drawn from content/level1.ts.
 *
 * Nothing solid here invents its own position: walls, furniture, the vault
 * portal and the arrival fit-out all come from the plan, which the physics
 * reads as well. What IS local to this file is decoration a body never
 * touches -- ceilings, lamps, screens, plates on the tables.
 */

const dummy = new THREE.Object3D()
const unitBox = new THREE.BoxGeometry(1, 1, 1)

/** One instanced mesh for a list of boxes, each scaled to its own size. */
function boxes(list: Box[], material: THREE.Material, shadow = true) {
  const mesh = new THREE.InstancedMesh(unitBox, material, Math.max(1, list.length))
  list.forEach((b, i) => {
    dummy.position.set(b.x, b.y, b.z)
    dummy.rotation.set(0, b.rotY, 0)
    dummy.scale.set(b.w, b.h, b.d)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  })
  mesh.count = list.length
  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = shadow
  mesh.receiveShadow = true
  return mesh
}



function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  paint(ctx)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}


// ===========================================================================
// Arrival: the personnel monitor and the portrait, facing the bridge
// ===========================================================================

function makePanel(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return { canvas, ctx: canvas.getContext('2d')!, texture }
}

/**
 * The personnel monitor. Everything drawn on it is real profile text or an
 * abstract trace -- decorative, and never implying live operational data.
 */
function IdentityConsole() {
  const panel = useMemo(() => makePanel(512, 320), [])
  const trace = useRef(0)
  const nextDraw = useRef(0)

  useFrame((_, dt) => {
    trace.current += dt
    if (trace.current < nextDraw.current) return
    nextDraw.current = trace.current + 1 / 12
    const { ctx, canvas, texture } = panel
    const t = trace.current
    ctx.fillStyle = '#120e0b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(201,153,107,0.045)'
    for (let yy = 0; yy < canvas.height; yy += 4) ctx.fillRect(0, yy, canvas.width, 1)
    ctx.fillStyle = PALETTE.brassHot
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif'
    ctx.fillText('PERSONNEL RECORD', 24, 40)
    ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif'
    ctx.fillStyle = '#f3ece6'
    ctx.fillText(identity.name, 24, 82)
    ctx.font = '15px "Segoe UI", system-ui, sans-serif'
    ctx.fillStyle = 'rgba(237,233,230,0.68)'
    ctx.fillText(identity.headline, 24, 110)
    ctx.font = 'bold 12px "Cascadia Code", monospace'
    ctx.fillStyle = PALETTE.brass
    identity.specialisms.slice(0, 4).forEach((s, i) => ctx.fillText('> ' + s.toUpperCase(), 24, 148 + i * 22))
    ctx.strokeStyle = 'rgba(201,153,107,0.85)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x <= 464; x += 4) {
      const v = Math.sin(x * 0.045 + t * 1.6) * 0.5 + Math.sin(x * 0.011 - t * 0.9) * 0.5
      const yy = 268 + v * 22
      if (x === 0) ctx.moveTo(24 + x, yy)
      else ctx.lineTo(24 + x, yy)
    }
    ctx.stroke()
    ctx.fillStyle = Math.sin(t * 2.2) > 0 ? '#8fd08a' : 'rgba(143,208,138,0.25)'
    ctx.beginPath()
    ctx.arc(canvas.width - 34, 34, 7, 0, Math.PI * 2)
    ctx.fill()
    texture.needsUpdate = true
  })

  const r = SHAFT_RADIUS - 0.3
  const a = CONSOLE_ANGLE
  const yScreen = FLOOR + 2.4
  const local = FLOOR - yScreen
  return (
    // rotation.y = PI/2 - a points local +Z out at the wall; adding PI turns
    // it back to face the shaft axis, which is where the visitor stands.
    <group position={[Math.cos(a) * r, yScreen, Math.sin(a) * r]} rotation={[0, Math.PI / 2 - a + Math.PI, 0]}>
      <group>
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={[2.6, 1.63]} />
          <meshBasicMaterial map={panel.texture} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.02]} castShadow>
          <boxGeometry args={[2.9, 1.95, 0.22]} />
          <meshStandardMaterial color={PALETTE.steelDark} roughness={0.55} metalness={0.7} />
        </mesh>
        <mesh position={[0, local + 1.5, 0.52]} castShadow receiveShadow>
          <boxGeometry args={[3.2, 0.14, 1.1]} />
          <meshStandardMaterial color={PALETTE.steel} roughness={0.46} metalness={0.78} />
        </mesh>
        <mesh position={[0, local + 1.62, 0.84]} rotation={[-0.42, 0, 0]}>
          <boxGeometry args={[2.6, 0.5, 0.08]} />
          <meshStandardMaterial color={PALETTE.steelDark} roughness={0.5} metalness={0.74} />
        </mesh>
        <mesh position={[0, local + 0.72, 0.4]} castShadow receiveShadow>
          <boxGeometry args={[3.0, 1.44, 0.76]} />
          <meshStandardMaterial color={PALETTE.deck} roughness={0.85} metalness={0.2} />
        </mesh>
        <pointLight color={PALETTE.brass} intensity={8} distance={7} decay={2} position={[0, 0, 1.2]} />
      </group>
    </group>
  )
}

/** The portrait, in a deep window in the wall straight ahead of the bridge. */
function PortraitWindow() {
  const texture = useLoader(THREE.TextureLoader, `${BASE}${identity.portrait}`)
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
  }, [texture])
  const W = 3.0
  const H = 3.0
  const r = SHAFT_RADIUS - 0.06
  const jamb = 0.58
  const a = PORTRAIT_ANGLE
  const y = FLOOR + 2.25
  return (
    <group position={[Math.cos(a) * r, y, Math.sin(a) * r]} rotation={[0, Math.PI / 2 - a + Math.PI, 0]}>
      {(
        [
          [W + 1.15, jamb, 0, H / 2 + jamb / 2],
          [W + 1.15, jamb, 0, -H / 2 - jamb / 2],
          [jamb, H, -W / 2 - jamb / 2, 0],
          [jamb, H, W / 2 + jamb / 2, 0],
        ] as const
      ).map(([w, h, x, yy], i) => (
        <mesh key={i} position={[x, yy, 0.18]} castShadow receiveShadow>
          <boxGeometry args={[w, h, 0.5]} />
          <meshStandardMaterial color={PALETTE.concreteDark} roughness={0.96} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.24]}>
        <planeGeometry args={[W + 0.1, H + 0.1]} />
        <meshBasicMaterial color="#120d0a" />
      </mesh>
      <mesh position={[0, 0, 0.3]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={texture} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.78} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.44]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#bccbc4" transparent opacity={0.1} roughness={0.05} depthWrite={false} />
      </mesh>
      {(
        [
          [W + 0.46, 0.23, 0, H / 2 + 0.115],
          [W + 0.46, 0.23, 0, -H / 2 - 0.115],
          [0.23, H + 0.46, -W / 2 - 0.115, 0],
          [0.23, H + 0.46, W / 2 + 0.115, 0],
        ] as const
      ).map(([w, h, x, yy], i) => (
        <mesh key={i} position={[x, yy, 0.5]}>
          <boxGeometry args={[w, h, 0.22]} />
          <meshStandardMaterial color={PALETTE.steel} roughness={0.4} metalness={0.82} />
        </mesh>
      ))}
      <pointLight color={PALETTE.brassHot} intensity={22} distance={14} decay={2} position={[0, 0.4, 2.2]} />
    </group>
  )
}

// ===========================================================================
// The rooms behind the wall
// ===========================================================================

type Frame = typeof OFFICE_F
type RoomSize = typeof OFFICE

/** A group in a room's frame: local x = s, local z = -d, origin on the deck
 *  floor at the silo wall's inner face. */
function framed(F: Frame) {
  const g = new THREE.Group()
  const [x, z] = F.to(0, 0)
  g.position.set(x, FLOOR, z)
  g.rotation.y = F.yaw
  return g
}

/** A rounded rectangle as a path, centred on (0, cy). */
function roundedRect<T extends THREE.Path>(p: T, halfW: number, halfH: number, r: number, cy: number, reverse = false) {
  const x0 = -halfW
  const x1 = halfW
  const y0 = cy - halfH
  const y1 = cy + halfH
  if (!reverse) {
    p.moveTo(x0 + r, y0)
    p.lineTo(x1 - r, y0)
    p.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false)
    p.lineTo(x1, y1 - r)
    p.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false)
    p.lineTo(x0 + r, y1)
    p.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false)
    p.lineTo(x0, y0 + r)
    p.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false)
  } else {
    p.moveTo(x0 + r, y0)
    p.absarc(x0 + r, y0 + r, r, Math.PI * 1.5, Math.PI, true)
    p.lineTo(x0, y1 - r)
    p.absarc(x0 + r, y1 - r, r, Math.PI, Math.PI / 2, true)
    p.lineTo(x1 - r, y1)
    p.absarc(x1 - r, y1 - r, r, Math.PI / 2, 0, true)
    p.lineTo(x1, y0 + r)
    p.absarc(x1 - r, y0 + r, r, 0, -Math.PI / 2, true)
  }
  return p
}

/** A rectangle of wall with a gate-shaped hole in it, as a flat mesh. */
function wallWithHole(halfW: number, y0: number, y1: number, gate: Gate | null, mat: THREE.Material, round?: { r: number; cy: number }) {
  const sh = new THREE.Shape()
  sh.moveTo(-halfW, y0)
  sh.lineTo(halfW, y0)
  sh.lineTo(halfW, y1)
  sh.lineTo(-halfW, y1)
  sh.lineTo(-halfW, y0)
  if (gate) sh.holes.push(roundedRect(new THREE.Path(), gate.halfW, gate.halfH, gate.radius, gate.centre, true))
  if (round) {
    const h = new THREE.Path()
    h.absarc(0, round.cy, round.r, 0, Math.PI * 2, true)
    sh.holes.push(h)
  }
  return new THREE.Mesh(new THREE.ShapeGeometry(sh, 32), mat)
}

/**
 * The passage through the silo wall: the gate's outline extruded through the
 * wall's thickness, with a face round it standing just proud of the wall on
 * the deck side. Its trim is a separate ring, so it can be brass or timber.
 */
function gatePassage(gate: Gate, lining: THREE.Material, trim: THREE.Material) {
  const g = new THREE.Group()
  // The lining's outside follows the outline too: a rectangle here showed as
  // a block over the opening and a frame round it inside.
  const pad = 0.12
  const outer = roundedRect(new THREE.Shape(), gate.halfW + pad, gate.halfH + pad, gate.radius + pad, gate.centre)
  outer.holes.push(roundedRect(new THREE.Path(), gate.halfW, gate.halfH, gate.radius, gate.centre, true))
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: WALL_THICK + 0.04, bevelEnabled: false, curveSegments: 24 }), lining)
  body.position.z = -WALL_THICK - 0.01
  body.receiveShadow = true
  g.add(body)
  // The trim: a band round the outline on the deck face.
  const ring = new THREE.Shape()
  roundedRect(ring, gate.halfW + 0.16, gate.halfH + 0.16, gate.radius + 0.16, gate.centre)
  ring.holes.push(roundedRect(new THREE.Path(), gate.halfW, gate.halfH, gate.radius, gate.centre, true))
  const band = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.08, bevelEnabled: false, curveSegments: 24 }), trim)
  band.position.z = 0.02
  g.add(band)
  return g
}

/** The shell of a room behind the wall: floor, ceiling, four walls. */
function roomShell(
  g: THREE.Group,
  R: RoomSize,
  gate: Gate,
  mats: { wall: THREE.Material; floor: THREE.Material; ceil: THREE.Material },
  back?: { r: number; cy: number },
) {
  const len = R.to - R.from
  // Out through the passage in the wall too, to meet the deck.
  // Starting at the wall's face, so it does not overlap the deck and flicker.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.half * 2, R.to), mats.floor)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0.006, -R.to / 2)
  floor.receiveShadow = true
  g.add(floor)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(R.half * 2, len), mats.ceil)
  ceil.rotation.x = Math.PI / 2
  ceil.position.set(0, R.height, -(R.from + R.to) / 2)
  g.add(ceil)
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(len, R.height), mats.wall)
    w.position.set(side * R.half, R.height / 2, -(R.from + R.to) / 2)
    w.rotation.y = -side * (Math.PI / 2)
    w.receiveShadow = true
    g.add(w)
  }
  const backWall = wallWithHole(R.half, 0, R.height, null, mats.wall, back)
  backWall.position.z = -R.to
  backWall.receiveShadow = true
  g.add(backWall)
  const front = wallWithHole(R.half, -0.4, R.height, gate, mats.wall)
  front.position.z = -R.from + 0.01
  front.rotation.y = Math.PI
  g.add(front)
}

function woodCeiling() {
  const t = canvasTexture(512, 256, (ctx) => {
    for (let i = 0; i < 32; i++) {
      const shade = 70 + ((i * 37) % 23)
      ctx.fillStyle = `rgb(${shade + 40},${shade + 22},${shade})`
      ctx.fillRect(i * 16, 0, 16, 256)
      ctx.fillStyle = 'rgba(20,12,6,0.55)'
      ctx.fillRect(i * 16, 0, 2, 256)
    }
  })
  t.repeat.set(3, 2)
  return t
}

// ---- the sheriff's office --------------------------------------------------

function OfficeShell() {
  const phase = useSilo((s) => s.phase)
  const parts = useMemo(() => {
    const g = framed(OFFICE_F)
    const c = tiled(claddingSurface(), OFFICE.half / 2, OFFICE.height / 4)
    const wall = new THREE.MeshStandardMaterial({ color: '#c9cbc6', roughness: 0.9, metalness: 0.08, map: c.map, normalMap: c.normalMap, side: THREE.DoubleSide })
    const floor = new THREE.MeshStandardMaterial({ color: '#5e5a4c', roughness: 0.62, metalness: 0.05 })
    const ceil = new THREE.MeshStandardMaterial({ map: woodCeiling(), roughness: 0.8, color: '#a88a68', side: THREE.DoubleSide })
    roomShell(g, OFFICE, OFFICE_GATE, { wall, floor, ceil }, { r: VAULT.radius + 0.02, cy: VAULT.centre })
    const lining = new THREE.MeshStandardMaterial({ color: '#7d786d', roughness: 0.85 })
    const brass = new THREE.MeshStandardMaterial({ color: '#b68a57', roughness: 0.35, metalness: 0.9 })
    g.add(gatePassage(OFFICE_GATE, lining, brass))
    // Two round lamps either side of the door, on the deck side.
    const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 2.2 })
    for (const sx of [-1.75, 1.75]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), lampMat)
      lamp.position.set(sx, 2.6, 0.18)
      g.add(lamp)
    }
    const light = new THREE.PointLight('#ffd9a0', 10, 7, 2)
    light.position.set(0, 3.2, 1.2)
    g.add(light)
    return g
  }, [])
  parts.visible = phase !== 'exterior'
  return <primitive object={parts} />
}

/** Green-tiled lower walls in the office, all the way round. */
function Wainscot() {
  const parts = useMemo(() => {
    const g = framed(OFFICE_F)
    const tex = (len: number) => {
      const t = canvasTexture(128, 128, (ctx) => {
        ctx.fillStyle = '#20403a'
        ctx.fillRect(0, 0, 128, 128)
        for (let y = 0; y < 128; y += 32)
          for (let x = 0; x < 128; x += 32) {
            const s = 50 + ((x * 7 + y * 13) % 17)
            ctx.fillStyle = `rgb(${s - 22},${s + 26},${s + 10})`
            ctx.fillRect(x + 2, y + 2, 28, 28)
          }
      })
      t.repeat.set(len / 0.6, 1.3 / 0.6)
      return t
    }
    const mat = (len: number) =>
      new THREE.MeshStandardMaterial({ map: tex(len), roughness: 0.25, metalness: 0.05, envMapIntensity: 0.8, side: THREE.DoubleSide })
    const len = OFFICE.to - OFFICE.from
    const panel = (w: number, x: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.3), mat(w))
      m.position.set(x, 0.65, z)
      m.rotation.y = ry
      g.add(m)
    }
    panel(len, -OFFICE.half + 0.012, -(OFFICE.from + OFFICE.to) / 2, Math.PI / 2)
    panel(len, OFFICE.half - 0.012, -(OFFICE.from + OFFICE.to) / 2, -Math.PI / 2)
    // Front and back, either side of the door and the vault's portal.
    for (const [a, b] of [
      [OFFICE_GATE.halfW + 0.2, OFFICE.half],
      [-OFFICE.half, -OFFICE_GATE.halfW - 0.2],
    ])
      panel(b - a, (a + b) / 2, -OFFICE.from - 0.012, Math.PI)
    for (const [a, b] of [
      [VAULT_PORTAL.outer + 0.02, OFFICE.half],
      [-OFFICE.half, -VAULT_PORTAL.outer - 0.02],
    ])
      panel(b - a, (a + b) / 2, -OFFICE.to + 0.012, 0)
    return g
  }, [])
  return <primitive object={parts} />
}

// ---- the cafeteria -----------------------------------------------------------

function HallShell() {
  const phase = useSilo((s) => s.phase)
  const parts = useMemo(() => {
    const g = framed(HALL_F)
    const conc = tiled(concreteSurface(), 10, 3)
    const wall = new THREE.MeshStandardMaterial({ color: '#cdbfa8', roughness: 0.92, side: THREE.DoubleSide })
    const floor = new THREE.MeshStandardMaterial({ color: '#8d867b', roughness: 0.7, metalness: 0.05, map: conc.map })
    const ceil = new THREE.MeshStandardMaterial({ color: '#a39a8f', roughness: 0.95, map: conc.map, side: THREE.DoubleSide })
    roomShell(g, HALL, HALL_GATE, { wall, floor, ceil })
    // Dark timber panelling round the lower walls.
    const wood = new THREE.MeshStandardMaterial({ color: '#4a3326', roughness: 0.7, side: THREE.DoubleSide })
    const len = HALL.to - HALL.from
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), wood)
      p.position.set(side * (HALL.half - 0.012), 0.55, -(HALL.from + HALL.to) / 2)
      p.rotation.y = -side * (Math.PI / 2)
      g.add(p)
    }
    // The opening: a pill through the wall, timber-lined, a brass rim.
    const lining = new THREE.MeshStandardMaterial({ color: '#5a3f2e', roughness: 0.6 })
    const brass = new THREE.MeshStandardMaterial({ color: '#c49a62', roughness: 0.3, metalness: 0.9 })
    g.add(gatePassage(HALL_GATE, lining, brass))
    // Steps up from the deck onto the sill, and down again into the hall.
    const stone = new THREE.MeshStandardMaterial({ color: '#6f675d', roughness: 0.8 })
    const nosing = new THREE.MeshStandardMaterial({ color: '#c49a62', roughness: 0.35, metalness: 0.85 })
    const w = HALL_PASS * 2 + 0.5
    const step = (d0: number, d1: number, h: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d1 - d0), stone)
      m.position.set(0, h / 2, -(d0 + d1) / 2)
      m.receiveShadow = true
      m.castShadow = true
      g.add(m)
      const n = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.05), nosing)
      n.position.set(0, h - 0.014, d0 < 0 ? -d0 - 0.02 : -d1 + 0.02)
      g.add(n)
    }
    step(HALL_SILL.out, HALL_SILL.out / 2, HALL_SILL.h / 2)
    step(HALL_SILL.out / 2, WALL_THICK, HALL_SILL.h)
    step(WALL_THICK, (WALL_THICK + HALL_SILL.in) / 2, HALL_SILL.h / 2)
    // Hourglass sconces over the opening, on the deck side.
    const glow = new THREE.MeshStandardMaterial({ color: '#ffe2b0', emissive: new THREE.Color('#ffb860'), emissiveIntensity: 2.4 })
    const cone = new THREE.CylinderGeometry(0.2, 0.03, 0.26, 20, 1, true)
    for (const sx of [-3.4, 0, 3.4]) {
      const lamp = new THREE.Group()
      const up = new THREE.Mesh(cone, glow)
      up.position.y = 0.13
      const down = new THREE.Mesh(cone, glow)
      down.rotation.x = Math.PI
      down.position.y = -0.13
      lamp.add(up, down)
      lamp.position.set(sx, HALL_GATE.centre + HALL_GATE.halfH + 0.75, 0.25)
      g.add(lamp)
    }
    // Warm light along the walls, so the hall is not a black box round its
    // lit middle.
    for (const [sx, dz] of [
      [-9.5, 4],
      [9.5, 4],
      [-9.5, 11.5],
      [9.5, 11.5],
      [0, 2.6],
    ]) {
      const l = new THREE.PointLight('#ffdcae', 16, 13, 1.6)
      l.position.set(sx, 3.8, -dz)
      g.add(l)
    }
    const cove = new THREE.MeshStandardMaterial({ color: '#ffe8c8', emissive: '#ffd59c', emissiveIntensity: 1.4 })
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, HALL.to - HALL.from - 0.4), cove)
      strip.position.set(side * (HALL.half - 0.06), HALL.height - 0.25, -(HALL.from + HALL.to) / 2)
      g.add(strip)
    }
    const wash = new THREE.PointLight('#ffc27a', 20, 10, 2)
    wash.position.set(0, HALL_GATE.centre + HALL_GATE.halfH + 0.5, 1.6)
    g.add(wash)
    return g
  }, [])
  parts.visible = phase !== 'exterior'
  return <primitive object={parts} />
}

/**
 * The view of the surface on the hall's far wall: the silo's camera, behind
 * glass. A real view with depth and light -- see three/surface.ts -- that
 * holds still as you walk past, because the camera does.
 */
function CameraScreen() {
  const gl = useThree((s) => s.gl)
  const surface = useMemo(() => buildSurface(), [])
  const screen = useMemo(() => screenMaterial(surface.target.texture), [surface])
  const lights = useRef<THREE.PointLight[]>([])
  const frame = useRef(0)
  useEffect(() => () => surface.dispose(), [surface])

  const parts = useMemo(() => {
    const g = framed(HALL_F)
    const w = SCREEN.half * 2
    const h = SCREEN.head - SCREEN.sill
    const z = -HALL.to + 0.04
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screen.material)
    pane.position.set(0, SCREEN.sill + h / 2, z)
    g.add(pane)
    // The glass in front: barely there, but it catches the room.
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.08, envMapIntensity: 2.2, clearcoat: 1, depthWrite: false }),
    )
    glass.position.set(0, SCREEN.sill + h / 2, z + 0.05)
    g.add(glass)
    // A steel bezel and two mullions.
    const steel = new THREE.MeshStandardMaterial({ color: '#2f2c29', roughness: 0.45, metalness: 0.8 })
    const bar = (bw: number, bh: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.16), steel)
      m.position.set(x, y, z + 0.06)
      g.add(m)
    }
    bar(w + 0.4, 0.2, 0, SCREEN.sill - 0.1)
    bar(w + 0.4, 0.2, 0, SCREEN.head + 0.1)
    bar(0.2, h + 0.4, -w / 2 - 0.1, SCREEN.sill + h / 2)
    bar(0.2, h + 0.4, w / 2 + 0.1, SCREEN.sill + h / 2)
    for (const x of [-w / 6, w / 6]) bar(0.08, h, x, SCREEN.sill + h / 2)
    // Its light, falling into the room.
    const ls: THREE.PointLight[] = []
    for (const x of [-5, 5]) {
      const l = new THREE.PointLight('#c9d6d8', 10, 16, 2)
      l.position.set(x, 3, z + 2.4)
      g.add(l)
      ls.push(l)
    }
    lights.current = ls
    return g
  }, [screen])

  useFrame(({ clock }) => {
    const d = daylight()
    screen.uniforms.uTime.value = clock.elapsedTime
    // A few times a second is plenty: the light changes over minutes.
    if (frame.current++ % 4 === 0) surface.render(gl, d, clock.elapsedTime)
    for (const l of lights.current) {
      l.color.copy(d.horizon).lerp(d.sky, 0.4).lerp(new THREE.Color('#c9d6d8'), 0.5)
      l.intensity = 4 + d.glow * 16
    }
  })

  return <primitive object={parts} />
}

// ===========================================================================
// Furniture
// ===========================================================================

/** Chairs as three instanced parts: seat, back, legs. */
function Chairs({ seats, seatColor, frameColor }: { seats: Seat[]; seatColor: string; frameColor: string }) {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const seatMat = new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.7 })
    const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.45, metalness: 0.7 })
    const seatList: Box[] = []
    const backList: Box[] = []
    const legList: Box[] = []
    for (const s of seats) {
      const fx = Math.sin(s.rotY)
      const fz = Math.cos(s.rotY)
      seatList.push({ x: s.x, y: FLOOR + 0.46, z: s.z, w: CHAIR.w, h: 0.05, d: CHAIR.d - 0.02, rotY: s.rotY })
      backList.push({ x: s.x - fx * 0.21, y: FLOOR + 0.74, z: s.z - fz * 0.21, w: CHAIR.w - 0.02, h: 0.42, d: 0.04, rotY: s.rotY })
      for (const [lx, lz] of [
        [-0.19, -0.19],
        [0.19, -0.19],
        [-0.19, 0.19],
        [0.19, 0.19],
      ]) {
        const c = Math.cos(s.rotY)
        const sn = Math.sin(s.rotY)
        legList.push({ x: s.x + lx * c + lz * sn, y: FLOOR + 0.22, z: s.z - lx * sn + lz * c, w: 0.03, h: 0.44, d: 0.03, rotY: s.rotY })
      }
    }
    group.add(boxes(seatList, seatMat), boxes(backList, seatMat), boxes(legList, frameMat, false))
    return group
  }, [seats, seatColor, frameColor])
  return <primitive object={parts} />
}

/** Tables: a top and four legs. */
function Tables({ list, size, topColor }: { list: Table[]; size: { w: number; d: number; h: number }; topColor: string }) {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const p = tiled(plateSurface(), 2, 1)
    const topMat = new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.55, metalness: 0.35, map: p.map })
    const legMat = new THREE.MeshStandardMaterial({ color: '#2b2a28', roughness: 0.5, metalness: 0.7 })
    const tops: Box[] = []
    const legs: Box[] = []
    for (const t of list) {
      tops.push(tableBox(t, size.w, 0.045, size.d, size.h - 0.045))
      const { ax, az, cx, cz } = tableAxes(t)
      for (const along of [-size.w / 2 + 0.1, size.w / 2 - 0.1])
        for (const across of [-size.d / 2 + 0.08, size.d / 2 - 0.08]) {
          legs.push({
            x: t.x + ax * along + cx * across,
            y: FLOOR + (size.h - 0.045) / 2,
            z: t.z + az * along + cz * across,
            w: 0.05,
            h: size.h - 0.045,
            d: 0.05,
            rotY: t.rotY,
          })
        }
    }
    group.add(boxes(tops, topMat), boxes(legs, legMat, false))
    return group
  }, [list, size, topColor])
  return <primitive object={parts} />
}

/** Plates, cups and condiments, scattered the same way on every load. */
function TableProps() {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    let s = 7
    const rand = () => {
      s = (s * 1664525 + 1013904223) % 4294967296
      return s / 4294967296
    }
    const plates = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.13, 0.11, 0.018, 20),
      new THREE.MeshStandardMaterial({ color: '#3d3f40', roughness: 0.35, metalness: 0.6 }),
      cafeTables.length * 3,
    )
    const cups = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.04, 0.035, 0.1, 12),
      new THREE.MeshStandardMaterial({ color: '#5f6b4a', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }),
      cafeTables.length * 3,
    )
    const bottles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.03, 0.035, 0.17, 10),
      new THREE.MeshStandardMaterial({ color: '#c9b79a', roughness: 0.4 }),
      cafeTables.length * 3,
    )
    let np = 0
    let nc = 0
    let nb = 0
    const top = FLOOR + CAFE_TABLE.h
    for (const t of cafeTables) {
      const { ax, az, cx, cz } = tableAxes(t)
      const at = (along: number, across: number): [number, number] => [t.x + ax * along + cx * across, t.z + az * along + cz * across]
      const nPlates = 1 + Math.floor(rand() * 3)
      for (let k = 0; k < nPlates; k++) {
        const [x, z] = at((rand() - 0.5) * 1.6, (rand() > 0.5 ? 1 : -1) * 0.22)
        dummy.position.set(x, top + 0.009, z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        plates.setMatrixAt(np++, dummy.matrix)
        if (rand() > 0.35) {
          dummy.position.set(x + ax * 0.24, top + 0.05, z + az * 0.24)
          dummy.updateMatrix()
          cups.setMatrixAt(nc++, dummy.matrix)
        }
      }
      if (rand() > 0.2) {
        for (let k = 0; k < 3; k++) {
          const [x, z] = at(-0.08 + k * 0.08, 0)
          dummy.position.set(x, top + 0.085, z)
          dummy.updateMatrix()
          bottles.setMatrixAt(nb++, dummy.matrix)
        }
      }
    }
    plates.count = np
    cups.count = nc
    bottles.count = nb
    for (const m of [plates, cups, bottles]) {
      m.instanceMatrix.needsUpdate = true
      m.castShadow = true
      group.add(m)
    }
    return group
  }, [])
  return <primitive object={parts} />
}

// ===========================================================================
// The cafeteria
// ===========================================================================

/** The ceiling rose: a ring of petal-shaped lights round a central disc,
 *  and plain panels toward the corners of the hall. */
function CafeCeiling() {
  const parts = useMemo(() => {
    const group = framed(HALL_F)
    const cz = -8.8
    const y = HALL.height - 0.03
    const glow = new THREE.MeshStandardMaterial({
      color: '#fff6e8',
      emissive: new THREE.Color('#fff1dc'),
      emissiveIntensity: 1.7,
      roughness: 0.5,
      side: THREE.DoubleSide,
    })
    const recess = new THREE.MeshStandardMaterial({ color: '#4c463f', roughness: 0.9, side: THREE.DoubleSide })
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, 0.55, 64, 1, true), recess)
    ring.position.set(0, y - 0.27, cz)
    group.add(ring)
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.3, 48, 1, true), recess)
    inner.position.set(0, y - 0.15, cz)
    group.add(inner)
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 48), glow)
    disc.rotation.x = Math.PI / 2
    disc.position.set(0, y, cz)
    group.add(disc)
    const petal = new THREE.Shape()
    petal.absellipse(0, 0, 1.25, 0.42, 0, Math.PI * 2, false, 0)
    const petalGeo = new THREE.ShapeGeometry(petal, 24)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const p = new THREE.Mesh(petalGeo, glow)
      p.position.set(Math.cos(a) * 2.65, y, cz + Math.sin(a) * 2.65)
      p.rotation.set(-Math.PI / 2, 0, 0)
      p.rotateZ(-a)
      group.add(p)
    }
    for (const [sx, dz] of [
      [-7, -3.6],
      [7, -3.6],
      [-7, -13.4],
      [7, -13.4],
      [-7, -8.8],
      [7, -8.8],
    ]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.5), glow)
      panel.position.set(sx, y - 0.03, dz)
      group.add(panel)
    }
    for (const [sx, dz, i] of [
      [0, cz, 34],
      [-6, -5, 22],
      [6, -5, 22],
      [-6, -12.5, 22],
      [6, -12.5, 22],
    ]) {
      const l = new THREE.PointLight('#fff0dc', i, 14, 2)
      l.position.set(sx, y - 1.0, dz)
      group.add(l)
    }
    return group
  }, [])
  return <primitive object={parts} />
}

function Counter() {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const s = tiled(steelSurface(), 4, 1)
    const steel = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.75, map: s.map })
    const body = new THREE.MeshStandardMaterial({ color: '#6a6157', roughness: 0.85 })
    const b = CAFE_COUNTER
    group.add(boxes([{ ...b, h: b.h - 0.05, y: b.y - 0.025 }], body))
    group.add(boxes([{ ...b, y: FLOOR + b.h - 0.025, h: 0.05, w: b.w + 0.08 }], steel))
    group.add(boxes([{ ...b, y: FLOOR + b.h + 0.42, h: 0.03, w: 0.4 }], steel, false))
    const glass = new THREE.MeshStandardMaterial({ color: '#cfe0e3', transparent: true, opacity: 0.2, roughness: 0.05, depthWrite: false })
    group.add(boxes([{ ...b, y: FLOOR + b.h + 0.22, h: 0.4, w: 0.02 }], glass, false))
    return group
  }, [])
  return <primitive object={parts} />
}

function Cafeteria() {
  return (
    <group>
      <HallShell />
      <CameraScreen />
      <CafeCeiling />
      <Tables list={cafeTables} size={CAFE_TABLE} topColor="#4b4a47" />
      <Chairs seats={cafeChairs} seatColor="#3a3632" frameColor="#24221f" />
      <TableProps />
      <Counter />
    </group>
  )
}

// ===========================================================================
// The sheriff's office
// ===========================================================================

/**
 * The text on the office terminals. An index of the record kept behind the
 * vault -- the same sections the CV has -- scrolling slowly. It names no
 * figures and implies no live data.
 */
const TERMINAL_LINES = [
  'RECORDS INDEX',
  '-------------',
  'PERSONNEL ........ 01',
  'POSTINGS ......... 02-04',
  'CAREER CORRIDOR .. 05',
  'PROJECT LAB ...... 07',
  'EDUCATION ........ 08',
  'CERTIFICATION .... 09',
  'SYSTEMS .......... 10',
  'METHODS .......... 11',
  'CONTACT .......... 12',
  '',
  'VAULT: SEALED',
  'ACCESS: VISITOR',
  '',
]

function Terminals() {
  const screen = useMemo(() => makePanel(256, 192), [])
  const t = useRef(0)
  const next = useRef(0)
  useFrame((_, dt) => {
    t.current += dt
    if (t.current < next.current) return
    next.current = t.current + 0.12
    const { ctx, canvas, texture } = screen
    ctx.fillStyle = '#04120c'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.font = 'bold 13px "Cascadia Code", monospace'
    const scroll = Math.floor(t.current * 1.4)
    for (let i = 0; i < 11; i++) {
      const line = TERMINAL_LINES[(scroll + i) % TERMINAL_LINES.length]
      ctx.fillStyle = i === 10 ? '#9dffcb' : 'rgba(110,240,170,0.82)'
      ctx.fillText(line, 12, 22 + i * 15)
    }
    if (Math.sin(t.current * 6) > 0) ctx.fillRect(12, 22 + 10 * 15 - 11, 9, 13)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    for (let y = 0; y < canvas.height; y += 3) ctx.fillRect(0, y, canvas.width, 1)
    texture.needsUpdate = true
  })

  const parts = useMemo(() => {
    const group = new THREE.Group()
    const body = new THREE.MeshStandardMaterial({ color: '#8e877a', roughness: 0.6 })
    const glassMat = new THREE.MeshStandardMaterial({
      map: screen.texture,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: screen.texture,
      emissiveIntensity: 1.1,
      roughness: 0.15,
    })
    for (const d of sheriffDesks) {
      // Facing the chair, which is on the side away from the door.
      const { cx, cz } = tableAxes(d)
      const g = new THREE.Group()
      g.position.set(d.x + cx * 0.05, FLOOR + SHERIFF_DESK.h, d.z + cz * 0.05)
      g.rotation.y = Math.atan2(-cx, -cz)
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.44), body)
      box.position.y = 0.22
      box.castShadow = true
      g.add(box)
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.27), glassMat)
      scr.position.set(0, 0.23, 0.225)
      g.add(scr)
      const kb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.15), body)
      kb.position.set(0, 0.015, 0.36)
      g.add(kb)
      group.add(g)
    }
    return group
  }, [screen])
  return <primitive object={parts} />
}

/** Fluorescent fixtures; one flickers now and then, as old ones do. */
function OfficeLights() {
  const flicker = useRef<THREE.MeshStandardMaterial | null>(null)
  const flickerLight = useRef<THREE.PointLight | null>(null)
  const state = useRef({ until: 0, next: 4 })
  const parts = useMemo(() => {
    const g = framed(OFFICE_F)
    const y = OFFICE.height - 0.06
    const housing = new THREE.MeshStandardMaterial({ color: '#2a2826', roughness: 0.6, metalness: 0.5 })
    let i = 0
    let flick: THREE.MeshStandardMaterial | null = null
    for (const dz of [2.6, 5.2, 7.6])
      for (const sx of [-2.2, 2.2]) {
        const f = new THREE.Group()
        f.position.set(sx, y, -dz)
        const h = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.3), housing)
        const tubeMat = new THREE.MeshStandardMaterial({ color: '#f4fbff', emissive: '#e8f4ff', emissiveIntensity: 1.8 })
        if (i === 3) flick = tubeMat
        const tube = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.03, 0.16), tubeMat)
        tube.position.y = -0.04
        f.add(h, tube)
        g.add(f)
        i++
      }
    let light: THREE.PointLight | null = null
    for (const [dz, k] of [
      [2.6, 0],
      [5.4, 1],
      [8.0, 2],
    ]) {
      const l = new THREE.PointLight('#e6f0ff', k === 2 ? 12 : 16, 12, 2)
      l.position.set(0, y - 0.5, -dz)
      g.add(l)
      if (k === 1) light = l
    }
    return { g, flick, light }
  }, [])
  useEffect(() => {
    flicker.current = parts.flick
    flickerLight.current = parts.light
  }, [parts])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const s = state.current
    let on = 1
    if (t > s.next) {
      s.until = t + 0.6 + Math.random() * 0.8
      s.next = s.until + 6 + Math.random() * 10
    }
    if (t < s.until && !useSilo.getState().reducedMotion) on = Math.random() > 0.45 ? 1 : 0.08
    if (flicker.current) flicker.current.emissiveIntensity = 1.8 * on
    if (flickerLight.current) flickerLight.current.intensity = 16 * on
  })

  return <primitive object={parts.g} />
}

/** Radians a second for the fan: about one turn every 1.6 s. */
const FAN_SPEED = 4

/** Cabinets, desks, round wall lamps, the notice board, a clock and a fan. */
function OfficeFittings() {
  const fan = useRef<THREE.Group | null>(null)
  const fanDt = useRef(1 / 60)
  const clockTex = useMemo(() => makePanel(128, 128), [])
  const lastSecond = useRef(-1)

  useFrame((_, dt) => {
    // A steady turn on a smoothed frame time, slow enough that each frame
    // moves a blade a small part of the way to the next one.
    fanDt.current += (Math.min(dt, 1 / 20) - fanDt.current) * 0.1
    if (fan.current && !useSilo.getState().reducedMotion) fan.current.rotation.z -= fanDt.current * FAN_SPEED
    // The clock tells the visitor's real time.
    const now = new Date()
    if (now.getSeconds() === lastSecond.current) return
    lastSecond.current = now.getSeconds()
    const { ctx, texture } = clockTex
    ctx.fillStyle = '#e9e2d4'
    ctx.beginPath()
    ctx.arc(64, 64, 62, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#2a2420'
    ctx.lineWidth = 4
    ctx.stroke()
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      ctx.fillStyle = '#2a2420'
      ctx.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 2, 4, 4)
    }
    const hand = (frac: number, len: number, w: number) => {
      const a = frac * Math.PI * 2
      ctx.lineWidth = w
      ctx.beginPath()
      ctx.moveTo(64, 64)
      ctx.lineTo(64 + Math.sin(a) * len, 64 - Math.cos(a) * len)
      ctx.stroke()
    }
    const h = (now.getHours() % 12) / 12 + now.getMinutes() / 720
    const m = now.getMinutes() / 60 + now.getSeconds() / 3600
    ctx.strokeStyle = '#1e1a17'
    hand(h, 30, 5)
    hand(m, 44, 3)
    ctx.strokeStyle = '#a3382c'
    hand(now.getSeconds() / 60, 48, 1.5)
    texture.needsUpdate = true
  })

  const parts = useMemo(() => {
    const group = new THREE.Group()
    const drawers = canvasTexture(64, 128, (ctx) => {
      ctx.fillStyle = '#6b6a4e'
      ctx.fillRect(0, 0, 64, 128)
      ctx.strokeStyle = '#3b3a2a'
      ctx.lineWidth = 2
      for (let i = 0; i < 4; i++) {
        ctx.strokeRect(5, 5 + i * 31, 54, 27)
        ctx.fillStyle = '#c9c2a6'
        ctx.fillRect(26, 16 + i * 31, 12, 4)
      }
    })
    group.add(boxes(sheriffCabinets, new THREE.MeshStandardMaterial({ map: drawers, roughness: 0.6, metalness: 0.4 })))

    // Desks: worn wood tops on steel pedestals.
    const deskMat = new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 0.65 })
    const pedMat = new THREE.MeshStandardMaterial({ color: '#59584c', roughness: 0.6, metalness: 0.5 })
    const tops: Box[] = []
    const peds: Box[] = []
    for (const d of sheriffDesks) {
      tops.push(tableBox(d, SHERIFF_DESK.w, 0.05, SHERIFF_DESK.d, SHERIFF_DESK.h - 0.05))
      const { ax, az } = tableAxes(d)
      for (const along of [-0.55, 0.55])
        peds.push({
          x: d.x + ax * along,
          y: FLOOR + (SHERIFF_DESK.h - 0.05) / 2,
          z: d.z + az * along,
          w: 0.5,
          h: SHERIFF_DESK.h - 0.05,
          d: SHERIFF_DESK.d - 0.06,
          rotY: d.rotY,
        })
    }
    group.add(boxes(tops, deskMat), boxes(peds, pedMat))

    // In the office's own frame from here on.
    const g = framed(OFFICE_F)
    group.add(g)
    // Round lamps on the front and back walls, warm against the cold tubes.
    const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 2.2 })
    const lampGeo = new THREE.SphereGeometry(0.17, 16, 12)
    for (const [sx, dz] of [
      [-4.6, OFFICE.from + 0.1],
      [-2.6, OFFICE.from + 0.1],
      [2.6, OFFICE.from + 0.1],
      [4.6, OFFICE.from + 0.1],
      [-4.6, OFFICE.to - 0.1],
      [4.6, OFFICE.to - 0.1],
    ]) {
      const lamp = new THREE.Mesh(lampGeo, lampMat)
      lamp.position.set(sx, 2.55, -dz)
      g.add(lamp)
    }
    // Notice board on the right-hand wall: a grid of pinned sheets.
    const board = canvasTexture(256, 160, (ctx) => {
      ctx.fillStyle = '#7a5b3c'
      ctx.fillRect(0, 0, 256, 160)
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 7; col++) {
          const shade = 210 + ((row * 7 + col) * 13) % 40
          ctx.fillStyle = `rgb(${shade},${shade - 8},${shade - 24})`
          ctx.fillRect(10 + col * 35, 10 + row * 37, 28, 32)
          ctx.fillStyle = 'rgba(60,50,40,0.5)'
          for (let l = 0; l < 4; l++) ctx.fillRect(13 + col * 35, 17 + row * 37 + l * 6, 20 - (l % 2) * 6, 2)
          ctx.fillStyle = '#a3382c'
          ctx.fillRect(22 + col * 35, 11 + row * 37, 4, 4)
        }
    })
    const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshStandardMaterial({ map: board, roughness: 0.9 }))
    boardMesh.position.set(OFFICE.half - 0.03, 1.9, -5.6)
    boardMesh.rotation.y = -Math.PI / 2
    g.add(boardMesh)
    return { group, g }
  }, [])

  return (
    <group>
      <primitive object={parts.group} />
      {/* Clock and fan on the left-hand wall, in the office's frame. */}
      <primitive object={parts.g}>
        <mesh position={[-OFFICE.half + 0.03, 2.9, -4.6]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[0.32, 32]} />
          <meshStandardMaterial map={clockTex.texture} roughness={0.5} />
        </mesh>
        <group position={[-OFFICE.half + 0.3, 2.7, -6.9]} rotation={[0, Math.PI / 2, 0]}>
          <mesh>
            <torusGeometry args={[0.36, 0.02, 6, 24]} />
            <meshStandardMaterial color="#3a3833" roughness={0.5} metalness={0.7} />
          </mesh>
          <group ref={fan} position={[0, 0, 0.03]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 0.05, 16]} />
              <meshStandardMaterial color="#3a3833" roughness={0.5} metalness={0.7} />
            </mesh>
            {[0, 1, 2].map((i) => (
              <group key={i} rotation={[0, 0, (i / 3) * Math.PI * 2]}>
                <mesh position={[0.18, 0, 0]} rotation={[0.35, 0, 0]}>
                  <boxGeometry args={[0.26, 0.11, 0.01]} />
                  <meshStandardMaterial color="#6f6c63" roughness={0.6} metalness={0.4} />
                </mesh>
              </group>
            ))}
          </group>
          <mesh position={[0, 0, 0.045]}>
            <circleGeometry args={[0.33, 32]} />
            <meshBasicMaterial color="#6f6c63" transparent opacity={0.16} depthWrite={false} />
          </mesh>
        </group>
      </primitive>
    </group>
  )
}

function SheriffOffice() {
  return (
    <group>
      <OfficeShell />
      <Wainscot />
      <Chairs seats={sheriffChairs} seatColor="#3f5a48" frameColor="#55534c" />
      <Terminals />
      <OfficeLights />
      <OfficeFittings />
      <Vault />
    </group>
  )
}

export default function Level01() {
  return (
    <group name="level1-probe">
      <PortraitWindow />
      <IdentityConsole />
      <CreedWall />
      <SheriffOffice />
      <Cafeteria />
    </group>
  )
}
