import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  ARCADE_GAMES,
  CABINET,
  CHAMBER,
  CH_DOOR,
  CH_OPENING,
  CH_TUNNEL,
  CLOSETS,
  CORRIDOR,
  CORRIDORS,
  FLOOR6,
  FRONT,
  GRAMOPHONE,
  LEVEL,
  ROOM_INFO,
  MAP_BOARD,
  MAZE,
  MAZE_FROM,
  MAZE_SPAN,
  MUSIC,
  ROOMS6,
  ROOM_SECTIONS,
  SEATS,
  SHELF,
  SHELF_RUNS,
  SPEAKERS,
  STAGE,
  cabinetPhi,
  inCorridor,
  inRoom,
  mazeCell,
  mazeHedges,
  roomPoint,
  roomPolar,
  roomWallGaps,
  type Room,
} from '../../content/level6'
import { AimRoom, CitizensRoom, DroneRoom, PoemsRoom, SoundBox } from './RecRooms'
import { seeded } from '../../content/frame'
import type { Box } from '../../content/level1'
import { breaker, setVaultGrind, vaultClunk, vaultStop } from '../../lib/audio'
import { chamber, doorRoll, sectionLit, stepChamberDoor } from '../../lib/chamber'
import { jukebox, setLevel, stop } from '../../lib/jukebox'
import { drawMazeMap } from '../../lib/mazeMap'
import { useSilo } from '../../state/useSilo'

/**
 * LEVEL 4 — RECREATION, drawn from content/level6.ts.
 *
 * A hedge maze right round the ring from the plaza where the bridge lands; a
 * map of it on the plaza; and at the back of the maze three round doors that
 * roll aside into the wall. Behind them, rooms cut into the rock and joined by
 * corridors -- the chamber with its orrery and arcade, the
 * music hall, and an empty room -- each dark until someone walks in, then lit
 * a section at a time round the room, and dark again once everyone has gone
 * and its door is shut.
 */

const CH_PASS_W = CH_TUNNEL.half * 2
const GRAM_AT = roomPoint(MUSIC, GRAMOPHONE.phi, GRAMOPHONE.rr)
const dummy = new THREE.Object3D()
const unitBox = new THREE.BoxGeometry(1, 1, 1)

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

export function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Clipped hedge: dense leaves, darker in the gaps. */
function hedgeTexture() {
  return canvasTexture(
    256,
    256,
    (g) => {
      const r = seeded(31)
      g.fillStyle = '#26401f'
      g.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 9000; i++) {
        const x = r() * 256
        const y = r() * 256
        const l = 14 + r() * 24
        g.fillStyle = `hsl(${88 + r() * 34}, ${22 + r() * 22}%, ${l}%)`
        g.beginPath()
        g.ellipse(x, y, 1 + r() * 2, 0.6 + r() * 1.2, r() * Math.PI, 0, Math.PI * 2)
        g.fill()
      }
    },
    true,
  )
}

/** The door's face: concentric rings, a ring of bolts, the hub. */
function doorFace() {
  return canvasTexture(512, 512, (g) => {
    const c = 256
    const grad = g.createRadialGradient(c, c, 20, c, c, 256)
    grad.addColorStop(0, '#6c6a63')
    grad.addColorStop(1, '#3d3b37')
    g.fillStyle = grad
    g.fillRect(0, 0, 512, 512)
    g.strokeStyle = 'rgba(20,18,16,0.85)'
    for (const [r, w] of [
      [240, 6],
      [200, 3],
      [150, 4],
      [80, 3],
    ]) {
      g.lineWidth = w
      g.beginPath()
      g.arc(c, c, r, 0, Math.PI * 2)
      g.stroke()
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      g.fillStyle = '#8c8577'
      g.beginPath()
      g.arc(c + Math.cos(a) * 222, c + Math.sin(a) * 222, 7, 0, Math.PI * 2)
      g.fill()
    }
    // Spokes, so the roll can be seen.
    g.strokeStyle = 'rgba(25,23,20,0.6)'
    g.lineWidth = 10
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      g.beginPath()
      g.moveTo(c + Math.cos(a) * 85, c + Math.sin(a) * 85)
      g.lineTo(c + Math.cos(a) * 195, c + Math.sin(a) * 195)
      g.stroke()
    }
    g.fillStyle = '#b89062'
    g.font = 'bold 34px "Courier New", monospace'
    g.textAlign = 'center'
    g.fillText('6', c, c + 12)
  })
}

/** Chalk on slate: payoff matrices, a maze, a little algebra. */
function chalkboard() {
  return canvasTexture(
    2048,
    256,
    (g) => {
      g.fillStyle = '#1f2722'
      g.fillRect(0, 0, 2048, 256)
      const r = seeded(9)
      // Smudges.
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(200,210,200,${(0.02 + r() * 0.04).toFixed(3)})`
        g.beginPath()
        g.ellipse(r() * 2048, r() * 256, 40 + r() * 90, 10 + r() * 30, 0, 0, Math.PI * 2)
        g.fill()
      }
      g.strokeStyle = g.fillStyle = 'rgba(235,236,226,0.85)'
      g.lineWidth = 2
      g.font = '22px "Segoe Print", "Comic Sans MS", cursive'
      const write = (t: string, x: number, y: number, size = 22) => {
        g.font = `${size}px "Segoe Print", "Comic Sans MS", cursive`
        g.fillText(t, x, y)
      }
      // A prisoner's dilemma.
      g.strokeRect(60, 70, 220, 140)
      g.beginPath()
      g.moveTo(170, 70)
      g.lineTo(170, 210)
      g.moveTo(60, 140)
      g.lineTo(280, 140)
      g.stroke()
      write('C', 105, 60)
      write('D', 215, 60)
      write('C', 30, 112)
      write('D', 30, 182)
      write('3, 3', 85, 112)
      write('0, 5', 195, 112)
      write('5, 0', 85, 182)
      write('1, 1', 195, 182)
      write('Nash: (D, D)', 300, 120, 26)
      write('Pareto: (C, C)', 300, 170, 26)
      // Guess two thirds.
      write('x = 2/3 · avg(x)', 560, 80, 28)
      write('→ 0 if all rational', 560, 130)
      write('but they never are', 580, 175)
      // A maze, sketched.
      g.lineWidth = 3
      const mx = 880
      for (let i = 0; i < 6; i++) {
        g.beginPath()
        g.moveTo(mx + r() * 20, 50 + i * 30)
        g.lineTo(mx + 120 + r() * 80, 50 + i * 30)
        g.lineTo(mx + 120 + r() * 80, 80 + i * 30)
        g.stroke()
      }
      write('START', mx - 10, 240, 18)
      // The stag hunt.
      write('Stag Hunt', 1160, 70, 28)
      write('S,S → 4,4    H,H → 3,3', 1160, 120)
      write('trust vs. safety', 1170, 165)
      // The ultimatum.
      write('Ultimatum: offer x of 10', 1500, 80, 26)
      write('reject → 0, 0', 1500, 130)
      write('fairness has a price', 1520, 175)
      write('E[u] = Σ p·u', 1820, 220, 24)
    },
    true,
  )
}

/** A cabinet's marquee and screen. */
function cabinetScreen(title: string) {
  return canvasTexture(256, 320, (g) => {
    g.fillStyle = '#0b0f12'
    g.fillRect(0, 0, 256, 320)
    g.fillStyle = '#e8b04b'
    g.fillRect(0, 0, 256, 70)
    g.fillStyle = '#1a1206'
    g.font = 'bold 22px "Courier New", monospace'
    g.textAlign = 'center'
    const words = title.split(' ')
    if (words.length > 1 && title.length > 14) {
      g.fillText(words.slice(0, Math.ceil(words.length / 2)).join(' '), 128, 30)
      g.fillText(words.slice(Math.ceil(words.length / 2)).join(' '), 128, 58)
    } else g.fillText(title, 128, 44)
    g.fillStyle = '#7fe0c4'
    g.font = '18px "Courier New", monospace'
    g.fillText('ONE ROUND.', 128, 140)
    g.fillText('ONE CHOICE.', 128, 168)
    g.fillStyle = '#f2c94c'
    g.fillText('PRESS E', 128, 250)
  })
}

/** The drone desk's screens. */
export function droneScreen(kind: 'link' | 'board') {
  return canvasTexture(512, 300, (g) => {
    g.fillStyle = '#061016'
    g.fillRect(0, 0, 512, 300)
    g.strokeStyle = '#1f6f7a'
    g.lineWidth = 2
    g.strokeRect(10, 10, 492, 280)
    g.fillStyle = '#7fe8f2'
    g.font = 'bold 30px "Courier New", monospace'
    if (kind === 'link') {
      g.fillText('DRONE LINK', 30, 60)
      g.font = '22px "Courier New", monospace'
      g.fillText('STATUS ..... READY', 30, 120)
      g.fillText('BATTERY .... 60 s', 30, 160)
      g.fillText(`PAD ........ LEVEL ${String(LEVEL).padStart(2, '0')}`, 30, 200)
      g.fillStyle = '#f2c94c'
      g.fillText('PRESS E TO FLY', 30, 260)
      // Crosshair.
      g.strokeStyle = '#7fe8f2'
      g.beginPath()
      g.arc(420, 150, 40, 0, Math.PI * 2)
      g.moveTo(370, 150)
      g.lineTo(470, 150)
      g.moveTo(420, 100)
      g.lineTo(420, 200)
      g.stroke()
    } else {
      g.fillText('SHAFT RACE', 30, 60)
      g.font = '20px "Courier New", monospace'
      g.fillText('12 GATES · DOWN THE SHAFT', 30, 110)
      g.fillText('BEST TIMES ON THIS TERMINAL', 30, 150)
      g.fillStyle = '#f2c94c'
      g.fillText('SEE THE BOARD AT THE DESK', 30, 250)
    }
  })
}

const MAZE_BEST = 'silo.maze.best'
function readBest() {
  try {
    const v = Number(localStorage.getItem(MAZE_BEST))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}


// ---------------------------------------------------------------------------
// The maze
// ---------------------------------------------------------------------------

function Maze() {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const map = hedgeTexture()
    map.repeat.set(3, 3)
    const hedge = new THREE.MeshStandardMaterial({ map, color: '#c4d6b4', roughness: 0.95 })
    const list = mazeHedges()
    group.add(boxes(list, hedge))

    // Strings of warm bulbs along the hedge tops.
    const bulbs: Array<[number, number, number]> = []
    for (const b of list) {
      const n = Math.max(1, Math.round(b.w / 1.4))
      const ca = Math.cos(b.rotY)
      const sa = -Math.sin(b.rotY)
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5
        bulbs.push([b.x + ca * t * b.w, b.y + b.h / 2 + 0.08, b.z + sa * t * b.w])
      }
    }
    const bulb = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb562', emissiveIntensity: 2.4 }),
      bulbs.length,
    )
    bulbs.forEach(([x, y, z], i) => {
      dummy.position.set(x, y, z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      bulb.setMatrixAt(i, dummy.matrix)
    })
    bulb.instanceMatrix.needsUpdate = true
    group.add(bulb)

    // Turf underfoot, inside the maze.
    const turfMap = canvasTexture(
      256,
      256,
      (g) => {
        const r = seeded(77)
        g.fillStyle = '#34482a'
        g.fillRect(0, 0, 256, 256)
        for (let i = 0; i < 5000; i++) {
          g.fillStyle = `hsl(${85 + r() * 30}, 35%, ${18 + r() * 18}%)`
          g.fillRect(r() * 256, r() * 256, 1, 3 + r() * 3)
        }
      },
      true,
    )
    turfMap.repeat.set(110, 6)
    const turf = new THREE.Mesh(
      new THREE.RingGeometry(MAZE.radii[0] - 0.2, 21.9, 256, 1, MAZE_FROM, MAZE_SPAN),
      new THREE.MeshStandardMaterial({ map: turfMap, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
    )
    turf.rotation.x = Math.PI / 2
    turf.position.y = FLOOR6 + 0.012
    turf.receiveShadow = true
    group.add(turf)

    // Warm lamps over the paths, round the ring.
    for (let i = 0; i < 6; i++) {
      const a = MAZE_FROM + ((i + 0.5) / 6) * MAZE_SPAN
      const l = new THREE.PointLight('#ffc78a', 16, 14, 2)
      l.position.set(Math.cos(a) * 16, FLOOR6 + 5.2, Math.sin(a) * 16)
      group.add(l)
    }
    return group
  }, [])
  return <primitive object={parts} />
}

/** The map of the maze, standing on the plaza, facing the bridge. */
function MapBoard() {
  const parts = useMemo(() => {
    const g = new THREE.Group()
    const a = MAP_BOARD.angle
    g.position.set(Math.cos(a) * MAP_BOARD.r, FLOOR6, Math.sin(a) * MAP_BOARD.r)
    // Facing back toward the axis: local +Z points inward.
    g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a))
    const tex = canvasTexture(1024, 720, (c) => {
      c.fillStyle = '#16120e'
      c.fillRect(0, 0, 1024, 720)
      drawMazeMap(c, { cx: 400, cy: 360, radius: 340 })
      c.fillStyle = '#e9e2d4'
      c.font = 'bold 40px "Courier New", monospace'
      c.fillText('THE MAZE', 770, 90)
      c.font = '22px "Courier New", monospace'
      c.fillStyle = '#ffd166'
      c.fillText('● WAYS IN', 770, 160)
      c.font = '20px "Courier New", monospace'
      ROOMS6.forEach((rm, i) => {
        c.fillStyle = ROOM_INFO[rm.id].colour
        c.fillText(`● ${ROOM_INFO[rm.id].label.toUpperCase()}`, 770, 205 + i * 36, 240)
      })
      c.fillStyle = 'rgba(233,226,212,0.7)'
      c.font = '22px "Courier New", monospace'
      c.fillText('PLAZA AT TOP', 770, 450)
      c.fillText('PRESS E FOR', 770, 600)
      c.fillText('A MAP THAT', 770, 630)
      c.fillText('FOLLOWS YOU', 770, 660)
    })
    const frame = new THREE.MeshStandardMaterial({ color: '#3a3128', roughness: 0.6, metalness: 0.4 })
    const board = new THREE.Mesh(new THREE.BoxGeometry(MAP_BOARD.w + 0.16, MAP_BOARD.h + 0.16, 0.08), frame)
    board.position.y = 1.0 + MAP_BOARD.h / 2
    g.add(board)
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_BOARD.w, MAP_BOARD.h),
      new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.5 }),
    )
    face.position.set(0, 1.0 + MAP_BOARD.h / 2, 0.045)
    g.add(face)
    for (const sx of [-MAP_BOARD.w / 2 + 0.1, MAP_BOARD.w / 2 - 0.1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), frame)
      leg.position.set(sx, 0.5, 0)
      g.add(leg)
    }
    const lamp = new THREE.PointLight('#ffe0b8', 6, 5, 2)
    lamp.position.set(0, 3.2, 1.0)
    g.add(lamp)
    return g
  }, [])
  return <primitive object={parts} />
}

// ---------------------------------------------------------------------------
// The doors
// ---------------------------------------------------------------------------

/** One round door, its brass ring on the wall, and the bore through to its room. */
function RoomDoor({ k }: { k: number }) {
  const room = ROOMS6[k]
  const door = useRef<THREE.Group>(null)
  const parts = useMemo(() => {
    const R = CH_DOOR.radius
    const steel = new THREE.MeshStandardMaterial({ color: '#57534c', roughness: 0.5, metalness: 0.75 })
    const face = new THREE.MeshStandardMaterial({ map: doorFace(), roughness: 0.55, metalness: 0.6 })
    const brass = new THREE.MeshStandardMaterial({ color: '#b68a57', roughness: 0.35, metalness: 0.9 })
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(R, R, CH_DOOR.half * 2, 64), [steel, face, face])
    slab.rotation.x = Math.PI / 2
    slab.castShadow = true
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.04, 0.07, 8, 64), brass)
    rim.position.z = CH_DOOR.half + 0.01
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 24), brass)
    hub.rotation.x = Math.PI / 2
    hub.position.z = CH_DOOR.half + 0.08
    const leaf = new THREE.Group()
    leaf.add(slab, rim, hub)

    const below = Math.asin(CH_OPENING.centre / (CH_OPENING.radius + 0.08))
    const ring = new THREE.Mesh(new THREE.TorusGeometry(CH_OPENING.radius + 0.08, 0.12, 10, 64, Math.PI + below * 2), brass)
    ring.rotation.z = -below
    ring.position.set(0, CH_OPENING.centre, 0.05)
    const boreLen = FRONT + 0.06
    const bore = new THREE.Mesh(
      new THREE.CylinderGeometry(CH_OPENING.radius, CH_OPENING.radius, boreLen, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: '#4c4741', roughness: 0.9, side: THREE.BackSide }),
    )
    bore.rotation.x = Math.PI / 2
    bore.position.set(0, CH_OPENING.centre, -boreLen / 2 + 0.02)
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(CH_PASS_W + 0.6, 0.1, CH_TUNNEL.to + 0.3),
      new THREE.MeshStandardMaterial({ color: '#3a3631', roughness: 0.8, metalness: 0.3 }),
    )
    floor.position.set(0, -0.05 + 0.002, -(CH_TUNNEL.to + 0.3) / 2 + 0.05)
    floor.receiveShadow = true
    const channel = new THREE.Mesh(
      new THREE.BoxGeometry(CH_PASS_W + 0.4, 0.02, CH_DOOR.half * 2 + 0.1),
      new THREE.MeshStandardMaterial({ color: '#0d0c0b', roughness: 1 }),
    )
    channel.position.set(0, 0.004, -CH_DOOR.d)
    const lamp = new THREE.PointLight('#ffd2a0', 6, 7, 2)
    lamp.position.set(0, 2.6, -1.4)
    const frame = new THREE.Group()
    const [x, z] = room.frame.to(0, 0)
    frame.position.set(x, FLOOR6, z)
    frame.rotation.y = room.frame.yaw
    frame.add(ring, bore, floor, channel, lamp)
    return { frame, leaf }
  }, [room])

  const seated = useRef(true)
  const opened = useRef(false)
  useEffect(() => {
    if (!useSilo.getState().chambersOpen[k]) chamber.doors[k] = 0
    return () => setVaultGrind(0)
  }, [k])

  useFrame((state, dt) => {
    const s = useSilo.getState()
    const body = s.mode === 'walk' && s.bodyReady && !s.droneFlying ? { x: state.camera.position.x, z: state.camera.position.z } : null
    const before = chamber.doors[k]
    const fast = s.reducedMotion ? 4 : 1
    chamber.doors[k] = stepChamberDoor(k, before, s.chambersOpen[k] && s.level === LEVEL, Math.min(dt, 1 / 20) * fast, body)
    const t = chamber.doors[k]
    if (t !== before) setVaultGrind(0.7)
    else if (!chamber.doors.some((v, i) => i !== k && v > 0 && v < 1)) setVaultGrind(0)
    if (t === 1 && !opened.current) {
      opened.current = true
      vaultStop()
    }
    if (t < 0.9) opened.current = false
    if (t === 0 && !seated.current) {
      seated.current = true
      vaultClunk()
    }
    if (t > 0.05) seated.current = false
    const leaf = door.current
    if (leaf) {
      const roll = doorRoll(t)
      leaf.position.set(roll, CH_DOOR.centre, -CH_DOOR.d)
      leaf.rotation.z = -roll / CH_DOOR.radius
    }
  })

  return (
    <primitive object={parts.frame}>
      <group ref={door}>
        <primitive object={parts.leaf} />
      </group>
    </primitive>
  )
}

// ---------------------------------------------------------------------------
// Rooms: the lights, the shell
// ---------------------------------------------------------------------------

/** A material the room's lights reveal, keyed to the section that lights it. */
export interface Lit {
  m: THREE.MeshStandardMaterial
  color: THREE.Color
  emissive: number
  section: number
}
/** For the room itself -- floor, walls, ceiling: comes up with the whole. */
export const WHOLE = -1

export function litMaker(list: Lit[]) {
  return (p: THREE.MeshStandardMaterialParameters, section: number) => {
    const m = new THREE.MeshStandardMaterial(p)
    list.push({ m, color: m.color.clone(), emissive: m.emissiveIntensity, section })
    return m
  }
}

/** Index of the section nearest an angle round a room (not its centre). */
export function sectionAt(r: Room, phi: number) {
  const secs = ROOM_SECTIONS[r.id]
  let best = 0
  let d = Infinity
  secs.slice(0, -1).forEach((p, i) => {
    const dd = Math.abs(((phi - p + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
    if (dd < d) {
      d = dd
      best = i
    }
  })
  return best
}
export const centreSection = (r: Room) => ROOM_SECTIONS[r.id].length - 1

/** A room's group, in its frame, with a helper to place things round it. */
export function roomGroup(r: Room) {
  const g = new THREE.Group()
  const [fx, fz] = r.frame.to(0, 0)
  g.position.set(fx, FLOOR6, fz)
  g.rotation.y = r.frame.yaw
  const C = -r.centre
  const place = (o: THREE.Object3D, phi: number, rr: number, y = 0) => {
    o.position.set(Math.sin(phi) * rr, y, C - Math.cos(phi) * rr)
    o.rotation.y = -phi
    g.add(o)
    return o
  }
  return { g, C, place }
}

/**
 * The shell of a round room: floor, wall (open at its entrance and at each
 * corridor), the face round the tunnel, and a shallow dome of a ceiling with
 * rings of light in it.
 */
export function roomShell(r: Room, g: THREE.Group, C: number, mat: (p: THREE.MeshStandardMaterialParameters, s: number) => THREE.MeshStandardMaterial, look: { wall: THREE.Texture | null; wallColor: string; floor: THREE.Texture | null; floorColor: string; ring: string; ringColor?: string }) {
  const R = r.radius
  const H = r.height
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 0.4, 96), mat({ ...(look.floor ? { map: look.floor } : {}), color: look.floorColor, roughness: 0.7, metalness: 0.15 }, WHOLE))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0.004, C)
  floor.receiveShadow = true
  g.add(floor)
  // The wall, in pieces between its openings. A thing at phi round the room
  // sits at cylinder theta = PI - phi.
  const wallMat = mat({ ...(look.wall ? { map: look.wall } : {}), color: look.wallColor, roughness: 0.85, side: THREE.BackSide }, WHOLE)
  const gaps = roomWallGaps(r)
    .map(([c, h]) => {
      let t0 = Math.PI - c - h
      t0 = ((t0 % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      return [t0, h * 2] as [number, number]
    })
    .sort((a, b) => a[0] - b[0])
  gaps.forEach(([t0, len], i) => {
    const start = t0 + len
    let end = gaps[(i + 1) % gaps.length][0]
    while (end <= start) end += Math.PI * 2
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, H, Math.max(8, Math.round((end - start) * 16)), 1, true, start, end - start), wallMat)
    piece.position.set(0, H / 2, C)
    g.add(piece)
  })
  // Over each corridor's mouth the wall closes again: the corridor is only
  // CORRIDOR.height tall, and the opening used to run on up to the ceiling.
  // And round the mouth, a flat portal: jambs and a head in the wall's own
  // finish, with a lit trim round the opening -- the corridor's box used to
  // stand out of the curved wall with gaps down its sides.
  const portalMat = mat({ ...(look.wall ? { map: look.wall } : {}), color: look.wallColor, roughness: 0.85 }, WHOLE)
  const trimMat = mat({ color: look.ring, emissive: look.ring, emissiveIntensity: 1.3 }, WHOLE)
  const JAMB = 0.6
  const HEAD = 0.55
  for (const [c, h] of roomWallGaps(r).slice(1)) {
    const top = H - CORRIDOR.height
    const lintel = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, top, 12, 1, true, Math.PI - c - h, h * 2), wallMat)
    lintel.position.set(0, CORRIDOR.height + top / 2, C)
    g.add(lintel)
    const outer = CORRIDOR.half + JAMB
    const dist = Math.sqrt(R * R - outer * outer) - 0.04
    const portal = new THREE.Group()
    portal.position.set(Math.sin(c) * dist, 0, C - Math.cos(c) * dist)
    portal.rotation.y = -c
    for (const side of [-1, 1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(JAMB, CORRIDOR.height + HEAD, 0.14), portalMat)
      jamb.position.set(side * (CORRIDOR.half + JAMB / 2), (CORRIDOR.height + HEAD) / 2, 0)
      portal.add(jamb)
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, CORRIDOR.height, 0.05), trimMat)
      strip.position.set(side * (CORRIDOR.half + 0.03), CORRIDOR.height / 2, 0.08)
      portal.add(strip)
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(outer * 2, HEAD, 0.14), portalMat)
    head.position.set(0, CORRIDOR.height + HEAD / 2, 0)
    portal.add(head)
    const topStrip = new THREE.Mesh(new THREE.BoxGeometry(CORRIDOR.half * 2 + 0.11, 0.05, 0.05), trimMat)
    topStrip.position.set(0, CORRIDOR.height + 0.03, 0.08)
    portal.add(topStrip)
    g.add(portal)
  }
  // The face round the tunnel.
  const face = new THREE.Shape()
  face.moveTo(-2.3, -0.5)
  face.lineTo(2.3, -0.5)
  face.lineTo(2.3, H + 0.3)
  face.lineTo(-2.3, H + 0.3)
  face.lineTo(-2.3, -0.5)
  const hole = new THREE.Path()
  hole.absarc(0, CH_OPENING.centre, CH_OPENING.radius, 0, Math.PI * 2, true)
  face.holes.push(hole)
  const front = new THREE.Mesh(new THREE.ShapeGeometry(face, 48), mat({ ...(look.wall ? { map: look.wall } : {}), color: look.wallColor, roughness: 0.85, side: THREE.DoubleSide }, WHOLE))
  front.position.set(0, 0, -(FRONT + 0.03))
  g.add(front)
  // Ceiling: a shallow dome with rings of light let into it.
  const DOME_R = R * 2.2
  const domeA = Math.asin((R + 0.05) / DOME_R)
  const domeBase = H - DOME_R * Math.cos(domeA)
  const ceil = new THREE.Mesh(new THREE.SphereGeometry(DOME_R, 64, 16, 0, Math.PI * 2, 0, domeA), mat({ color: '#2d2925', roughness: 0.95, side: THREE.BackSide }, WHOLE))
  ceil.position.set(0, domeBase, C)
  g.add(ceil)
  const ringMat = mat({ color: look.ringColor ?? '#fff1d6', emissive: look.ring, emissiveIntensity: 1.7 }, centreSection(r))
  for (const rr of [R * 0.32, R * 0.64, R * 0.92]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.05, 6, 96), ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, domeBase + Math.sqrt(DOME_R * DOME_R - rr * rr) - 0.12, C)
    g.add(ring)
  }
  return { domeBase, DOME_R }
}

/**
 * Bring a room's lights up when someone walks in, a section at a time, with a
 * breaker for each; and down again once they have left and the door is shut.
 */
export function useRoomLights(k: number, lit: Lit[], lights: Array<{ l: THREE.PointLight; max: number; section: number }>) {
  const r = ROOMS6[k]
  const announced = useRef(-1)
  useEffect(() => {
    chamber.litAt[k] = null
    announced.current = -1
    return () => {
      chamber.litAt[k] = null
    }
  }, [k])
  useFrame((state) => {
    const now = performance.now()
    const s = useSilo.getState()
    const cam = state.camera.position
    const walking = s.mode === 'walk' && !s.droneFlying
    if (chamber.litAt[k] === null && walking) {
      const p = roomPolar(r, cam.x, cam.z)
      if (p.rr < r.radius - 0.4 && p.d > FRONT + 0.5 && Math.abs(cam.y - FLOOR6 - 1.6) < 1.5) chamber.litAt[k] = now
    }
    const besideIt = CORRIDORS.some((c) => (c.a === r || c.b === r) && inCorridor(c, cam.x, cam.z))
    if (chamber.litAt[k] !== null && walking && chamber.doors[k] === 0 && !inRoom(r, cam.x, cam.z) && !besideIt) {
      chamber.litAt[k] = null
      announced.current = -1
      breaker(false)
    }
    const n = ROOM_SECTIONS[r.id].length
    for (let i = announced.current + 1; i < n; i++) {
      if (sectionLit(k, i, now) <= 0) break
      announced.current = i
      breaker(i === n - 1)
    }
    let whole = 0
    for (let i = 0; i < n; i++) whole += sectionLit(k, i, now)
    whole /= n
    for (const L of lit) {
      const v = L.section === WHOLE ? whole : sectionLit(k, L.section, now)
      L.m.color.copy(L.color).multiplyScalar(0.035 + 0.965 * v)
      L.m.emissiveIntensity = L.emissive * v
    }
    for (const { l, max, section } of lights) l.intensity = max * sectionLit(k, section, now)
  })
}

// ---------------------------------------------------------------------------
// The chamber -- game theory: the orrery and the arcade
// ---------------------------------------------------------------------------

function ChamberRoom() {
  const k = 0
  const r = CHAMBER
  const birdData = useRef<Array<{ x: number; y: number; z: number; rot: number; phase: number; s: number }>>([])

  const parts = useMemo(() => {
    const lit: Lit[] = []
    const mat = litMaker(lit)
    const { g, C, place } = roomGroup(r)
    const R = r.radius
    const rand = seeded(606)

    const floorMap = canvasTexture(1024, 1024, (c) => {
      c.fillStyle = '#2b2622'
      c.fillRect(0, 0, 1024, 1024)
      const fr = seeded(4)
      for (let i = 0; i < 1600; i++) {
        c.fillStyle = `rgba(${60 + fr() * 30},${52 + fr() * 25},${44 + fr() * 20},0.35)`
        c.fillRect(fr() * 1024, fr() * 1024, 2 + fr() * 6, 2 + fr() * 6)
      }
      c.strokeStyle = '#a77e4e'
      c.lineWidth = 6
      for (let q = 1; q <= 5; q++) {
        const rad = q * 46
        const gap = fr() * Math.PI * 2
        c.beginPath()
        c.arc(512, 512, rad, gap + 0.35, gap + Math.PI * 2 - 0.05)
        c.stroke()
        const spoke = gap + 1 + fr() * 3
        c.beginPath()
        c.moveTo(512 + Math.cos(spoke) * rad, 512 + Math.sin(spoke) * rad)
        c.lineTo(512 + Math.cos(spoke) * (rad + 46), 512 + Math.sin(spoke) * (rad + 46))
        c.stroke()
      }
      c.lineWidth = 3
      c.beginPath()
      c.arc(512, 512, 300, 0, Math.PI * 2)
      c.stroke()
    })
    const wallMap = woodPanels()
    wallMap.repeat.set(18, 2)
    roomShell(r, g, C, mat, { wall: wallMap, wallColor: '#ffffff', floor: floorMap, floorColor: '#ffffff', ring: '#ffd9a0' })

    // Chalkboards round the wall above the counters.
    const chalk = chalkboard()
    chalk.repeat.set(-3, 1)
    const gapE = Math.asin((CH_TUNNEL.half + 0.15) / R)
    const board = new THREE.Mesh(
      new THREE.CylinderGeometry(R - 0.02, R - 0.02, 1.7, 96, 1, true, gapE + 0.25, Math.PI * 2 - gapE * 2 - 0.5),
      mat({ map: chalk, roughness: 0.95, side: THREE.BackSide }, WHOLE),
    )
    // Above the corridors' portals, not across them.
    board.position.set(0, CORRIDOR.height + 0.6 + 0.85, C)
    g.add(board)

    // Counters round the wall, lit from inside, curios on them.
    const wood = (section: number) => mat({ color: '#5b4331', roughness: 0.7 }, section)
    const glow = (section: number) => mat({ color: '#f7ead2', emissive: '#ffe2b5', emissiveIntensity: 1.3, roughness: 0.4 }, section)
    const curio = new THREE.InstancedMesh(unitBox, mat({ color: '#ffffff', roughness: 0.6 }, WHOLE), 400)
    let nCurio = 0
    const curioColors = ['#b08a5c', '#d8cfbd', '#6d8a7b', '#8c4d3e', '#c9b27c', '#4e5d6c', '#e6dcc8']
    for (const [a0, a1] of SHELF_RUNS) {
      const section = sectionAt(r, (a0 + a1) / 2)
      const n = Math.ceil(((a1 - a0) * SHELF.r1) / 1.2)
      for (let i = 0; i < n; i++) {
        const phi = a0 + ((i + 0.5) / n) * (a1 - a0)
        const w = ((a1 - a0) / n) * SHELF.r1 + 0.04
        const back = new THREE.Mesh(unitBox, wood(section))
        back.scale.set(w, SHELF.high, (SHELF.r1 - SHELF.r0) / 2)
        place(back, phi, SHELF.r1 - (SHELF.r1 - SHELF.r0) / 4, SHELF.high / 2)
        const fore = new THREE.Mesh(unitBox, wood(section))
        fore.scale.set(w, SHELF.low, (SHELF.r1 - SHELF.r0) / 2)
        place(fore, phi, SHELF.r0 + (SHELF.r1 - SHELF.r0) / 4, SHELF.low / 2)
        const band = new THREE.Mesh(unitBox, glow(section))
        band.scale.set(w, 0.22, 0.02)
        place(band, phi, SHELF.r0 - 0.005, 0.55)
        for (const [rr, y] of [
          [SHELF.r0 + 0.2, SHELF.low],
          [SHELF.r1 - 0.2, SHELF.high],
        ]) {
          for (let q = 0; q < 4 && nCurio < 400; q++) {
            const p = phi + (q / 4 - 0.375) * (w / rr)
            const sx = 0.1 + rand() * 0.25
            const sy = 0.08 + rand() * 0.38
            dummy.position.set(Math.sin(p) * rr, y + sy / 2, C - Math.cos(p) * rr)
            dummy.rotation.set(0, -p + (rand() - 0.5) * 0.6, 0)
            dummy.scale.set(sx, sy, 0.1 + rand() * 0.2)
            dummy.updateMatrix()
            curio.setMatrixAt(nCurio, dummy.matrix)
            curio.setColorAt(nCurio, new THREE.Color(curioColors[Math.floor(rand() * curioColors.length)]))
            nCurio++
          }
        }
      }
    }
    curio.count = nCurio
    curio.instanceMatrix.needsUpdate = true
    if (curio.instanceColor) curio.instanceColor.needsUpdate = true
    g.add(curio)

    // The orrery.
    const ORR = centreSection(r)
    const orr = new THREE.Group()
    orr.position.set(0, 5.3, C)
    const brass = mat({ color: '#c49a62', roughness: 0.32, metalness: 0.9 }, ORR)
    const bronze = mat({ color: '#8a6440', roughness: 0.45, metalness: 0.85 }, ORR)
    orr.add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 20), mat({ color: '#ffd28a', emissive: '#ffb04a', emissiveIntensity: 2.2, roughness: 0.4 }, ORR)))
    const rings: THREE.Group[] = []
    for (const [rad, tilt, planet, size] of [
      [1.7, 0.18, true, 0.24],
      [2.6, -0.12, true, 0.36],
      [3.5, 0.3, true, 0.5],
      [4.4, -0.24, true, 0.3],
      [5.1, 0.08, false, 0],
    ] as Array<[number, number, boolean, number]>) {
      const q = new THREE.Group()
      q.rotation.x = Math.PI / 2 + tilt
      q.rotation.y = tilt * 0.7
      q.add(new THREE.Mesh(new THREE.TorusGeometry(rad, 0.035, 6, 96), brass))
      if (planet) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 16), bronze)
        p.position.set(rad, 0, 0)
        q.add(p)
      }
      orr.add(q)
      rings.push(q)
    }
    const web: number[] = []
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2
      const b = a + Math.PI * 0.62
      web.push(Math.cos(a) * 5.1, 0, Math.sin(a) * 5.1, Math.cos(b) * 5.1, 0, Math.sin(b) * 5.1)
    }
    const webGeo = new THREE.BufferGeometry()
    webGeo.setAttribute('position', new THREE.Float32BufferAttribute(web, 3))
    const webMat = new THREE.LineBasicMaterial({ color: '#4f9fa8', transparent: true, opacity: 0 })
    const webLines = new THREE.LineSegments(webGeo, webMat)
    webLines.rotation.x = 0.08
    orr.add(webLines)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 6), brass)
      rod.position.set(Math.cos(a) * 5.1, 1.2, Math.sin(a) * 5.1)
      orr.add(rod)
    }
    g.add(orr)

    // The arcade.
    const arcade = sectionAt(r, 0)
    const cabMat = mat({ color: '#1d2a33', roughness: 0.55, metalness: 0.3 }, arcade)
    const trim = mat({ color: '#e8b04b', emissive: '#e8a33b', emissiveIntensity: 0.6, roughness: 0.4 }, arcade)
    ARCADE_GAMES.forEach((game, q) => {
      const cab = new THREE.Group()
      const w = CABINET.w
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, CABINET.depth), cabMat)
      base.position.y = 0.5
      cab.add(base)
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, CABINET.h - 1.0, CABINET.depth * 0.6), cabMat)
      top.position.set(0, 1.0 + (CABINET.h - 1.0) / 2, -CABINET.depth * 0.2)
      cab.add(top)
      const tex = cabinetScreen(game.title)
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.14, 0.82), mat({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9 }, arcade))
      screen.position.set(0, 1.42, CABINET.depth * 0.1 + 0.005)
      screen.rotation.x = -0.12
      cab.add(screen)
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.34), trim)
      panel.position.set(0, 1.02, CABINET.depth / 2 - 0.1)
      panel.rotation.x = 0.25
      cab.add(panel)
      for (const sx of [-0.18, 0.06, 0.2]) {
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), trim)
        btn.position.set(sx, 1.07, CABINET.depth / 2 - 0.08)
        cab.add(btn)
      }
      place(cab, cabinetPhi(q), CABINET.rr)
    })

    // Paper birds overhead.
    const birdGeo = new THREE.BufferGeometry()
    birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, -0.2, 0.06, -0.08, 0, 0, -0.1, 0, 0, 0.18, 0, 0, -0.1, 0.2, 0.06, -0.08], 3))
    birdGeo.computeVertexNormals()
    const N_BIRDS = 170
    const flock = new THREE.InstancedMesh(birdGeo, mat({ color: '#efe6d2', roughness: 0.8, side: THREE.DoubleSide }, ORR), N_BIRDS)
    const data: Array<{ x: number; y: number; z: number; rot: number; phase: number; s: number }> = []
    for (let i = 0; i < N_BIRDS; i++) {
      const rr = 2.5 + rand() * 7
      const a = rand() * Math.PI * 2
      data.push({ x: Math.sin(a) * rr, y: 4.4 + rand() * 2.8, z: C - Math.cos(a) * rr, rot: rand() * Math.PI * 2, phase: rand() * Math.PI * 2, s: 0.8 + rand() * 1.6 })
      flock.setColorAt(i, new THREE.Color(rand() < 0.2 ? '#d9b27a' : rand() < 0.5 ? '#f3ecdc' : '#e4d8bf'))
    }
    if (flock.instanceColor) flock.instanceColor.needsUpdate = true
    g.add(flock)

    const lights: Array<{ l: THREE.PointLight; max: number; section: number }> = []
    const addLight = (phi: number, rr: number, y: number, max: number, dist: number, section: number, color = '#ffd8a8') => {
      const l = new THREE.PointLight(color, 0, dist, 2)
      l.position.set(Math.sin(phi) * rr, y, C - Math.cos(phi) * rr)
      g.add(l)
      lights.push({ l, max, section })
    }
    addLight(-1.2, 6.5, 3.4, 26, 10, sectionAt(r, -1.2))
    addLight(0, 6.4, 3.6, 26, 10, arcade, '#ffe0b0')
    addLight(-1.78, 6.6, 3.4, 22, 10, sectionAt(r, -1.78), '#ffd8a8')
    addLight(1.3, 6.4, 3.4, 20, 10, sectionAt(r, 1.3))
    addLight(0, 0, 6.6, 60, 20, ORR)
    return { g, lit, rings, orr, flock, data, lights, webMat, ORR }
  }, [r])

  useEffect(() => {
    birdData.current = parts.data
  }, [parts])
  useRoomLights(k, parts.lit, parts.lights)

  useFrame((state, dt) => {
    parts.webMat.opacity = 0.5 * sectionLit(k, parts.ORR)
    if (useSilo.getState().reducedMotion) return
    parts.rings.forEach((q, i) => {
      q.rotation.z += dt * (0.05 + i * 0.025) * (i % 2 ? -1 : 1)
    })
    parts.orr.rotation.y += dt * 0.02
    const t = state.clock.elapsedTime
    birdData.current.forEach((b, i) => {
      dummy.position.set(b.x, b.y + Math.sin(t * 0.6 + b.phase) * 0.06, b.z)
      dummy.rotation.set(Math.sin(t * 0.8 + b.phase) * 0.15, b.rot + Math.sin(t * 0.2 + b.phase) * 0.2, 0)
      dummy.scale.setScalar(b.s)
      dummy.updateMatrix()
      parts.flock.setMatrixAt(i, dummy.matrix)
    })
    parts.flock.instanceMatrix.needsUpdate = true
  })

  return <primitive object={parts.g} />
}

/** Timber panelling, for the chamber's wall. */
function woodPanels() {
  return canvasTexture(
    512,
    256,
    (g) => {
      g.fillStyle = '#3a2c22'
      g.fillRect(0, 0, 512, 256)
      g.strokeStyle = 'rgba(15,10,6,0.7)'
      g.lineWidth = 3
      for (let x = 0; x <= 512; x += 64) {
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x, 256)
        g.stroke()
      }
      const r = seeded(12)
      for (let i = 0; i < 300; i++) {
        g.strokeStyle = `rgba(90,66,48,${(0.15 + r() * 0.2).toFixed(2)})`
        g.lineWidth = 1
        const x = r() * 512
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x + (r() - 0.5) * 6, 256)
        g.stroke()
      }
    },
    true,
  )
}

// ---------------------------------------------------------------------------
// The music hall
// ---------------------------------------------------------------------------

/** A cassette closet: an open cabinet, shelf on shelf of tapes on their spines. */
function closet(mat: THREE.Material, tapeMat: THREE.Material, rand: () => number, w: number, h: number, depth: number) {
  const closet = new THREE.Group()
  const slab = (sw: number, sh: number, sd: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), mat)
    m.position.set(x, y, z)
    closet.add(m)
  }
  slab(w, h, 0.05, 0, h / 2, -depth / 2 + 0.025)
  slab(0.06, h, depth, -w / 2 + 0.03, h / 2, 0)
  slab(0.06, h, depth, w / 2 - 0.03, h / 2, 0)
  slab(w, 0.08, depth, 0, h - 0.04, 0)
  slab(w, 0.12, depth, 0, 0.06, 0)
  const SHELVES = 7
  const gap = (h - 0.3) / SHELVES
  for (let q = 1; q < SHELVES; q++) slab(w - 0.1, 0.025, depth - 0.08, 0, 0.12 + q * gap, 0)
  const tapes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.075, 0.11), tapeMat, SHELVES * 80)
  let t = 0
  const colors = ['#e8d6a8', '#d05a43', '#2f6f8f', '#f2c94c', '#6fae7b', '#d8d8d8', '#a65fa0', '#1f1f1f']
  for (let row = 0; row < SHELVES; row++) {
    let x = -w / 2 + 0.1
    while (x < w / 2 - 0.1 && t < SHELVES * 80) {
      if (rand() < 0.06) {
        x += 0.06
        continue
      }
      dummy.position.set(x, 0.12 + row * gap + 0.05, depth / 2 - 0.12)
      dummy.rotation.set(0, 0, rand() < 0.05 ? 0.25 : 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      tapes.setMatrixAt(t, dummy.matrix)
      tapes.setColorAt(t, new THREE.Color(colors[Math.floor(rand() * colors.length)]))
      t++
      x += 0.022
    }
  }
  tapes.count = t
  tapes.instanceMatrix.needsUpdate = true
  if (tapes.instanceColor) tapes.instanceColor.needsUpdate = true
  closet.add(tapes)
  return closet
}

function MusicRoom() {
  const k = 1
  const r = MUSIC

  const parts = useMemo(() => {
    const lit: Lit[] = []
    const mat = litMaker(lit)
    const { g, C, place } = roomGroup(r)
    const rand = seeded(909)
    // Deep red walls with gold fluting, a dark oak floor with a great rug.
    const walls = canvasTexture(
      512,
      256,
      (c) => {
        c.fillStyle = '#4a1f1c'
        c.fillRect(0, 0, 512, 256)
        for (let x = 0; x < 512; x += 32) {
          c.fillStyle = 'rgba(201,153,107,0.35)'
          c.fillRect(x, 0, 2, 256)
          c.fillStyle = 'rgba(0,0,0,0.25)'
          c.fillRect(x + 2, 0, 3, 256)
        }
      },
      true,
    )
    walls.repeat.set(16, 1)
    const floor = canvasTexture(
      512,
      512,
      (c) => {
        c.fillStyle = '#3a2a1e'
        c.fillRect(0, 0, 512, 512)
        for (let y = 0; y < 512; y += 24) {
          c.fillStyle = `rgba(${70 + ((y * 7) % 30)},${48 + ((y * 5) % 20)},${30},0.6)`
          c.fillRect(0, y, 512, 22)
        }
      },
      true,
    )
    floor.repeat.set(4, 4)
    const shell = roomShell(r, g, C, mat, { wall: walls, wallColor: '#ffffff', floor, floorColor: '#ffffff', ring: '#ffcf8a' })
    const sec = (phi: number) => sectionAt(r, phi)

    // The rug, in front of the stage.
    const rug = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), mat({ color: '#6b2f2a', roughness: 1 }, WHOLE))
    rug.rotation.x = -Math.PI / 2
    rug.position.set(0, 0.012, C - 1.4)
    g.add(rug)
    const rugRing = new THREE.Mesh(new THREE.RingGeometry(3.7, 3.95, 64), mat({ color: '#c49a62', roughness: 0.9 }, WHOLE))
    rugRing.rotation.x = -Math.PI / 2
    rugRing.position.set(0, 0.014, C - 1.4)
    g.add(rugRing)

    // The stage, and the gramophone on it.
    const stageSec = sec(0)
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(STAGE.radius, STAGE.radius + 0.05, STAGE.h, 48), mat({ color: '#2a1d14', roughness: 0.6 }, stageSec))
    place(stage, 0, STAGE.rr, STAGE.h / 2)
    const stageEdge = new THREE.Mesh(new THREE.TorusGeometry(STAGE.radius, 0.03, 6, 64), mat({ color: '#ffd9a0', emissive: '#ffb562', emissiveIntensity: 1.6 }, stageSec))
    stageEdge.rotation.x = Math.PI / 2
    place(stageEdge, 0, STAGE.rr, STAGE.h)
    const gram = new THREE.Group()
    const cabinetWood = mat({ color: '#4a2e1c', roughness: 0.55 }, stageSec)
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.9), cabinetWood)
    stand.position.y = 0.425
    gram.add(stand)
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.62), cabinetWood)
    plinth.position.y = 0.94
    gram.add(plinth)
    const record = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.012, 48), mat({ color: '#141414', roughness: 0.3, metalness: 0.2 }, stageSec))
    record.position.y = 1.04
    gram.add(record)
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.014, 24), mat({ color: '#b5463a', roughness: 0.5 }, stageSec))
    label.position.y = 1.042
    gram.add(label)
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 24; i++) {
      const t = i / 24
      pts.push(new THREE.Vector2(0.03 + Math.pow(t, 3.2) * 0.5, t * 0.85))
    }
    const hornMat = mat({ color: '#c9a063', roughness: 0.25, metalness: 0.95, side: THREE.DoubleSide }, stageSec)
    const horn = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), hornMat)
    horn.position.set(0.12, 1.25, -0.05)
    horn.rotation.set(-1.1, 0, 0.25)
    gram.add(horn)
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), mat({ color: '#0c0907', roughness: 0.9 }, stageSec))
    slot.position.set(0, 0.62, 0.451)
    gram.add(slot)
    const tapeIn = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.03), new THREE.MeshStandardMaterial({ color: '#e8d6a8', roughness: 0.5, emissive: '#000000' }))
    tapeIn.position.set(0, 0.62, 0.46)
    tapeIn.visible = false
    gram.add(tapeIn)
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24, Math.PI), hornMat)
    neck.position.set(0.17, 1.1, 0.05)
    neck.rotation.y = Math.PI / 2
    gram.add(neck)
    place(gram, GRAMOPHONE.phi, GRAMOPHONE.rr, STAGE.h)

    // Cassette closets either side of the stage.
    for (const c of CLOSETS) {
      const s = sec(c.phi)
      place(closet(mat({ color: '#4a2e1c', roughness: 0.55 }, s), mat({ color: '#ffffff', roughness: 0.5 }, s), rand, c.w, c.h, c.depth), c.phi, c.rr)
    }
    // Speaker cabinets, and the seats facing the stage.
    for (const sp of SPEAKERS) {
      const s = sec(sp.phi)
      const cab = new THREE.Group()
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.7), mat({ color: '#1c1714', roughness: 0.7 }, s))
      box.position.y = 0.95
      cab.add(box)
      for (const [y, rad] of [
        [0.55, 0.3],
        [1.3, 0.18],
        [1.7, 0.08],
      ]) {
        const cone = new THREE.Mesh(new THREE.CircleGeometry(rad, 32), mat({ color: '#3a3330', roughness: 0.9 }, s))
        cone.position.set(0, y, 0.36)
        cab.add(cone)
      }
      place(cab, sp.phi, sp.rr)
    }
    const leather = mat({ color: '#5a3324', roughness: 0.55 }, WHOLE)
    for (const seat of SEATS) {
      const sofa = new THREE.Group()
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.8), leather)
      base.position.y = 0.225
      sofa.add(base)
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.18), leather)
      back.position.set(0, 0.6, -0.31)
      sofa.add(back)
      for (const sx of [-0.7, 0.7]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.8), leather)
        arm.position.set(sx, 0.55, 0)
        sofa.add(arm)
      }
      // Facing in, toward the stage.
      place(sofa, seat.phi, seat.rr)
    }
    // A chandelier: brass rings and a halo of warm bulbs.
    const chand = new THREE.Group()
    chand.position.set(0, shell.domeBase + Math.sqrt(shell.DOME_R ** 2) - 2.2, C)
    const centreSec = centreSection(r)
    const gold = mat({ color: '#c9a063', roughness: 0.3, metalness: 0.9 }, centreSec)
    const bulbMat = mat({ color: '#fff3dc', emissive: '#ffcf8a', emissiveIntensity: 2.4 }, centreSec)
    for (const [rad, y] of [
      [1.6, 0],
      [1.1, -0.45],
      [0.6, -0.85],
    ]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.035, 6, 48), gold)
      ring.rotation.x = Math.PI / 2
      ring.position.y = y
      chand.add(ring)
      const n = Math.round(rad * 10)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bulbMat)
        b.position.set(Math.cos(a) * rad, y + 0.06, Math.sin(a) * rad)
        chand.add(b)
      }
    }
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 6), gold)
    chain.position.y = 1.0
    chand.add(chain)
    g.add(chand)

    const lights: Array<{ l: THREE.PointLight; max: number; section: number }> = []
    const addLight = (phi: number, rr: number, y: number, max: number, dist: number, section: number, color = '#ffd8a8') => {
      const l = new THREE.PointLight(color, 0, dist, 2)
      l.position.set(Math.sin(phi) * rr, y, C - Math.cos(phi) * rr)
      g.add(l)
      lights.push({ l, max, section })
    }
    addLight(0, 5.0, 3.4, 28, 10, stageSec, '#ffcf9a')
    addLight(-1.6, 5.5, 3.2, 18, 9, sec(-1.6))
    addLight(1.6, 5.5, 3.2, 18, 9, sec(1.6))
    addLight(0, 0, chand.position.y - 1.2, 40, 16, centreSec, '#ffdcae')
    return { g, lit, lights, record, tapeIn }
  }, [r])

  useRoomLights(k, parts.lit, parts.lights)
  // Leaving the floor takes the tape out.
  useEffect(() => () => stop(false), [])

  useFrame((state, dt) => {
    const s = useSilo.getState()
    if (jukebox.playing && !s.reducedMotion) parts.record.rotation.y -= dt * 3.5
    parts.tapeIn.visible = jukebox.playing
    if (jukebox.current) (parts.tapeIn.material as THREE.MeshStandardMaterial).emissive.set(jukebox.current.color)
    // Louder the nearer you stand; faint from a corridor or through the open
    // door; nothing much with it shut.
    if (jukebox.playing) {
      const cam = state.camera.position
      const dist = Math.hypot(cam.x - GRAM_AT[0], cam.z - GRAM_AT[1])
      const inside = inRoom(MUSIC, cam.x, cam.z)
      const nearby = CORRIDORS.some((c) => inCorridor(c, cam.x, cam.z)) || ROOMS6.some((q) => q !== MUSIC && inRoom(q, cam.x, cam.z))
      const v = inside ? Math.min(1, Math.max(0.25, 1 - (dist - 4) / 14)) : nearby ? 0.18 : chamber.doors[k] > 0.5 ? 0.12 : 0.03
      if (Math.abs(v - jukebox.proximity) > 0.02) setLevel(v)
    }
  })

  return <primitive object={parts.g} />
}

// ---------------------------------------------------------------------------
// The empty room
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The corridors between them
// ---------------------------------------------------------------------------

function Corridors() {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const wall = new THREE.MeshStandardMaterial({ color: '#4c4741', roughness: 0.9, side: THREE.DoubleSide })
    const floorMat = new THREE.MeshStandardMaterial({ color: '#3a3631', roughness: 0.8, metalness: 0.3 })
    const strip = new THREE.MeshStandardMaterial({ color: '#ffe0b8', emissive: '#ffcf96', emissiveIntensity: 1.4 })
    for (const c of CORRIDORS) {
      const len = Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]) + 0.6
      const g = new THREE.Group()
      g.position.set((c.from[0] + c.to[0]) / 2, FLOOR6, (c.from[1] + c.to[1]) / 2)
      // Local X along the corridor.
      g.rotation.y = -Math.atan2(c.dir[1], c.dir[0])
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(len, CORRIDOR.half * 2), floorMat)
      floor.rotation.x = -Math.PI / 2
      floor.position.y = 0.006
      g.add(floor)
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(len, CORRIDOR.half * 2), wall)
      ceil.rotation.x = Math.PI / 2
      ceil.position.y = CORRIDOR.height
      g.add(ceil)
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(len, CORRIDOR.height), wall)
        w.position.set(0, CORRIDOR.height / 2, side * CORRIDOR.half)
        g.add(w)
        const s = new THREE.Mesh(new THREE.BoxGeometry(len - 0.4, 0.04, 0.06), strip)
        s.position.set(0, 0.25, side * (CORRIDOR.half - 0.04))
        g.add(s)
      }
      const l = new THREE.PointLight('#ffd2a0', 8, 8, 2)
      l.position.y = CORRIDOR.height - 0.4
      g.add(l)
      group.add(g)
    }
    return group
  }, [])
  return <primitive object={parts} />
}

// ---------------------------------------------------------------------------
// The maze's clock
// ---------------------------------------------------------------------------

/**
 * A run starts on stepping through a gap from the promenade and stops on
 * reaching the cell in front of any door; the best time is kept on this
 * device.
 */
function MazeClock() {
  const shownUntil = useRef(0)
  const lastNote = useRef<string | null>(null)
  useEffect(() => () => useSilo.getState().setHudNote(null), [])
  useFrame((state) => {
    const s = useSilo.getState()
    if (s.mode !== 'walk' || s.level !== LEVEL || s.droneFlying) return
    const now = performance.now()
    const p = state.camera.position
    const cell = mazeCell(p.x, p.z)
    const r = Math.hypot(p.x, p.z)
    if (cell && chamber.mazeStart === null && cell.ring === 0 && shownUntil.current < now) chamber.mazeStart = now
    if (!cell && r < MAZE.radii[0] && chamber.mazeStart !== null) chamber.mazeStart = null
    let note: string | null = null
    if (chamber.mazeStart !== null && cell && cell.ring === MAZE.radii.length - 1 && ROOMS6.some((q) => q.sector === cell.sector)) {
      const took = now - chamber.mazeStart
      chamber.mazeStart = null
      chamber.mazeLast = took
      const best = readBest()
      if (best === null || took < best) {
        try {
          localStorage.setItem(MAZE_BEST, String(Math.round(took)))
        } catch {
          // Storage blocked; the time still shows.
        }
      }
      shownUntil.current = now + 7000
    }
    const blocked = chamber.blocked.some(Boolean)
    if (blocked) note = 'Step out of the doorway · the round door is rolling shut'
    else if (chamber.mazeStart !== null) note = `Maze · ${clock(now - chamber.mazeStart)}`
    else if (shownUntil.current > now && chamber.mazeLast !== null) {
      const best = readBest()
      note = `Through the maze in ${clock(chamber.mazeLast)}${best ? ` · best ${clock(best)}` : ''}`
    }
    if (note !== lastNote.current) {
      lastNote.current = note
      s.setHudNote(note)
    }
  })
  return null
}

/** Everything on level 6 drawn while the visitor is near it. */
export default function Level06() {
  return (
    <>
      <Maze />
      <MapBoard />
      {ROOMS6.map((_, k) => (
        <RoomDoor key={k} k={k} />
      ))}
      <ChamberRoom />
      <MusicRoom />
      <SoundBox />
      <CitizensRoom />
      <PoemsRoom />
      <DroneRoom />
      <AimRoom />
      <Corridors />
      <MazeClock />
    </>
  )
}
