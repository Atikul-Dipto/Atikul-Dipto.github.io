import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SHAFT_RADIUS } from '../../content/floors'
import { FLOOR, PORTRAIT_ANGLE } from '../../content/level1'
import { identity } from '../../content/portfolio'
import { reactor } from '../../lib/reactor'

/**
 * The name, in iron, on the wall above the portrait.
 *
 * Block letters cut from plate, drawn here as outlines rather than set in a
 * font: no typeface to license or download, and a look of their own -- square,
 * heavy, the kind of lettering bolted to a bulkhead. Each outline is on a box
 * one unit high; only the letters the name needs are drawn, and a letter
 * without an outline is left as a gap.
 *
 * Behind the iron, a glow in the reactor's colour: the power conduits run up
 * from the core and end in level 1's floor, and the light runs on through the
 * name, pulsing with them -- brighter while the core surges.
 */

type Outline = { w: number; pts: Array<[number, number]>; hole?: Array<[number, number]> }

const T = 0.2
const LETTERS: Record<string, Outline> = {
  A: {
    w: 0.82,
    pts: [[0, 0], [0.22, 0], [0.3, 0.3], [0.52, 0.3], [0.6, 0], [0.82, 0], [0.52, 1], [0.3, 1]],
    hole: [[0.35, 0.46], [0.47, 0.46], [0.41, 0.72]],
  },
  T: { w: 0.78, pts: [[0.29, 0], [0.49, 0], [0.49, 1 - T], [0.78, 1 - T], [0.78, 1], [0, 1], [0, 1 - T], [0.29, 1 - T]] },
  I: { w: 0.22, pts: [[0, 0], [0.22, 0], [0.22, 1], [0, 1]] },
  K: { w: 0.8, pts: [[0, 0], [T, 0], [T, 0.4], [0.56, 0], [0.8, 0], [0.38, 0.5], [0.8, 1], [0.56, 1], [T, 0.6], [T, 1], [0, 1]] },
  U: { w: 0.78, pts: [[0, 1], [0, 0], [0.78, 0], [0.78, 1], [0.58, 1], [0.58, T], [T, T], [T, 1]] },
  L: { w: 0.7, pts: [[0, 0], [0.7, 0], [0.7, T], [T, T], [T, 1], [0, 1]] },
  S: { w: 0.78, pts: [[0, 0], [0.78, 0], [0.78, 0.6], [T, 0.6], [T, 0.8], [0.78, 0.8], [0.78, 1], [0, 1], [0, 0.4], [0.58, 0.4], [0.58, T], [0, T]] },
  M: { w: 0.98, pts: [[0, 0], [T, 0], [T, 0.66], [0.45, 0.3], [0.53, 0.3], [0.78, 0.66], [0.78, 0], [0.98, 0], [0.98, 1], [0.8, 1], [0.49, 0.56], [0.18, 1], [0, 1]] },
}

const HEIGHT = 0.82
const GAP = 0.16
const SPACE = 0.5
/** The widest the name may be: the bay between the two ribs either side of
 *  the portrait, less a margin. */
const MAX_WIDTH = 9.4
const CENTRE_Y = 5.6
const R = SHAFT_RADIUS - 0.16

function letterGeometry(o: Outline) {
  const sh = new THREE.Shape(o.pts.map(([x, y]) => new THREE.Vector2(x, y)))
  if (o.hole) sh.holes.push(new THREE.Path(o.hole.map(([x, y]) => new THREE.Vector2(x, y))))
  return new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2 })
}

function nameGeometry(text: string, halo = 0) {
  const chars = text.toUpperCase().split('')
  const widths = chars.map((c) => (LETTERS[c] ? LETTERS[c].w : SPACE))
  const raw = widths.reduce((a, b) => a + b, 0) + GAP * (chars.length - 1)
  const scale = Math.min(HEIGHT, MAX_WIDTH / raw)
  const total = raw * scale
  const parts: THREE.BufferGeometry[] = []
  let x = -total / 2
  const m = new THREE.Matrix4()
  chars.forEach((c, i) => {
    const o = LETTERS[c]
    const w = widths[i] * scale
    if (o) {
      const g = letterGeometry(o)
      g.scale(scale, scale, 1)
      // Along the curve of the wall: each letter turned to face the centre,
      // at the angle of its own middle.
      const a = PORTRAIT_ANGLE + (x + w / 2) / R
      m.makeRotationY(Math.PI / 2 - a + Math.PI)
      m.setPosition(Math.cos(a) * R, 0, Math.sin(a) * R)
      g.translate(-w / 2, -scale / 2, 0)
      if (halo) {
        // A little larger and set back against the wall: the glow behind.
        g.scale(1 + halo, 1 + halo * 1.3, 0.4)
        g.translate(0, 0, -0.07)
      }
      g.applyMatrix4(m)
      parts.push(g)
    }
    x += w + GAP * scale
  })
  return mergeGeometries(parts)
}

export default function IronName() {
  const mesh = useMemo(() => {
    const geo = nameGeometry(identity.name)
    // Blackened iron, worn bright on the edges by the bevel catching light.
    const iron = new THREE.MeshStandardMaterial({ color: '#7d6c5e', roughness: 0.38, metalness: 0.85 })
    const m = new THREE.Mesh(geo, iron)
    m.position.y = FLOOR + CENTRE_Y
    m.castShadow = true
    return m
  }, [])
  const glow = useMemo(() => {
    const uTime = { value: 0 }
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime, uSurge: reactor.uSurge },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uSurge;
        varying vec3 vW;
        void main() {
          // A pulse running along the name, the way it runs up the conduits.
          float along = atan(vW.z, vW.x) * 22.0;
          float p = fract(along * 0.12 - uTime * (0.35 + uSurge * 1.5));
          float pulse = smoothstep(0.0, 0.1, p) * smoothstep(0.35, 0.1, p);
          vec3 col = vec3(0.25, 0.85, 0.95) * (0.75 + pulse * 2.2 + uSurge * 2.0);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      toneMapped: false,
    })
    const m = new THREE.Mesh(nameGeometry(identity.name, 0.16), mat)
    m.position.y = FLOOR + CENTRE_Y
    return { m, uTime }
  }, [])
  useFrame((s) => {
    glow.uTime.value = s.clock.elapsedTime
  })
  const light = useMemo(() => {
    // The glow's light on the wall round the letters.
    const l = new THREE.PointLight('#5fd8e6', 10, 9, 2)
    const a = PORTRAIT_ANGLE
    const r = SHAFT_RADIUS - 1.6
    l.position.set(Math.cos(a) * r, FLOOR + CENTRE_Y - 1.2, Math.sin(a) * r)
    return l
  }, [])
  return (
    <>
      <primitive object={mesh} />
      <primitive object={glow.m} />
      <primitive object={light} />
    </>
  )
}
