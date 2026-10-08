// Hero centrepiece: a wireframe globe turned so Bangladesh faces the viewer,
// with shipment arcs running between real cities and a pulse travelling each
// lane. Same subject as the logistics projects and the published op-ed.
import { makeDotTexture, cappedDpr } from './env'

// Real coordinates — these are the hubs the logistics projects actually model.
const CITIES = [
  { name: 'Dhaka', lat: 23.8103, lon: 90.4125, hub: true },
  { name: 'Chattogram', lat: 22.3569, lon: 91.7832, hub: true },
  { name: 'Khulna', lat: 22.8456, lon: 89.5403 },
  { name: 'Rajshahi', lat: 24.3745, lon: 88.6042 },
  { name: 'Sylhet', lat: 24.8949, lon: 91.8687 },
  { name: 'Rangpur', lat: 25.7439, lon: 89.2752 },
  { name: 'Barishal', lat: 22.701, lon: 90.3535 },
  { name: 'Mymensingh', lat: 24.7471, lon: 90.4203 },
  { name: "Cox's Bazar", lat: 21.4272, lon: 91.97 },
  { name: 'Jashore', lat: 23.1667, lon: 89.2167 },
]

// Lanes: everything through the two hubs, plus a few lateral links so the
// network does not read as a pure star.
const LANES = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 9],
  [1, 8], [1, 4], [1, 6], [2, 9], [3, 5], [2, 6],
]

const RADIUS = 2

// Bangladesh spans ~4 degrees of latitude. At true scale on a whole globe the
// lane network is a pinprick, so the cluster is scaled up about its own
// centroid: the SHAPE of the network stays true (Dhaka central, Chattogram
// south-east, Rangpur north) while the overall span is exaggerated enough to
// read. This is hero art, not a map.
const SPREAD = 3.1
const CENTRE = { lat: 23.6, lon: 90.4 }

function latLonToVec3(THREE, lat, lon, radius = RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

/** Lat/long wireframe. Built by hand rather than from SphereGeometry's wireframe,
 *  which triangulates and looks like a net instead of a globe. */
function buildGraticule(THREE, color, opacity) {
  const pts = []
  const SEG = 72
  for (let i = 1; i < 18; i++) {
    const lat = -90 + i * 10
    for (let s = 0; s < SEG; s++) {
      pts.push(latLonToVec3(THREE, lat, (s / SEG) * 360 - 180, RADIUS * 1.001))
      pts.push(latLonToVec3(THREE, lat, ((s + 1) / SEG) * 360 - 180, RADIUS * 1.001))
    }
  }
  for (let m = 0; m < 36; m++) {
    const lon = m * 10 - 180
    for (let s = 0; s < SEG / 2; s++) {
      pts.push(latLonToVec3(THREE, (s / (SEG / 2)) * 180 - 90, lon, RADIUS * 1.001))
      pts.push(latLonToVec3(THREE, ((s + 1) / (SEG / 2)) * 180 - 90, lon, RADIUS * 1.001))
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  )
}

export function createGlobe(THREE, canvas, { palette }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(cappedDpr())

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50)
  camera.position.set(0, 0, 3.35)

  const globe = new THREE.Group()
  scene.add(globe)

  const accent = new THREE.Color(palette.colors[0])
  const accent2 = new THREE.Color(palette.colors[1])
  const accent3 = new THREE.Color(palette.colors[2])

  // An OPAQUE body, deliberately: it writes depth, so arcs on the far side are
  // culled and the network reads as a sphere. Making it merely translucent puts
  // it in the transparent pass, where it sorts in front of the arcs and dims
  // every lane to near-invisible.
  //
  // It is also *lit* rather than flat-shaded. The camera sits close enough that
  // the sphere overflows the frame, so there is no silhouette to read; the
  // shading terminator is what makes it look like a ball instead of a disc.
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS, 64, 48),
    new THREE.MeshPhongMaterial({
      color: new THREE.Color(palette.dark ? '#0a2036' : '#123451'),
      shininess: 6,
      specular: new THREE.Color('#1b4a6b'),
    }),
  )
  globe.add(body)

  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const key = new THREE.DirectionalLight(0xffffff, 1.5)
  key.position.set(-2.5, 2.4, 3.2)
  scene.add(key)
  const rim = new THREE.DirectionalLight(accent.clone(), 0.9)
  rim.position.set(3, -1.5, -1)
  scene.add(rim)

  globe.add(buildGraticule(THREE, accent, palette.dark ? 0.26 : 0.34))

  // City markers
  const cityPos = CITIES.map((c) =>
    latLonToVec3(
      THREE,
      CENTRE.lat + (c.lat - CENTRE.lat) * SPREAD,
      CENTRE.lon + (c.lon - CENTRE.lon) * SPREAD,
      RADIUS * 1.012,
    ),
  )
  const cityVerts = new Float32Array(CITIES.length * 3)
  const cityColors = new Float32Array(CITIES.length * 3)
  CITIES.forEach((city, i) => {
    cityVerts[i * 3] = cityPos[i].x
    cityVerts[i * 3 + 1] = cityPos[i].y
    cityVerts[i * 3 + 2] = cityPos[i].z
    const c = city.hub ? accent3 : accent2
    cityColors[i * 3] = c.r
    cityColors[i * 3 + 1] = c.g
    cityColors[i * 3 + 2] = c.b
  })
  const cityGeo = new THREE.BufferGeometry()
  cityGeo.setAttribute('position', new THREE.BufferAttribute(cityVerts, 3))
  cityGeo.setAttribute('color', new THREE.BufferAttribute(cityColors, 3))
  const cityMat = new THREE.PointsMaterial({
    size: 0.05,
    map: makeDotTexture(THREE),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  globe.add(new THREE.Points(cityGeo, cityMat))

  // Arcs. The control point lifts with lane length so long lanes bow higher,
  // which is what makes the network read as 3D rather than painted on.
  const curves = []
  const arcPts = []
  const arcColors = []
  const ARC_SEG = 44
  LANES.forEach(([a, b]) => {
    const from = cityPos[a]
    const to = cityPos[b]
    const mid = from.clone().add(to).multiplyScalar(0.5)
    const lift = 1 + 0.05 + from.distanceTo(to) * 0.42
    mid.normalize().multiplyScalar(RADIUS * lift)
    const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone())
    curves.push(curve)
    const samples = curve.getPoints(ARC_SEG)
    for (let s = 0; s < samples.length - 1; s++) {
      arcPts.push(samples[s], samples[s + 1])
      // Fade each lane in from its origin so the arcs feel directional.
      const t0 = s / samples.length
      const t1 = (s + 1) / samples.length
      const c0 = accent.clone().lerp(accent3, t0)
      const c1 = accent.clone().lerp(accent3, t1)
      arcColors.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b)
    }
  })
  const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPts)
  arcGeo.setAttribute('color', new THREE.Float32BufferAttribute(arcColors, 3))
  globe.add(
    new THREE.LineSegments(
      arcGeo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  )

  // One pulse per lane, travelling origin -> destination on its own offset.
  const pulseCount = curves.length
  const pulseVerts = new Float32Array(pulseCount * 3)
  const pulseOffset = curves.map((_, i) => i / pulseCount)
  const pulseGeo = new THREE.BufferGeometry()
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulseVerts, 3))
  const pulses = new THREE.Points(
    pulseGeo,
    new THREE.PointsMaterial({
      size: 0.038,
      map: makeDotTexture(THREE),
      color: palette.dark ? 0xffffff : accent3,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  globe.add(pulses)

  // Face the camera at the cluster's centre, not at Dhaka: the cities are scaled
  // about CENTRE, so centring on Dhaka's own position leaves the network sitting
  // off to one side of the frame.
  const centre = latLonToVec3(THREE, CENTRE.lat, CENTRE.lon).normalize()
  const home = new THREE.Quaternion().setFromUnitVectors(centre, new THREE.Vector3(0, 0, 1))
  globe.quaternion.copy(home)

  const drift = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const pointer = { x: 0, y: 0 }
  const target = { x: 0, y: 0 }

  function resize(width, height) {
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  function update(time) {
    target.x += (pointer.x - target.x) * 0.06
    target.y += (pointer.y - target.y) * 0.06

    // Gentle oscillation rather than a full spin: a full rotation would hide
    // Bangladesh — the whole point of the piece — for half of every cycle.
    euler.set(
      -0.04 + target.y * 0.1 + Math.sin(time * 0.00021) * 0.03,
      Math.sin(time * 0.00013) * 0.1 + target.x * 0.14,
      0,
    )
    drift.setFromEuler(euler)
    globe.quaternion.copy(drift).multiply(home)

    for (let i = 0; i < pulseCount; i++) {
      const t = (time * 0.00009 + pulseOffset[i]) % 1
      const p = curves[i].getPoint(t)
      pulseVerts[i * 3] = p.x
      pulseVerts[i * 3 + 1] = p.y
      pulseVerts[i * 3 + 2] = p.z
    }
    pulseGeo.attributes.position.needsUpdate = true
    cityMat.size = 0.048 + Math.sin(time * 0.0016) * 0.008

    renderer.render(scene, camera)
  }

  return {
    update,
    resize,
    setPointer(x, y) {
      pointer.x = x
      pointer.y = y
    },
    dispose() {
      scene.traverse((obj) => {
        obj.geometry?.dispose()
        obj.material?.dispose()
      })
      renderer.dispose()
    },
  }
}
