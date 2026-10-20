import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  CLAD_TILES,
  CUT_HALF,
  CUT_MID,
  DECK_INNER,
  DECK_SEGMENTS,
  FLOORS,
  FLOOR_HEIGHT,
  PALETTE,
  SHAFT_RADIUS,
  WALL_ARC,
  WALL_CENTER,
  WALL_HEIGHT,
  WALL_THETA_START,
  WALL_THICK,
  cutTheta,
  contentAngle,
  walkY,
  levelY,
} from '../content/floors'
import { RAIL_GAP_HALF } from '../content/stairs'
import { CREED, HALL_F, HALL_GATE } from '../content/level1'
import { MAX_OPENINGS, OPENINGS, openingsOn } from '../content/openings'
import { useSilo } from '../state/useSilo'
import { RIB, RIBS_PER_FLOOR, LAMPS_PER_FLOOR, lampAngles, recordWallSpan, ribAngles } from '../content/layout'
import Stairway from './Stairway'
import Water from './Water'
import { claddingSurface, concreteSurface, deckPlateMaterial, planarUV, steelSurface, tiled } from './materials'

/** Deterministic PRNG so the concrete weathering is identical every load. */
function makeRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const dummy = new THREE.Object3D()

/** Orients an instance to face the shaft axis. InstancedMesh has no per-instance
 *  lookAt, so a throwaway Object3D does the matrix maths. */
function faceAxis(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number) {
  dummy.position.set(x, y, z)
  dummy.rotation.set(0, 0, 0)
  dummy.lookAt(0, y, 0)
  dummy.updateMatrix()
  mesh.setMatrixAt(i, dummy.matrix)
}

/**
 * The wall: an arc, not a tube. WALL_ARC leaves the cutaway sector unbuilt,
 * which is what makes the section readable from outside. Inner and outer
 * shells plus two radial cut faces give it real thickness, so the missing
 * panel looks cut away rather than merely absent.
 */
/** Arcs [from, to] with each [centre, half] cut out of them. */
function cutArcs(arcs: Array<[number, number]>, cuts: ReadonlyArray<readonly [number, number]>) {
  let out = arcs
  for (const [c, h] of cuts) {
    const next: Array<[number, number]> = []
    for (const [from, to] of out) {
      // The cut's centre, unwrapped into this arc's range.
      let cc = c
      while (cc < from - Math.PI) cc += Math.PI * 2
      while (cc > to + Math.PI) cc -= Math.PI * 2
      const a0 = cc - h
      const a1 = cc + h
      if (a1 <= from || a0 >= to) {
        next.push([from, to])
        continue
      }
      if (a0 > from + 0.01) next.push([from, a0])
      if (a1 < to - 0.01) next.push([a1, to])
    }
    out = next
  }
  return out
}

function ConcreteWall() {
  const hole = useMemo(() => ({ value: 1 }), [])
  // The shader's opening slots; `useFrame` below fills them.
  const holes = useMemo(
    () => ({
      holeA: Array.from({ length: MAX_OPENINGS }, () => new THREE.Vector4(1, 0, 1e6, 0)),
      holeT: Array.from({ length: MAX_OPENINGS }, () => new THREE.Vector4(0, 1, 0, 0)),
      // Each opening's floor: the wall is never cut below it.
      holeF: Array.from({ length: MAX_OPENINGS }, () => 1e6),
    }),
    [],
  )
  const nodes = useMemo(() => {
    const group = new THREE.Group()

    // Vertex-colour mottling instead of a texture: nothing to download, no UV
    // seam on a cylinder, and it holds up at every distance.
    const mottle = (geo: THREE.BufferGeometry, seed: number, light: number) => {
      const rand = makeRandom(seed)
      // Near-white: these multiply the colour map, so a wide range here would
      // just crush the texture back into flat brown.
      const base = new THREE.Color('#ffffff')
      const dark = new THREE.Color('#b4b8bb')
      const pos = geo.attributes.position
      const colors = new Float32Array(pos.count * 3)
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        const blotch =
          (Math.sin(y * 0.6 + pos.getX(i) * 0.4) + Math.sin(pos.getZ(i) * 0.55 - y * 0.22)) * 0.25
        const t = Math.min(1, Math.max(0, light + blotch + rand() * 0.34))
        const c = base.clone().lerp(dark, t)
        colors[i * 3] = c.r
        colors[i * 3 + 1] = c.g
        colors[i * 3 + 2] = c.b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      return geo
    }

    // Precast cladding panels, one 4 m tile at a time round the arc and up
    // the height. The repeat comes from the real dimensions: a fixed count
    // stretched the old concrete to nearly 7 m wide when the shaft grew.
    // CLAD_TILES is shared with content/layout, which stands the ribs on
    // the joints.
    const clad = tiled(claddingSurface(), CLAD_TILES, Math.round(WALL_HEIGHT / 4))
    const shell = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0.08,
      side: THREE.DoubleSide,
      map: clad.map,
      normalMap: clad.normalMap,
      roughnessMap: clad.roughnessMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
    })
    // Doors go straight through the wall -- rooms on several levels -- so the
    // wall has holes in it there: both shells are cut away inside each
    // opening's outline, and the tunnel drawn behind each door lines the bore.
    // Cut in the shader rather than the mesh, because a 72-segment cylinder
    // has no vertices anywhere near a 3 m circle. Closed for the approach,
    // when the rooms behind them are not drawn.
    //
    // The shader holds MAX_OPENINGS; there are more openings than that in
    // the silo, so each frame the slots are given to the ones nearest the
    // camera in height (`useFrame` below). A fixed count, so it never
    // recompiles; the doorways of distant levels are not drawn anyway.
    const { holeA, holeT, holeF } = holes
    shell.onBeforeCompile = (shader) => {
      shader.uniforms.uHole = hole
      shader.uniforms.uHoleA = { value: holeA }
      shader.uniforms.uHoleT = { value: holeT }
      shader.uniforms.uHoleF = { value: holeF }
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vShellPos;`,
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vShellPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vShellPos;
          uniform float uHole;
          uniform vec4 uHoleA[${MAX_OPENINGS}];
          uniform vec4 uHoleT[${MAX_OPENINGS}];
          uniform float uHoleF[${MAX_OPENINGS}];`,
        )
        .replace(
          'void main() {',
          `void main() {
          if (uHole > 0.5) {
            for (int i = 0; i < ${MAX_OPENINGS}; i++) {
              vec4 h = uHoleA[i];
              vec4 t = uHoleT[i];
              // A rounded rectangle, half-size (h.w, t.z), corner radius t.w.
              vec2 p = abs(vec2(dot(vShellPos.xz, t.xy), vShellPos.y - h.z));
              vec2 q = p - vec2(h.w, t.z) + t.w;
              float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - t.w;
              // Only above the floor: a gate whose outline dips under it would
              // otherwise leave a hole in the wall seen from the level below.
              if (dot(vShellPos.xz, h.xy) > 10.0 && dist < 0.0 && vShellPos.y > uHoleF[i]) discard;
            }
          }`,
        )
    }
    shell.customProgramCacheKey = () => 'shaft-wall-openings'

    const inner = new THREE.Mesh(
      mottle(
        new THREE.CylinderGeometry(
          SHAFT_RADIUS,
          SHAFT_RADIUS,
          WALL_HEIGHT,
          72,
          48,
          true,
          WALL_THETA_START,
          WALL_ARC,
        ),
        9,
        0.32,
      ),
      shell,
    )
    inner.position.y = WALL_CENTER
    group.add(inner)

    const outerR = SHAFT_RADIUS + WALL_THICK
    const outer = new THREE.Mesh(
      mottle(
        new THREE.CylinderGeometry(outerR, outerR, WALL_HEIGHT, 72, 24, true, WALL_THETA_START, WALL_ARC),
        17,
        0.52,
      ),
      shell,
    )
    outer.position.y = WALL_CENTER
    group.add(outer)

    // The two cut faces: exposed aggregate across the wall thickness.
    const cutMat = new THREE.MeshStandardMaterial({ color: PALETTE.concreteCut, roughness: 0.99 })
    for (const sign of [-1, 1]) {
      const a = CUT_MID + sign * CUT_HALF
      const face = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICK, WALL_HEIGHT, 0.04), cutMat)
      face.position.set(
        Math.cos(a) * (SHAFT_RADIUS + WALL_THICK / 2),
        WALL_CENTER,
        Math.sin(a) * (SHAFT_RADIUS + WALL_THICK / 2),
      )
      face.rotation.y = -a
      group.add(face)
    }
    return group
  }, [hole, holes])

  useFrame(({ camera }) => {
    hole.value = useSilo.getState().phase === 'exterior' ? 0 : 1
    const h = holes
    const y = camera.position.y
    const near = OPENINGS.length <= MAX_OPENINGS ? OPENINGS : [...OPENINGS].sort((a, b) => Math.abs(a.centreY - y) - Math.abs(b.centreY - y))
    for (let i = 0; i < MAX_OPENINGS; i++) {
      const o = near[i]
      if (o) {
        h.holeA[i].set(Math.cos(o.angle), Math.sin(o.angle), o.centreY, o.halfW)
        h.holeT[i].set(-Math.sin(o.angle), Math.cos(o.angle), o.halfH, o.radius)
        h.holeF[i] = walkY(o.level) - 0.01
      } else {
        h.holeA[i].set(1, 0, 1e6, 0)
        h.holeT[i].set(0, 1, 0, 0)
        h.holeF[i] = 1e6
      }
    }
  })

  return <primitive object={nodes} />
}

/**
 * Rock behind the missing wall panel. BackSide, so it is drawn when you are
 * inside the shaft looking out through the cutaway, and back-face culled on the
 * approach — the one surface that must not block the section view.
 */
function StrataBackdrop() {
  const geometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(
      SHAFT_RADIUS + WALL_THICK + 0.5,
      SHAFT_RADIUS + WALL_THICK + 0.5,
      WALL_HEIGHT,
      28,
      40,
      true,
      cutTheta(0.1),
      CUT_HALF * 2 + 0.2,
    )
    // Horizontal banding, so the exposed ground reads as strata.
    const rock = new THREE.Color(PALETTE.rock)
    const dark = new THREE.Color(PALETTE.rockDark)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const band = (Math.sin(y * 0.42) + Math.sin(y * 1.31 + 1.7) * 0.4) * 0.5 + 0.5
      const c = rock.clone().lerp(dark, band)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }, [])

  // The rock itself: strata of brown, ochre and slate, grain, pebbles and
  // cracks -- self-lit through the same picture, so it never reads as a flat
  // plain slab when the lamps are elsewhere.
  const rockTex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 2048
    const g = c.getContext('2d')!
    let seed = 41
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
    const tones = ['#4a3a2c', '#5a4632', '#3a302a', '#6a5238', '#2f2925', '#54483d', '#463b33']
    // A base under the bands, so where two wavy edges do not quite meet it
    // is rock that shows, not a black slit.
    g.fillStyle = '#41352b'
    g.fillRect(0, 0, 1024, 2048)
    let y = 0
    while (y < 2048) {
      const h = 30 + rand() * 120
      g.fillStyle = tones[Math.floor(rand() * tones.length)]
      // A wavy band, not a ruled one.
      g.beginPath()
      g.moveTo(0, y)
      for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + y) * 6)
      for (let x = 1024; x >= 0; x -= 32) g.lineTo(x, y + h + Math.sin(x * 0.012 + y + 3) * 6)
      g.closePath()
      g.fill()
      y += h
    }
    for (let i = 0; i < 26000; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '255,240,220' : '0,0,0'},${(0.03 + rand() * 0.07).toFixed(3)})`
      g.fillRect(rand() * 1024, rand() * 2048, 1 + rand() * 3, 1 + rand() * 3)
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${150 + rand() * 60},${130 + rand() * 50},${110 + rand() * 40},0.35)`
      g.beginPath()
      g.ellipse(rand() * 1024, rand() * 2048, 2 + rand() * 7, 2 + rand() * 5, rand() * 3, 0, Math.PI * 2)
      g.fill()
    }
    g.strokeStyle = 'rgba(10,8,6,0.65)'
    for (let i = 0; i < 40; i++) {
      let x = rand() * 1024
      let yy = rand() * 2048
      g.lineWidth = 1 + rand() * 2
      g.beginPath()
      g.moveTo(x, yy)
      for (let k = 0; k < 12; k++) {
        x += (rand() - 0.5) * 50
        yy += 10 + rand() * 30
        g.lineTo(x, yy)
      }
      g.stroke()
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1.5, WALL_HEIGHT / 30)
    t.anisotropy = 4
    return t
  }, [])

  return (
    <mesh geometry={geometry} position={[0, WALL_CENTER, 0]}>
      <meshStandardMaterial
        map={rockTex}
        vertexColors
        roughness={1}
        metalness={0}
        side={THREE.BackSide}
        // The pooled lights cluster on the fit-out, so without a little self
        // illumination the cutaway reads as a hole in the world when you turn
        // towards it rather than as the rock the shaft was bored through.
        emissive="#ffffff"
        emissiveMap={rockTex}
        emissiveIntensity={0.55}
      />
    </mesh>
  )
}

/**
 * Pilasters, one level tall. They used to run the full depth, which meant a
 * single fit-out slot anywhere in the shaft culled the whole column — with
 * twelve levels of slots that culled every rib in the building and left the
 * wall a bare tube. Segmenting them per level keeps the detail everywhere
 * except directly in front of a console, window or airlock.
 */
function Ribs() {
  const ref = useMemo(() => {
    const height = FLOOR_HEIGHT - 0.4
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(RIB.w, height, RIB.d),
      (() => {
        const c = tiled(concreteSurface(), 1, 10)
        return new THREE.MeshStandardMaterial({
          color: PALETTE.concreteDark,
          roughness: 0.95,
          map: c.map,
          normalMap: c.normalMap,
          roughnessMap: c.roughnessMap,
        })
      })(),
      FLOORS.length * RIBS_PER_FLOOR,
    )

    let n = 0
    FLOORS.forEach((floor) => {
      const y = levelY(floor.level) + 1.4
      for (const a of ribAngles(floor.level)) {
        faceAxis(mesh, n++, Math.cos(a) * RIB.r, y, Math.sin(a) * RIB.r)
      }
    })
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }, [])
  return <primitive object={ref} />
}

function Decks() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const deckGeo = new THREE.RingGeometry(DECK_INNER, SHAFT_RADIUS - 0.06, DECK_SEGMENTS, 1)
    // The walking face, laid flat in world space so its plate pattern can be
    // mapped from world position and continue onto the bridge and landing.
    const deckTop = planarUV(deckGeo.clone().rotateX(-Math.PI / 2))
    const deckMat = deckPlateMaterial()
    const soffitMat = new THREE.MeshStandardMaterial({
      color: PALETTE.concreteDark,
      roughness: 1,
      metalness: 0,
      side: THREE.FrontSide,
    })
    const brushed = tiled(steelSurface(), 6, 6)
    const steel = new THREE.MeshStandardMaterial({
      roughness: 0.6,
      metalness: 0.35,
      map: brushed.map,
      normalMap: brushed.normalMap,
      roughnessMap: brushed.roughnessMap,
    })
    const edgeMat = new THREE.MeshStandardMaterial({
      color: PALETTE.brass,
      emissive: new THREE.Color(PALETTE.brass),
      emissiveIntensity: 1.6,
      roughness: 0.5,
      metalness: 0.4,
    })
    const bandLight = new THREE.MeshStandardMaterial({
      color: '#fff1d8',
      emissive: new THREE.Color('#ffe0b0'),
      emissiveIntensity: 2.2,
      roughness: 0.5,
    })

    FLOORS.forEach((floor) => {
      const y = walkY(floor.level)

      const deck = new THREE.Mesh(deckTop, deckMat)
      deck.receiveShadow = true
      deck.position.y = y
      group.add(deck)

      // Ceiling for the level below: plain, so nothing shimmers overhead.
      const soffit = new THREE.Mesh(deckGeo, soffitMat)
      soffit.rotation.x = Math.PI / 2
      soffit.position.y = y - 0.26
      group.add(soffit)

      // Lip and handrail around the stairwell opening -- with a gap at the
      // gangway, which is the one way off this deck. Closing the ring here
      // would leave the stair and the lift visible but unreachable, which is
      // what the first version of this did.
      //
      // A torus is drawn in XY from its own zero; after `rotation.z = -A` and
      // `rotation.x = -PI/2` an arc of length L covers world angles [A-L, A].
      // So starting at the gangway's leading edge and running the long way
      // round lands the opening exactly on the gangway.
      const gangway = contentAngle(floor.level)
      const ringStart = -(gangway - RAIL_GAP_HALF)
      const ringArc = Math.PI * 2 - RAIL_GAP_HALF * 2

      const lip = new THREE.Mesh(
        new THREE.TorusGeometry(DECK_INNER, 0.1, 8, 80, ringArc),
        steel,
      )
      lip.rotation.x = -Math.PI / 2
      lip.rotation.z = ringStart
      lip.position.y = y + 0.05
      group.add(lip)

      const rail = new THREE.Mesh(
        new THREE.TorusGeometry(DECK_INNER, 0.055, 6, 80, ringArc),
        steel,
      )
      rail.rotation.x = -Math.PI / 2
      rail.rotation.z = ringStart
      rail.position.y = y + 1.05
      group.add(rail)

      const n = 84
      const posts = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1.05, 6),
        steel,
        n,
      )
      let p = 0
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const off = Math.abs(((a - gangway + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
        if (off < RAIL_GAP_HALF + 0.02) continue
        dummy.position.set(Math.cos(a) * DECK_INNER, y + 0.52, Math.sin(a) * DECK_INNER)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        posts.setMatrixAt(p++, dummy.matrix)
      }
      posts.count = p
      posts.instanceMatrix.needsUpdate = true
      group.add(posts)

      // Edge rail across the cutaway, where the deck ends in open air. Lit,
      // because it is both the only warning you get and the thing that tells
      // you which way the structure has been cut.
      const edge = new THREE.Mesh(
        new THREE.TorusGeometry(SHAFT_RADIUS - 0.2, 0.06, 6, 20, CUT_HALF * 2 + 0.2),
        edgeMat,
      )
      edge.rotation.x = -Math.PI / 2
      edge.rotation.z = -(CUT_MID + CUT_HALF + 0.1)
      edge.position.y = y + 1.0
      group.add(edge)

      // Structural band where the deck meets the wall. On level 1 it stops at
      // the rooms: it runs at 4 m, and carried on through it cut straight
      // across the cafeteria window.
      // On level 1 it also stops either side of the creed wall.
      // The cafeteria's gate is taller than the band, so it stops either
      // side of it too; the office door is lower and passes under.
      const gateHalf = (HALL_GATE.halfW + 0.15) / SHAFT_RADIUS
      const bandArcs: Array<[number, number]> =
        floor.level === 1
          ? [
              [CREED.to + 0.03, HALL_F.angle - gateHalf],
              [HALL_F.angle + gateHalf, CREED.from - 0.03 + Math.PI * 2],
            ]
          : // Elsewhere it stops either side of the level's record display,
            // and either side of every gate tall enough to reach it -- a gate
            // used to run straight through the band and its line of light.
            (() => {
              const { from, to } = recordWallSpan(floor.level)
              // The underside of the band, with its line of light, less a margin.
              const bandFoot = levelY(floor.level) + 2.2 - 0.25
              const cuts = openingsOn(floor.level)
                .filter((o) => o.centreY + o.halfH + 0.2 > bandFoot)
                .map((o) => [o.angle, (o.halfW + 0.35) / SHAFT_RADIUS] as const)
              return cutArcs([[to + 0.03, from - 0.03 + Math.PI * 2]], cuts)
            })()
      for (const [from, to] of bandArcs) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(SHAFT_RADIUS - 0.26, 0.1, 6, 80, to - from), steel)
        band.rotation.x = -Math.PI / 2
        // Torus arc [0, L] lands on world angles [A - L, A] for rotation.z = -A.
        band.rotation.z = -to
        band.position.y = levelY(floor.level) + 2.2
        group.add(band)
        // A light line just under the band, right round the level: the one
        // continuous line of light that says this wall is built, not dug.
        const line = new THREE.Mesh(new THREE.TorusGeometry(SHAFT_RADIUS - 0.3, 0.022, 4, 160, to - from), bandLight)
        line.rotation.x = -Math.PI / 2
        line.rotation.z = -to
        line.position.y = levelY(floor.level) + 2.2 - 0.14
        group.add(line)
      }
    })
    return group
  }, [])

  return <primitive object={nodes} />
}

/** Wall lamps. Emissive geometry only; the real lights follow the camera. */
function Lamps() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const total = FLOORS.length * LAMPS_PER_FLOOR
    const bulbs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.1, 0.18, 0.34),
      new THREE.MeshStandardMaterial({
        color: PALETTE.brassHot,
        emissive: new THREE.Color(PALETTE.brassHot),
        emissiveIntensity: 1.4,
        roughness: 0.4,
      }),
      total,
    )
    const housings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.36, 0.16, 0.5),
      new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.6, metalness: 0.7 }),
      total,
    )

    let n = 0
    FLOORS.forEach((floor) => {
      const y = levelY(floor.level)
      for (const a of lampAngles(floor.level)) {
        const r = SHAFT_RADIUS - 0.62
        faceAxis(bulbs, n, Math.cos(a) * r, y + 1.5, Math.sin(a) * r)
        faceAxis(housings, n, Math.cos(a) * r, y + 1.68, Math.sin(a) * r)
        n++
      }
    })
    bulbs.count = n
    housings.count = n
    bulbs.instanceMatrix.needsUpdate = true
    housings.instanceMatrix.needsUpdate = true
    group.add(bulbs, housings)
    return group
  }, [])

  return <primitive object={nodes} />
}

/**
 * A steel threshold across the foot of every gate in the wall. The deck stops
 * a few centimetres short of the wall's face and a room's floor starts at it,
 * so without one there was a dark slot underfoot in every doorway, with the
 * deck's edge showing down it. The cafeteria has its own step, so not there.
 */
function GateSills() {
  const mesh = useMemo(() => {
    const list = OPENINGS.filter((o) => !(o.level === 1 && Math.abs(o.angle - HALL_F.angle) < 0.01))
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mat = new THREE.MeshStandardMaterial({ color: '#3b3f44', roughness: 0.38, metalness: 0.85 })
    const m = new THREE.InstancedMesh(geo, mat, list.length)
    const o3 = new THREE.Object3D()
    list.forEach((o, i) => {
      // The gate's half-width at its floor: where a rounded outline sunk
      // under the floor crosses it.
      const floorY = walkY(o.level)
      const dy = Math.abs(floorY + 0.02 - o.centreY)
      const straight = o.halfH - o.radius
      const k = Math.max(0, dy - straight)
      const half = dy <= straight ? o.halfW : Math.max(0.6, o.halfW - o.radius + Math.sqrt(Math.max(0, o.radius ** 2 - k ** 2)))
      const r = SHAFT_RADIUS + 0.05
      o3.position.set(Math.cos(o.angle) * r, floorY + 0.004, Math.sin(o.angle) * r)
      o3.rotation.set(0, -o.angle, 0)
      // Local X runs out through the wall, Z across the gate.
      o3.scale.set(1.0, 0.02, half * 2 + 0.3)
      o3.updateMatrix()
      m.setMatrixAt(i, o3.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.receiveShadow = true
    return m
  }, [])
  return <primitive object={mesh} />
}

export default function Structure() {
  return (
    <group>
      <ConcreteWall />
      <StrataBackdrop />
      <Ribs />
      <Decks />
      <GateSills />
      <Stairway />
      <Lamps />
      <Water />
    </group>
  )
}
