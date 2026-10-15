import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { DECK_INNER, PALETTE, SHAFT_RADIUS, contentAngle, walkY } from '../content/floors'
import { ROOM_INNER } from '../content/level1'
import { daylight } from '../lib/daylight'
import { useSilo } from '../state/useSilo'
import { DISH } from '../content/dome'

/**
 * How the interior is lit.
 *
 * THE SUN. One directional light, the only one that casts shadows. On level 1
 * it hangs in the dish and is daylight -- its colour and strength follow the
 * hour -- so the railings, the stair and the furniture throw real shadows
 * across the deck that swing warm at dusk and go blue at night.
 *
 * Below level 1 it becomes a work light, and where it hangs matters. Placed
 * up in the dish it would have eleven decks between it and the visitor and
 * every surface would be in shadow. So it drops to just under the soffit of
 * the deck above whichever level the visitor is on, and its shadow camera only
 * reaches down from there: the deck above is behind the light and casts
 * nothing, while everything on the visitor's own level casts properly.
 *
 * FILL. A hemisphere light tinted by the sky, a procedural environment map --
 * no download; three.js builds it from a room description -- so chrome and
 * glass have something to reflect and shadows are never dead black, and four
 * pooled lamps on the promenade that travel with the visitor.
 */
const POOL = 4

export default function Lighting() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const quality = useSilo((s) => s.quality)
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const pool = useRef<Array<THREE.PointLight | null>>([])
  const placedFor = useRef<number | null>(null)
  const warm = useMemo(() => new THREE.Color(PALETTE.brassHot), [])
  const ground = useMemo(() => new THREE.Color('#2a211b'), [])

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.34
    pmrem.dispose()
    return () => {
      scene.environment = null
      env.dispose()
    }
  }, [gl, scene])

  // The light's target has to be in the scene graph for its world matrix to
  // update; without this the light keeps aiming at the origin.
  useEffect(() => {
    const L = sun.current
    if (!L) return
    scene.add(L.target)
    return () => {
      scene.remove(L.target)
    }
  }, [scene])

  useFrame(() => {
    const d = daylight()
    const s = useSilo.getState()
    const level = s.level
    const y = walkY(level)
    const top = level === 1

    const L = sun.current
    if (L) {
      if (placedFor.current !== level) {
        placedFor.current = level
        const cam = L.shadow.camera
        if (top) {
          L.position.set(3.5, DISH.bottom + 0.5, 2.5)
          cam.near = 0.5
          cam.far = DISH.bottom + 0.5 - y + 6
        } else {
          L.position.set(2.6, y + 9.4, 1.8)
          cam.near = 0.1
          cam.far = 11.5
        }
        L.target.position.set(0, y, 0)
        L.target.updateMatrixWorld()
        cam.updateProjectionMatrix()
      }
      if (top) {
        L.color.copy(d.sun)
        L.intensity = 0.35 + d.sunI * 1.15
      } else {
        L.color.copy(warm)
        L.intensity = 1.25
      }
    }

    if (hemi.current) {
      const h = hemi.current
      if (top) {
        h.color.copy(warm).lerp(d.sky, 0.55)
        h.intensity = 0.55 + d.glow * 0.55
      } else {
        h.color.copy(warm)
        h.intensity = 0.62
      }
    }

    // Pooled promenade lamps: round the level the visitor is on, clear of
    // the bridge, and brighter after dark on the top floor.
    const base = contentAngle(level)
    const r = (DECK_INNER + ROOM_INNER) / 2
    pool.current.forEach((p, i) => {
      if (!p) return
      const a = base + ((i + 0.5) / POOL) * Math.PI * 2
      p.position.set(Math.cos(a) * r, y + 3.8, Math.sin(a) * r)
      p.intensity = top ? 55 + d.night * 35 : 62
    })
  })

  const shadows = quality === 'high'
  const extent = SHAFT_RADIUS + 1

  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffffff', ground, 0.6]} />
      <ambientLight color="#4b5560" intensity={0.22} />
      <directionalLight
        ref={sun}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.045}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
      />
      {Array.from({ length: POOL }, (_, i) => (
        <pointLight
          key={i}
          ref={(p) => {
            pool.current[i] = p
          }}
          color={PALETTE.brassHot}
          intensity={55}
          // Far enough to reach the outer wall and the rooms' facades from
          // the promenade: at 24 m the wall 11 m away was barely lit.
          distance={32}
          decay={2}
        />
      ))}
    </>
  )
}
