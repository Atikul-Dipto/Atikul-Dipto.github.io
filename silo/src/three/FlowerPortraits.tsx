import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FLOORS, walkY } from '../content/floors'
import { PORTRAIT, flowerAngle, flowerOn } from '../content/flowers'
import { useSilo } from '../state/useSilo'
import { paintFlower } from './flowerPaint'

/**
 * Each floor's flower, painted and framed on its wall under a lamp. Hung on
 * the floor the visitor is on and the two either side, like the record
 * displays; a painting is kept once painted, so coming back costs nothing
 * but its upload.
 */
const painted = new Map<number, HTMLCanvasElement>()

function Portrait({ level }: { level: number }) {
  const { group, dispose } = useMemo(() => {
    const f = flowerOn(level)
    let canvas = painted.get(level)
    if (!canvas) {
      canvas = paintFlower(f)
      painted.set(level, canvas)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const a = flowerAngle(level)
    const g = new THREE.Group()
    g.position.set(Math.cos(a) * PORTRAIT.r, walkY(level) + PORTRAIT.bottom + PORTRAIT.h / 2, Math.sin(a) * PORTRAIT.r)
    // Face the middle of the shaft.
    g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a))

    const canvasMat = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.32, roughness: 0.85 })
    const picture = new THREE.Mesh(new THREE.PlaneGeometry(PORTRAIT.w, PORTRAIT.h), canvasMat)
    picture.position.z = 0.035
    g.add(picture)
    // The frame: dark wood, a box round the canvas, with a fine lit fillet
    // in the flower's own colour just inside it.
    const B = 0.08
    const wood = new THREE.MeshStandardMaterial({ color: '#2a1d16', roughness: 0.55, metalness: 0.15 })
    const fillet = new THREE.MeshStandardMaterial({ color: f.colour, emissive: f.colour, emissiveIntensity: 0.9 })
    // Backing and the four sides of the frame as one mesh, the fillet as
    // another: three draw calls a painting.
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)
    const frame = mergeGeometries([
      box(PORTRAIT.w + B * 2, PORTRAIT.h + B * 2, 0.03, 0, 0, 0),
      box(PORTRAIT.w + B * 2, B, 0.08, 0, (PORTRAIT.h + B) / 2, 0.04),
      box(PORTRAIT.w + B * 2, B, 0.08, 0, -(PORTRAIT.h + B) / 2, 0.04),
      box(B, PORTRAIT.h, 0.08, (PORTRAIT.w + B) / 2, 0, 0.04),
      box(B, PORTRAIT.h, 0.08, -(PORTRAIT.w + B) / 2, 0, 0.04),
    ])!
    g.add(new THREE.Mesh(frame, wood))
    const line = mergeGeometries([
      box(PORTRAIT.w, 0.012, 0.012, 0, PORTRAIT.h / 2 - 0.006, 0.042),
      box(PORTRAIT.w, 0.012, 0.012, 0, -PORTRAIT.h / 2 + 0.006, 0.042),
      box(0.012, PORTRAIT.h, 0.012, PORTRAIT.w / 2 - 0.006, 0, 0.042),
      box(0.012, PORTRAIT.h, 0.012, -PORTRAIT.w / 2 + 0.006, 0, 0.042),
    ])!
    g.add(new THREE.Mesh(line, fillet))
    const dispose = () => {
      tex.dispose()
      g.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.geometry.dispose()
      })
      for (const m of [canvasMat, wood, fillet]) m.dispose()
    }
    return { group: g, dispose }
  }, [level])
  useEffect(() => dispose, [dispose])
  return <primitive object={group} />
}

export default function FlowerPortraits() {
  const level = useSilo((s) => s.level)
  return (
    <>
      {FLOORS.filter((f) => Math.abs(f.level - level) <= 1).map((f) => (
        <Portrait key={f.level} level={f.level} />
      ))}
    </>
  )
}
