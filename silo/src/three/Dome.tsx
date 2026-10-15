import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CY, DISH, RS, T_BASE, T_OCULUS, domeY } from '../content/dome'
import { daylight } from '../lib/daylight'
import { CABLE_TOP } from './Elevator'
import { concreteSurface, tiled } from './materials'

/**
 * The head of the silo: a concrete dome, ringed with louvred vents, with a
 * great glass dish hanging in its crown on a column that is the top of the
 * lift core.
 *
 * The dish is the skylight. Daylight comes down through it -- and through the
 * vents round it -- into the atrium, and both follow the hour from
 * lib/daylight: white at noon, amber at dusk, deep blue at night.
 *
 * Built from the reference's ideas, not its geometry: a shallow dome on the
 * wall head, ovals set in rings on its inner face, and a faceted bowl of glass
 * on a single column.
 */

const dummy = new THREE.Object3D()

/** A pill-shaped outline: the oval of each vent. */
function pill(w: number, h: number) {
  const s = new THREE.Shape()
  const r = h / 2
  const x = w / 2 - r
  s.moveTo(-x, -r)
  s.lineTo(x, -r)
  s.absarc(x, 0, r, -Math.PI / 2, Math.PI / 2, false)
  s.lineTo(-x, r)
  s.absarc(-x, 0, r, Math.PI / 2, Math.PI * 1.5, false)
  return s
}

/** Horizontal louvres, painted once: the slats read whatever colour the
 *  emissive tint gives them. */
function louvreTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 64, 128)
  ctx.fillStyle = '#262626'
  for (let y = 0; y < 128; y += 16) ctx.fillRect(0, y, 64, 6)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(4, 1)
  return t
}

export default function Dome() {
  const dishLight = useRef<THREE.PointLight>(null)
  const fill = useRef<THREE.PointLight>(null)

  const parts = useMemo(() => {
    const group = new THREE.Group()
    const concrete = tiled(concreteSurface(), 14, 6)
    // A faint emissive, driven by the hour: the light coming through the dish
    // and the vents bouncing round the inside of the dome. Without it the
    // shell is lit only by lamps far below it and reads as a black lid.
    const shellMat = new THREE.MeshStandardMaterial({
      color: '#b3a99d',
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0,
      roughness: 0.96,
      map: concrete.map,
      normalMap: concrete.normalMap,
      roughnessMap: concrete.roughnessMap,
      side: THREE.DoubleSide,
    })
    const ribMat = new THREE.MeshStandardMaterial({
      color: '#8f867b',
      roughness: 0.92,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0,
    })
    const frameMat = new THREE.MeshStandardMaterial({ color: '#4a4540', roughness: 0.7, metalness: 0.4 })

    // ---- the shell -------------------------------------------------------
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(RS, 96, 24, 0, Math.PI * 2, T_OCULUS, T_BASE - T_OCULUS),
      shellMat,
    )
    shell.position.y = CY
    shell.receiveShadow = true
    group.add(shell)

    // ---- meridian ribs, from the wall head up to the oculus ------------
    // A torus drawn in XY covers angle psi; a point on the dome at polar
    // angle t sits at psi = PI/2 - t in the vertical plane through the axis.
    const ribs = 16
    const ribGeo = new THREE.TorusGeometry(RS - 0.18, 0.22, 6, 40, T_BASE - T_OCULUS)
    for (let i = 0; i < ribs; i++) {
      const a = (i / ribs) * Math.PI * 2
      const rib = new THREE.Mesh(ribGeo, ribMat)
      rib.position.y = CY
      rib.rotation.set(0, -a, Math.PI / 2 - T_BASE)
      group.add(rib)
    }

    // Rings: one at the spring line and one round the oculus.
    for (const t of [T_BASE - 0.01, T_OCULUS + 0.006]) {
      const r = Math.sin(t) * (RS - 0.25)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.32, 8, 96), ribMat)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = CY + Math.cos(t) * (RS - 0.25)
      group.add(ring)
    }

    // ---- vents, in three rings between the ribs -------------------------
    const outline = pill(2.3, 1.05)
    const hole = pill(2.0, 0.78)
    const frameShape = outline.clone()
    frameShape.holes.push(new THREE.Path(hole.getPoints(24)))
    const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: 0.28, bevelEnabled: false, curveSegments: 12 })
    const panelGeo = new THREE.ShapeGeometry(hole, 12)
    // Map the louvre texture across the panel's bounding box.
    {
      const pos = panelGeo.attributes.position
      const uv = new Float32Array(pos.count * 2)
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = (pos.getX(i) + 1.0) / 2.0
        uv[i * 2 + 1] = (pos.getY(i) + 0.39) / 0.78
      }
      panelGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    }
    const louvreMat = new THREE.MeshStandardMaterial({
      color: '#2a2a2a',
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: louvreTexture(),
      emissiveIntensity: 1,
      roughness: 0.6,
    })

    const rings: Array<[number, number]> = [
      [T_BASE - 0.1, 30],
      [T_BASE - 0.26, 24],
      [T_BASE - 0.42, 17],
    ]
    const total = rings.reduce((n, [, c]) => n + c, 0)
    const frames = new THREE.InstancedMesh(frameGeo, frameMat, total)
    const panels = new THREE.InstancedMesh(panelGeo, louvreMat, total)
    const basis = new THREE.Matrix4()
    const X = new THREE.Vector3()
    const Y = new THREE.Vector3()
    const Z = new THREE.Vector3()
    let n = 0
    for (const [t, count] of rings) {
      for (let k = 0; k < count; k++) {
        const a = ((k + 0.5) / count) * Math.PI * 2
        const p = new THREE.Vector3(Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a))
        // Local +Z faces down into the atrium (towards the sphere's centre),
        // local X runs along the line of latitude.
        Z.copy(p).negate()
        X.set(-Math.sin(a), 0, Math.cos(a))
        Y.crossVectors(Z, X).normalize()
        X.crossVectors(Y, Z).normalize()
        basis.makeBasis(X, Y, Z)
        const at = p.clone().multiplyScalar(RS - 0.12).add(new THREE.Vector3(0, CY, 0))
        dummy.position.copy(at)
        dummy.quaternion.setFromRotationMatrix(basis)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        frames.setMatrixAt(n, dummy.matrix)
        dummy.position.add(Z.clone().multiplyScalar(0.02))
        dummy.updateMatrix()
        panels.setMatrixAt(n, dummy.matrix)
        n++
      }
    }
    frames.instanceMatrix.needsUpdate = true
    panels.instanceMatrix.needsUpdate = true
    group.add(frames, panels)

    // ---- the column: the top of the lift core ---------------------------
    const colH = DISH.bottom - CABLE_TOP
    const colConcrete = tiled(concreteSurface(), 2, 6)
    const colMat = new THREE.MeshStandardMaterial({
      color: '#c0b6aa',
      roughness: 0.9,
      map: colConcrete.map,
      normalMap: colConcrete.normalMap,
    })
    const column = new THREE.Mesh(new THREE.CylinderGeometry(DISH.neck, DISH.neck, colH, 48), colMat)
    column.position.y = CABLE_TOP + colH / 2
    column.castShadow = true
    column.receiveShadow = true
    group.add(column)
    // Bands, and the hoist housing at its foot where the cables go in.
    for (const y of [CABLE_TOP + 0.2, CABLE_TOP + colH * 0.42, DISH.bottom - 0.4]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(DISH.neck + 0.12, DISH.neck + 0.12, 0.36, 48), frameMat)
      band.position.y = y
      band.castShadow = true
      group.add(band)
    }
    // A ventilation grille up one side of the column.
    const grille = new THREE.Mesh(
      new THREE.CylinderGeometry(DISH.neck + 0.02, DISH.neck + 0.02, 2.6, 16, 1, true, -0.28, 0.56),
      new THREE.MeshStandardMaterial({ color: '#2c2926', roughness: 0.7, metalness: 0.5, map: louvreTexture() }),
    )
    grille.position.y = CABLE_TOP + 2.2
    group.add(grille)

    // ---- the dish -------------------------------------------------------
    // A quarter-ellipse in profile: flat where it meets the column, vertical
    // at the rim -- a bowl of glass.
    const profile: THREE.Vector2[] = []
    const H = DISH.top - DISH.bottom
    for (let i = 0; i <= 24; i++) {
      const q = (i / 24) * (Math.PI / 2)
      profile.push(new THREE.Vector2(DISH.neck + (DISH.rim - DISH.neck) * Math.sin(q), DISH.bottom + H * (1 - Math.cos(q))))
    }
    const dishGeo = new THREE.LatheGeometry(profile, 64)
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#d8e4ea',
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 1,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    })
    const dish = new THREE.Mesh(dishGeo, glassMat)
    group.add(dish)

    // Mullions: ribs down the profile, and rings round it.
    const mullion = new THREE.MeshStandardMaterial({ color: '#3b3733', roughness: 0.5, metalness: 0.7 })
    const ribPath = new THREE.CatmullRomCurve3(profile.map((v) => new THREE.Vector3(v.x - 0.02, v.y, 0)))
    const ribTube = new THREE.TubeGeometry(ribPath, 40, 0.07, 5, false)
    const dishRibs = new THREE.InstancedMesh(ribTube, mullion, 32)
    for (let i = 0; i < 32; i++) {
      dummy.position.set(0, 0, 0)
      dummy.rotation.set(0, (i / 32) * Math.PI * 2, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      dishRibs.setMatrixAt(i, dummy.matrix)
    }
    dishRibs.instanceMatrix.needsUpdate = true
    group.add(dishRibs)
    for (let i = 2; i <= 24; i += 3) {
      const v = profile[i]
      const ring = new THREE.Mesh(new THREE.TorusGeometry(v.x - 0.02, 0.06, 5, 64), mullion)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = v.y
      group.add(ring)
    }
    // A heavier ring at the rim, where the bowl is hung.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(DISH.rim, 0.2, 8, 96), frameMat)
    rim.rotation.x = -Math.PI / 2
    rim.position.y = DISH.top
    group.add(rim)

    // The open sky beyond the bowl: a disc filling the oculus.
    const sky = new THREE.Mesh(
      new THREE.CircleGeometry(DISH.rim + 0.7, 64),
      new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    )
    sky.rotation.x = Math.PI / 2
    sky.position.y = domeY(DISH.rim + 0.6) + 0.05

    group.add(sky)
    return { group, glassMat, louvreMat, shellMat, ribMat, skyMat: sky.material as THREE.MeshBasicMaterial }
  }, [])

  useFrame(() => {
    const d = daylight()
    // Glass: tinted by the sky, brighter the brighter it is out there.
    parts.glassMat.emissive.copy(d.sky).lerp(d.sun, 0.55)
    parts.glassMat.emissiveIntensity = 0.25 + d.glow * 1.25
    parts.skyMat.color.copy(d.sky).lerp(d.sun, 0.3).multiplyScalar(0.4 + d.glow * 1.1)
    parts.louvreMat.emissive.copy(d.sun).lerp(d.sky, 0.35)
    parts.louvreMat.emissiveIntensity = 0.12 + d.glow * 1.1
    for (const m of [parts.shellMat, parts.ribMat]) {
      m.emissive.copy(d.sky).lerp(d.sun, 0.6)
      m.emissiveIntensity = 0.03 + d.glow * 0.13
    }
    if (dishLight.current) {
      dishLight.current.color.copy(d.sun)
      dishLight.current.intensity = 120 + d.glow * 900
    }
    if (fill.current) {
      fill.current.color.copy(d.sky).lerp(d.sun, 0.5)
      fill.current.intensity = 20 + d.glow * 90
    }
  })

  return (
    <group>
      <primitive object={parts.group} />
      {/* Light spilling out of the bowl onto the dome around it. */}
      <pointLight ref={dishLight} position={[0, DISH.bottom + 2.2, 0]} distance={52} decay={2} />
      {/* And down into the head of the atrium. */}
      <pointLight ref={fill} position={[0, DISH.bottom - 5, 0]} distance={34} decay={2} />
    </group>
  )
}

