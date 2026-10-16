import { useEffect, useMemo, useRef, type Ref } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PALETTE } from '../../content/floors'
import {
  FLOOR,
  INNER_DOOR,
  VAULT,
  VAULT_PORTAL,
  VAULT_ROOM,
  VAULT_TERMINAL,
  VAULT_TUNNEL,
  fromVault,
} from '../../content/level1'
import { identity } from '../../content/portfolio'
import { vaultClunk } from '../../lib/audio'
import { DOOR_FRAME_YAW, DOOR_OPEN_T, HINGE_X, doorPose, stepDoor, vaultDoor } from '../../lib/vault'
import { useSilo } from '../../state/useSilo'
import { claddingSurface, concreteSurface, plateSurface, steelSurface, tiled } from '../materials'

/**
 * The records vault: a round door in a deep portal in the sheriff's back wall,
 * and behind it a short room cut into the rock beyond the silo wall, lined
 * with archive shelving, with the terminal that holds the personnel record --
 * and at its far end a second round door that stays shut.
 *
 * Drawn in the vault's own frame (content/level1.ts): a group whose local X is
 * across the door, to the right as seen from the office, and whose local Z
 * points back into the office, so a point at depth d is at z = -d.
 *
 * The door does not open on a timer. It is driven by lib/vault.ts, which
 * stops it rather than swing it through a body: stand in its way and it waits
 * until you step back.
 */

const SEG = 64

/** Deterministic PRNG, so the shelves are stocked the same way every load. */
function makeRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/** A box in the vault frame, from its extents (s across, d out, y up). */
function vbox(s0: number, s1: number, d0: number, d1: number, y0: number, y1: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(s1 - s0, y1 - y0, d1 - d0), mat)
  m.position.set((s0 + s1) / 2, (y0 + y1) / 2, -(d0 + d1) / 2)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** A flat wall from d0 to d1, |s| < half, y0..y1, with a round hole in it.
 *  UVs are in metres, so a texture repeated 1/4 per unit tiles every 4 m. */
function holedPlate(half: number, y0: number, y1: number, holeY: number, holeR: number, d0: number, d1: number, mat: THREE.Material) {
  const shape = new THREE.Shape()
  shape.moveTo(-half, y0)
  shape.lineTo(half, y0)
  shape.lineTo(half, y1)
  shape.lineTo(-half, y1)
  shape.lineTo(-half, y0)
  const hole = new THREE.Path()
  hole.absarc(0, holeY, holeR, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const g = new THREE.ExtrudeGeometry(shape, { depth: d1 - d0, bevelEnabled: false, curveSegments: SEG })
  const m = new THREE.Mesh(g, mat)
  m.position.z = -d1
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** A plane in the vault frame. `facing` is the way its front looks. */
function plane(w: number, h: number, mat: THREE.Material, at: [number, number, number], facing: 'up' | 'down' | '+s' | '-s' | 'office' | 'room') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  m.position.set(...at)
  const r: Record<typeof facing, [number, number, number]> = {
    up: [-Math.PI / 2, 0, 0],
    down: [Math.PI / 2, 0, 0],
    '+s': [0, Math.PI / 2, 0],
    '-s': [0, -Math.PI / 2, 0],
    office: [0, 0, 0],
    room: [0, Math.PI, 0],
  }
  m.rotation.set(...r[facing])
  m.receiveShadow = true
  return m
}

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function hazardTexture() {
  return canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = '#1b1712'
    ctx.fillRect(0, 0, 256, 128)
    ctx.fillStyle = '#c99a3c'
    for (let i = -128; i < 256; i += 40) {
      ctx.beginPath()
      ctx.moveTo(i, 128)
      ctx.lineTo(i + 20, 128)
      ctx.lineTo(i + 148, 0)
      ctx.lineTo(i + 128, 0)
      ctx.fill()
    }
  })
}

interface Mats {
  door: THREE.Material
  dark: THREE.Material
}

/**
 * One round door leaf, centred on its own origin, face towards local +Z:
 * raised rings, spokes, a viewing slot and a handwheel. `wheel` receives the
 * handwheel's group, to turn it.
 */
function DoorLeaf({ radius: R, mats, wheel }: { radius: number; mats: Mats; wheel?: Ref<THREE.Group> }) {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R, R, 0.36, 72]} />
        <primitive object={mats.door} attach="material" />
      </mesh>
      {[R - 0.12, R * 0.62, R * 0.24].map((rr) => (
        <mesh key={rr} position={[0, 0, 0.19]}>
          <torusGeometry args={[rr, 0.05, 8, 64]} />
          <primitive object={mats.dark} attach="material" />
        </mesh>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} rotation={[0, 0, (i / 8) * Math.PI * 2]} position={[0, 0, 0.2]}>
          <boxGeometry args={[0.07, R * 1.72, 0.05]} />
          <primitive object={mats.dark} attach="material" />
        </mesh>
      ))}
      <mesh position={[0, R * 0.78, 0.2]}>
        <boxGeometry args={[0.36, 0.14, 0.04]} />
        <meshStandardMaterial color="#1a1714" roughness={0.3} />
      </mesh>
      <group ref={wheel} position={[0, 0, 0.34]}>
        <mesh>
          <torusGeometry args={[0.42, 0.04, 8, 32]} />
          <primitive object={mats.dark} attach="material" />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i / 4) * Math.PI * 2]}>
            <boxGeometry args={[0.04, 0.84, 0.04]} />
            <primitive object={mats.dark} attach="material" />
          </mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.16, 16]} />
          <primitive object={mats.door} attach="material" />
        </mesh>
      </group>
    </group>
  )
}

/** The fixed parts: portal, bulkhead, tunnel and the room, built once. */
function useShell() {
  return useMemo(() => {
    const group = new THREE.Group()
    const R = VAULT.radius
    const P = VAULT_PORTAL
    const T = VAULT_TUNNEL
    const RM = VAULT_ROOM
    const sill = VAULT.sill
    const top = sill + RM.height

    const pc = tiled(concreteSurface(), 1, 1)
    const portalMat = new THREE.MeshStandardMaterial({ color: '#6c655b', roughness: 0.95, map: pc.map, normalMap: pc.normalMap })
    const st = tiled(steelSurface(), 1, 1)
    const steel = new THREE.MeshStandardMaterial({ color: '#5d5952', roughness: 0.55, metalness: 0.7, map: st.map, normalMap: st.normalMap })
    const dark = new THREE.MeshStandardMaterial({ color: '#3a3833', roughness: 0.6, metalness: 0.6 })
    const cl = tiled(claddingSurface(), 0.25, 0.25)
    const clad = new THREE.MeshStandardMaterial({ color: '#c9ccce', roughness: 0.9, map: cl.map, normalMap: cl.normalMap, side: THREE.DoubleSide })
    const pl = tiled(plateSurface(), 1, 1)
    const plate = (w: number, h: number) => {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.15, map: pl.map.clone(), normalMap: pl.normalMap.clone() })
      for (const t of [m.map!, m.normalMap!]) {
        t.repeat.set(w / 1.22, h / 1.22)
        t.needsUpdate = true
      }
      return m
    }
    const wallMat = (w: number, h: number) => {
      const m = clad.clone()
      m.map = cl.map.clone()
      m.normalMap = cl.normalMap.clone()
      for (const t of [m.map, m.normalMap]) {
        t.repeat.set(w / 4, h / 4)
        t.needsUpdate = true
      }
      return m
    }

    // ---- portal --------------------------------------------------------------
    for (const side of [-1, 1]) {
      const s0 = side > 0 ? P.inner : -P.outer
      group.add(vbox(s0, s0 + (P.outer - P.inner), P.front, 0, 0, P.top, portalMat))
    }
    group.add(vbox(-P.inner, P.inner, P.front, 0, P.head, P.top, portalMat))
    // A steel lining round the opening, so the jambs read as a frame. It
    // stands 5 cm proud of the jambs' inner faces: flush with them, the two
    // faces shared a plane and flickered through each other.
    for (const side of [-1, 1]) {
      const s0 = side > 0 ? P.inner - 0.05 : -P.inner - 0.01
      group.add(vbox(s0, s0 + 0.06, P.front - 0.02, -0.2, 0.04, P.head - 0.05, steel))
    }
    group.add(vbox(-P.inner - 0.01, P.inner + 0.01, P.front - 0.02, -0.2, P.head - 0.05, P.head + 0.01, steel))
    // The floor of the recess, between the jambs: a dark steel plate the door
    // stands on, so the office floor does not run on under the door.
    group.add(vbox(-P.inner + 0.01, P.inner - 0.01, P.front - 0.02, T.from, 0, 0.04, dark))
    group.add(vbox(-P.inner + 0.01, P.inner - 0.01, P.front - 0.05, P.front - 0.01, 0, 0.045, new THREE.MeshStandardMaterial({
      color: PALETTE.brass, emissive: new THREE.Color(PALETTE.brass), emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.5,
    })))

    // ---- the bulkhead the door seats against, and its ring -----------------
    group.add(holedPlate(P.inner + 0.01, 0, P.head + 0.01, VAULT.centre, R, T.from, -0.02, steel))
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.08, 0.1, 12, SEG), dark)
    ring.position.set(0, VAULT.centre, -T.from + 0.03)
    group.add(ring)

    // ---- the tunnel through the wall --------------------------------------------
    const tunnelLen = T.to - T.from
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(R, R, tunnelLen, SEG, 1, true), steel.clone())
    ;(tunnel.material as THREE.MeshStandardMaterial).side = THREE.BackSide
    tunnel.rotation.x = Math.PI / 2
    tunnel.position.set(0, VAULT.centre, -(T.from + T.to) / 2)
    tunnel.receiveShadow = true
    group.add(tunnel)
    // Its sill: a flat floor across the bottom of the bore, level with the room.
    const chord = 2 * Math.sqrt(R * R - (VAULT.centre - sill) ** 2)
    group.add(vbox(-chord / 2, chord / 2, T.from - 0.03, T.to, VAULT.centre - R, sill, steel))
    const sillTop = plane(chord, tunnelLen + 0.03, plate(chord, tunnelLen), [0, sill + 0.002, -(T.from - 0.03 + T.to) / 2], 'up')
    group.add(sillTop)
    // A brass nosing on the step up.
    const nose = vbox(-chord / 2, chord / 2, T.from - 0.06, T.from - 0.01, sill - 0.04, sill + 0.004, new THREE.MeshStandardMaterial({
      color: PALETTE.brass, emissive: new THREE.Color(PALETTE.brass), emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.5,
    }))
    group.add(nose)

    // ---- the room -------------------------------------------------------------
    const W = RM.half * 2
    const D = RM.to - RM.from
    const midD = (RM.from + RM.to) / 2
    group.add(plane(W, D, plate(W, D), [0, sill + 0.001, -midD], 'up'))
    const ceilConc = tiled(concreteSurface(), W / 4, D / 4)
    // Every inner face is set a few millimetres in from the solid skin
    // behind it: two faces in one plane flicker through each other.
    const IN = 0.008
    const ceiling = plane(W, D, new THREE.MeshStandardMaterial({ color: '#77736d', roughness: 1, map: ceilConc.map }), [0, top - IN, -midD], 'down')
    ceiling.castShadow = true
    group.add(ceiling)
    // A slab over the room, to keep the daylight from the dish off its floor.
    group.add(vbox(-RM.half - RM.wall, RM.half + RM.wall, T.from, RM.to + RM.wall, top, top + 0.3, portalMat))
    group.add(plane(D, RM.height, wallMat(D, RM.height), [-RM.half + IN, sill + RM.height / 2, -midD], '+s'))
    group.add(plane(D, RM.height, wallMat(D, RM.height), [RM.half - IN, sill + RM.height / 2, -midD], '-s'))
    group.add(plane(W, RM.height, wallMat(W, RM.height), [0, sill + RM.height / 2, -(RM.to - IN)], 'office'))
    // The inside of the front wall, round the end of the tunnel. Its UVs are
    // in metres, so one tile is a quarter of a unit of texture.
    const front = holedPlate(RM.half, 0, top, VAULT.centre, R, T.to - 0.02, RM.from, wallMat(1, 1))
    group.add(front)
    // Outer skin, so the room is a closed box from any angle.
    for (const side of [-1, 1]) {
      group.add(vbox(side > 0 ? RM.half : -RM.half - RM.wall, side > 0 ? RM.half + RM.wall : -RM.half, RM.from, RM.to + RM.wall, 0, top, portalMat))
    }
    group.add(vbox(-RM.half, RM.half, RM.to, RM.to + RM.wall, 0, top, portalMat))

    // Light strips down the ceiling.
    const stripMat = new THREE.MeshStandardMaterial({
      color: '#fff3dc', emissive: new THREE.Color('#ffe2b0'), emissiveIntensity: 1.6, roughness: 0.5,
    })
    for (const s of [-1.05, 1.05]) group.add(vbox(s - 0.07, s + 0.07, RM.from + 0.6, RM.to - 0.6, top - 0.06, top - 0.01, stripMat))
    // A skirting line of light along the floor either side, as on the bridges.
    const skirt = new THREE.MeshStandardMaterial({
      color: PALETTE.brass, emissive: new THREE.Color(PALETTE.brass), emissiveIntensity: 0.9, roughness: 0.5,
    })
    group.add(vbox(-RM.half + 0.01, -RM.half + 0.05, RM.from + 0.2, RM.to - 0.2, sill + 0.06, sill + 0.1, skirt))

    // ---- archive shelving, down the right-hand wall -----------------------------
    {
      const s0 = RM.half - 0.55
      const s1 = RM.half - 0.02
      const d0 = RM.from + 0.5
      const d1 = RM.to - 0.5
      const h0 = sill
      const h1 = sill + 2.6
      const bays = 5
      for (let i = 0; i <= bays; i++) {
        const d = d0 + ((d1 - d0) * i) / bays
        group.add(vbox(s0, s1, d - 0.03, d + 0.03, h0, h1, dark))
      }
      const levels = [0.08, 0.68, 1.28, 1.88, 2.48]
      for (const h of levels) group.add(vbox(s0, s1, d0, d1, h0 + h, h0 + h + 0.03, dark))
      // Archive boxes: a deterministic scatter, so it is the same every load.
      const rand = makeRandom(7)
      const boxGeo = new THREE.BoxGeometry(1, 1, 1)
      const boxMat = new THREE.MeshStandardMaterial({ roughness: 0.9 })
      const tones = ['#7b6a52', '#6b5d49', '#8a7a62', '#5a5348', '#74674f']
      const inst = new THREE.InstancedMesh(boxGeo, boxMat, 200)
      const o = new THREE.Object3D()
      let n = 0
      for (const h of levels.slice(0, 4)) {
        let d = d0 + 0.08
        while (d < d1 - 0.4 && n < 200) {
          const w = 0.32 + rand() * 0.14
          const hh = 0.3 + rand() * 0.18
          if (rand() > 0.12) {
            o.position.set(s0 + 0.25 + rand() * 0.04, h0 + h + 0.03 + hh / 2, -(d + w / 2))
            o.rotation.set(0, (rand() - 0.5) * 0.08, 0)
            o.scale.set(0.42, hh, w)
            o.updateMatrix()
            inst.setMatrixAt(n, o.matrix)
            inst.setColorAt(n, new THREE.Color(tones[Math.floor(rand() * tones.length)]))
            n++
          }
          d += w + 0.04
          // Leave a gap where an upright stands.
          const bay = (d1 - d0) / bays
          const into = (d - d0) % bay
          if (into > bay - 0.4) d += bay - into + 0.06
        }
      }
      inst.count = n
      inst.instanceMatrix.needsUpdate = true
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      inst.castShadow = true
      group.add(inst)
    }

    // ---- the record terminal ------------------------------------------------------
    {
      const K = VAULT_TERMINAL
      const desk = vbox(K.s - K.w / 2, K.s + K.w / 2, K.d - K.depth / 2, K.d + K.depth / 2, sill, sill + K.h, steel)
      group.add(desk)
      const screenTex = canvasTexture(512, 320, (ctx) => {
        ctx.fillStyle = '#0b0a08'
        ctx.fillRect(0, 0, 512, 320)
        ctx.strokeStyle = 'rgba(201,153,107,0.6)'
        ctx.lineWidth = 3
        ctx.strokeRect(10, 10, 492, 300)
        ctx.textAlign = 'center'
        ctx.fillStyle = PALETTE.brassHot
        ctx.font = '700 30px ui-monospace, "Cascadia Mono", Consolas, monospace'
        ctx.fillText('PERSONNEL RECORD', 256, 92)
        ctx.fillStyle = 'rgba(201,153,107,0.4)'
        ctx.fillRect(96, 116, 320, 2)
        ctx.fillStyle = '#f4e8d2'
        ctx.font = '600 34px "Segoe UI", Arial, sans-serif'
        ctx.fillText(identity.name.toUpperCase(), 256, 178)
        ctx.fillStyle = 'rgba(201,153,107,0.75)'
        ctx.font = '600 20px ui-monospace, "Cascadia Mono", Consolas, monospace'
        ctx.fillText('ON FILE  ·  LEVEL 01', 256, 236)
      })
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.75),
        new THREE.MeshStandardMaterial({ map: screenTex, emissive: new THREE.Color('#ffffff'), emissiveMap: screenTex, emissiveIntensity: 0.9, roughness: 0.4 }),
      )
      // Standing on the desk's back edge, tipped back, facing into the room.
      screen.position.set(K.s - K.w / 2 + 0.22, sill + K.h + 0.42, -K.d)
      screen.rotation.set(0, Math.PI / 2, 0)
      screen.rotateX(-0.28)
      group.add(screen)
      group.add(vbox(K.s - K.w / 2 + 0.08, K.s - K.w / 2 + 0.16, K.d - 0.65, K.d + 0.65, sill + K.h, sill + K.h + 0.84, dark))
    }

    // ---- the sealed door at the far end ---------------------------------------------
    const innerCentre = sill + INNER_DOOR.radius + 0.12
    const recess = new THREE.Mesh(new THREE.CircleGeometry(INNER_DOOR.radius + 0.1, SEG), new THREE.MeshStandardMaterial({ color: '#0e0c0a' }))
    recess.position.set(0, innerCentre, -INNER_DOOR.d + 0.025)
    group.add(recess)
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(INNER_DOOR.radius + 0.1, 0.1, 12, SEG), dark)
    innerRing.position.set(0, innerCentre, -INNER_DOOR.d + 0.06)
    group.add(innerRing)
    const stencil = canvasTexture(256, 96, (ctx) => {
      ctx.fillStyle = '#1b1712'
      ctx.fillRect(0, 0, 256, 96)
      ctx.strokeStyle = '#b4584f'
      ctx.lineWidth = 4
      ctx.strokeRect(6, 6, 244, 84)
      ctx.fillStyle = '#e07a6e'
      ctx.textAlign = 'center'
      ctx.font = '800 40px ui-monospace, "Cascadia Mono", Consolas, monospace'
      ctx.fillText('SEALED', 128, 62)
    })
    const sign = plane(0.66, 0.25, new THREE.MeshStandardMaterial({ map: stencil, emissive: new THREE.Color('#ffffff'), emissiveMap: stencil, emissiveIntensity: 0.5, roughness: 0.6 }), [-1.85, sill + 1.75, -INNER_DOOR.d + 0.03], 'office')
    group.add(sign)

    // Hazard striping on the floor before each door.
    const hz = hazardTexture()
    const stripe = (w: number, d: number, at: [number, number, number]) =>
      plane(w, d, new THREE.MeshStandardMaterial({ map: hz, roughness: 0.8, transparent: true, opacity: 0.85, depthWrite: false }), at, 'up')
    group.add(stripe(3.4, 1.0, [0, 0.012, 1.6]))
    group.add(stripe(3.0, 0.8, [0, sill + 0.012, -(INNER_DOOR.d - 0.7)]))

    return { group, mats: { door: (() => {
      const s2 = tiled(steelSurface(), 2, 2)
      return new THREE.MeshStandardMaterial({ color: '#8c8476', roughness: 0.55, metalness: 0.7, map: s2.map, normalMap: s2.normalMap })
    })(), dark }, innerCentre }
  }, [])
}

export default function Vault() {
  const shell = useShell()
  const plug = useRef<THREE.Group>(null)
  const hinge = useRef<THREE.Group>(null)
  const wheel = useRef<THREE.Group>(null)
  const innerWheel = useRef<THREE.Group>(null)
  const warn = useRef<THREE.MeshStandardMaterial>(null)
  const innerWarn = useRef<THREE.MeshStandardMaterial>(null)
  const roomLight = useRef<THREE.PointLight>(null)
  const phase = useSilo((s) => s.phase)
  const seated = useRef(true)
  const turned = useRef(false)

  // Whatever the door was doing, it is shut again when level 1 is unmounted
  // and mounted again -- unless it is still wanted open.
  useEffect(() => {
    if (!useSilo.getState().vaultOpen) vaultDoor.t = 0
  }, [])

  useFrame((state, dt) => {
    const s = useSilo.getState()
    const fast = s.reducedMotion ? 6 : 1
    const body = s.mode === 'walk' && s.bodyReady ? { x: state.camera.position.x, z: state.camera.position.z } : null
    const before = vaultDoor.t
    vaultDoor.t = stepDoor(before, s.vaultOpen && s.level === 1, Math.min(dt, 1 / 20) * fast, body)
    if (vaultDoor.blocked !== s.doorBlocked) s.setDoorBlocked(vaultDoor.blocked)
    const t = vaultDoor.t
    // The bolts: once as the wheel finishes turning, once as the door seats.
    if (before < 1 && t >= 1 && !turned.current) {
      turned.current = true
      vaultClunk()
    }
    if (t < 0.5) turned.current = false
    if (t === 0 && !seated.current) {
      seated.current = true
      vaultClunk()
    }
    if (t > 0.05) seated.current = false

    const pose = doorPose(t)
    if (wheel.current) wheel.current.rotation.z = pose.wheel
    if (plug.current) plug.current.position.z = pose.plug
    if (hinge.current) hinge.current.rotation.y = pose.swing
    const now = performance.now()
    if (warn.current) {
      const moving = t > 0 && t < DOOR_OPEN_T
      warn.current.emissiveIntensity = moving ? 1.2 + Math.max(0, Math.sin(now / 120)) * 2.5 : t >= DOOR_OPEN_T ? 1.4 : 0.5
    }
    if (roomLight.current) roomLight.current.intensity = THREE.MathUtils.smoothstep(t, 1.1, 2.2) * 26
    // The sealed door, tried: its wheel gives a fraction and springs back,
    // and its lamp flashes.
    const k = Math.max(0, 1 - (now - vaultDoor.knock) / 900)
    if (innerWheel.current) innerWheel.current.rotation.z = Math.sin(k * Math.PI * 3) * 0.12 * k
    if (innerWarn.current) innerWarn.current.emissiveIntensity = 0.7 + k * (2 + Math.sin(now / 70) * 1.5)
  })

  const [ox, oz] = fromVault(0, 0)
  const P = VAULT_PORTAL
  return (
    <group position={[ox, FLOOR, oz]} rotation={[0, DOOR_FRAME_YAW, 0]} visible={phase !== 'exterior'}>
      <primitive object={shell.group} />

      {/* The door: drawn out of its seat, then swung on the right-hand jamb. */}
      <group position={[0, VAULT.centre, -VAULT.seat]}>
        <group ref={plug}>
          <group ref={hinge} position={[HINGE_X, 0, 0.1]}>
            <group position={[-HINGE_X, 0, 0]}>
              <DoorLeaf radius={VAULT.radius} mats={shell.mats} wheel={wheel} />
            </group>
          </group>
        </group>
      </group>

      {/* Warning lamp on the head of the portal. */}
      <mesh position={[0, (P.head + P.top) / 2, -P.front + 0.08]}>
        <boxGeometry args={[0.6, 0.16, 0.16]} />
        <meshStandardMaterial ref={warn} color="#ffb24a" emissive="#ff8a1e" emissiveIntensity={0.5} />
      </mesh>

      {/* The room's own light, which comes up as the door opens. */}
      <pointLight
        ref={roomLight}
        color="#ffe2b8"
        intensity={0}
        distance={10}
        decay={2}
        position={[0, VAULT.sill + VAULT_ROOM.height - 0.5, -(VAULT_ROOM.from + VAULT_ROOM.to) / 2]}
      />

      {/* The second door. It does not open. */}
      <group position={[0, shell.innerCentre, -INNER_DOOR.d + 0.2]}>
        <DoorLeaf radius={INNER_DOOR.radius} mats={shell.mats} wheel={innerWheel} />
      </group>
      <mesh position={[0, shell.innerCentre + INNER_DOOR.radius + 0.42, -INNER_DOOR.d + 0.09]}>
        <boxGeometry args={[0.5, 0.14, 0.14]} />
        <meshStandardMaterial ref={innerWarn} color="#ff6a5a" emissive="#ff3020" emissiveIntensity={0.7} />
      </mesh>
    </group>
  )
}
