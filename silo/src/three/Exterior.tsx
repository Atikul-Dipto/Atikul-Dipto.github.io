import { useMemo } from 'react'
import * as THREE from 'three'
import { PALETTE, SHAFT_RADIUS, levelY } from '../content/floors'

/**
 * The approach: a barren plain, and the only thing on it — the head of the
 * structure, with the shaft cut away below ground so the lit decks are visible
 * before you ever go in. Mounted only during the exterior phase.
 */
export default function Exterior() {
  const ground = useMemo(() => {
    const geo = new THREE.PlaneGeometry(900, 900, 90, 90)
    const pos = geo.attributes.position
    // Low, broad dunes — enough relief to catch the light, nothing more.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const h =
        Math.sin(x * 0.012) * 2.4 +
        Math.cos(y * 0.009) * 2.0 +
        Math.sin((x + y) * 0.022) * 1.1
      // Flatten a bowl around the structure so it sits in a depression.
      const d = Math.hypot(x, y)
      const bowl = Math.max(0, 1 - d / 120)
      pos.setZ(i, h * (1 - bowl) - bowl * 5)
    }
    geo.computeVertexNormals()
    return geo
  }, [])

  const headY = levelY(1) + 9

  return (
    <group>
      <mesh geometry={ground} rotation={[-Math.PI / 2, 0, 0]} position={[0, headY - 10.5, 0]}>
        <meshStandardMaterial color="#5d5147" roughness={1} metalness={0} />
      </mesh>

      {/* Head of the structure above grade. */}
      <mesh position={[0, headY - 4, 0]}>
        <cylinderGeometry args={[SHAFT_RADIUS + 2.4, SHAFT_RADIUS + 3.2, 13, 48, 1, true]} />
        <meshStandardMaterial color={PALETTE.concrete} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* Cap slab */}
      <mesh position={[0, headY + 2.6, 0]}>
        <cylinderGeometry args={[SHAFT_RADIUS + 3.6, SHAFT_RADIUS + 3.6, 1.4, 48]} />
        <meshStandardMaterial color={PALETTE.concreteDark} roughness={0.95} />
      </mesh>
      {/* Ventilation stacks */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + 0.4
        const r = SHAFT_RADIUS - 3
        return (
          <mesh key={i} position={[Math.cos(a) * r, headY + 5, Math.sin(a) * r]}>
            <cylinderGeometry args={[0.9, 1.1, 4.2, 12]} />
            <meshStandardMaterial color={PALETTE.steelDark} roughness={0.7} metalness={0.5} />
          </mesh>
        )
      })}

      {/* Perimeter marker lights */}
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2
        const r = SHAFT_RADIUS + 9
        return (
          <mesh key={i} position={[Math.cos(a) * r, headY - 9, Math.sin(a) * r]}>
            <boxGeometry args={[0.3, 1.6, 0.3]} />
            <meshStandardMaterial
              color={PALETTE.brassHot}
              emissive={PALETTE.brassHot}
              emissiveIntensity={1.6}
            />
          </mesh>
        )
      })}

      {/* Overcast key light, raking across the plain. */}
      <directionalLight color="#e4cdad" intensity={2.8} position={[-60, 44, 46]} />
      <hemisphereLight args={['#9b8b77', '#453a30', 0.95]} />
    </group>
  )
}
