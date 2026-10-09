import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { PALETTE, SHAFT_RADIUS, SLOT, contentAngle, levelY } from '../../content/floors'
import { identity } from '../../content/portfolio'
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
  const panel = useMemo(() => makePanel(512, 320), [])
  const trace = useRef(0)

  useFrame((_, dt) => {
    trace.current += dt
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
  return (
    <group position={[Math.cos(a) * r, y + 0.5, Math.sin(a) * r]} onUpdate={(g) => g.lookAt(0, y + 0.5, 0)}>
      <mesh position={[0, 0, 0.06]}>
        <planeGeometry args={[2.6, 1.63]} />
        <meshBasicMaterial map={panel.texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[2.9, 1.95, 0.22]} />
        <meshStandardMaterial color={PALETTE.steelDark} roughness={0.55} metalness={0.7} />
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
    <group position={[Math.cos(angle) * r, y + 0.35, Math.sin(angle) * r]} onUpdate={(g) => g.lookAt(0, y + 0.35, 0)}>
      {/* Hollow casing: four slabs, never one box across the opening. */}
      {([
        [W + 1.15, jamb, 0, H / 2 + jamb / 2],
        [W + 1.15, jamb, 0, -H / 2 - jamb / 2],
        [jamb, H, -W / 2 - jamb / 2, 0],
        [jamb, H, W / 2 + jamb / 2, 0],
      ] as const).map(([w, h, x, yy], i) => (
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
        <meshPhysicalMaterial color="#bccbc4" transparent opacity={0.1} roughness={0.05} depthWrite={false} />
      </mesh>

      {([
        [W + 0.46, 0.23, 0, H / 2 + 0.115, 0.5],
        [W + 0.46, 0.23, 0, -H / 2 - 0.115, 0.5],
        [0.23, H + 0.46, -W / 2 - 0.115, 0, 0.5],
        [0.23, H + 0.46, W / 2 + 0.115, 0, 0.5],
        [W, 0.1, 0, -H / 2 + 0.62, 0.47],
      ] as const).map(([w, h, x, yy, z], i) => (
        <mesh key={i} position={[x, yy, z]}>
          <boxGeometry args={[w, h, 0.22]} />
          <meshStandardMaterial color={PALETTE.steel} roughness={0.4} metalness={0.82} />
        </mesh>
      ))}

      <pointLight color={PALETTE.brassHot} intensity={30} distance={13} decay={2} position={[0, 0.4, 1.9]} />
    </group>
  )
}

/** Personnel-records airlock. Clicking it opens the CV viewer. */
function Airlock({ angle }: { angle: number }) {
  const y = levelY(1)
  const setCvOpen = useSilo((s) => s.setCvOpen)
  const hovered = useRef(false)
  const light = useRef<THREE.PointLight>(null)
  const doorL = useRef<THREE.Mesh>(null)
  const doorR = useRef<THREE.Mesh>(null)

  useFrame((_, dt) => {
    const open = hovered.current ? 0.78 : 0
    if (doorL.current) doorL.current.position.x += (-0.8 - open - doorL.current.position.x) * Math.min(1, dt * 4)
    if (doorR.current) doorR.current.position.x += (0.8 + open - doorR.current.position.x) * Math.min(1, dt * 4)
    if (light.current) {
      const want = hovered.current ? 14 : 4
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
        setCvOpen(true)
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
        <meshStandardMaterial color={PALETTE.brassHot} emissive={PALETTE.brassHot} emissiveIntensity={2.4} />
      </mesh>
      <pointLight ref={light} color={PALETTE.brassHot} intensity={4} distance={9} decay={2} position={[0, 1.4, 1.6]} />
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
    </group>
  )
}
