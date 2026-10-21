import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BOTTOM, LEVEL_COUNT, PALETTE, SHAFT_RADIUS, WATER_DROP, walkY } from '../content/floors'
import { lampAngles } from '../content/layout'
import { useSilo } from '../state/useSilo'

/**
 * The flooded pit under level 12: still, dark water, filling the shaft wall
 * to wall, seen from any deck by looking down over the rail.
 *
 * No second render for the reflection -- the whole silo drawn again every
 * frame for a surface most visitors see from a hundred metres up is a poor
 * trade. Instead:
 *
 * - A ring of wall lamps hangs just above the surface, and the same ring is
 *   drawn again, upside down, the same distance below it. The water is
 *   partly see-through, so the lower ring shows through it as the upper
 *   ring's reflection -- the oldest trick for a mirror there is.
 * - The surface's normal is bent by a few slow travelling ripples, worked out
 *   in the shader from world position and time, so the light on it moves.
 * - A faint caustic shimmer is added to its emission, so it reads as water
 *   even where no lamp reaches it.
 * - A few lights are sunk under the surface round the foot of the core, which
 *   is the part of the water the open middle of the decks looks down on.
 */

export const WATER_Y = walkY(LEVEL_COUNT) - WATER_DROP
/** Height of the lamp ring above the water, and so of its reflection below. */
const LAMP_RISE = 1.6

export default function Water() {
  const parts = useMemo(() => {
    const group = new THREE.Group()
    const uTime = { value: 0 }

    // ---- the surface --------------------------------------------------------
    const water = new THREE.MeshStandardMaterial({
      color: '#0d2f35',
      emissive: new THREE.Color('#1d5560'),
      emissiveIntensity: 0.35,
      // Not glassy: on the rippled normals a sharp highlight broke into white
      // blotches; a little rough, it is a sheen that moves.
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      // The environment it would otherwise mirror is a bright room: on
      // rippled water it showed as white clouds, which a flooded pit at the
      // bottom of a shaft has no sky to reflect.
      envMapIntensity: 0.12,
    })
    water.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        )
      shader.fragmentShader =
        'uniform float uTime;\nvarying vec3 vWaterPos;\n' +
        shader.fragmentShader
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            {
              // Slope of a few travelling waves, in world X and Z.
              vec2 p = vWaterPos.xz;
              vec2 g = vec2(0.0);
              vec2 d1 = normalize(vec2(0.8, 0.6));
              vec2 d2 = normalize(vec2(-0.5, 0.9));
              vec2 d3 = normalize(vec2(0.2, -1.0));
              g += d1 * cos(dot(p, d1) * 0.9 + uTime * 0.7) * 0.9;
              g += d2 * cos(dot(p, d2) * 1.7 - uTime * 0.9) * 0.45;
              g += d3 * cos(dot(p, d3) * 3.1 + uTime * 1.3) * 0.22;
              g += vec2(cos(length(p) * 2.2 - uTime * 0.6)) * normalize(p + 1e-4) * 0.18;
              vec3 bend = (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz;
              normal = normalize(normal - bend * 0.09);
            }`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            {
              // Caustic-like shimmer: where two wave fields cross, a glint.
              vec2 p = vWaterPos.xz;
              float c = sin(p.x * 1.3 + uTime * 0.8) * sin(p.y * 1.1 - uTime * 0.6)
                      + sin((p.x + p.y) * 0.9 - uTime * 0.5);
              float glint = pow(max(0.0, c * 0.5), 6.0);
              totalEmissiveRadiance += vec3(0.35, 0.62, 0.66) * glint * 0.25;
            }`,
          )
    }
    water.customProgramCacheKey = () => 'pit-water'
    const surface = new THREE.Mesh(new THREE.CircleGeometry(SHAFT_RADIUS - 0.02, 96), water)
    surface.rotation.x = -Math.PI / 2
    surface.position.y = WATER_Y
    surface.renderOrder = 2
    group.add(surface)

    // ---- the depths ---------------------------------------------------------
    // The pit floor, far enough down that the water reads as deep, and dark
    // enough that it is only ever a suggestion through it.
    const bed = new THREE.Mesh(
      new THREE.CircleGeometry(SHAFT_RADIUS, 64),
      new THREE.MeshStandardMaterial({ color: '#05100f', roughness: 1 }),
    )
    bed.rotation.x = -Math.PI / 2
    bed.position.y = BOTTOM
    group.add(bed)

    // ---- the lamp ring and its reflection -----------------------------------
    const angles = lampAngles(LEVEL_COUNT)
    const lampMat = new THREE.MeshStandardMaterial({
      color: PALETTE.brassHot,
      emissive: new THREE.Color(PALETTE.brassHot),
      emissiveIntensity: 1.6,
      roughness: 0.4,
    })
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.12, 0.3), lampMat, angles.length * 2)
    const dummy = new THREE.Object3D()
    let n = 0
    for (const a of angles) {
      for (const side of [1, -1]) {
        const r = SHAFT_RADIUS - 0.35
        dummy.position.set(Math.cos(a) * r, WATER_Y + side * LAMP_RISE, Math.sin(a) * r)
        dummy.rotation.set(0, 0, 0)
        dummy.lookAt(0, dummy.position.y, 0)
        dummy.updateMatrix()
        lamps.setMatrixAt(n++, dummy.matrix)
      }
    }
    lamps.count = n
    lamps.instanceMatrix.needsUpdate = true
    group.add(lamps)

    // Lights under the surface round the foot of the core. The lamp ring is
    // under the decks and only seen from low down; these are what a visitor
    // sees from the rail, a hundred metres up, through the open middle.
    // A soft round glow each, not a hard disc: seen through water, a lamp's
    // edge is lost.
    const halo = document.createElement('canvas')
    halo.width = halo.height = 128
    {
      const g = halo.getContext('2d')!
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
      grad.addColorStop(0, 'rgba(255,255,255,1)')
      grad.addColorStop(0.18, 'rgba(255,255,255,0.85)')
      grad.addColorStop(0.5, 'rgba(255,255,255,0.22)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, 128, 128)
    }
    const glow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({
        color: '#7fdde4',
        map: new THREE.CanvasTexture(halo),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      10,
    )
    glow.renderOrder = 1
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2
      dummy.position.set(Math.cos(a) * 5.6, WATER_Y - 1.3, Math.sin(a) * 5.6)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.updateMatrix()
      glow.setMatrixAt(i, dummy.matrix)
    }
    glow.instanceMatrix.needsUpdate = true
    group.add(glow)

    // A dark tide line on the wall where the water meets it.
    const tide = new THREE.Mesh(
      new THREE.CylinderGeometry(SHAFT_RADIUS - 0.03, SHAFT_RADIUS - 0.03, 0.5, 96, 1, true),
      new THREE.MeshStandardMaterial({ color: '#1b1f1e', roughness: 1, side: THREE.BackSide }),
    )
    tide.position.y = WATER_Y + 0.25
    group.add(tide)

    return { group, uTime }
  }, [])

  useFrame((s) => {
    // Still water when motion is reduced: the ripples hold their shape.
    if (!useSilo.getState().reducedMotion) parts.uTime.value = s.clock.elapsedTime
  })

  return <primitive object={parts.group} />
}
