import { useMemo } from 'react'
import * as THREE from 'three'
import {
  BAYS,
  BOTTOM,
  CUT_HALF,
  CUT_MID,
  DECK_INNER,
  FLOORS,
  FLOOR_HEIGHT,
  PALETTE,
  SHAFT_RADIUS,
  SLOT,
  STAIR_RADIUS,
  STAIR_WIDTH,
  STEP_RISE,
  TOP_MARGIN,
  WALL_ARC,
  WALL_CENTER,
  WALL_HEIGHT,
  WALL_THETA_START,
  WALL_THICK,
  cutTheta,
  contentAngle,
  deckY,
  inCut,
  levelY,
} from '../content/floors'
import { concreteSurface, plateSurface, steelSurface, tiled } from './materials'

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

/** Every angle a level's fit-out occupies — nothing structural may stand here. */
function fitOutAngles() {
  const out: number[] = []
  FLOORS.forEach((f) => {
    const base = contentAngle(f.level)
    Object.values(SLOT).forEach((off) => out.push(base + off))
  })
  return out
}

/** Clear of every fit-out slot on every level, by `pad` radians. */
function clearOfFitOut(angles: number[], a: number, pad: number) {
  return angles.every((b) => {
    const d = Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
    return d > pad
  })
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
      const dark = new THREE.Color('#9d9289')
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

    // Arc length is about 69 units and the wall is 157 tall, so this tiles the
    // concrete at roughly four units a side.
    const concrete = tiled(concreteSurface(), 17, 39)
    const shell = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      map: concrete.map,
      normalMap: concrete.normalMap,
      roughnessMap: concrete.roughnessMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
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
    const perFloor = 14
    const height = FLOOR_HEIGHT - 0.4
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.8, height, 0.6),
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
      FLOORS.length * perFloor,
    )

    let n = 0
    FLOORS.forEach((floor) => {
      const base = contentAngle(floor.level)
      const slots = Object.values(SLOT).map((off) => base + off)
      const y = levelY(floor.level) + 1.4
      for (let i = 0; i < perFloor; i++) {
        const a = base + (i / perFloor) * Math.PI * 2
        if (inCut(a, 0.12) || !clearOfFitOut(slots, a, 0.3)) continue
        faceAxis(
          mesh,
          n,
          Math.cos(a) * (SHAFT_RADIUS - 0.32),
          y,
          Math.sin(a) * (SHAFT_RADIUS - 0.32),
        )
        n++
      }
    })
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    return mesh
  }, [])
  return <primitive object={ref} />
}

function Decks() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const deckGeo = new THREE.RingGeometry(DECK_INNER, SHAFT_RADIUS - 0.06, 80, 1)
    const plate = tiled(plateSurface(), 18, 18)
    const deckMat = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0.12,
      // Top face only. The underside of a deck is always seen at a grazing
      // angle from the level below, which is the worst case for a tiled normal
      // map — it shimmers into vertical streaks. The soffit below handles it.
      side: THREE.FrontSide,
      map: plate.map,
      normalMap: plate.normalMap,
      roughnessMap: plate.roughnessMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
    })
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

    FLOORS.forEach((floor) => {
      const y = deckY(floor.level)

      const deck = new THREE.Mesh(deckGeo, deckMat)
      deck.rotation.x = -Math.PI / 2
      deck.position.y = y
      group.add(deck)

      // Ceiling for the level below: plain, so nothing shimmers overhead.
      const soffit = new THREE.Mesh(deckGeo, soffitMat)
      soffit.rotation.x = Math.PI / 2
      soffit.position.y = y - 0.26
      group.add(soffit)

      // Lip and handrail around the stairwell opening.
      const lip = new THREE.Mesh(new THREE.TorusGeometry(DECK_INNER, 0.1, 8, 80), steel)
      lip.rotation.x = -Math.PI / 2
      lip.position.y = y + 0.05
      group.add(lip)

      const rail = new THREE.Mesh(new THREE.TorusGeometry(DECK_INNER, 0.055, 6, 80), steel)
      rail.rotation.x = -Math.PI / 2
      rail.position.y = y + 1.05
      group.add(rail)

      const n = 52
      const posts = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1.05, 6),
        steel,
        n,
      )
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        dummy.position.set(Math.cos(a) * DECK_INNER, y + 0.52, Math.sin(a) * DECK_INNER)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        posts.setMatrixAt(i, dummy.matrix)
      }
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

      // Structural band where the deck meets the wall.
      const band = new THREE.Mesh(new THREE.TorusGeometry(SHAFT_RADIUS - 0.26, 0.1, 6, 80), steel)
      band.rotation.x = -Math.PI / 2
      band.position.y = levelY(floor.level) + 2.2
      group.add(band)
    })
    return group
  }, [])

  return <primitive object={nodes} />
}

/**
 * Radial corridors. Each deck is divided into BAYS bays by a floor kerb, a
 * waist-high bulkhead and an overhead joist, which is what turns a bare ring
 * into circulation space. Bays holding a fit-out slot, and bays in the
 * cutaway, are left open.
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
    // Tiling must follow the proportions of the thing it is on. Stretching a
    // patterned texture across a long, short face turns it into stripes.
    const panelSteel = tiled(steelSurface(), 6, 1.5)
    const panel = new THREE.MeshStandardMaterial({
      roughness: 0.78,
      metalness: 0.18,
      map: panelSteel.map,
      normalMap: panelSteel.normalMap,
      roughnessMap: panelSteel.roughnessMap,
    })

    const joists = new THREE.InstancedMesh(new THREE.BoxGeometry(span, 0.34, 0.46), steel, max)
    const kerbs = new THREE.InstancedMesh(new THREE.BoxGeometry(span, 0.12, 0.34), steel, max)
    const bulkheads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(span * 0.62, 1.15, 0.14),
      panel,
      max,
    )
    const hangers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), steel, max)

    const slots = fitOutAngles()
    let n = 0
    FLOORS.forEach((floor) => {
      const base = contentAngle(floor.level)
      const deck = deckY(floor.level)
      const mid = DECK_INNER + span / 2
      for (let k = 0; k < BAYS; k++) {
        const a = base + ((k + 0.5) / BAYS) * Math.PI * 2
        if (inCut(a, 0.06) || !clearOfFitOut(slots, a, 0.26)) continue
        radial(joists, n, a, mid, levelY(floor.level) + 2.6)
        radial(kerbs, n, a, mid, deck + 0.1)
        radial(bulkheads, n, a, mid, deck + 0.64)
        radial(hangers, n, a, SHAFT_RADIUS - 2.2, levelY(floor.level) + 3.4)
        n++
      }
    })

    for (const mesh of [joists, kerbs, bulkheads, hangers]) {
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      group.add(mesh)
    }
    return group
  }, [])

  return <primitive object={nodes} />
}

/** Spiral stair running the full depth, as one instanced mesh of treads. */
function Stairs() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const steps = Math.floor((TOP_MARGIN - BOTTOM) / STEP_RISE)
    const treads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(STAIR_WIDTH, 0.14, 1.0),
      (() => {
        const t = tiled(plateSurface(), 2, 1)
        return new THREE.MeshStandardMaterial({
          roughness: 0.7,
          metalness: 0.25,
          map: t.map,
          normalMap: t.normalMap,
          roughnessMap: t.roughnessMap,
        })
      })(),
      steps,
    )

    // One continuous helix, independent of the per-level content rotation.
    const turn = (y: number) => (-y / 11) * Math.PI * 0.52 + Math.PI * 0.5
    for (let i = 0; i < steps; i++) {
      const y = TOP_MARGIN - i * STEP_RISE
      const a = turn(y)
      faceAxis(treads, i, Math.cos(a) * STAIR_RADIUS, y, Math.sin(a) * STAIR_RADIUS)
    }
    treads.instanceMatrix.needsUpdate = true
    group.add(treads)

    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= steps; i += 2) {
      const y = TOP_MARGIN - i * STEP_RISE
      const a = turn(y)
      pts.push(
        new THREE.Vector3(
          Math.cos(a) * (STAIR_RADIUS + 0.68),
          y + 1.0,
          Math.sin(a) * (STAIR_RADIUS + 0.68),
        ),
      )
    }
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.05, 6, false),
        new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.34, metalness: 0.88 }),
      ),
    )
    return group
  }, [])

  return <primitive object={nodes} />
}

/** Wall lamps. Emissive geometry only; the real lights follow the camera. */
function Lamps() {
  const nodes = useMemo(() => {
    const group = new THREE.Group()
    const perFloor = 6
    const total = FLOORS.length * perFloor
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
      for (let k = 0; k < perFloor; k++) {
        const a = (k / perFloor) * Math.PI * 2 + contentAngle(floor.level)
        if (inCut(a, 0.06)) continue
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

function Caps() {
  return (
    <>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, TOP_MARGIN + 9, 0]}>
        <circleGeometry args={[SHAFT_RADIUS, 56]} />
        <meshStandardMaterial color={PALETTE.concreteDark} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BOTTOM + 1, 0]}>
        <circleGeometry args={[SHAFT_RADIUS, 56]} />
        <meshStandardMaterial color={PALETTE.concreteDark} roughness={1} side={THREE.DoubleSide} />
      </mesh>
    </>
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
      <Stairs />
      <Lamps />
      <Caps />
    </group>
  )
}
