import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * A fixed set of real lights, fed by every light the scene asks for.
 *
 * WHY. In three.js the number of lights of each kind is compiled into every
 * lit material's shader. Change the count -- a floor's rooms mounting with
 * their lamps, the approach's floods going away as you enter -- and every
 * material in the scene recompiles, on the spot, freezing the page for
 * seconds on an ordinary machine. That was the stall on entering, on arriving
 * at a floor, and when the drone reached a floor whose rooms then loaded.
 *
 * HOW. Lights created anywhere else are taken out of the scene graph the
 * frame they appear (or before a compile, by `sweepLights`) and kept as
 * "wanted" lights: their objects live on, so code holding a ref can still
 * change their colour and intensity. Each frame the pool hands its real lights
 * to the wanted ones that matter most from where the camera is. The counts
 * never change, so nothing recompiles.
 *
 * Lights marked `userData.keep` stay real: the sun, which casts the shadows,
 * and the sky's hemisphere light -- present from the first frame to the last.
 */

/**
 * Every lit shader carries a block of code per light, and on Windows the
 * Direct3D shader compiler slows sharply as they grow: at eighteen point
 * lights a first visit spent over ten seconds compiling. Eight, chosen afresh
 * each frame from the nearest and brightest, look the same from anywhere.
 */
const POINTS = 8
const DIRECTIONALS = 1

interface Wanted {
  light: THREE.Light
  parent: THREE.Object3D
}

const wanted: Wanted[] = []
const _p = new THREE.Vector3()
const _t = new THREE.Vector3()

/** True if every ancestor up to the scene is visible. */
function shown(o: THREE.Object3D | null, root: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) {
    if (!n.visible) return false
    if (n === root) return true
  }
  return false
}

/** Take every light not owned by the pool out of the scene graph. */
export function sweepLights(scene: THREE.Scene) {
  const found: THREE.Light[] = []
  scene.traverse((o) => {
    const l = o as THREE.Light
    if (!l.isLight || l.userData.keep || l.userData.pooled) return
    if ((l as THREE.HemisphereLight).isHemisphereLight) return
    found.push(l)
  })
  for (const l of found) {
    const parent = l.parent
    if (!parent) continue
    parent.remove(l)
    wanted.push({ light: l, parent })
  }
}

export default function LightPool() {
  const scene = useThree((s) => s.scene)
  const pool = useMemo(() => {
    const group = new THREE.Group()
    group.name = 'light-pool'
    const points = Array.from({ length: POINTS }, () => {
      const l = new THREE.PointLight('#ffffff', 0, 10, 2)
      l.userData.pooled = true
      group.add(l)
      return l
    })
    const dirs = Array.from({ length: DIRECTIONALS }, () => {
      const l = new THREE.DirectionalLight('#ffffff', 0)
      l.userData.pooled = true
      group.add(l)
      group.add(l.target)
      return l
    })
    const ambient = new THREE.AmbientLight('#000000', 1)
    ambient.userData.pooled = true
    group.add(ambient)
    return { group, points, dirs, ambient }
  }, [])

  useEffect(() => {
    scene.add(pool.group)
    return () => {
      scene.remove(pool.group)
    }
  }, [scene, pool])

  // First, before anything else draws: take any new lights out, and hand out
  // the real ones.
  useFrame(({ camera }) => {
    sweepLights(scene)
    const cam = camera.position
    const scored: Array<{ w: Wanted; score: number }> = []
    const dirs: Wanted[] = []
    const ambient = pool.ambient.color.setRGB(0, 0, 0)
    for (let i = wanted.length - 1; i >= 0; i--) {
      const w = wanted[i]
      // Gone with its floor: forget it.
      let attached = false
      for (let n: THREE.Object3D | null = w.parent; n; n = n.parent) if (n === scene) attached = true
      if (!attached) {
        wanted.splice(i, 1)
        continue
      }
      const l = w.light
      if (!l.visible || l.intensity <= 0 || !shown(w.parent, scene)) continue
      if ((l as THREE.AmbientLight).isAmbientLight) {
        ambient.r += l.color.r * l.intensity
        ambient.g += l.color.g * l.intensity
        ambient.b += l.color.b * l.intensity
        continue
      }
      if ((l as THREE.DirectionalLight).isDirectionalLight) {
        dirs.push(w)
        continue
      }
      if (!(l as THREE.PointLight).isPointLight) continue
      _p.copy(l.position).applyMatrix4(w.parent.matrixWorld)
      const pl = l as THREE.PointLight
      const d = _p.distanceTo(cam)
      const reach = pl.distance > 0 ? pl.distance : 30
      const score = (l.intensity / (1 + (d * d) / (reach * reach))) * (d < reach + 8 ? 1 : 0.05)
      scored.push({ w, score })
    }
    scored.sort((a, b) => b.score - a.score)
    pool.points.forEach((real, i) => {
      const s = scored[i]
      if (!s) {
        real.intensity = 0
        return
      }
      const l = s.w.light as THREE.PointLight
      real.position.copy(l.position).applyMatrix4(s.w.parent.matrixWorld)
      real.color.copy(l.color)
      real.intensity = l.intensity
      real.distance = l.distance
      real.decay = l.decay
    })
    pool.dirs.forEach((real, i) => {
      const w = dirs[i]
      if (!w) {
        real.intensity = 0
        return
      }
      const l = w.light as THREE.DirectionalLight
      _p.copy(l.position).applyMatrix4(w.parent.matrixWorld)
      _t.setFromMatrixPosition(l.target.matrixWorld)
      real.position.copy(_p).sub(_t)
      real.target.position.set(0, 0, 0)
      real.color.copy(l.color)
      real.intensity = l.intensity
    })
  }, -1000)

  return null
}
