import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BOTTOM, PALETTE, SHAFT_RADIUS, TOP_MARGIN } from '../content/floors'
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
