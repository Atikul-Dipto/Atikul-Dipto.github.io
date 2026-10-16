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
/** The composer, once mounted, so its shaders can be compiled ahead (warm.ts). */
export const effectsHandle: { composer: unknown } = { composer: null }

export default function Effects() {
  const quality = useSilo((s) => s.quality)
  if (quality === 'low' || isLowPower()) return null

  return (
    <EffectComposer
      ref={(c) => {
        effectsHandle.composer = c
      }}
      multisampling={4}
      frameBufferType={THREE.HalfFloatType}
    >
      <N8AO
        // Left to itself it notices the scene has transparent materials --
        // glass, glows, signage -- and draws the whole scene twice more every
        // frame to keep the shading off them: three renders a frame instead
        // of one. The shading under a few panes of glass is not worth that.
        ref={(pass) => {
          if (!pass) return
          const p = pass as unknown as { autoDetectTransparency: boolean }
          p.autoDetectTransparency = false
          pass.configuration.transparencyAware = false
        }}
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
