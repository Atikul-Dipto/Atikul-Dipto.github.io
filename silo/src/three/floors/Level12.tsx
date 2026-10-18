import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { identity } from '../../content/portfolio'
import { SHAFT_RADIUS, WALL_THICK, walkY } from '../../content/floors'
import {
  CATWALK,
  COMMS,
  CONSOLE,
  CONTACTS,
  CX_FRAME,
  FLOOR12,
  PASSAGE,
  PASS_HALF,
  PLATFORM,
  RACK,
  REACTOR,
  RX_FRAME,
  TUNNEL_TO,
} from '../../content/level12'
import type { WallFrame } from '../../content/frame'
import { seeded } from '../../content/frame'
import { reactor } from '../../lib/reactor'

/**
 * LEVEL 12 — the reactor that powers the silo, and the communications room,
 * drawn from content/level12.ts.
 */

const dummy = new THREE.Object3D()

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** A group in a wall frame: local x = s, local z = -d, origin on the wall face at floor height. */
function frameGroup(F: WallFrame) {
  const g = new THREE.Group()
  const [x, z] = F.to(0, 0)
  g.position.set(x, FLOOR12, z)
  g.rotation.y = F.yaw
  return g
}

/** The way through the wall: brass ring, lined bore, floor, a lamp. */
function passage(g: THREE.Group, length: number, accent: string) {
  const brass = new THREE.MeshStandardMaterial({ color: '#b68a57', roughness: 0.35, metalness: 0.9 })
  const below = Math.asin(PASSAGE.centre / (PASSAGE.radius + 0.1))
  const ring = new THREE.Mesh(new THREE.TorusGeometry(PASSAGE.radius + 0.1, 0.14, 10, 64, Math.PI + below * 2), brass)
  ring.rotation.z = -below
  ring.position.set(0, PASSAGE.centre, 0.06)
  g.add(ring)
  const bore = new THREE.Mesh(
    new THREE.CylinderGeometry(PASSAGE.radius, PASSAGE.radius, length, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: '#3b3a3a', roughness: 0.85, metalness: 0.3, side: THREE.BackSide }),
  )
  bore.rotation.x = Math.PI / 2
  bore.position.set(0, PASSAGE.centre, -length / 2 + 0.02)
  g.add(bore)
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(PASS_HALF * 2 + 0.6, 0.1, length + 0.2),
    new THREE.MeshStandardMaterial({ color: '#2f2d2b', roughness: 0.7, metalness: 0.4 }),
  )
  floor.position.set(0, -0.048, -length / 2)
  floor.receiveShadow = true
  g.add(floor)
  for (const s of [-1, 1]) {
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.02, length),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.6 }),
    )
    edge.position.set(s * (PASS_HALF - 0.08), 0.012, -length / 2)
    g.add(edge)
  }
  const lamp = new THREE.PointLight(accent, 6, 8, 2)
  lamp.position.set(0, 3, -length / 2)
  g.add(lamp)
}

// ---------------------------------------------------------------------------
// The reactor
// ---------------------------------------------------------------------------

/** The core's light: a slow churn of fire and cold, drawn in its shader. */
function plasmaMaterial(uTime: { value: number }, uSurge: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uSurge },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      varying vec3 vNormal;
      void main() {
        vPos = position;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSurge;
      varying vec3 vPos;
      varying vec3 vNormal;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float n(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 p = vPos * 1.4 + vec3(0.0, -uTime * 0.8, uTime * 0.3);
        float v = n(p) * 0.55 + n(p * 2.3 + 4.0) * 0.3 + n(p * 5.1 - 2.0) * 0.15;
        float rim = pow(1.0 - abs(vNormal.z), 2.0);
        vec3 hot = vec3(1.0, 0.62, 0.22);
        vec3 cold = vec3(0.3, 0.85, 1.0);
        vec3 col = mix(cold, hot, smoothstep(0.35, 0.75, v)) * (1.6 + v * 2.2 + rim * 1.5);
        col *= 1.0 + uSurge * 2.5;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
  })
}

function Reactor() {
  const parts = useMemo(() => {
    const g = frameGroup(RX_FRAME)
    passage(g, TUNNEL_TO + 0.08, '#4fd6e0')
    const R = REACTOR
    const C = -R.centre
    const rand = seeded(1212)

    // The hall: a rough rock bore, banded with lit ribs.
    // Open where the tunnel comes in: a full cylinder ran straight across the
    // gate, and from inside the hall the way out was a wall of rock.
    const rockR = R.radius + 0.5
    const gateGap = Math.asin((PASSAGE.radius + 0.7) / rockR)
    const rockGeo = new THREE.CylinderGeometry(rockR, rockR, R.depth + R.height, 64, 24, true, gateGap, Math.PI * 2 - gateGap * 2)
    const pos = rockGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const k = 1 + (rand() - 0.5) * 0.06
      pos.setX(i, x * k)
      pos.setZ(i, z * k)
    }
    rockGeo.computeVertexNormals()
    const rockMat = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 1, side: THREE.BackSide })
    const rock = new THREE.Mesh(rockGeo, rockMat)
    rock.position.set(0, (R.height - R.depth) / 2, C)
    g.add(rock)
    // The face the tunnel comes through, closing the gap round the opening
    // from the floor of the pit to the roof.
    const half = rockR * Math.sin(gateGap) + 0.3
    const gate = new THREE.Shape()
    gate.moveTo(-half, -R.depth)
    gate.lineTo(half, -R.depth)
    gate.lineTo(half, R.height)
    gate.lineTo(-half, R.height)
    gate.lineTo(-half, -R.depth)
    const bore = new THREE.Path()
    bore.absarc(0, PASSAGE.centre, PASSAGE.radius, 0, Math.PI * 2, true)
    gate.holes.push(bore)
    const gateFace = new THREE.Mesh(
      new THREE.ShapeGeometry(gate, 48),
      new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 1, side: THREE.DoubleSide }),
    )
    gateFace.position.set(0, 0, -TUNNEL_TO - 0.02)
    g.add(gateFace)
    const gateRing = new THREE.Mesh(
      new THREE.TorusGeometry(PASSAGE.radius + 0.1, 0.14, 10, 64),
      new THREE.MeshStandardMaterial({ color: '#4fd6e0', emissive: '#4fd6e0', emissiveIntensity: 1.2 }),
    )
    gateRing.position.set(0, PASSAGE.centre, -TUNNEL_TO - 0.06)
    g.add(gateRing)
    const ribMat = new THREE.MeshStandardMaterial({ color: '#1b2a2d', emissive: '#4fd6e0', emissiveIntensity: 0.9 })
    for (let i = 0; i < 16; i++) {
      const phi = (i / 16) * Math.PI * 2 + 0.1
      if (Math.abs(Math.abs(phi) - Math.PI) < 0.3) continue
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, R.depth + R.height, 0.08), ribMat)
      rib.position.set(Math.sin(phi) * (R.radius - 0.1), (R.height - R.depth) / 2, C - Math.cos(phi) * (R.radius - 0.1))
      g.add(rib)
    }
    // Ceiling: a dark dome, and the floor of the pit far below.
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R.radius + 0.6, 64), new THREE.MeshStandardMaterial({ color: '#1d1a17', roughness: 1 }))
    cap.rotation.x = Math.PI / 2
    cap.position.set(0, R.height, C)
    g.add(cap)
    const pit = new THREE.Mesh(
      new THREE.CircleGeometry(R.radius + 0.6, 64),
      new THREE.MeshStandardMaterial({ color: '#120d0a', emissive: '#ff7a2f', emissiveIntensity: 0.35 }),
    )
    pit.rotation.x = -Math.PI / 2
    pit.position.set(0, -R.depth, C)
    g.add(pit)

    // The gallery round the rim: steel grating, a rail on the drop.
    const grate = canvasTexture(256, 256, (c) => {
      c.fillStyle = '#3a3b3c'
      c.fillRect(0, 0, 256, 256)
      c.strokeStyle = '#1a1b1c'
      c.lineWidth = 3
      for (let i = 0; i <= 256; i += 16) {
        c.beginPath()
        c.moveTo(i, 0)
        c.lineTo(i, 256)
        c.moveTo(0, i)
        c.lineTo(256, i)
        c.stroke()
      }
    })
    grate.wrapS = grate.wrapT = THREE.RepeatWrapping
    grate.repeat.set(24, 2)
    const steel = new THREE.MeshStandardMaterial({ map: grate, roughness: 0.6, metalness: 0.7 })
    const gallery = new THREE.Mesh(new THREE.RingGeometry(R.rim, R.radius + 0.4, 96, 1), steel)
    gallery.rotation.x = -Math.PI / 2
    gallery.position.set(0, 0.002, C)
    gallery.receiveShadow = true
    g.add(gallery)
    const railMat = new THREE.MeshStandardMaterial({ color: '#c49a62', roughness: 0.35, metalness: 0.9 })
    const catGap = Math.asin((CATWALK.half + 0.05) / R.rim)
    const rail = new THREE.Mesh(new THREE.TorusGeometry(R.rim, 0.035, 6, 128, Math.PI * 2 - catGap * 2), railMat)
    rail.rotation.set(Math.PI / 2, 0, -Math.PI / 2 + catGap)
    rail.position.set(0, 1.1, C)
    g.add(rail)
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 1.1, 0.05), railMat, 64)
    let np = 0
    for (let i = 0; i < 64; i++) {
      const phi = (i / 64) * Math.PI * 2
      if (Math.abs(Math.abs(phi - Math.PI)) < catGap + 0.02) continue
      dummy.position.set(Math.sin(phi) * R.rim, 0.55, C - Math.cos(phi) * R.rim)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      posts.setMatrixAt(np++, dummy.matrix)
    }
    posts.count = np
    g.add(posts)

    // The catwalk out over the drop, and the platform beside the machine.
    const len = CATWALK.from - CATWALK.to
    const cat = new THREE.Mesh(new THREE.BoxGeometry(CATWALK.half * 2, 0.12, len + 0.3), steel)
    cat.position.set(0, -0.06, C + (CATWALK.from + CATWALK.to) / 2)
    g.add(cat)
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), railMat)
      r.position.set(s * CATWALK.half, 1.1, C + (CATWALK.from + CATWALK.to) / 2)
      g.add(r)
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, len), new THREE.MeshStandardMaterial({ color: '#4fd6e0', emissive: '#4fd6e0', emissiveIntensity: 2 }))
      strip.position.set(s * (CATWALK.half - 0.06), 0.01, C + (CATWALK.from + CATWALK.to) / 2)
      g.add(strip)
    }
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM.radius, PLATFORM.radius, 0.14, 48), steel)
    plat.position.set(0, -0.07, C + PLATFORM.rr)
    g.add(plat)
    const platRail = new THREE.Mesh(new THREE.TorusGeometry(PLATFORM.radius, 0.035, 6, 48, Math.PI * 2 - 1.3), railMat)
    platRail.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.65)
    platRail.position.set(0, 1.1, C + PLATFORM.rr)
    g.add(platRail)

    // The console, and its screen.
    const screenTex = canvasTexture(512, 256, (c) => {
      c.fillStyle = '#04131a'
      c.fillRect(0, 0, 512, 256)
      c.fillStyle = '#7fe8f2'
      c.font = 'bold 30px "Courier New", monospace'
      c.fillText('PRIMARY CORE', 24, 50)
      c.font = '20px "Courier New", monospace'
      c.fillText('OUTPUT .......... NOMINAL', 24, 100)
      c.fillText('FEEDS ........... 12 LEVELS', 24, 135)
      c.fillText('CONTAINMENT ..... HOLDING', 24, 170)
      c.fillStyle = '#ffd166'
      c.fillText('PRESS E TO RUN A SURGE TEST', 24, 225)
    })
    const consoleMat = new THREE.MeshStandardMaterial({ color: '#23292c', roughness: 0.5, metalness: 0.6 })
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.6), consoleMat)
    desk.position.set(0, 0.5, C + CONSOLE.rr)
    g.add(desk)
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.55),
      new THREE.MeshStandardMaterial({ map: screenTex, emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 1 }),
    )
    screen.position.set(0, 1.28, C + CONSOLE.rr + 0.12)
    screen.rotation.x = -0.35
    g.add(screen)

    // ---- the machine ---------------------------------------------------------
    const machine = new THREE.Group()
    machine.position.set(0, 0, C)
    g.add(machine)
    const hull = new THREE.MeshStandardMaterial({ color: '#7d858c', roughness: 0.3, metalness: 0.75 })
    const glowCyan = new THREE.MeshStandardMaterial({ color: '#0b2a30', emissive: '#4fd6e0', emissiveIntensity: 1.6 })
    const glowAmber = new THREE.MeshStandardMaterial({ color: '#2a1a0b', emissive: '#ff9a3c', emissiveIntensity: 1.8 })
    // The column, below and above the heart.
    const below = new THREE.Mesh(new THREE.CylinderGeometry(R.core, R.core + 1.2, R.depth - 3, 48), hull)
    below.position.y = -R.depth / 2 - 1.5
    machine.add(below)
    const above = new THREE.Mesh(new THREE.CylinderGeometry(R.core * 0.8, R.core, R.height - 6, 48), hull)
    above.position.y = 3 + (R.height - 6) / 2
    machine.add(above)
    // Glowing seams up the column.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      for (const [y0, h, r] of [
        [-R.depth + 2, R.depth - 5, R.core + 0.62],
        [3, R.height - 6, R.core * 0.9],
      ]) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), i % 2 ? glowCyan : glowAmber)
        seam.position.set(Math.sin(a) * r, y0 + h / 2, Math.cos(a) * r)
        machine.add(seam)
      }
    }
    // The heart: a sphere of churning light in a cage of gimbal rings.
    const uTime = { value: 0 }
    const uSurge = { value: 0 }
    const heart = new THREE.Mesh(new THREE.SphereGeometry(1.9, 48, 32), plasmaMaterial(uTime, uSurge))
    heart.position.y = 0.6
    machine.add(heart)
    const gimbals: THREE.Mesh[] = []
    for (const [r, tilt] of [
      [2.5, 0.0],
      [2.8, 1.1],
      [3.1, 2.2],
    ] as Array<[number, number]>) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 12, 96), hull)
      ring.position.y = 0.6
      ring.rotation.set(tilt, tilt * 0.6, 0)
      machine.add(ring)
      gimbals.push(ring)
    }
    // Great rings turning round the column, up and down the pit.
    const spinners: Array<{ m: THREE.Object3D; speed: number }> = []
    for (let k = -6; k <= 4; k++) {
      if (k === 0) continue
      const y = k * 3.6 + 0.6
      const r = R.core + 1.6 + (k % 2 ? 0.8 : 0)
      const ring = new THREE.Group()
      ring.position.y = y
      const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.22, 10, 96), hull)
      band.rotation.x = Math.PI / 2
      ring.add(band)
      // Lights along it, so its turning shows.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const bead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.12), k % 2 ? glowCyan : glowAmber)
        bead.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
        bead.rotation.y = -a
        ring.add(bead)
      }
      // Struts to the column.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + k
        const strut = new THREE.Mesh(new THREE.BoxGeometry(r - R.core, 0.14, 0.14), hull)
        strut.position.set(Math.cos(a) * (r + R.core) / 2, 0, Math.sin(a) * (r + R.core) / 2)
        strut.rotation.y = -a
        ring.add(strut)
      }
      machine.add(ring)
      spinners.push({ m: ring, speed: (k % 2 ? 0.35 : -0.22) * (1 + Math.abs(k) * 0.05) })
    }
    // A beam of light from the heart up through the column top.
    const beamMat = new THREE.MeshBasicMaterial({ color: '#9ff3ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, R.height - 2.5, 16, 1, true), beamMat)
    beam.position.y = 2.5 + (R.height - 2.5) / 2
    machine.add(beam)
    // Conduits from the top of the column out across the roof.
    const pipeMat = new THREE.MeshStandardMaterial({ color: '#30363a', roughness: 0.4, metalness: 0.8 })
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, R.radius - R.core, 12), pipeMat)
      pipe.rotation.z = Math.PI / 2
      const holder = new THREE.Group()
      holder.position.y = R.height - 2.2
      holder.rotation.y = a
      pipe.position.set((R.radius + R.core) / 2, 0, 0)
      holder.add(pipe)
      const glow = new THREE.Mesh(new THREE.BoxGeometry(R.radius - R.core, 0.06, 0.06), glowCyan)
      glow.position.set((R.radius + R.core) / 2, -0.24, 0)
      holder.add(glow)
      machine.add(holder)
    }
    // Arcs between the heart and its cage, redrawn many times a second.
    const arcGeo = new THREE.BufferGeometry()
    arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 12 * 3 * 2), 3))
    const arcs = new THREE.LineSegments(arcGeo, new THREE.LineBasicMaterial({ color: '#c8f7ff', transparent: true, opacity: 0.85 }))
    arcs.position.y = 0.6
    machine.add(arcs)

    const heartLight = new THREE.PointLight('#ffb070', 120, 45, 1.6)
    heartLight.position.y = 0.6
    machine.add(heartLight)
    const coolLight = new THREE.PointLight('#5fe0ec', 40, 30, 1.8)
    coolLight.position.set(0, 9, C * 0)
    machine.add(coolLight)

    return { g, uTime, uSurge, spinners, gimbals, arcs, arcGeo, heartLight, beamMat }
  }, [])

  useEffect(() => () => {
    reactor.surgeAt = null
  }, [])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const now = performance.now()
    const surge = reactor.surgeAt === null ? 0 : Math.max(0, 1 - (now - reactor.surgeAt) / 3500)
    parts.uTime.value = t * (1 + surge * 3)
    parts.uSurge.value = surge
    parts.heartLight.intensity = 120 * (1 + surge * 2.5) * (0.92 + Math.sin(t * 13) * 0.04 + Math.sin(t * 7.3) * 0.04)
    parts.beamMat.opacity = 0.3 + surge * 0.5 + Math.sin(t * 9) * 0.04
    const k = 1 + surge * 5
    for (const s of parts.spinners) s.m.rotation.y += dt * s.speed * k
    parts.gimbals.forEach((r, i) => {
      r.rotation.x += dt * (0.4 + i * 0.17) * k
      r.rotation.y += dt * (0.3 - i * 0.11) * k
    })
    // New arcs every few frames.
    if (Math.floor(t * 14) !== Math.floor((t - dt) * 14)) {
      const a = parts.arcGeo.attributes.position as THREE.BufferAttribute
      const arr = a.array as Float32Array
      let o = 0
      const count = 3 + Math.floor(surge * 3)
      for (let n = 0; n < 6; n++) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(Math.random() * 2 - 1)
        let px = Math.sin(phi) * Math.cos(theta) * 1.9
        let py = Math.cos(phi) * 1.9
        let pz = Math.sin(phi) * Math.sin(theta) * 1.9
        for (let s = 0; s < 12; s++) {
          const on = n < count
          const step = 0.12 + Math.random() * 0.1
          const nx = px * (1 + step / 1.9) + (Math.random() - 0.5) * 0.35
          const ny = py * (1 + step / 1.9) + (Math.random() - 0.5) * 0.35
          const nz = pz * (1 + step / 1.9) + (Math.random() - 0.5) * 0.35
          arr.set(on ? [px, py, pz, nx, ny, nz] : [0, 0, 0, 0, 0, 0], o)
          o += 6
          px = nx
          py = ny
          pz = nz
        }
      }
      a.needsUpdate = true
    }
  })

  return <primitive object={parts.g} />
}

// ---------------------------------------------------------------------------
// Communications
// ---------------------------------------------------------------------------

function plateTexture(label: string, value: string) {
  return canvasTexture(512, 256, (c) => {
    c.fillStyle = '#041016'
    c.fillRect(0, 0, 512, 256)
    c.strokeStyle = '#4fd6e0'
    c.lineWidth = 4
    c.strokeRect(8, 8, 496, 240)
    c.fillStyle = '#4fd6e0'
    c.font = 'bold 26px "Courier New", monospace'
    c.fillText(label.toUpperCase(), 30, 60)
    c.fillStyle = '#e9fbff'
    let size = 34
    c.font = `bold ${size}px "Segoe UI", Arial, sans-serif`
    while (c.measureText(value).width > 450 && size > 16) {
      size -= 2
      c.font = `bold ${size}px "Segoe UI", Arial, sans-serif`
    }
    c.fillText(value, 30, 140)
    c.fillStyle = '#ffd166'
    c.font = '22px "Courier New", monospace'
    c.fillText('PRESS E', 30, 212)
  })
}

function Comms() {
  const parts = useMemo(() => {
    const g = frameGroup(CX_FRAME)
    passage(g, COMMS.from + 0.06, '#7fe8f2')
    const C = COMMS
    const rand = seeded(4040)
    const len = C.to - C.from
    const midD = -(C.from + C.to) / 2

    // The room.
    const floorTex = canvasTexture(256, 256, (c) => {
      c.fillStyle = '#1d2124'
      c.fillRect(0, 0, 256, 256)
      c.strokeStyle = '#0d1012'
      c.lineWidth = 4
      c.strokeRect(0, 0, 256, 256)
    })
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping
    floorTex.repeat.set(C.half, len / 2)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(C.half * 2, len), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.3 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, 0.003, midD)
    floor.receiveShadow = true
    g.add(floor)
    const wallMat = new THREE.MeshStandardMaterial({ color: '#2a3034', roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide })
    const wall = (w: number, x: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, C.height), wallMat)
      m.position.set(x, C.height / 2, z)
      m.rotation.y = ry
      g.add(m)
    }
    wall(len, -C.half, midD, Math.PI / 2)
    wall(len, C.half, midD, -Math.PI / 2)
    wall(C.half * 2, 0, -C.to, 0)
    // The front wall, round the tunnel.
    const face = new THREE.Shape()
    face.moveTo(-C.half, -0.5)
    face.lineTo(C.half, -0.5)
    face.lineTo(C.half, C.height)
    face.lineTo(-C.half, C.height)
    face.lineTo(-C.half, -0.5)
    const hole = new THREE.Path()
    hole.absarc(0, PASSAGE.centre, PASSAGE.radius, 0, Math.PI * 2, true)
    face.holes.push(hole)
    const front = new THREE.Mesh(new THREE.ShapeGeometry(face, 48), wallMat)
    front.position.set(0, 0, -C.from + 0.01)
    g.add(front)
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(C.half * 2, len), new THREE.MeshStandardMaterial({ color: '#15191b', roughness: 0.9, side: THREE.DoubleSide }))
    ceil.rotation.x = Math.PI / 2
    ceil.position.set(0, C.height, midD)
    g.add(ceil)
    // Strip lights and cable trays overhead.
    const stripMat = new THREE.MeshStandardMaterial({ color: '#e8fbff', emissive: '#bfeff7', emissiveIntensity: 1.4 })
    for (const s of [-2.2, 2.2]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, len - 1), stripMat)
      strip.position.set(s, C.height - 0.05, midD)
      g.add(strip)
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, len - 0.4), new THREE.MeshStandardMaterial({ color: '#3b4247', metalness: 0.7, roughness: 0.4 }))
      tray.position.set(s * 1.9, C.height - 0.6, midD)
      g.add(tray)
    }

    // Racks down both walls, their faces full of status lights.
    const rackMat = new THREE.MeshStandardMaterial({ color: '#16191c', roughness: 0.45, metalness: 0.6 })
    const ledGeo = new THREE.BoxGeometry(0.035, 0.035, 0.01)
    const leds = new THREE.InstancedMesh(ledGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), 1400)
    let nLed = 0
    const ledColors = ['#4fd6e0', '#7fe0c4', '#ffd166', '#ff6b5b', '#4fd6e0', '#7fe0c4']
    const units = Math.floor((RACK.to - RACK.from) / RACK.w)
    for (const side of [-1, 1]) {
      for (let u = 0; u < units; u++) {
        const d = RACK.from + (u + 0.5) * RACK.w
        const x = side * (C.half - RACK.depth / 2)
        const rack = new THREE.Mesh(new THREE.BoxGeometry(RACK.depth, RACK.h, RACK.w - 0.06), rackMat)
        rack.position.set(x, RACK.h / 2, -d)
        rack.castShadow = true
        g.add(rack)
        const faceX = side * (C.half - RACK.depth) - side * 0.006
        for (let row = 0; row < 14; row++) {
          for (let col = 0; col < 6 && nLed < 1400; col++) {
            if (rand() < 0.35) continue
            dummy.position.set(faceX, 0.3 + row * 0.16, -d - 0.4 + col * 0.16)
            dummy.rotation.set(0, Math.PI / 2, 0)
            dummy.scale.set(1, 1, 1)
            dummy.updateMatrix()
            leds.setMatrixAt(nLed, dummy.matrix)
            leds.setColorAt(nLed, new THREE.Color(ledColors[Math.floor(rand() * ledColors.length)]))
            nLed++
          }
        }
      }
    }
    leds.count = nLed
    leds.instanceMatrix.needsUpdate = true
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true
    g.add(leds)

    // The transmitter at the end: a console, screens, and a dish turning above.
    const tx = new THREE.Group()
    tx.position.set(0, 0, -(C.to - 0.7))
    const desk = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 1.4), rackMat)
    desk.position.y = 0.55
    tx.add(desk)
    const wave = canvasTexture(1024, 256, (c) => {
      c.fillStyle = '#03131a'
      c.fillRect(0, 0, 1024, 256)
      c.strokeStyle = '#4fd6e0'
      c.lineWidth = 3
      c.beginPath()
      for (let x = 0; x < 1024; x += 4) {
        const y = 128 + Math.sin(x * 0.03) * 40 * Math.sin(x * 0.004) + Math.sin(x * 0.17) * 8
        if (x === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.stroke()
      c.fillStyle = '#e9fbff'
      c.font = 'bold 34px "Courier New", monospace'
      c.fillText('OPEN CHANNEL · ' + identity.name, 30, 50)
      c.font = '22px "Courier New", monospace'
      c.fillStyle = '#7fe8f2'
      c.fillText(identity.location.toUpperCase() + ' · ' + identity.headline.toUpperCase(), 30, 230)
    })
    const scr = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 1.2),
      new THREE.MeshStandardMaterial({ map: wave, emissive: '#ffffff', emissiveMap: wave, emissiveIntensity: 1 }),
    )
    scr.position.set(0, 1.9, 0.2)
    tx.add(scr)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 12), rackMat)
    mast.position.set(0, 2.9, -0.3)
    tx.add(mast)
    const dish = new THREE.Group()
    dish.position.set(0, 3.7, -0.3)
    const bowl = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 32, 12, 0, Math.PI * 2, 0, 0.9),
      new THREE.MeshStandardMaterial({ color: '#c9ced2', roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }),
    )
    bowl.rotation.x = -Math.PI / 2 + 0.5
    dish.add(bowl)
    const feed = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshStandardMaterial({ color: '#ff6b5b', emissive: '#ff6b5b', emissiveIntensity: 2 }))
    feed.position.set(0, 0.35, 0.55)
    dish.add(feed)
    tx.add(dish)
    g.add(tx)

    // The contact plates, under the machines, each tilted up on a stand.
    const plateMats: THREE.MeshStandardMaterial[] = []
    for (const p of CONTACTS) {
      const tex = plateTexture(p.label, p.value)
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.3 })
      plateMats.push(mat)
      const stand = new THREE.Group()
      stand.position.set(p.s, 0, -p.d)
      // Facing the middle of the room.
      stand.rotation.y = p.s > 0 ? -Math.PI / 2 : Math.PI / 2
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.8), rackMat)
      base.position.y = 0.08
      stand.add(base)
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.72), mat)
      plate.position.set(0, 0.5, 0)
      plate.rotation.x = -0.75
      stand.add(plate)
      // A cable from the plate back up into the rack.
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), new THREE.MeshStandardMaterial({ color: '#111' }))
      cable.position.set(0, 0.5, -0.55)
      cable.rotation.x = 0.6
      stand.add(cable)
      g.add(stand)
    }

    // A slowly turning hologram of the name in the middle of the room.
    const holoTex = canvasTexture(1024, 256, (c) => {
      c.clearRect(0, 0, 1024, 256)
      c.fillStyle = 'rgba(127,232,242,0.95)'
      c.font = 'bold 96px "Segoe UI", Arial, sans-serif'
      c.textAlign = 'center'
      c.fillText(identity.name, 512, 120)
      c.font = '34px "Courier New", monospace'
      c.fillText('GET IN TOUCH', 512, 200)
    })
    const holo = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.8),
      new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    )
    holo.position.set(0, 2.6, midD)
    g.add(holo)
    const projector = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.6, 24), rackMat)
    projector.position.set(0, 0.3, midD)
    g.add(projector)
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 0.4, 1.8, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: '#4fd6e0', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    cone.position.set(0, 1.5, midD)
    g.add(cone)

    const l1 = new THREE.PointLight('#bfeff7', 18, 14, 2)
    l1.position.set(0, C.height - 0.8, -(C.from + len * 0.3))
    const l2 = new THREE.PointLight('#bfeff7', 18, 14, 2)
    l2.position.set(0, C.height - 0.8, -(C.from + len * 0.75))
    g.add(l1, l2)

    return { g, leds, nLed, dish, holo, plateMats }
  }, [])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    parts.dish.rotation.y += dt * 0.4
    parts.holo.rotation.y = Math.sin(t * 0.4) * 0.6
    parts.plateMats.forEach((m, i) => {
      m.emissiveIntensity = 0.8 + Math.max(0, Math.sin(t * 2 + i)) * 0.4
    })
    // A few status lights change each tick.
    if (Math.floor(t * 6) !== Math.floor((t - dt) * 6) && parts.leds.instanceColor) {
      const c = new THREE.Color()
      for (let i = 0; i < 40; i++) {
        const k = Math.floor(Math.random() * parts.nLed)
        parts.leds.getColorAt(k, c)
        c.multiplyScalar(Math.random() < 0.5 ? 0.25 : 4)
        c.r = Math.min(1, c.r)
        c.g = Math.min(1, c.g)
        c.b = Math.min(1, c.b)
        if (c.r + c.g + c.b < 0.15) c.set('#4fd6e0')
        parts.leds.setColorAt(k, c)
      }
      parts.leds.instanceColor.needsUpdate = true
    }
  })

  return <primitive object={parts.g} />
}

/**
 * The power running up the silo from the reactor: conduits on the wall from
 * the reactor's opening to the dome, with light travelling up them. Drawn on
 * every level, because the point is that you can follow them down.
 */
export function PowerConduits() {
  const parts = useMemo(() => {
    const g = new THREE.Group()
    // Up to level 1's floor and into it: from there the power lights the
    // name over the portrait (IronName.tsx), not a bare pipe on the wall.
    const top = walkY(1) - 0.03
    const bottom = FLOOR12 + PASSAGE.centre + PASSAGE.radius + 0.6
    const h = top - bottom
    const uTime = { value: 0 }
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime, uSurge: reactor.uSurge },
      vertexShader: /* glsl */ `
        varying float vY;
        void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uSurge;
        varying float vY;
        void main() {
          float p = fract(vY * 0.05 - uTime * (0.35 + uSurge * 1.5));
          float pulse = smoothstep(0.0, 0.08, p) * smoothstep(0.3, 0.08, p);
          vec3 col = vec3(0.25, 0.85, 0.95) * (0.9 + pulse * 3.5 + uSurge * 2.0);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      toneMapped: false,
    })
    const casing = new THREE.MeshStandardMaterial({ color: '#2a3034', roughness: 0.4, metalness: 0.8 })
    const a = RX_FRAME.angle
    for (const off of [-0.055, 0.055]) {
      const ang = a + off
      const r = SHAFT_RADIUS - 0.12
      const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.16), casing)
      pipe.position.set(Math.cos(ang) * r, bottom + h / 2, Math.sin(ang) * r)
      pipe.rotation.y = -ang
      g.add(pipe)
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.13, h, 0.13), mat)
      core.position.set(Math.cos(ang) * (r - 0.1), bottom + h / 2, Math.sin(ang) * (r - 0.1))
      core.rotation.y = -ang
      g.add(core)
    }
    void WALL_THICK
    return { g, uTime }
  }, [])
  useFrame((s) => {
    parts.uTime.value = s.clock.elapsedTime
    const surge = reactor.surgeAt === null ? 0 : Math.max(0, 1 - (performance.now() - reactor.surgeAt) / 3500)
    reactor.uSurge.value = surge
  })
  return <primitive object={parts.g} />
}

export default function Level12() {
  return (
    <>
      <Reactor />
      <Comms />
    </>
  )
}
