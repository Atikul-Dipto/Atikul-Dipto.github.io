import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSilo } from '../state/useSilo'

/**
 * A wall display: a curved panel of dark glass set into the silo wall, on a
 * steel plinth between two fins, with light lines in the plinth and the
 * header. Whatever `paint` draws is lit from inside the glass, dimly until
 * someone on its level comes near -- then it wakes, a scan line running down
 * the glass and leaving the content at full brightness. After that a slower
 * scan passes every few seconds, so it never quite sits still.
 *
 * Used for the creed on level 1 and for each level's record on 2-12.
 *
 * The reveal and the scan are a few lines added to the standard material's
 * shader, masking only the emission: no texture is redrawn after the first
 * frame, so the effect costs nothing on the CPU.
 */

/** A curved surface on the cylinder r, facing the axis, with u running the
 *  way a visitor reads -- left to right as they face the wall. */
function curvedPanel(r: number, a0: number, a1: number, y0: number, h: number) {
  const segs = Math.max(8, Math.round((a1 - a0) * 60))
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const a = a0 + (a1 - a0) * t
    pos.push(Math.cos(a) * r, y0, Math.sin(a) * r)
    pos.push(Math.cos(a) * r, y0 + h, Math.sin(a) * r)
    // Facing outward at angle a, screen-right is increasing a, so u follows a.
    uv.push(t, 0, t, 1)
    if (i > 0) {
      const b = (i - 1) * 2
      // (bottom, next bottom, top) winds towards the axis.
      idx.push(b, b + 2, b + 1, b + 2, b + 3, b + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** A solid curved bar: the ring sector r0..r1, a0..a1, from y0 up h. */
function arcSolid(r0: number, r1: number, a0: number, a1: number, y0: number, h: number) {
  const segs = Math.max(4, Math.round((a1 - a0) * 60))
  const shape = new THREE.Shape()
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs
    // Drawn in XY with Y = -Z; rotateX(-PI/2) lays it flat.
    if (i === 0) shape.moveTo(Math.cos(a) * r1, -Math.sin(a) * r1)
    else shape.lineTo(Math.cos(a) * r1, -Math.sin(a) * r1)
  }
  for (let i = segs; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / segs
    shape.lineTo(Math.cos(a) * r0, -Math.sin(a) * r0)
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g
}

export interface WallDisplayProps {
  from: number
  to: number
  /** Radius of the glass face. */
  r: number
  /** Floor height the display stands on. */
  floor: number
  /** Glass from this height above the floor... */
  plinth: number
  /** ...to this one. */
  top: number
  /** The level it is on: it only wakes for someone on that level. */
  level: number
  wakeDistance?: number
  /** Paints the glass. Called once. */
  paint: () => THREE.Texture
  /** Hairline dividers over the glass, as fractions across it. */
  mullions?: number[]
}

export default function WallDisplay({
  from,
  to,
  r,
  floor,
  plinth,
  top,
  level,
  wakeDistance = 24,
  paint,
  mullions = [],
}: WallDisplayProps) {
  const state = useRef({ booted: false, bootAt: 0, scanAt: 0 })

  const parts = useMemo(() => {
    const u = { uReveal: { value: -0.05 }, uScan: { value: -1 } }
    const group = new THREE.Group()
    const a0 = from
    const a1 = to
    const base = floor
    const glassY = base + plinth
    const glassH = top - plinth

    // ---- the display ------------------------------------------------------
    const display = paint()
    const glass = new THREE.MeshStandardMaterial({
      color: '#0b1114',
      // Satin, not mirror: glossier glass threw the lamps back as hot spots
      // sitting right on top of the words.
      roughness: 0.42,
      metalness: 0.25,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: display,
      emissiveIntensity: 1.15,
    })
    glass.onBeforeCompile = (shader) => {
      shader.uniforms.uReveal = u.uReveal
      shader.uniforms.uScan = u.uScan
      shader.fragmentShader =
        'uniform float uReveal;\nuniform float uScan;\n' +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            // Distance down the glass from its top edge.
            float down = 1.0 - vEmissiveMapUv.y;
            // Asleep it still shows, faintly, so it can be seen across the
            // atrium and draws people over; waking brings it up to full.
            float shown = mix(0.14, 1.0, smoothstep(uReveal + 0.012, uReveal - 0.012, down));
            float edge = exp(-abs(down - uReveal) * 70.0) * step(uReveal, 1.04);
            float scan = exp(-abs(down - uScan) * 160.0) * 0.22;
            totalEmissiveRadiance = totalEmissiveRadiance * shown
              + emissive * (edge * 0.55 + scan) * vec3(1.0, 0.82, 0.58);
          }`,
        )
    }
    glass.customProgramCacheKey = () => 'wall-display-glass'
    const panel = new THREE.Mesh(curvedPanel(r, a0, a1, glassY, glassH), glass)
    group.add(panel)

    // ---- the housing --------------------------------------------------------
    const steel = new THREE.MeshStandardMaterial({ color: '#2b3033', roughness: 0.42, metalness: 0.75 })
    const satin = new THREE.MeshStandardMaterial({ color: '#555c60', roughness: 0.32, metalness: 0.85 })
    const led = new THREE.MeshStandardMaterial({
      color: '#fff3dc',
      emissive: new THREE.Color('#ffe2b0'),
      emissiveIntensity: 2.6,
      roughness: 0.4,
    })
    const front = r - 0.18
    const back = r + 0.17
    const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
      const mesh = new THREE.Mesh(g, m)
      mesh.castShadow = shadow
      mesh.receiveShadow = true
      group.add(mesh)
    }
    // Plinth, its top a light line, and a recessed kick at the floor.
    add(arcSolid(front, back, a0, a1, base + 0.08, plinth - 0.08), steel)
    add(arcSolid(front + 0.06, back, a0, a1, base, 0.08), satin)
    add(arcSolid(front - 0.004, front + 0.02, a0 + 0.004, a1 - 0.004, base + plinth - 0.05, 0.022), led, false)
    // Header, with a light line along its underside washing down the glass.
    add(arcSolid(front, back, a0, a1, base + top, 0.26), steel)
    add(arcSolid(front + 0.02, front + 0.06, a0 + 0.004, a1 - 0.004, base + top - 0.025, 0.025), led, false)
    // Fins at both ends, standing proud of the glass, each with a lit edge.
    const fin = 0.016
    for (const [f0, f1, side] of [
      [a0 - fin, a0, 1],
      [a1, a1 + fin, -1],
    ] as const) {
      add(arcSolid(front - 0.12, back, f0, f1, base, top + 0.26), satin)
      const edgeA = side === 1 ? f1 - 0.0025 : f0
      add(arcSolid(front - 0.125, front - 0.1, edgeA, edgeA + 0.0025, base + 0.1, top + 0.06), led, false)
    }
    // Mullions: hairline steel dividers over the glass, so it reads as a run
    // of panels rather than one sheet.
    const span = a1 - a0
    for (const t of mullions) {
      const a = a0 + span * t
      add(arcSolid(r - 0.035, r - 0.005, a - 0.0012, a + 0.0012, glassY, glassH), satin, false)
    }
    return { group, glass, u }
    // Built once: a display does not move or change what it shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Displays mount and unmount as the visitor moves between levels; each
  // holds a large canvas texture, so let the GPU have it back.
  useEffect(
    () => () => {
      parts.group.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        m.geometry.dispose()
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          ;(mat as THREE.MeshStandardMaterial).emissiveMap?.dispose()
          mat.dispose()
        }
      })
    },
    [parts],
  )

  useFrame((s) => {
    const st = state.current
    const t = s.clock.elapsedTime
    const { u, glass } = parts
    const silo = useSilo.getState()
    const reduced = silo.reducedMotion

    if (!st.booted) {
      // Wakes when someone on its level comes within range.
      const cam = s.camera.position
      const mid = (from + to) / 2
      const dx = cam.x - Math.cos(mid) * r
      const dz = cam.z - Math.sin(mid) * r
      if (silo.level === level && Math.hypot(dx, dz) < wakeDistance) {
        st.booted = true
        st.bootAt = t
        st.scanAt = t + 9
      }
      u.uReveal.value = -0.05
      return
    }
    if (reduced) {
      u.uReveal.value = 1.1
      u.uScan.value = -1
      return
    }
    // The boot scan, top to bottom over four seconds.
    u.uReveal.value = Math.min(1.1, -0.05 + ((t - st.bootAt) / 4) * 1.15)
    // Then a slow pass every eleven seconds.
    const since = t - st.scanAt
    if (since > 11) st.scanAt = t
    u.uScan.value = since < 3.2 ? -0.05 + (since / 3.2) * 1.1 : -1
    // A faint breath in the light, and now and then -- when two slow waves
    // happen to peak together, every minute or so -- a stutter.
    const rare = Math.sin(t * 0.37) * Math.sin(t * 1.13) > 0.985
    const stutter = rare && Math.sin(t * 57) > 0 ? -0.3 : 0
    glass.emissiveIntensity = 1.1 + Math.sin(t * 0.7) * 0.05 + stutter
  })

  return <primitive object={parts.group} />
}
