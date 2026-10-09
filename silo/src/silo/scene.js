// Builds the silo: an original industrial shaft — concrete wall, ring decks
// around a central stairwell, a spiral stair running the full depth, and a
// shaft of daylight from the sealed top that dies out a few levels down.
import * as THREE from 'three'
import {
  BOTTOM,
  CONTENT_OFFSET,
  DECK_INNER,
  FLOORS,
  PALETTE,
  SHAFT_RADIUS,
  STAIR_RADIUS,
  STAIR_WIDTH,
  STEP_RISE,
  TOP_MARGIN,
  WALL_CENTER,
  WALL_HEIGHT,
  angleAt,
  deckY,
  floorY,
} from './config'

/** Deterministic noise so the concrete mottling is identical every load. */
function makeRandom(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/** Places an instance facing the shaft axis. InstancedMesh has no per-instance
 *  lookAt, so a throwaway Object3D does the orientation maths. */
const dummy = new THREE.Object3D()
function faceAxis(mesh, i, x, y, z, { flip = false } = {}) {
  dummy.position.set(x, y, z)
  dummy.lookAt(flip ? x * 2 : 0, y, flip ? z * 2 : 0)
  dummy.updateMatrix()
  mesh.setMatrixAt(i, dummy.matrix)
}

function concreteWall() {
  const geo = new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, WALL_HEIGHT, 80, 60, true)
  // Mottle the concrete with vertex colours instead of a texture: no download,
  // no UV seam on a cylinder, and it reads correctly at every distance.
  const rand = makeRandom(9)
  const base = new THREE.Color(PALETTE.concrete)
  const dark = new THREE.Color(PALETTE.concreteDark)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const blotch = (Math.sin(y * 0.7 + pos.getX(i) * 0.4) + Math.sin(pos.getZ(i) * 0.6 - y * 0.25)) * 0.25
    const c = base.clone().lerp(dark, Math.min(1, Math.max(0, 0.3 + blotch + rand() * 0.34)))
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const wall = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
      side: THREE.BackSide,
    }),
  )
  wall.position.y = WALL_CENTER
  return wall
}

/** Vertical pilasters: the detail that stops the wall reading as a plain tube. */
function ribs() {
  const count = 24
  const geo = new THREE.BoxGeometry(0.75, WALL_HEIGHT, 0.55)
  const mat = new THREE.MeshStandardMaterial({ color: PALETTE.concreteDark, roughness: 0.92 })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    faceAxis(mesh, i, Math.cos(a) * (SHAFT_RADIUS - 0.3), WALL_CENTER, Math.sin(a) * (SHAFT_RADIUS - 0.3))
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

/** Horizontal band at every deck level, so depth is legible at a glance. */
function bands() {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.6, metalness: 0.5 })
  FLOORS.forEach((f) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(SHAFT_RADIUS - 0.26, 0.1, 6, 72), mat)
    band.rotation.x = -Math.PI / 2
    band.position.y = floorY(f.index) + 2.1
    group.add(band)
  })
  return group
}

function decks() {
  const group = new THREE.Group()
  const deckGeo = new THREE.RingGeometry(DECK_INNER, SHAFT_RADIUS - 0.06, 72, 1)
  const deckMat = new THREE.MeshStandardMaterial({
    color: PALETTE.deck,
    roughness: 0.88,
    metalness: 0.18,
    side: THREE.DoubleSide,
  })
  const steel = new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.45, metalness: 0.78 })

  FLOORS.forEach((floor) => {
    const y = deckY(floor.index)
    const deck = new THREE.Mesh(deckGeo, deckMat)
    deck.rotation.x = -Math.PI / 2
    deck.position.y = y
    group.add(deck)

    // Lip around the stairwell, and the handrail above it.
    const lip = new THREE.Mesh(new THREE.TorusGeometry(DECK_INNER, 0.09, 8, 72), steel)
    lip.rotation.x = -Math.PI / 2
    lip.position.y = y + 0.05
    group.add(lip)

    const rail = new THREE.Mesh(new THREE.TorusGeometry(DECK_INNER, 0.055, 6, 72), steel)
    rail.rotation.x = -Math.PI / 2
    rail.position.y = y + 1.05
    group.add(rail)

    // Balusters.
    const n = 44
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 6), steel, n)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      dummy.position.set(Math.cos(a) * DECK_INNER, y + 0.52, Math.sin(a) * DECK_INNER)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      post.setMatrixAt(i, dummy.matrix)
    }
    post.instanceMatrix.needsUpdate = true
    group.add(post)
  })
  return group
}

/** The spiral stair, as one instanced mesh of treads winding the full depth. */
function stairs() {
  const steps = Math.floor((TOP_MARGIN - BOTTOM) / STEP_RISE)
  const geo = new THREE.BoxGeometry(STAIR_WIDTH, 0.14, 1.0)
  const mat = new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.55, metalness: 0.68 })
  const mesh = new THREE.InstancedMesh(geo, mat, steps)

  for (let i = 0; i < steps; i++) {
    const y = TOP_MARGIN - i * STEP_RISE
    const a = angleAt(y)
    faceAxis(mesh, i, Math.cos(a) * STAIR_RADIUS, y, Math.sin(a) * STAIR_RADIUS)
  }
  mesh.instanceMatrix.needsUpdate = true

  const group = new THREE.Group()
  group.add(mesh)

  // Handrail: one tube following the same helix, further out.
  const pts = []
  for (let i = 0; i <= steps; i += 2) {
    const y = TOP_MARGIN - i * STEP_RISE
    const a = angleAt(y)
    pts.push(new THREE.Vector3(Math.cos(a) * (STAIR_RADIUS + 0.72), y + 1.0, Math.sin(a) * (STAIR_RADIUS + 0.72)))
  }
  group.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.05, 6, false),
      new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.34, metalness: 0.88 }),
    ),
  )

  // Central column the stair wraps around.
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, TOP_MARGIN - BOTTOM, 18),
    new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.5, metalness: 0.8 }),
  )
  column.position.y = (TOP_MARGIN + BOTTOM) / 2
  group.add(column)

  return group
}

/** Wall lamps at every level. Emissive geometry only — the actual lights are a
 *  pair pooled in the viewer and moved to whichever floor you are on. */
function lamps() {
  const group = new THREE.Group()
  const bulbGeo = new THREE.BoxGeometry(1.1, 0.18, 0.34)
  const bulbMat = new THREE.MeshStandardMaterial({
    color: PALETTE.brassHot,
    emissive: new THREE.Color(PALETTE.brassHot),
    emissiveIntensity: 1.5,
    roughness: 0.4,
  })
  const housingGeo = new THREE.BoxGeometry(1.34, 0.16, 0.5)
  const housingMat = new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.6, metalness: 0.7 })

  const perFloor = 6
  const total = FLOORS.length * perFloor
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, total)
  const housings = new THREE.InstancedMesh(housingGeo, housingMat, total)

  let n = 0
  FLOORS.forEach((floor) => {
    const y = floorY(floor.index)
    for (let k = 0; k < perFloor; k++) {
      const a = (k / perFloor) * Math.PI * 2 + angleAt(y)
      const r = SHAFT_RADIUS - 0.6
      faceAxis(bulbs, n, Math.cos(a) * r, y + 1.5, Math.sin(a) * r)
      faceAxis(housings, n, Math.cos(a) * r, y + 1.68, Math.sin(a) * r)
      n++
    }
  })
  bulbs.instanceMatrix.needsUpdate = true
  housings.instanceMatrix.needsUpdate = true
  group.add(bulbs, housings)
  return group
}

/** Daylight from the sealed top, dying out a few levels down. */
function skyShaft() {
  const h = 42
  const geo = new THREE.CylinderGeometry(1.6, SHAFT_RADIUS * 0.8, h, 36, 1, true)
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(PALETTE.brassHot) } },
    vertexShader: `
      varying float vFade;
      void main() {
        vFade = uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vFade;
      void main() {
        gl_FragColor = vec4(uColor, pow(vFade, 3.0) * 0.14);
      }
    `,
  })
  const cone = new THREE.Mesh(geo, mat)
  cone.position.y = TOP_MARGIN - h / 2 + 3
  return cone
}

function dust(count = 650) {
  const pos = new Float32Array(count * 3)
  const rand = makeRandom(31)
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2
    const r = 0.8 + rand() * (SHAFT_RADIUS - 1.6)
    pos[i * 3] = Math.cos(a) * r
    pos[i * 3 + 1] = TOP_MARGIN - rand() * (TOP_MARGIN - BOTTOM)
    pos[i * 3 + 2] = Math.sin(a) * r
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: PALETTE.brassHot,
      size: 0.055,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  )
}

/** Floor 1: the window, and the portrait behind it.
 *
 *  Every part of this assembly sits on the +Z side of the group, which after
 *  lookAt() points INTO the shaft. The wall is a cylinder at SHAFT_RADIUS with
 *  no hole in it, so anything placed on -Z is simply behind the wall and
 *  invisible — which is exactly how the portrait went missing the first time.
 *  The depth is faked with a protruding casing instead of a real recess. */
function arrivalWindow(portraitTexture) {
  const group = new THREE.Group()
  const y = floorY(0)
  const a = angleAt(y) + CONTENT_OFFSET
  const r = SHAFT_RADIUS - 0.06
  group.position.set(Math.cos(a) * r, y + 0.35, Math.sin(a) * r)
  group.lookAt(0, y + 0.35, 0)

  const W = 3.0
  const H = 3.0

  // Casing: four slabs forming a border, NOT one solid box. A solid box here
  // spans the aperture and quietly occludes the pane behind it — which is what
  // hid the portrait twice. Anything covering the opening must be hollow.
  const casingMat = new THREE.MeshStandardMaterial({ color: PALETTE.concreteDark, roughness: 0.96 })
  const jamb = 0.575
  const casingBar = (w, h, x, yy) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), casingMat)
    m.position.set(x, yy, 0.18)
    group.add(m)
  }
  casingBar(W + 1.15, jamb, 0, H / 2 + jamb / 2)
  casingBar(W + 1.15, jamb, 0, -H / 2 - jamb / 2)
  casingBar(jamb, H, -W / 2 - jamb / 2, 0)
  casingBar(jamb, H, W / 2 + jamb / 2, 0)

  // Dark backing immediately behind the pane, so the aperture never shows wall.
  const backing = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 0.1, H + 0.1),
    new THREE.MeshBasicMaterial({ color: '#120d0a' }),
  )
  backing.position.z = 0.24
  group.add(backing)

  // Driven from the emissive map: a diffuse-only portrait in a dim shaft reads
  // as brown mush. This is a lit pane, which is the point of the shot.
  const portrait = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({
      map: portraitTexture,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: portraitTexture,
      emissiveIntensity: 1.25,
      roughness: 0.9,
    }),
  )
  portrait.position.z = 0.3
  group.add(portrait)

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshPhysicalMaterial({
      color: '#bccbc4',
      transparent: true,
      opacity: 0.1,
      roughness: 0.05,
      metalness: 0,
      depthWrite: false,
    }),
  )
  glass.position.z = 0.44
  group.add(glass)

  const frameMat = new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.4, metalness: 0.82 })
  const bar = (w, h, x, yy, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.22), frameMat)
    m.position.set(x, yy, z)
    group.add(m)
  }
  bar(W + 0.46, 0.23, 0, H / 2 + 0.115, 0.5)
  bar(W + 0.46, 0.23, 0, -H / 2 - 0.115, 0.5)
  bar(0.23, H + 0.46, -W / 2 - 0.115, 0, 0.5)
  bar(0.23, H + 0.46, W / 2 + 0.115, 0, 0.5)
  // One low transom — a cross would sit straight across the face.
  bar(W, 0.1, 0, -H / 2 + 0.62, 0.47)

  const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), frameMat, 24)
  let n = 0
  for (let i = 0; i < 6; i++) {
    const t = -W / 2 + (i / 5) * W
    for (const yy of [H / 2 + 0.115, -H / 2 - 0.115]) {
      dummy.position.set(t, yy, 0.62)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      rivets.setMatrixAt(n++, dummy.matrix)
    }
  }
  for (let i = 0; i < 6; i++) {
    const t = -H / 2 + (i / 5) * H
    for (const xx of [-W / 2 - 0.115, W / 2 + 0.115]) {
      dummy.position.set(xx, t, 0.62)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      rivets.setMatrixAt(n++, dummy.matrix)
    }
  }
  rivets.count = n
  rivets.instanceMatrix.needsUpdate = true
  group.add(rivets)

  // Light spilling out of the window onto the deck in front of it.
  const spill = new THREE.PointLight(PALETTE.brassHot, 30, 13, 2)
  spill.position.set(0, 0.4, 1.9)
  group.add(spill)

  return group
}

/** Numerals painted on steel plates bolted beside each landing. */
function makePlateTexture(floor) {
  const c = document.createElement('canvas')
  c.width = 320
  c.height = 150
  const ctx = c.getContext('2d')
  ctx.fillStyle = 'rgba(30,25,21,0.96)'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.strokeStyle = 'rgba(201,153,107,0.5)'
  ctx.lineWidth = 4
  ctx.strokeRect(8, 8, c.width - 16, c.height - 16)
  ctx.fillStyle = PALETTE.brassHot
  ctx.font = 'bold 82px "Segoe UI", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(floor.index + 1).padStart(2, '0'), c.width / 2, c.height / 2 - 8)
  ctx.font = 'bold 21px "Segoe UI", system-ui, sans-serif'
  ctx.fillStyle = 'rgba(237,233,230,0.7)'
  ctx.fillText(floor.name.toUpperCase(), c.width / 2, c.height - 30)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  return tex
}

function levelPlates() {
  const group = new THREE.Group()
  FLOORS.forEach((floor) => {
    const y = floorY(floor.index) + 0.6
    const a = angleAt(floorY(floor.index)) - 0.78
    const r = SHAFT_RADIUS - 0.34
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.8),
      new THREE.MeshBasicMaterial({ map: makePlateTexture(floor), transparent: true }),
    )
    plate.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
    plate.lookAt(0, y, 0)
    group.add(plate)
  })
  return group
}

export function buildSilo(portraitTexture) {
  const root = new THREE.Group()
  root.add(concreteWall())
  root.add(ribs())
  root.add(bands())
  root.add(decks())
  root.add(stairs())
  root.add(lamps())
  root.add(levelPlates())
  root.add(skyShaft())

  const motes = dust()
  root.add(motes)

  if (portraitTexture) root.add(arrivalWindow(portraitTexture))

  // Sealed cap at the top, so looking up reads as "no way out".
  const capMat = new THREE.MeshStandardMaterial({ color: PALETTE.concreteDark, roughness: 1, side: THREE.DoubleSide })
  const cap = new THREE.Mesh(new THREE.CircleGeometry(SHAFT_RADIUS, 56), capMat)
  cap.rotation.x = Math.PI / 2
  cap.position.y = TOP_MARGIN + 8
  root.add(cap)

  // Floor of the shaft.
  const base = new THREE.Mesh(new THREE.CircleGeometry(SHAFT_RADIUS, 56), capMat)
  base.rotation.x = -Math.PI / 2
  base.position.y = BOTTOM + 1
  root.add(base)

  return { root, motes }
}
