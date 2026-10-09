import { Bloom, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { isLowPower } from '../lib/capability'
import { useSilo } from '../state/useSilo'

/**
 * The part that does the most for legibility.
 *
 * Ambient occlusion is what separates a deck from the wall it meets, a rib
 * from the concrete behind it, a stair tread from its neighbour. Without it a
 * dim interior lit by a few point lights has no contact shading anywhere and
 * every surface melts into the next — which is exactly how this scene read
 * before. Bloom then lets the lamps and signage behave like light sources
 * rather than pale rectangles.
 *
 * The whole stack is dropped on the low quality tier, where the frame budget
 * matters more than the finish.
 */
export default function Effects() {
  const quality = useSilo((s) => s.quality)
  if (quality === 'low' || isLowPower()) return null

  return (
    <EffectComposer multisampling={4} frameBufferType={THREE.HalfFloatType}>
      <N8AO
        aoRadius={2.4}
        distanceFalloff={0.9}
        intensity={3.2}
        quality="low"
        halfRes
        aoSamples={12}
        denoiseSamples={4}
        color="#120c08"
      />
      <Bloom
        mipmapBlur
        luminanceThreshold={0.7}
        luminanceSmoothing={0.3}
        intensity={0.7}
        radius={0.68}
      />
      <Vignette offset={0.22} darkness={0.5} />
    </EffectComposer>
  )
}
