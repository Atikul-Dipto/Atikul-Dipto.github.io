import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { wastelandMaterial } from '../wasteland'
import { PALETTE, SHAFT_RADIUS } from '../../content/floors'
import {
  CAFE,
  CAFE_COUNTER,
  CAFE_TABLE,
  CHAIR,
  CONSOLE_ANGLE,
  FLOOR,
  PORTRAIT_ANGLE,
  ROOM_INNER,
  SHERIFF,
  SHERIFF_DESK,
  VAULT,
  VAULT_PORTAL,
  WALL_T,
  WINDOW,
  cafeChairs,
  cafeTables,
  mid,
  polar,
  roomWalls,
  sheriffCabinets,
  sheriffChairs,
  sheriffDesks,
  tangential,
} from '../../content/level1'
import type { Box, Room, Seat } from '../../content/level1'
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

/** A flat ring sector with polar UVs: u round the arc, v out along the radius. */
function sector(r0: number, r1: number, a0: number, a1: number, y: number, down: boolean, uScale = 1, vScale = 1) {
  const segs = Math.max(8, Math.round((a1 - a0) * 40))
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs
    for (const [r, v] of [
      [r0, 0],
      [r1, 1],
    ]) {
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r)
      uv.push((i / segs) * uScale, v * vScale)
    }
    if (i > 0) {
      const b = (i - 1) * 2
      if (down) idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
      else idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** A vertical band on a cylinder, facing inward, between two world angles. */
function band(r: number, a0: number, a1: number, y0: number, h: number) {
  // Cylinder theta is measured from +Z, opposite in sense to world angle.
  const g = new THREE.CylinderGeometry(r, r, h, Math.max(8, Math.round((a1 - a0) * 40)), 1, true, Math.PI / 2 - a1, a1 - a0)
  g.translate(0, y0 + h / 2, 0)
  return g
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

function signTexture(text: string, sub: string) {
  return canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = '#16120f'
    ctx.fillRect(0, 0, 512, 128)
    ctx.strokeStyle = 'rgba(201,153,107,0.6)'
    ctx.lineWidth = 4
    ctx.strokeRect(6, 6, 500, 116)
    ctx.fillStyle = PALETTE.brassHot
    ctx.font = 'bold 54px "Segoe UI", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 56)
    ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif'
    ctx.fillStyle = 'rgba(237,233,230,0.7)'
    ctx.fillText(sub, 256, 104)
  })
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
// Room shells: walls, glazing, ceilings, floors
// ===========================================================================

function RoomShell({ room }: { room: Room }) {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const walls = roomWalls(room)
    // The facades are the same precast cladding as the shaft wall. Each wall
    // box is one 0.05 rad slice, about 0.7 m, and half a tile across it is
    // one panel column -- so the joints land on the slices.
    const c = tiled(claddingSurface(), 0.5, room.height / 4)
    const wallMat = new THREE.MeshStandardMaterial({
      color: room.id === 'sheriff' ? '#c9cbc6' : '#ffffff',
      roughness: 0.9,
      metalness: 0.08,
      map: c.map,
      normalMap: c.normalMap,
      roughnessMap: c.roughnessMap,
    })
    group.add(boxes(walls.solid, wallMat))
    const glass = new THREE.MeshStandardMaterial({
      color: '#bcd3d8',
      transparent: true,
      opacity: 0.16,
      roughness: 0.05,
      metalness: 0.2,
      envMapIntensity: 1.3,
      depthWrite: false,
    })
    if (walls.glass.length) group.add(boxes(walls.glass, glass, false))

    // Ceiling slab, drawn twice: its soffit facing down into the room and its
    // top facing up into the atrium.
    const ceilY = FLOOR + room.height
    const conc = tiled(concreteSurface(), 10, 3)
    const ceilMat =
      room.id === 'sheriff'
        ? new THREE.MeshStandardMaterial({ map: woodCeiling(), roughness: 0.8, color: '#a88a68' })
        : new THREE.MeshStandardMaterial({ color: '#a39a8f', roughness: 0.95, map: conc.map, normalMap: conc.normalMap })
    const soffit = new THREE.Mesh(
      sector(ROOM_INNER - WALL_T / 2, SHAFT_RADIUS, room.from, room.to, ceilY, true, room.id === 'sheriff' ? 1 : 6, room.id === 'sheriff' ? 1 : 2),
      ceilMat,
    )
    soffit.receiveShadow = true
    group.add(soffit)
    const roof = new THREE.Mesh(
      sector(ROOM_INNER - WALL_T / 2, SHAFT_RADIUS, room.from, room.to, ceilY + 0.3, false),
      new THREE.MeshStandardMaterial({ color: PALETTE.concreteDark, roughness: 1 }),
    )
    roof.castShadow = true
    roof.receiveShadow = true
    group.add(roof)

    // A floor finish over the deck plate: polished concrete in the
    // cafeteria, worn linoleum in the office.
    const floorMat =
      room.id === 'sheriff'
        ? new THREE.MeshStandardMaterial({ color: '#5e5a4c', roughness: 0.62, metalness: 0.05 })
        : new THREE.MeshStandardMaterial({ color: '#8d867b', roughness: 0.38, metalness: 0.08, map: conc.map })
    const floor = new THREE.Mesh(sector(ROOM_INNER, SHAFT_RADIUS - 0.06, room.from + 0.004, room.to - 0.004, FLOOR + 0.006, false, 6, 2), floorMat)
    floor.receiveShadow = true
    group.add(floor)

    // Signage over the door, on the promenade side.
    const m = mid(room)
    const [sx, sz] = polar(m, ROOM_INNER - WALL_T / 2 - 0.03)
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.6),
      new THREE.MeshStandardMaterial({
        map: room.id === 'sheriff' ? signTexture('SHERIFF', 'RECORDS · LEVEL 01') : signTexture('CAFETERIA', 'LEVEL 01'),
        emissive: new THREE.Color('#ffffff'),
        emissiveMap: room.id === 'sheriff' ? signTexture('SHERIFF', 'RECORDS · LEVEL 01') : signTexture('CAFETERIA', 'LEVEL 01'),
        emissiveIntensity: 0.6,
      }),
    )
    sign.position.set(sx, FLOOR + 3.15, sz)
    // Face out, towards the promenade and the axis.
    sign.rotation.y = Math.PI / 2 - m + Math.PI
    group.add(sign)
    return group
  }, [room])

  return <primitive object={parts} />
}

function woodCeiling() {
  const t = canvasTexture(512, 256, (ctx) => {
    // Radial planks, so the sector's polar UVs turn them into spokes.
    for (let i = 0; i < 32; i++) {
      const shade = 70 + ((i * 37) % 23)
      ctx.fillStyle = `rgb(${shade + 40},${shade + 22},${shade})`
      ctx.fillRect(i * 16, 0, 16, 256)
      ctx.fillStyle = 'rgba(20,12,6,0.55)'
      ctx.fillRect(i * 16, 0, 2, 256)
    }
  })
  t.repeat.set(3, 1)
  return t
}

/** Green-tiled lower walls in the office. */
function Wainscot() {
  const parts = useMemo(() => {
    const group = new THREE.Group()
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

    const m = mid(SHERIFF)
    const doorHalf = SHERIFF.doorWidth / 2 / ROOM_INNER
    // Inside face of the facade, either side of the door.
    for (const [a0, a1] of [
      [SHERIFF.from + 0.01, m - doorHalf],
      [m + doorHalf, SHERIFF.to - 0.01],
    ]) {
      const r = ROOM_INNER + WALL_T / 2 + 0.012
      group.add(new THREE.Mesh(band(r, a0, a1, FLOOR, 1.3), mat((a1 - a0) * r)))
    }
    // Back wall, either side of the vault portal.
    const vHalf = (VAULT_PORTAL.outer - 0.02) / (SHAFT_RADIUS - 0.03)
    for (const [a0, a1] of [
      [SHERIFF.from + 0.01, VAULT.angle - vHalf],
      [VAULT.angle + vHalf, SHERIFF.to - 0.01],
    ]) {
      const r = SHAFT_RADIUS - 0.03
      group.add(new THREE.Mesh(band(r, a0, a1, FLOOR, 1.3), mat((a1 - a0) * r)))
    }
    return group
  }, [])
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
        // Rotate the leg offset into the chair's frame.
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

/** Tables: a top and four legs, plus what was left on them. */
function Tables({ list, size, topColor }: { list: Array<{ a: number; r: number }>; size: { w: number; d: number; h: number }; topColor: string }) {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const p = tiled(plateSurface(), 2, 1)
    const topMat = new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.55, metalness: 0.35, map: p.map })
    const legMat = new THREE.MeshStandardMaterial({ color: '#2b2a28', roughness: 0.5, metalness: 0.7 })
    const tops: Box[] = []
    const legs: Box[] = []
    for (const t of list) {
      const top = tangential(t.a, t.r, size.w, 0.045, size.d, size.h - 0.045)
      tops.push(top)
      const tx = -Math.sin(t.a)
      const tz = Math.cos(t.a)
      const rx = Math.cos(t.a)
      const rz = Math.sin(t.a)
      for (const along of [-size.w / 2 + 0.1, size.w / 2 - 0.1])
        for (const across of [-size.d / 2 + 0.08, size.d / 2 - 0.08]) {
          legs.push({
            x: rx * (t.r + across) + tx * along,
            y: FLOOR + (size.h - 0.045) / 2,
            z: rz * (t.r + across) + tz * along,
            w: 0.05,
            h: size.h - 0.045,
            d: 0.05,
            rotY: top.rotY,
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
      const tx = -Math.sin(t.a)
      const tz = Math.cos(t.a)
      const rx = Math.cos(t.a)
      const rz = Math.sin(t.a)
      const at = (along: number, across: number): [number, number] => [
        rx * (t.r + across) + tx * along,
        rz * (t.r + across) + tz * along,
      ]
      const nPlates = 1 + Math.floor(rand() * 3)
      for (let k = 0; k < nPlates; k++) {
        const [x, z] = at((rand() - 0.5) * 1.6, (rand() > 0.5 ? 1 : -1) * 0.22)
        dummy.position.set(x, top + 0.009, z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        plates.setMatrixAt(np++, dummy.matrix)
        if (rand() > 0.35) {
          dummy.position.set(x + tx * 0.24, top + 0.05, z + tz * 0.24)
          dummy.updateMatrix()
          cups.setMatrixAt(nc++, dummy.matrix)
        }
      }
      // A cluster of condiments in the middle of most tables.
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

/**
 * The view out of the cafeteria window: the surface, as the silo's cameras
 * show it -- a scorched plain, dead trees, ash sky by day and stars by night.
 *
 * It is a screen, not a window, and it is static: an image mapped onto the
 * glass, not a scene sampled by the direction from the eye, so it does not
 * slide past as you walk along it. The hour still comes from lib/daylight, so
 * it is the same time out there as in the dome.
 */
function CafeWindow() {
  const view = useMemo(() => wastelandMaterial(), [])
  const uniforms = view.uniforms
  const light = useRef<THREE.PointLight>(null)
  const light2 = useRef<THREE.PointLight>(null)
  const geo = useMemo(() => band(SHAFT_RADIUS - 0.08, WINDOW.from, WINDOW.to, FLOOR + WINDOW.sill, WINDOW.head - WINDOW.sill), [])

  useFrame(() => {
    const d = daylight()
    uniforms.uHorizon.value.copy(d.horizon)
    uniforms.uGlow.value = d.glow
    uniforms.uNight.value = d.night
    for (const l of [light.current, light2.current]) {
      if (!l) continue
      l.color.copy(d.horizon).lerp(d.sky, 0.4)
      l.intensity = 6 + d.glow * 34
    }
  })

  const m = mid(CAFE)
  const frame = useMemo(() => {
    const group = new THREE.Group()
    const steel = new THREE.MeshStandardMaterial({ color: '#2f2c29', roughness: 0.45, metalness: 0.8 })
    const conc = new THREE.MeshStandardMaterial({ color: '#6d665d', roughness: 0.95 })
    const r = SHAFT_RADIUS - 0.12
    // Sill and head.
    for (const [y, h] of [
      [WINDOW.sill - 0.18, 0.36],
      [WINDOW.head + 0.18, 0.36],
    ]) {
      group.add(new THREE.Mesh(band(r - 0.02, WINDOW.from - 0.02, WINDOW.to + 0.02, FLOOR + y - h / 2, h), conc))
    }
    // Mullions every 3 m, and columns at either end.
    const n = Math.round(((WINDOW.to - WINDOW.from) * r) / 3)
    for (let i = 0; i <= n; i++) {
      const a = WINDOW.from + ((WINDOW.to - WINDOW.from) * i) / n
      const end = i === 0 || i === n
      const [x, z] = polar(a, r - (end ? 0.25 : 0.06))
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(end ? 0.7 : 0.1, CAFE.height, end ? 0.6 : 0.16), end ? conc : steel)
      mesh.position.set(x, FLOOR + CAFE.height / 2, z)
      mesh.rotation.y = -a - Math.PI / 2
      mesh.castShadow = true
      group.add(mesh)
    }
    return group
  }, [])

  return (
    <group>
      <mesh geometry={geo} material={view.material} />
      <primitive object={frame} />
      {/* Light coming in through the glass. */}
      {[-0.32, 0.32].map((off, i) => {
        const [x, z] = polar(m + off, SHAFT_RADIUS - 2.4)
        return (
          <pointLight key={off} ref={i ? light2 : light} position={[x, FLOOR + 3, z]} distance={16} decay={2} />
        )
      })}
    </group>
  )
}

/** The radial ceiling: a ring of petal-shaped lights round a central disc. */
function CafeCeiling() {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const m = mid(CAFE)
    const [cx, cz] = polar(m, 17.6)
    const y = FLOOR + CAFE.height - 0.03
    const glow = new THREE.MeshStandardMaterial({
      color: '#fff6e8',
      emissive: new THREE.Color('#fff1dc'),
      emissiveIntensity: 1.7,
      roughness: 0.5,
      side: THREE.DoubleSide,
    })
    const recess = new THREE.MeshStandardMaterial({ color: '#4c463f', roughness: 0.9, side: THREE.DoubleSide })

    // Recessed ring round the whole rose.
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, 0.55, 64, 1, true), recess)
    ring.position.set(cx, y - 0.27, cz)
    group.add(ring)
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.3, 48, 1, true), recess)
    inner.position.set(cx, y - 0.15, cz)
    group.add(inner)

    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 48), glow)
    disc.rotation.x = Math.PI / 2
    disc.position.set(cx, y, cz)
    group.add(disc)

    const petal = new THREE.Shape()
    petal.absellipse(0, 0, 1.25, 0.42, 0, Math.PI * 2, false, 0)
    const petalGeo = new THREE.ShapeGeometry(petal, 24)
    const petals = 12
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2
      const p = new THREE.Mesh(petalGeo, glow)
      p.rotation.set(Math.PI / 2, 0, a)
      p.position.set(cx + Math.cos(a) * 2.65, y, cz + Math.sin(a) * 2.65)
      // Petals lie flat and point out from the centre.
      p.rotation.set(-Math.PI / 2, 0, 0)
      p.rotateZ(-a)
      group.add(p)
    }

    // Plain light panels out towards the corners of the hall.
    for (const [off, r] of [
      [-0.55, 15.2],
      [0.55, 15.2],
      [-0.55, 20.3],
      [0.55, 20.3],
      [-0.25, 20.6],
      [0.25, 20.6],
    ]) {
      const [x, z] = polar(m + off, r)
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.5), glow)
      panel.position.set(x, y - 0.03, z)
      panel.rotation.y = -(m + off) - Math.PI / 2
      group.add(panel)
    }
    return { group, cx, cz, y }
  }, [])

  return (
    <group>
      <primitive object={parts.group} />
      <pointLight color="#fff0dc" intensity={34} distance={15} decay={2} position={[parts.cx, parts.y - 1.2, parts.cz]} />
      {[-0.55, 0.55].map((off) => {
        const [x, z] = polar(mid(CAFE) + off, 17.6)
        return <pointLight key={off} color="#ffeccf" intensity={24} distance={14} decay={2} position={[x, parts.y - 0.8, z]} />
      })}
    </group>
  )
}

function Counter() {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const s = tiled(steelSurface(), 4, 1)
    const steel = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.75, map: s.map })
    const body = new THREE.MeshStandardMaterial({ color: '#6a6157', roughness: 0.85 })
    const b = CAFE_COUNTER
    group.add(boxes([{ ...b, h: b.h - 0.05, y: b.y - 0.025 }], body))
    group.add(boxes([{ ...b, y: FLOOR + b.h - 0.025, h: 0.05, d: b.d + 0.08 }], steel))
    // Sneeze guard and the tray rail.
    group.add(boxes([{ ...b, y: FLOOR + b.h + 0.42, h: 0.03, d: 0.4 }], steel, false))
    const glass = new THREE.MeshStandardMaterial({ color: '#cfe0e3', transparent: true, opacity: 0.2, roughness: 0.05, depthWrite: false })
    group.add(boxes([{ ...b, y: FLOOR + b.h + 0.22, h: 0.4, d: 0.02 }], glass, false))
    return group
  }, [])
  return <primitive object={parts} />
}

function Cafeteria() {
  return (
    <group>
      <RoomShell room={CAFE} />
      <CafeWindow />
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
      const face = d.a
      const [x, z] = polar(d.a, d.r + 0.05)
      const g = new THREE.Group()
      g.position.set(x, FLOOR + SHERIFF_DESK.h, z)
      g.rotation.y = Math.PI / 2 - face
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

/** A fluorescent fixture that flickers now and then, as old ones do. */
function OfficeLights() {
  const flicker = useRef<THREE.MeshStandardMaterial>(null)
  const flickerLight = useRef<THREE.PointLight>(null)
  const state = useRef({ until: 0, next: 4 })
  const fixtures = useMemo(() => {
    const out: Array<{ x: number; z: number; rotY: number }> = []
    for (const r of [15.4, 18.0, 20.4])
      for (const off of [-0.2, 0.2]) {
        const a = mid(SHERIFF) + off
        const [x, z] = polar(a, r)
        out.push({ x, z, rotY: -a - Math.PI / 2 })
      }
    return out
  }, [])
  const y = FLOOR + SHERIFF.height - 0.06

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

  return (
    <group>
      {fixtures.map((f, i) => (
        <group key={i} position={[f.x, y, f.z]} rotation={[0, f.rotY, 0]}>
          <mesh>
            <boxGeometry args={[1.5, 0.07, 0.3]} />
            <meshStandardMaterial color="#2a2826" roughness={0.6} metalness={0.5} />
          </mesh>
          <mesh position={[0, -0.04, 0]}>
            <boxGeometry args={[1.36, 0.03, 0.16]} />
            <meshStandardMaterial
              ref={i === 3 ? flicker : undefined}
              color="#f4fbff"
              emissive="#e8f4ff"
              emissiveIntensity={1.8}
            />
          </mesh>
        </group>
      ))}
      {[15.6, 18.6].map((r, i) => {
        const [x, z] = polar(mid(SHERIFF), r)
        return (
          <pointLight
            key={r}
            ref={i === 1 ? flickerLight : undefined}
            color="#e6f0ff"
            intensity={16}
            distance={12}
            decay={2}
            position={[x, y - 0.5, z]}
          />
        )
      })}
      {(() => {
        const [x, z] = polar(mid(SHERIFF), 20.6)
        return <pointLight color="#e6f0ff" intensity={12} distance={9} decay={2} position={[x, y - 0.5, z]} />
      })()}
    </group>
  )
}

/** Radians a second for the fan: about one turn every 1.6 s. */
const FAN_SPEED = 4

/** Round wall lamps, cabinets, the notice board, a clock and a fan. */
function OfficeFittings() {
  const fan = useRef<THREE.Group>(null)
  const fanDt = useRef(1 / 60)
  const clockTex = useMemo(() => makePanel(128, 128), [])
  const lastSecond = useRef(-1)

  useFrame((_, dt) => {
    // A steady turn. The step is taken from a smoothed frame time, so a
    // dropped frame does not kick the blades forward, and the speed is low
    // enough that at any frame rate each frame moves a blade a small part of
    // the 120 degrees between blades -- fast, and the eye pairs each blade
    // with the wrong one in the next frame and sees the fan stutter or run
    // backwards.
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
    // Cabinets with drawer fronts painted on.
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
      tops.push(tangential(d.a, d.r, SHERIFF_DESK.w, 0.05, SHERIFF_DESK.d, SHERIFF_DESK.h - 0.05))
      const tx = -Math.sin(d.a)
      const tz = Math.cos(d.a)
      for (const along of [-0.55, 0.55]) {
        const [x, z] = polar(d.a, d.r)
        peds.push({
          x: x + tx * along,
          y: FLOOR + (SHERIFF_DESK.h - 0.05) / 2,
          z: z + tz * along,
          w: 0.5,
          h: SHERIFF_DESK.h - 0.05,
          d: SHERIFF_DESK.d - 0.06,
          rotY: -d.a - Math.PI / 2,
        })
      }
    }
    group.add(boxes(tops, deskMat), boxes(peds, pedMat))

    // Round lamps on the walls, warm against the cold tubes.
    const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 2.2 })
    const lampGeo = new THREE.SphereGeometry(0.17, 16, 12)
    const m = mid(SHERIFF)
    for (const off of [-0.38, -0.2, 0.2, 0.38]) {
      const [x, z] = polar(m + off, ROOM_INNER + WALL_T / 2 + 0.08)
      const lamp = new THREE.Mesh(lampGeo, lampMat)
      lamp.position.set(x, FLOOR + 2.55, z)
      group.add(lamp)
    }
    for (const off of [-0.33, 0.33]) {
      const [x, z] = polar(m + off, SHAFT_RADIUS - 0.12)
      const lamp = new THREE.Mesh(lampGeo, lampMat)
      lamp.position.set(x, FLOOR + 2.55, z)
      group.add(lamp)
    }

    // Notice board on the far side wall: a grid of pinned sheets.
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
    const side = SHERIFF.to
    const r0 = 17.6
    const off = (WALL_T / 2 + 0.02) / r0
    const [bx, bz] = polar(side - off, r0)
    const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshStandardMaterial({ map: board, roughness: 0.9 }))
    boardMesh.position.set(bx, FLOOR + 1.9, bz)
    // Facing back into the room.
    boardMesh.rotation.y = -side + Math.PI
    group.add(boardMesh)
    return { group, side, off }
  }, [])

  // Clock and fan on the near side wall.
  const near = SHERIFF.from
  const [cx, cz] = polar(near + (WALL_T / 2 + 0.03) / 17.0, 17.0)
  const [fx, fz] = polar(near + (WALL_T / 2 + 0.3) / 19.4, 19.4)

  return (
    <group>
      <primitive object={parts.group} />
      <mesh position={[cx, FLOOR + 2.9, cz]} rotation={[0, -near, 0]}>
        <circleGeometry args={[0.32, 32]} />
        <meshStandardMaterial map={clockTex.texture} roughness={0.5} />
      </mesh>
      <group position={[fx, FLOOR + 2.7, fz]} rotation={[0, -near, 0]}>
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[0.36, 0.02, 6, 24]} />
          <meshStandardMaterial color="#3a3833" roughness={0.5} metalness={0.7} />
        </mesh>
        {/* Three blades from a hub -- each its own blade, not a bar through
            the middle, which made six and doubled the strobing. */}
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
        {/* The blur a turning fan leaves: a faint disc over the blades. */}
        <mesh position={[0, 0, 0.045]}>
          <circleGeometry args={[0.33, 32]} />
          <meshBasicMaterial color="#6f6c63" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

function SheriffOffice() {
  return (
    <group>
      <RoomShell room={SHERIFF} />
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
    <group>
      <PortraitWindow />
      <IdentityConsole />
      <CreedWall />
      <SheriffOffice />
      <Cafeteria />
    </group>
  )
}
