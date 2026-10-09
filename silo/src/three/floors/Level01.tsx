import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import {
  DECK_INNER,
  PALETTE,
  SHAFT_RADIUS,
  SLOT,
  contentAngle,
  deckY,
  levelY,
} from '../../content/floors'
import { identity } from '../../content/portfolio'
import { gesture } from '../../lib/drag'
import { useSilo } from '../../state/useSilo'

const BASE = import.meta.env.BASE_URL

/**
 * Builds a CRT-style panel as a canvas texture. Everything drawn here is either
 * real profile text or an abstract trace — the animation is decorative and must
 * never imply live operational data (spec §5).
 */
function makePanel(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 4
  return { canvas, ctx: canvas.getContext('2d')!, texture }
}

function IdentityConsole({ angle }: { angle: number }) {
  const y = levelY(1)
  const deck = deckY(1)
  const panel = useMemo(() => makePanel(512, 320), [])
  const trace = useRef(0)
  const nextDraw = useRef(0)

  useFrame((_, dt) => {
    trace.current += dt
    // Repainting a 512x320 canvas every frame is pure waste on a decorative
    // trace; twelve times a second reads identically.
    if (trace.current < nextDraw.current) return
    nextDraw.current = trace.current + 1 / 12

    const { ctx, canvas, texture } = panel
    const t = trace.current

    ctx.fillStyle = '#120e0b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Scanlines
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
    identity.specialisms.slice(0, 4).forEach((s, i) => {
      ctx.fillText('> ' + s.toUpperCase(), 24, 148 + i * 22)
    })

    // Abstract trace — decorative, carries no value.
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

    // Status LED
    ctx.fillStyle = Math.sin(t * 2.2) > 0 ? '#8fd08a' : 'rgba(143,208,138,0.25)'
    ctx.beginPath()
    ctx.arc(canvas.width - 34, 34, 7, 0, Math.PI * 2)
    ctx.fill()

    texture.needsUpdate = true
  })

  const r = SHAFT_RADIUS - 0.3
  const a = angle + SLOT.console
  const localDeck = deck - (y + 0.5)
  return (
    <group
      position={[Math.cos(a) * r, y + 0.5, Math.sin(a) * r]}
      onUpdate={(g) => g.lookAt(0, y + 0.5, 0)}
    >
      <mesh position={[0, 0, 0.06]}>
        <planeGeometry args={[2.6, 1.63]} />
        <meshBasicMaterial map={panel.texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[2.9, 1.95, 0.22]} />
        <meshStandardMaterial color={PALETTE.steelDark} roughness={0.55} metalness={0.7} />
      </mesh>

      {/* Desk below the screen, with a canted control surface. The group sits
          at world y + 0.5, so deck level is this far down in local space. */}
      <mesh position={[0, localDeck + 1.5, 0.52]}>
        <boxGeometry args={[3.2, 0.14, 1.1]} />
        <meshStandardMaterial color={PALETTE.steel} roughness={0.46} metalness={0.78} />
      </mesh>
      <mesh position={[0, localDeck + 1.62, 0.84]} rotation={[-0.42, 0, 0]}>
        <boxGeometry args={[2.6, 0.5, 0.08]} />
        <meshStandardMaterial color={PALETTE.steelDark} roughness={0.5} metalness={0.74} />
      </mesh>
      {/* Plinth, standing on the deck. */}
      <mesh position={[0, localDeck + 0.72, 0.4]}>
        <boxGeometry args={[3.0, 1.44, 0.76]} />
        <meshStandardMaterial color={PALETTE.deck} roughness={0.85} metalness={0.2} />
      </mesh>

      <pointLight color={PALETTE.brass} intensity={7} distance={6} decay={2} position={[0, 0, 1.1]} />
    </group>
  )
}

/** The window, and the portrait behind it. */
function PortraitWindow({ angle }: { angle: number }) {
  const y = levelY(1)
  const texture = useLoader(THREE.TextureLoader, `${BASE}${identity.portrait}`)
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
  }, [texture])

  const W = 3.0
  const H = 3.0
  const r = SHAFT_RADIUS - 0.06
  const jamb = 0.58

  // NOTE: every part sits on +Z, which after lookAt() points into the shaft.
  // Anything on -Z is behind the wall cylinder and invisible, and any solid box
  // spanning the aperture occludes the pane — both cost real debugging time.
  return (
    <group
      position={[Math.cos(angle) * r, y + 0.35, Math.sin(angle) * r]}
      onUpdate={(g) => g.lookAt(0, y + 0.35, 0)}
    >
      {/* Hollow casing: four slabs, never one box across the opening. */}
      {(
        [
          [W + 1.15, jamb, 0, H / 2 + jamb / 2],
          [W + 1.15, jamb, 0, -H / 2 - jamb / 2],
          [jamb, H, -W / 2 - jamb / 2, 0],
          [jamb, H, W / 2 + jamb / 2, 0],
        ] as const
      ).map(([w, h, x, yy], i) => (
        <mesh key={i} position={[x, yy, 0.18]}>
          <boxGeometry args={[w, h, 0.5]} />
          <meshStandardMaterial color={PALETTE.concreteDark} roughness={0.96} />
        </mesh>
      ))}

      <mesh position={[0, 0, 0.24]}>
        <planeGeometry args={[W + 0.1, H + 0.1]} />
        <meshBasicMaterial color="#120d0a" />
      </mesh>

      {/* Driven from the emissive map so it reads as a lit pane in a dim shaft. */}
      <mesh position={[0, 0, 0.3]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          map={texture}
          emissive="#ffffff"
          emissiveMap={texture}
          emissiveIntensity={1.25}
          roughness={0.9}
        />
      </mesh>

      <mesh position={[0, 0, 0.44]}>
        <planeGeometry args={[W, H]} />
        <meshPhysicalMaterial
          color="#bccbc4"
          transparent
          opacity={0.1}
          roughness={0.05}
          depthWrite={false}
        />
      </mesh>

      {(
        [
          [W + 0.46, 0.23, 0, H / 2 + 0.115, 0.5],
          [W + 0.46, 0.23, 0, -H / 2 - 0.115, 0.5],
          [0.23, H + 0.46, -W / 2 - 0.115, 0, 0.5],
          [0.23, H + 0.46, W / 2 + 0.115, 0, 0.5],
          [W, 0.1, 0, -H / 2 + 0.16, 0.47],
        ] as const
      ).map(([w, h, x, yy, z], i) => (
        <mesh key={i} position={[x, yy, z]}>
          <boxGeometry args={[w, h, 0.22]} />
          <meshStandardMaterial color={PALETTE.steel} roughness={0.4} metalness={0.82} />
        </mesh>
      ))}

      <pointLight
        color={PALETTE.brassHot}
        intensity={30}
        distance={13}
        decay={2}
        position={[0, 0.4, 1.9]}
      />
    </group>
  )
}

/**
 * Personnel-records airlock. Hovering cracks the doors; clicking walks the
 * camera in, and the record opens when it arrives (see Rig, phase 'airlock').
 */
function Airlock({ angle }: { angle: number }) {
  const y = levelY(1)
  const enterAirlock = useSilo((s) => s.enterAirlock)
  const phase = useSilo((s) => s.phase)
  const hovered = useRef(false)
  const light = useRef<THREE.PointLight>(null)
  const doorL = useRef<THREE.Mesh>(null)
  const doorR = useRef<THREE.Mesh>(null)

  useFrame((_, dt) => {
    // Fully open once you have stepped in; merely ajar on hover.
    const open = phase === 'airlock' ? 1.5 : hovered.current ? 0.78 : 0
    const speed = Math.min(1, dt * 4)
    if (doorL.current) doorL.current.position.x += (-0.8 - open - doorL.current.position.x) * speed
    if (doorR.current) doorR.current.position.x += (0.8 + open - doorR.current.position.x) * speed
    if (light.current) {
      const want = phase === 'airlock' ? 26 : hovered.current ? 14 : 4
      light.current.intensity += (want - light.current.intensity) * Math.min(1, dt * 5)
    }
  })

  const r = SHAFT_RADIUS - 0.28
  const a = angle + SLOT.airlock

  return (
    <group
      position={[Math.cos(a) * r, y - 0.45, Math.sin(a) * r]}
      onUpdate={(g) => g.lookAt(0, y - 0.45, 0)}
      onPointerOver={(e) => {
        e.stopPropagation()
        hovered.current = true
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        hovered.current = false
        document.body.style.cursor = ''
      }}
      onClick={(e) => {
        e.stopPropagation()
        // Turning to look ends with a pointerup over whatever you now face.
        if (gesture.dragging) return
        enterAirlock()
      }}
    >
      {/* Frame */}
      <mesh position={[0, 0.6, 0.1]}>
        <boxGeometry args={[3.6, 4.2, 0.4]} />
        <meshStandardMaterial color={PALETTE.steelDark} roughness={0.5} metalness={0.78} />
      </mesh>
      {/* Recess behind the doors */}
      <mesh position={[0, 0.6, 0.3]}>
        <planeGeometry args={[3.0, 3.7]} />
        <meshBasicMaterial color="#0d0a08" />
      </mesh>
      {/* Blast doors */}
      <mesh ref={doorL} position={[-0.8, 0.6, 0.42]}>
        <boxGeometry args={[1.56, 3.7, 0.22]} />
        <meshStandardMaterial color={PALETTE.steel} roughness={0.42} metalness={0.85} />
      </mesh>
      <mesh ref={doorR} position={[0.8, 0.6, 0.42]}>
        <boxGeometry args={[1.56, 3.7, 0.22]} />
        <meshStandardMaterial color={PALETTE.steel} roughness={0.42} metalness={0.85} />
      </mesh>
      {/* Warning light */}
      <mesh position={[0, 2.95, 0.46]}>
        <boxGeometry args={[0.46, 0.18, 0.2]} />
        <meshStandardMaterial
          color={PALETTE.brassHot}
          emissive={PALETTE.brassHot}
          emissiveIntensity={2.4}
        />
      </mesh>
      <pointLight
        ref={light}
        color={PALETTE.brassHot}
        intensity={4}
        distance={9}
        decay={2}
        position={[0, 1.4, 1.6]}
      />
    </group>
  )
}

/**
 * The rest of the monitoring room: service runs along the wall, a hazard
 * marking on the deck at the airlock threshold, and two blank status panels
 * flanking the console. Nothing here carries data.
 */
function MonitoringRoom({ angle }: { angle: number }) {
  const y = levelY(1)
  const deck = deckY(1)

  const pipes = useMemo(() => {
    const group = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.steelDark,
      roughness: 0.52,
      metalness: 0.76,
    })
    // Two service runs following the wall across the width of the room.
    const arc = 1.9
    for (const [dy, radius] of [
      [3.0, SHAFT_RADIUS - 0.55],
      [3.34, SHAFT_RADIUS - 0.95],
    ] as const) {
      const pipe = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.11, 8, 48, arc), mat)
      pipe.rotation.x = -Math.PI / 2
      pipe.rotation.z = -(angle + arc / 2)
      pipe.position.y = y + dy
      group.add(pipe)
    }
    // Brackets tying them back to the wall.
    for (let i = 0; i < 5; i++) {
      const a = angle - arc / 2 + 0.1 + (i / 4) * arc
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.12), mat)
      bracket.position.set(
        Math.cos(a) * (SHAFT_RADIUS - 0.75),
        y + 3.17,
        Math.sin(a) * (SHAFT_RADIUS - 0.75),
      )
      bracket.rotation.y = -a
      group.add(bracket)
    }
    return group
  }, [angle, y])

  return (
    <group>
      <primitive object={pipes} />

      {/* Hazard marking on the threshold of the airlock. */}
      <group rotation={[0, Math.PI / 2 - (angle + SLOT.airlock), 0]}>
        <mesh
          position={[0, deck + 0.03, (DECK_INNER + SHAFT_RADIUS) / 2 + 1.4]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[3.4, 2.2]} />
          <meshStandardMaterial
            color={PALETTE.brass}
            roughness={0.9}
            transparent
            opacity={0.28}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Two blank status panels flanking the console. */}
      {[-0.28, 0.22].map((off, i) => {
        const a = angle + SLOT.console + off
        const r = SHAFT_RADIUS - 0.34
        return (
          <group
            key={i}
            position={[Math.cos(a) * r, y + 2.0, Math.sin(a) * r]}
            onUpdate={(g) => g.lookAt(0, y + 2.0, 0)}
          >
            <mesh>
              <boxGeometry args={[0.9, 0.62, 0.14]} />
              <meshStandardMaterial color={PALETTE.steelDark} roughness={0.56} metalness={0.7} />
            </mesh>
            <mesh position={[0, 0, 0.09]}>
              <planeGeometry args={[0.74, 0.46]} />
              <meshStandardMaterial
                color="#1b1511"
                emissive={PALETTE.brass}
                emissiveIntensity={0.22}
                roughness={0.6}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export default function Level01() {
  const angle = contentAngle(1)
  return (
    <group>
      <PortraitWindow angle={angle + SLOT.window} />
      <IdentityConsole angle={angle} />
      <Airlock angle={angle} />
      <MonitoringRoom angle={angle} />
    </group>
  )
}
