import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  BOTTOM,
  FLOORS,
  PALETTE,
  SHAFT_RADIUS,
  TOP_MARGIN,
  contentAngle,
  levelY,
} from '../content/floors'
import { useSilo } from '../state/useSilo'

function makeRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/** Suspended dust. Cheap, and the single biggest win for a sense of scale. */
export function Dust({ count = 900 }: { count?: number }) {
  const points = useRef<THREE.Points>(null)
  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const rand = makeRandom(31)
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2
      const r = 0.8 + rand() * (SHAFT_RADIUS - 1.6)
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = TOP_MARGIN - rand() * (TOP_MARGIN - BOTTOM)
      pos[i * 3 + 2] = Math.sin(a) * r
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return geo
  }, [count])

  const reduced = useSilo((s) => s.reducedMotion)
  useFrame((_, dt) => {
    if (!reduced && points.current) points.current.rotation.y += dt * 0.012
  })

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        color={PALETTE.brassHot}
        size={0.055}
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  )
}

/**
 * Two pooled lights that follow the visitor instead of one per level. Twelve
 * levels of real point lights would cost far more than it would ever show.
 */
export function TravellingLights({ carY }: { carY: React.RefObject<number> }) {
  const a = useRef<THREE.PointLight>(null)
  const b = useRef<THREE.PointLight>(null)

  useFrame(() => {
    const y = carY.current ?? 0
    const level = useSilo.getState().level
    const ang = contentAngle(level)
    if (a.current) a.current.position.set(Math.cos(ang) * (SHAFT_RADIUS - 3.2), y + 1.6, Math.sin(ang) * (SHAFT_RADIUS - 3.2))
    if (b.current) b.current.position.set(Math.cos(ang + 2.3) * (SHAFT_RADIUS - 3.2), y - 5, Math.sin(ang + 2.3) * (SHAFT_RADIUS - 3.2))
  })

  return (
    <>
      <pointLight ref={a} color={PALETTE.brassHot} intensity={46} distance={22} decay={2} />
      <pointLight ref={b} color={PALETTE.brass} intensity={26} distance={24} decay={2} />
    </>
  )
}

/** Daylight from the sealed head, dying out within a few levels. */
export function SkyShaft() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(PALETTE.brassHot) } },
        vertexShader: `
          varying float vFade;
          void main() {
            vFade = uv.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying float vFade;
          void main() { gl_FragColor = vec4(uColor, pow(vFade, 3.0) * 0.16); }
        `,
      }),
    [],
  )
  const h = 46
  return (
    <mesh material={material} position={[0, TOP_MARGIN - h / 2 + 4, 0]}>
      <cylinderGeometry args={[1.8, SHAFT_RADIUS * 0.8, h, 36, 1, true]} />
    </mesh>
  )
}

function plateTexture(level: number, name: string) {
  const c = document.createElement('canvas')
  c.width = 340
  c.height = 152
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(28,23,19,0.96)'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.strokeStyle = 'rgba(201,153,107,0.5)'
  ctx.lineWidth = 4
  ctx.strokeRect(8, 8, c.width - 16, c.height - 16)
  ctx.fillStyle = PALETTE.brassHot
  ctx.font = 'bold 80px "Segoe UI", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(level).padStart(2, '0'), c.width / 2, c.height / 2 - 10)
  ctx.font = 'bold 19px "Segoe UI", system-ui, sans-serif'
  ctx.fillStyle = 'rgba(237,233,230,0.7)'
  ctx.fillText(name.toUpperCase().slice(0, 26), c.width / 2, c.height - 30)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  return tex
}

/** Level signage bolted beside each landing. */
export function LevelSigns() {
  const group = useMemo(() => {
    const g = new THREE.Group()
    FLOORS.forEach((floor) => {
      const y = levelY(floor.level) + 0.7
      const a = contentAngle(floor.level) - 1.05
      const r = SHAFT_RADIUS - 0.34
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 0.8),
        new THREE.MeshBasicMaterial({ map: plateTexture(floor.level, floor.name), transparent: true }),
      )
      plate.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
      plate.lookAt(0, y, 0)
      g.add(plate)
    })
    return g
  }, [])
  return <primitive object={group} />
}
