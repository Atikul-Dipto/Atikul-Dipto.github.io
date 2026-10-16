import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  ARCADE_GAMES,
  CABINET,
  CHAMBER,
  CH_DOOR,
  CH_FRAME,
  CH_FRONT,
  CH_OPENING,
  CH_TUNNEL,
  CLOSET,
  DRONE_DESK,
  DRONE_PLINTH,
  FLOOR6,
  GRAMOPHONE,
  MAZE,
  MAZE_FROM,
  MAZE_TO,
  SECTIONS,
  SHELF,
  SHELF_RUNS,
  cabinetPhi,
  chamberPoint,
  inChamber,
  inChamberPolar,
  mazeCell,
  mazeHedges,
} from '../../content/level6'
import { seeded } from '../../content/frame'
import type { Box } from '../../content/level1'
import { breaker, setVaultGrind, vaultClunk, vaultStop } from '../../lib/audio'
import { chamber, doorRoll, sectionLit, stepChamberDoor } from '../../lib/chamber'
import { jukebox, setLevel, stop } from '../../lib/jukebox'
import { useSilo } from '../../state/useSilo'

/**
 * LEVEL 6 — RECREATION, drawn from content/level6.ts.
 *
 * A hedge maze across the deck; at its heart, in the silo wall, a round door
 * that rolls aside into the wall; behind it a great round chamber cut into
 * the rock, dark until someone walks in -- then lit a section at a time,
 * round the room from the entrance, the orrery overhead last of all.
 */

const CH_PASS_W = CH_TUNNEL.half * 2
const GRAM_AT = chamberPoint(GRAMOPHONE.phi, GRAMOPHONE.rr)
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

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat = false) {
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

// ---------------------------------------------------------------------------
// The maze
// ---------------------------------------------------------------------------

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

function Maze() {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const map = hedgeTexture()
    map.repeat.set(3, 2)
    const hedge = new THREE.MeshStandardMaterial({ map, color: '#c4d6b4', roughness: 0.95 })
    const list = mazeHedges()
    group.add(boxes(list, hedge))

    // Strings of warm bulbs along the hedge tops: the maze's only light, so
    // it reads as a garden at night under grow lamps.
    const bulbs: Array<[number, number, number]> = []
    for (const b of list) {
      const n = Math.max(1, Math.round(b.w / 1.2))
      const ca = Math.cos(b.rotY)
      const sa = -Math.sin(b.rotY)
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5
        bulbs.push([b.x + ca * t * b.w, b.y + b.h / 2 + 0.08, b.z + sa * t * b.w])
      }
    }
    const bulb = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.06, 8, 6),
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
    turfMap.repeat.set(30, 6)
    const turf = new THREE.Mesh(
      new THREE.RingGeometry(MAZE.radii[0] - 0.2, 21.9, 64, 1, MAZE_FROM, MAZE_TO - MAZE_FROM),
      new THREE.MeshStandardMaterial({ map: turfMap, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
    )
    // RingGeometry is in XY with theta from +X; lay it flat so theta matches
    // the world angle (x = r cos a, z = r sin a).
    turf.rotation.x = Math.PI / 2
    turf.position.y = FLOOR6 + 0.012
    turf.receiveShadow = true
    group.add(turf)

    // A few warm lamps over the paths.
    const lamps: THREE.PointLight[] = []
    for (const [a, r] of [
      [MAZE.mid - 0.45, 13.9],
      [MAZE.mid + 0.4, 16.2],
      [MAZE.mid, 20.2],
    ] as Array<[number, number]>) {
      const l = new THREE.PointLight('#ffc78a', 14, 11, 2)
      l.position.set(Math.cos(a) * r, FLOOR6 + 3.4, Math.sin(a) * r)
      group.add(l)
      lamps.push(l)
    }
    return group
  }, [])
  return <primitive object={parts} />
}

// ---------------------------------------------------------------------------
// The round door
// ---------------------------------------------------------------------------

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

function ChamberDoor() {
  const door = useRef<THREE.Group>(null)
  const parts = useMemo(() => {
    const R = CH_DOOR.radius
    const steel = new THREE.MeshStandardMaterial({ color: '#57534c', roughness: 0.5, metalness: 0.75 })
    const face = new THREE.MeshStandardMaterial({ map: doorFace(), roughness: 0.55, metalness: 0.6 })
    const brass = new THREE.MeshStandardMaterial({ color: '#b68a57', roughness: 0.35, metalness: 0.9 })
    // The slab: a short cylinder with its axis along the frame's d.
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

    // The portal on the wall face: a brass ring round the opening, only the
    // part above the floor.
    const below = Math.asin(CH_OPENING.centre / (CH_OPENING.radius + 0.08))
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(CH_OPENING.radius + 0.08, 0.12, 10, 64, Math.PI + below * 2),
      brass,
    )
    ring.rotation.z = -below
    ring.position.set(0, CH_OPENING.centre, 0.05)

    // The bore through the wall and on to the chamber.
    const boreLen = CH_FRONT + 0.06
    const bore = new THREE.Mesh(
      new THREE.CylinderGeometry(CH_OPENING.radius, CH_OPENING.radius, boreLen, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: '#4c4741', roughness: 0.9, side: THREE.BackSide }),
    )
    bore.rotation.x = Math.PI / 2
    bore.position.set(0, CH_OPENING.centre, -boreLen / 2 + 0.02)
    // Its floor, and the dark channel the door's foot runs in.
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
    // A lamp in the bore, so the door can be seen and the way through read.
    const lamp = new THREE.PointLight('#ffd2a0', 6, 7, 2)
    lamp.position.set(0, 2.6, -1.4)
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.04, CH_FRONT - 1.1),
      new THREE.MeshStandardMaterial({ color: '#ffe0b8', emissive: '#ffcf96', emissiveIntensity: 1.6 }),
    )
    strip.position.set(0, CH_OPENING.centre + CH_OPENING.radius - 0.06, -(1.1 + CH_FRONT) / 2)

    const frame = new THREE.Group()
    const [x, z] = CH_FRAME.to(0, 0)
    frame.position.set(x, FLOOR6, z)
    frame.rotation.y = CH_FRAME.yaw
    frame.add(ring, bore, floor, channel, lamp, strip)
    return { frame, leaf }
  }, [])

  const seated = useRef(true)
  const opened = useRef(false)
  useEffect(() => {
    if (!useSilo.getState().chamberOpen) chamber.door = 0
    return () => setVaultGrind(0)
  }, [])

  useFrame((state, dt) => {
    const s = useSilo.getState()
    const body = s.mode === 'walk' && s.bodyReady ? { x: state.camera.position.x, z: state.camera.position.z } : null
    const before = chamber.door
    const fast = s.reducedMotion ? 4 : 1
    chamber.door = stepChamberDoor(before, s.chamberOpen && s.level === 6, Math.min(dt, 1 / 20) * fast, body)
    const t = chamber.door
    setVaultGrind(t !== before ? 0.7 : 0)
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
// The chamber
// ---------------------------------------------------------------------------

/** Every material in the chamber, keyed to the section whose lights reveal it. */
interface Lit {
  m: THREE.MeshStandardMaterial
  color: THREE.Color
  emissive: number
  section: number
}

/** Index of the section nearest an angle round the room. */
function sectionAt(phi: number) {
  let best = 0
  let d = Infinity
  SECTIONS.forEach((s, i) => {
    if (s.id === 'orrery') return
    const dd = Math.abs(((phi - s.phi + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
    if (dd < d) {
      d = dd
      best = i
    }
  })
  return best
}
const ORRERY = SECTIONS.length - 1
/** For the room itself -- floor, walls, ceiling: comes up with the whole. */
const WHOLE = -1

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
function droneScreen(kind: 'link' | 'board') {
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
      g.fillText('PAD ........ LEVEL 06', 30, 200)
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

function Chamber() {
  const lights = useRef<Array<{ l: THREE.PointLight; max: number; section: number }>>([])
  const birdData = useRef<Array<{ x: number; y: number; z: number; rot: number; phase: number; s: number }>>([])
  const announced = useRef(-1)

  const parts = useMemo(() => {
    const lit: Lit[] = []
    const mat = (p: THREE.MeshStandardMaterialParameters, section: number) => {
      const m = new THREE.MeshStandardMaterial(p)
      lit.push({ m, color: m.color.clone(), emissive: m.emissiveIntensity, section })
      return m
    }

    // The frame: local x = s, local z = -d, origin on the wall face.
    const frame = new THREE.Group()
    const [fx, fz] = CH_FRAME.to(0, 0)
    frame.position.set(fx, FLOOR6, fz)
    frame.rotation.y = CH_FRAME.yaw
    const C = -CHAMBER.centre
    /** Put an object round the chamber at (phi, rr), facing the centre. */
    const place = (o: THREE.Object3D, phi: number, rr: number, y = 0) => {
      o.position.set(Math.sin(phi) * rr, y, C - Math.cos(phi) * rr)
      o.rotation.y = -phi
      frame.add(o)
      return o
    }

    // ---- the room ---------------------------------------------------------
    const R = CHAMBER.radius
    const H = CHAMBER.height
    const floorMap = canvasTexture(1024, 1024, (g) => {
      // Dark stone, with a maze inlaid in brass round the centre.
      g.fillStyle = '#2b2622'
      g.fillRect(0, 0, 1024, 1024)
      const r = seeded(4)
      for (let i = 0; i < 1600; i++) {
        g.fillStyle = `rgba(${60 + r() * 30},${52 + r() * 25},${44 + r() * 20},0.35)`
        g.fillRect(r() * 1024, r() * 1024, 2 + r() * 6, 2 + r() * 6)
      }
      g.strokeStyle = '#a77e4e'
      g.lineWidth = 6
      const c = 512
      for (let k = 1; k <= 5; k++) {
        const rad = k * 46
        const gap = r() * Math.PI * 2
        g.beginPath()
        g.arc(c, c, rad, gap + 0.35, gap + Math.PI * 2 - 0.05)
        g.stroke()
        const spoke = gap + 1 + r() * 3
        g.beginPath()
        g.moveTo(c + Math.cos(spoke) * rad, c + Math.sin(spoke) * rad)
        g.lineTo(c + Math.cos(spoke) * (rad + 46), c + Math.sin(spoke) * (rad + 46))
        g.stroke()
      }
      g.lineWidth = 3
      g.beginPath()
      g.arc(c, c, 300, 0, Math.PI * 2)
      g.stroke()
    })
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 0.4, 96), mat({ map: floorMap, roughness: 0.7, metalness: 0.15 }, WHOLE))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, 0.004, C)
    floor.receiveShadow = true
    frame.add(floor)

    // Wall: dark timber panelling, open at the entrance.
    const gap = Math.asin((CH_TUNNEL.half + 0.15) / R)
    const wallMap = canvasTexture(
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
    wallMap.repeat.set(18, 2)
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.02, R + 0.02, H, 96, 1, true, gap, Math.PI * 2 - gap * 2),
      mat({ map: wallMap, roughness: 0.85, side: THREE.BackSide }, WHOLE),
    )
    wall.position.set(0, H / 2, C)
    frame.add(wall)
    // The entrance's face: the wall the tunnel comes through, closed round it.
    const face = new THREE.Shape()
    face.moveTo(-2.3, -0.5)
    face.lineTo(2.3, -0.5)
    face.lineTo(2.3, H + 0.3)
    face.lineTo(-2.3, H + 0.3)
    face.lineTo(-2.3, -0.5)
    const bore = new THREE.Path()
    bore.absarc(0, CH_OPENING.centre, CH_OPENING.radius, 0, Math.PI * 2, true)
    face.holes.push(bore)
    const front = new THREE.Mesh(new THREE.ShapeGeometry(face, 48), mat({ map: wallMap, roughness: 0.85, side: THREE.DoubleSide }, WHOLE))
    front.position.set(0, 0, -(CH_FRONT + 0.03))
    frame.add(front)

    // Ceiling: a shallow dome of plaster with rings of light let into it.
    const DOME_R = R * 2.2
    const domeA = Math.asin((R + 0.05) / DOME_R)
    const domeBase = H - DOME_R * Math.cos(domeA)
    const ceil = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_R, 64, 16, 0, Math.PI * 2, 0, domeA),
      mat({ color: '#2d2925', roughness: 0.95, side: THREE.BackSide }, WHOLE),
    )
    ceil.position.set(0, domeBase, C)
    frame.add(ceil)
    const ringMat = mat({ color: '#fff1d6', emissive: '#ffd9a0', emissiveIntensity: 1.7 }, ORRERY)
    for (const rr of [3.2, 6.4, 9.2]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.05, 6, 96), ringMat)
      ring.rotation.x = Math.PI / 2
      ring.position.set(0, domeBase + Math.sqrt(DOME_R * DOME_R - rr * rr) - 0.12, C)
      frame.add(ring)
    }

    // Chalkboards on the wall, all the way round above the counters.
    const chalk = chalkboard()
    // Negative: the board is seen from inside the cylinder, which mirrors it.
    chalk.repeat.set(-3, 1)
    const board = new THREE.Mesh(
      new THREE.CylinderGeometry(R - 0.02, R - 0.02, 1.7, 96, 1, true, gap + 0.25, Math.PI * 2 - gap * 2 - 0.5),
      mat({ map: chalk, roughness: 0.95, side: THREE.BackSide }, WHOLE),
    )
    board.position.set(0, 3.55, C)
    frame.add(board)
    const ledge = new THREE.Mesh(
      new THREE.CylinderGeometry(R - 0.1, R - 0.1, 0.06, 96, 1, true, gap + 0.25, Math.PI * 2 - gap * 2 - 0.5),
      mat({ color: '#6b5038', roughness: 0.7, side: THREE.DoubleSide }, WHOLE),
    )
    ledge.position.set(0, 2.68, C)
    frame.add(ledge)

    // ---- counters round the wall, lit from inside ------------------------
    const rand = seeded(606)
    const wood = (section: number) => mat({ color: '#5b4331', roughness: 0.7 }, section)
    const glow = (section: number) =>
      mat({ color: '#f7ead2', emissive: '#ffe2b5', emissiveIntensity: 1.3, roughness: 0.4 }, section)
    const curio = new THREE.InstancedMesh(unitBox, mat({ color: '#ffffff', roughness: 0.6 }, WHOLE), 400)
    let nCurio = 0
    const curioColors = ['#b08a5c', '#d8cfbd', '#6d8a7b', '#8c4d3e', '#c9b27c', '#4e5d6c', '#e6dcc8']
    for (const [a0, a1] of SHELF_RUNS) {
      const section = sectionAt((a0 + a1) / 2)
      const n = Math.ceil(((a1 - a0) * SHELF.r1) / 1.2)
      for (let i = 0; i < n; i++) {
        const phi = a0 + ((i + 0.5) / n) * (a1 - a0)
        const w = ((a1 - a0) / n) * SHELF.r1 + 0.04
        // Two tiers, the back one higher, like steps.
        const back = new THREE.Mesh(unitBox, wood(section))
        back.scale.set(w, SHELF.high, (SHELF.r1 - SHELF.r0) / 2)
        place(back, phi, SHELF.r1 - (SHELF.r1 - SHELF.r0) / 4, SHELF.high / 2)
        const fore = new THREE.Mesh(unitBox, wood(section))
        fore.scale.set(w, SHELF.low, (SHELF.r1 - SHELF.r0) / 2)
        place(fore, phi, SHELF.r0 + (SHELF.r1 - SHELF.r0) / 4, SHELF.low / 2)
        // A lit glass band along the front, like the curved display cases.
        const band = new THREE.Mesh(unitBox, glow(section))
        band.scale.set(w, 0.22, 0.02)
        place(band, phi, SHELF.r0 - 0.005, 0.55)
        // Curios on both tiers.
        for (const [rr, y] of [
          [SHELF.r0 + 0.2, SHELF.low],
          [SHELF.r1 - 0.2, SHELF.high],
        ]) {
          for (let k = 0; k < 4 && nCurio < 400; k++) {
            const p = phi + (k / 4 - 0.375) * (w / rr)
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
    frame.add(curio)

    // ---- the orrery --------------------------------------------------------
    const orr = new THREE.Group()
    orr.position.set(0, 5.3, C)
    const brass = mat({ color: '#c49a62', roughness: 0.32, metalness: 0.9 }, ORRERY)
    const bronze = mat({ color: '#8a6440', roughness: 0.45, metalness: 0.85 }, ORRERY)
    const sunMat = mat({ color: '#ffd28a', emissive: '#ffb04a', emissiveIntensity: 2.2, roughness: 0.4 }, ORRERY)
    orr.add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 20), sunMat))
    const rings: THREE.Group[] = []
    for (const [rad, tilt, planet, size] of [
      [1.7, 0.18, true, 0.24],
      [2.6, -0.12, true, 0.36],
      [3.5, 0.3, true, 0.5],
      [4.4, -0.24, true, 0.3],
      [5.1, 0.08, false, 0],
    ] as Array<[number, number, boolean, number]>) {
      const g = new THREE.Group()
      g.rotation.x = Math.PI / 2 + tilt
      g.rotation.y = tilt * 0.7
      g.add(new THREE.Mesh(new THREE.TorusGeometry(rad, 0.035, 6, 96), brass))
      if (planet) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 16), bronze)
        p.position.set(rad, 0, 0)
        g.add(p)
      }
      orr.add(g)
      rings.push(g)
    }
    // Threads strung from the outer ring: the web the planets turn in.
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
    // Hangers to the ceiling.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 6), brass)
      rod.position.set(Math.cos(a) * 5.1, 1.2, Math.sin(a) * 5.1)
      orr.add(rod)
    }
    frame.add(orr)

    // ---- the music nook ---------------------------------------------------
    const music = sectionAt(GRAMOPHONE.phi)
    const gram = new THREE.Group()
    const cabinetWood = mat({ color: '#4a2e1c', roughness: 0.55 }, music)
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.9), cabinetWood)
    stand.position.y = 0.425
    gram.add(stand)
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.62), cabinetWood)
    plinth.position.y = 0.94
    gram.add(plinth)
    const record = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.27, 0.012, 48),
      mat({ color: '#141414', roughness: 0.3, metalness: 0.2 }, music),
    )
    record.position.y = 1.04
    gram.add(record)
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.014, 24), mat({ color: '#b5463a', roughness: 0.5 }, music))
    label.position.y = 1.042
    gram.add(label)
    // The horn: a flared brass trumpet on a swan neck.
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 24; i++) {
      const t = i / 24
      pts.push(new THREE.Vector2(0.03 + Math.pow(t, 3.2) * 0.5, t * 0.85))
    }
    const hornMat = mat({ color: '#c9a063', roughness: 0.25, metalness: 0.95, side: THREE.DoubleSide }, music)
    const horn = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), hornMat)
    horn.position.set(0.12, 1.25, -0.05)
    horn.rotation.set(-1.1, 0, 0.25)
    gram.add(horn)
    // The cassette slot in the front of the stand, and the tape in it.
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), mat({ color: '#0c0907', roughness: 0.9 }, music))
    slot.position.set(0, 0.62, 0.451)
    gram.add(slot)
    const tapeIn = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.03), mat({ color: '#e8d6a8', roughness: 0.5 }, music))
    tapeIn.position.set(0, 0.62, 0.46)
    tapeIn.visible = false
    gram.add(tapeIn)
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24, Math.PI), hornMat)
    neck.position.set(0.17, 1.1, 0.05)
    neck.rotation.y = Math.PI / 2
    gram.add(neck)
    place(gram, GRAMOPHONE.phi, GRAMOPHONE.rr)

    // The cassette closet: an open cabinet, shelf on shelf of tapes stood
    // on their spines.
    const closet = new THREE.Group()
    const CW = CLOSET.w
    const CH = CLOSET.h
    const CD = CLOSET.depth
    const slab = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cabinetWood)
      m.position.set(x, y, z)
      closet.add(m)
    }
    slab(CW, CH, 0.05, 0, CH / 2, -CD / 2 + 0.025)
    slab(0.06, CH, CD, -CW / 2 + 0.03, CH / 2, 0)
    slab(0.06, CH, CD, CW / 2 - 0.03, CH / 2, 0)
    slab(CW, 0.08, CD, 0, CH - 0.04, 0)
    slab(CW, 0.12, CD, 0, 0.06, 0)
    const SHELVES = 7
    const shelfGap = (CH - 0.3) / SHELVES
    for (let k = 1; k < SHELVES; k++) slab(CW - 0.1, 0.025, CD - 0.08, 0, 0.12 + k * shelfGap, 0)
    const tapes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.02, 0.075, 0.11),
      mat({ color: '#ffffff', roughness: 0.5 }, music),
      SHELVES * 80,
    )
    let t = 0
    const tapeColors = ['#e8d6a8', '#d05a43', '#2f6f8f', '#f2c94c', '#6fae7b', '#d8d8d8', '#a65fa0', '#1f1f1f']
    for (let row = 0; row < SHELVES; row++) {
      let x = -CW / 2 + 0.1
      while (x < CW / 2 - 0.1 && t < SHELVES * 80) {
        // Now and then a gap, or a tape lying down.
        if (rand() < 0.06) {
          x += 0.06
          continue
        }
        dummy.position.set(x, 0.12 + row * shelfGap + 0.05, CD / 2 - 0.12)
        dummy.rotation.set(0, 0, rand() < 0.05 ? 0.25 : 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        tapes.setMatrixAt(t, dummy.matrix)
        tapes.setColorAt(t, new THREE.Color(tapeColors[Math.floor(rand() * tapeColors.length)]))
        t++
        x += 0.022
      }
    }
    tapes.count = t
    tapes.instanceMatrix.needsUpdate = true
    if (tapes.instanceColor) tapes.instanceColor.needsUpdate = true
    closet.add(tapes)
    place(closet, CLOSET.phi, CLOSET.rr)

    // ---- the arcade ---------------------------------------------------------
    const arcade = sectionAt(0)
    const cabMat = mat({ color: '#1d2a33', roughness: 0.55, metalness: 0.3 }, arcade)
    const trim = mat({ color: '#e8b04b', emissive: '#e8a33b', emissiveIntensity: 0.6, roughness: 0.4 }, arcade)
    ARCADE_GAMES.forEach((game, k) => {
      const cab = new THREE.Group()
      const w = CABINET.w
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, CABINET.depth), cabMat)
      base.position.y = 0.5
      cab.add(base)
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, CABINET.h - 1.0, CABINET.depth * 0.6), cabMat)
      top.position.set(0, 1.0 + (CABINET.h - 1.0) / 2, -CABINET.depth * 0.2)
      cab.add(top)
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.14, 0.82),
        mat({ map: cabinetScreen(game.title), emissive: '#ffffff', emissiveMap: cabinetScreen(game.title), emissiveIntensity: 0.9 }, arcade),
      )
      screen.position.set(0, 1.42, CABINET.depth * 0.1 + 0.005)
      screen.rotation.x = -0.12
      cab.add(screen)
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.34), trim)
      panel.position.set(0, 1.02, CABINET.depth / 2 - 0.1)
      panel.rotation.x = 0.25
      cab.add(panel)
      for (const s of [-0.18, 0.06, 0.2]) {
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), trim)
        btn.position.set(s, 1.07, CABINET.depth / 2 - 0.08)
        cab.add(btn)
      }
      place(cab, cabinetPhi(k), CABINET.rr)
    })

    // ---- drone control ------------------------------------------------------
    const droneSec = sectionAt(DRONE_DESK.phi)
    const desk = new THREE.Group()
    const deskMat = mat({ color: '#2d3438', roughness: 0.5, metalness: 0.5 }, droneSec)
    const top = new THREE.Mesh(new THREE.BoxGeometry(DRONE_DESK.w, 0.06, DRONE_DESK.depth), deskMat)
    top.position.y = DRONE_DESK.h
    desk.add(top)
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, DRONE_DESK.h, DRONE_DESK.depth - 0.1), deskMat)
      leg.position.set(s * (DRONE_DESK.w / 2 - 0.1), DRONE_DESK.h / 2, 0)
      desk.add(leg)
    }
    const screens: Array<['link' | 'board', number]> = [
      ['board', -1.05],
      ['link', 0],
      ['board', 1.05],
    ]
    for (const [kind, s] of screens) {
      const tex = droneScreen(kind)
      const mon = new THREE.Mesh(
        new THREE.BoxGeometry(0.96, 0.58, 0.04),
        [deskMat, deskMat, deskMat, deskMat, mat({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1 }, droneSec), deskMat],
      )
      mon.position.set(s, DRONE_DESK.h + 0.42, -0.18)
      mon.rotation.y = -s * 0.22
      desk.add(mon)
    }
    // Sticks on the desk.
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.22), deskMat)
    pad.position.set(0, DRONE_DESK.h + 0.055, 0.2)
    desk.add(pad)
    place(desk, DRONE_DESK.phi, DRONE_DESK.rr)

    // A drone on a plinth, the twin of the one on the pad outside.
    const plinthG = new THREE.Group()
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 1.0, 24), deskMat)
    pl.position.y = 0.5
    plinthG.add(pl)
    const drone = droneModel(mat({ color: '#d7dde0', roughness: 0.4, metalness: 0.4 }, droneSec), mat({ color: '#e8553b', emissive: '#e8553b', emissiveIntensity: 1.2 }, droneSec))
    drone.position.y = 1.12
    plinthG.add(drone)
    place(plinthG, DRONE_PLINTH.phi, DRONE_PLINTH.rr)

    // ---- paper birds overhead ------------------------------------------------
    const birdGeo = new THREE.BufferGeometry()
    birdGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0.18, -0.2, 0.06, -0.08, 0, 0, -0.1, 0, 0, 0.18, 0, 0, -0.1, 0.2, 0.06, -0.08], 3),
    )
    birdGeo.computeVertexNormals()
    const N_BIRDS = 170
    const flock = new THREE.InstancedMesh(
      birdGeo,
      mat({ color: '#efe6d2', roughness: 0.8, side: THREE.DoubleSide }, ORRERY),
      N_BIRDS,
    )
    const data: Array<{ x: number; y: number; z: number; rot: number; phase: number; s: number }> = []
    for (let i = 0; i < N_BIRDS; i++) {
      const rr = 2.5 + rand() * 7
      const a = rand() * Math.PI * 2
      data.push({
        x: Math.sin(a) * rr,
        y: 4.4 + rand() * 2.8,
        z: C - Math.cos(a) * rr,
        rot: rand() * Math.PI * 2,
        phase: rand() * Math.PI * 2,
        s: 0.8 + rand() * 1.6,
      })
      flock.setColorAt(i, new THREE.Color(rand() < 0.2 ? '#d9b27a' : rand() < 0.5 ? '#f3ecdc' : '#e4d8bf'))
    }
    if (flock.instanceColor) flock.instanceColor.needsUpdate = true
    frame.add(flock)

    // ---- lights ----------------------------------------------------------------
    const pointLights: Array<{ l: THREE.PointLight; max: number; section: number }> = []
    const addLight = (phi: number, rr: number, y: number, intensity: number, dist: number, section: number, color = '#ffd8a8') => {
      const l = new THREE.PointLight(color, 0, dist, 2)
      l.position.set(Math.sin(phi) * rr, y, C - Math.cos(phi) * rr)
      frame.add(l)
      pointLights.push({ l, max: intensity, section })
    }
    addLight(GRAMOPHONE.phi, 6.5, 3.4, 26, 10, music)
    addLight(0, 6.4, 3.6, 26, 10, arcade, '#ffe0b0')
    addLight(DRONE_DESK.phi, 6.6, 3.4, 22, 10, droneSec, '#bfe8ff')
    addLight(0, 0, 6.6, 60, 20, ORRERY)

    return { frame, lit, rings, orr, flock, data, pointLights, record, webMat, tapeIn }
  }, [])

  // Leaving the floor takes the tape out.
  useEffect(() => () => stop(false), [])

  useEffect(() => {
    lights.current = parts.pointLights
    birdData.current = parts.data
    // Dark when you come back.
    chamber.litAt = null
    announced.current = -1
    return () => {
      chamber.litAt = null
    }
  }, [parts])

  useFrame((state, dt) => {
    const now = performance.now()
    const s = useSilo.getState()
    // The lights come on when someone first steps into the room.
    const cam = state.camera.position
    if (chamber.litAt === null && s.mode === 'walk') {
      const p = inChamberPolar(cam.x, cam.z)
      if (p.rr < CHAMBER.radius - 0.4 && p.d > CH_FRONT + 0.5 && Math.abs(cam.y - FLOOR6 - 1.6) < 1.5) chamber.litAt = now
    }
    // And off again once everyone has left and the door is shut behind them.
    if (chamber.litAt !== null && chamber.door === 0 && !inChamber(cam.x, cam.z) && s.mode === 'walk' && !s.droneFlying) {
      chamber.litAt = null
      announced.current = -1
      breaker(false)
    }
    // A breaker for each section, as it comes on.
    for (let i = announced.current + 1; i < SECTIONS.length; i++) {
      if (sectionLit(i, now) <= 0) break
      announced.current = i
      breaker(i === SECTIONS.length - 1)
    }

    let whole = 0
    for (let i = 0; i < SECTIONS.length; i++) whole += sectionLit(i, now)
    whole /= SECTIONS.length
    for (const L of parts.lit) {
      const k = L.section === WHOLE ? whole : sectionLit(L.section, now)
      L.m.color.copy(L.color).multiplyScalar(0.035 + 0.965 * k)
      L.m.emissiveIntensity = L.emissive * k
    }
    parts.webMat.opacity = 0.5 * sectionLit(ORRERY, now)
    for (const { l, max, section } of lights.current) l.intensity = max * sectionLit(section, now)

    // The orrery turns; the birds drift.
    const still = s.reducedMotion
    if (!still) {
      parts.rings.forEach((g, i) => {
        g.rotation.z += dt * (0.05 + i * 0.025) * (i % 2 ? -1 : 1)
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
    }
    // The record turns while a cassette plays, and the tape shows in the slot.
    if (jukebox.playing && !still) parts.record.rotation.y -= dt * 3.5
    parts.tapeIn.visible = jukebox.playing
    if (jukebox.current) (parts.tapeIn.material as THREE.MeshStandardMaterial).emissive.set(jukebox.current.color)
    // Louder the nearer you stand; faint from the maze through the open door,
    // and nothing much with it shut.
    if (jukebox.playing) {
      const dist = Math.hypot(cam.x - GRAM_AT[0], cam.z - GRAM_AT[1])
      const inside = inChamber(cam.x, cam.z)
      const k = inside ? Math.min(1, Math.max(0.25, 1 - (dist - 4) / 16)) : chamber.door > 0.5 ? 0.12 : 0.03
      if (Math.abs(k - jukebox.proximity) > 0.02) setLevel(k)
    }
  })

  return <primitive object={parts.frame} />
}

/** A small quadcopter: a body, four arms, four rotors and a lamp. */
export function droneModel(shell: THREE.Material, lamp: THREE.Material) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.3), shell)
  g.add(body)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.28), shell)
    arm.position.set(Math.sin(a) * 0.14, 0, Math.cos(a) * 0.14)
    arm.rotation.y = a
    g.add(arm)
    const rotor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.006, 20),
      new THREE.MeshStandardMaterial({ color: '#1a1a1a', transparent: true, opacity: 0.55 }),
    )
    rotor.position.set(Math.sin(a) * 0.27, 0.05, Math.cos(a) * 0.27)
    rotor.name = 'rotor'
    g.add(rotor)
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), lamp)
  eye.position.set(0, 0, 0.16)
  g.add(eye)
  return g
}

/**
 * The maze's clock and the HUD line that shows it. A run starts on stepping
 * through the gap from the promenade and stops on reaching the cell in front
 * of the door; the best time is kept on this device.
 */
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

function MazeClock() {
  const shownUntil = useRef(0)
  const lastNote = useRef<string | null>(null)
  useEffect(() => () => useSilo.getState().setHudNote(null), [])
  useFrame((state) => {
    const s = useSilo.getState()
    if (s.mode !== 'walk' || s.level !== 6) return
    const now = performance.now()
    const p = state.camera.position
    const cell = mazeCell(p.x, p.z)
    const r = Math.hypot(p.x, p.z)
    if (cell && chamber.mazeStart === null && cell.ring === 0 && shownUntil.current < now) chamber.mazeStart = now
    if (!cell && r < MAZE.radii[0] && chamber.mazeStart !== null) chamber.mazeStart = null
    let note: string | null = null
    if (chamber.mazeStart !== null && cell && cell.ring === MAZE.radii.length - 1 && cell.sector === MAZE.exit) {
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
    if (chamber.blocked) note = 'Step out of the doorway · the round door is rolling shut'
    else if (chamber.mazeStart !== null) note = `Maze · ${clock(now - chamber.mazeStart)}`
    else if (shownUntil.current > now && chamber.mazeLast !== null) {
      const best = readBest()
      note = `Through the maze in ${clock(chamber.mazeLast)}${best ? ` · best ${clock(best)}` : ''}`
    } else if (inChamber(p.x, p.z) && chamber.litAt === null) note = null
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
      <ChamberDoor />
      <Chamber />
      <MazeClock />
    </>
  )
}
