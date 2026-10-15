import { useMemo } from 'react'
import * as THREE from 'three'
import {
  BAYS,
  BOTTOM,
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
import { CAFE, CREED, SHERIFF } from '../content/level1'
import { RIB, RIBS_PER_FLOOR, LAMPS_PER_FLOOR, bayAngles, lampAngles, recordWallSpan, ribAngles } from '../content/layout'
import Stairway from './Stairway'
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

/** Places a radial member: a box whose local +X runs outward along `angle`. */
function radial(mesh: THREE.InstancedMesh, i: number, angle: number, radius: number, y: number) {
  dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
  dummy.rotation.set(0, -angle, 0)
  dummy.updateMatrix()
  mesh.setMatrixAt(i, dummy.matrix)
}

/**
 * The wall: an arc, not a tube. WALL_ARC leaves the cutaway sector unbuilt,
 * which is what makes the section readable from outside. Inner and outer
 * shells plus two radial cut faces give it real thickness, so the missing
 * panel looks cut away rather than merely absent.
 */
function ConcreteWall() {
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
    const clad = tiled(
      claddingSurface(),
      Math.round((SHAFT_RADIUS * WALL_ARC) / 4),
      Math.round(WALL_HEIGHT / 4),
    )
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
  }, [])

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

  return (
    <mesh geometry={geometry} position={[0, WALL_CENTER, 0]}>
      <meshStandardMaterial
        vertexColors
        roughness={1}
        metalness={0}
        side={THREE.BackSide}
        // The pooled lights cluster on the fit-out, so without a little self
        // illumination the cutaway reads as a hole in the world when you turn
        // towards it rather than as the rock the shaft was bored through.
        emissive={PALETTE.rock}
        emissiveIntensity={2.4}
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
      const bandArcs: Array<[number, number]> =
        floor.level === 1
          ? [
              [SHERIFF.to, CAFE.from],
              [CAFE.to, CREED.from - 0.03 + Math.PI * 2],
              [CREED.to + 0.03, SHERIFF.from],
            ]
          : // Elsewhere it stops either side of the level's record display.
            (() => {
              const { from, to } = recordWallSpan(floor.level)
              return [[to + 0.03, from - 0.03 + Math.PI * 2]] as Array<[number, number]>
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

/**
 * Radial framing. Each deck is divided into bays by a flush floor kerb and an
 * overhead joist with a hanger -- what turns a bare ring into a structure.
 *
 * There used to be a waist-high bulkhead across every bay as well. With a
 * guided camera that was set dressing; with a body it was a row of radial
 * walls across the only way round the ring, every one of which a visitor
 * would either walk into or, having no collision, walk straight through.
 */
function Corridors() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const max = FLOORS.length * BAYS
    const span = SHAFT_RADIUS - DECK_INNER

    const brushed = tiled(steelSurface(), 6, 1)
    const steel = new THREE.MeshStandardMaterial({
      roughness: 0.62,
      metalness: 0.3,
      map: brushed.map,
      normalMap: brushed.normalMap,
      roughnessMap: brushed.roughnessMap,
    })

    const joists = new THREE.InstancedMesh(new THREE.BoxGeometry(span, 0.34, 0.46), steel, max)
    // Flush with the deck: 2 cm proud, so it reads as a seam without being a
    // step the body has to climb at every bay.
    const kerbs = new THREE.InstancedMesh(new THREE.BoxGeometry(span, 0.04, 0.3), steel, max)
    const hangers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), steel, max)

    // One counter PER MESH. Level 1 has no deck above it, so it gets kerbs
    // but no joists or hangers -- and with a single shared counter the slots
    // it skipped were never written, kept the identity matrix, and drew a
    // 13.6 m joist and a hanger at the world origin: straight through the
    // middle of the lift shaft.
    let nk = 0
    let nj = 0
    FLOORS.forEach((floor) => {
      const deck = walkY(floor.level)
      const mid = DECK_INNER + span / 2
      for (const a of bayAngles(floor.level)) {
        if (floor.level > 1) {
          radial(joists, nj, a, mid, levelY(floor.level) + 2.6)
          radial(hangers, nj, a, SHAFT_RADIUS - 2.2, levelY(floor.level) + 3.4)
          nj++
        }
        radial(kerbs, nk++, a, mid, deck + 0.02)
      }
    })

    for (const mesh of [joists, kerbs, hangers]) {
      mesh.count = mesh === kerbs ? nk : nj
      mesh.instanceMatrix.needsUpdate = true
      mesh.castShadow = mesh !== kerbs
      mesh.receiveShadow = true
      group.add(mesh)
    }
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

/** The floor of the pit, below level 12. The top is the dome (Dome.tsx). */
function Caps() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BOTTOM + 1, 0]} receiveShadow>
      <circleGeometry args={[SHAFT_RADIUS, 56]} />
      <meshStandardMaterial color={PALETTE.concreteDark} roughness={1} side={THREE.DoubleSide} />
    </mesh>
  )
}

export default function Structure() {
  return (
    <group>
      <ConcreteWall />
      <StrataBackdrop />
      <Ribs />
      <Decks />
      <Corridors />
      <Stairway />
      <Lamps />
      <Caps />
    </group>
  )
}
