// Owns the renderer, the camera rig and the loop. The camera rides the same
// helix as the stair: scrolling lowers it, and because the angle is a function
// of depth, descending also turns you — so each landing faces a fresh wall.
import * as THREE from 'three'
import { buildSilo } from './scene'
import {
  CAM_RADIUS,
  DECK_DROP,
  DEPTH,
  EYE,
  FLOORS,
  FLOOR_HEIGHT,
  PALETTE,
  SHAFT_RADIUS,
  angleAt,
  floorY,
} from './config'

const LOOK_LIMIT_YAW = 0.85
const LOOK_LIMIT_PITCH = 0.42
// How strongly the camera is pulled toward the nearest landing. Enough to make
// floors feel like destinations, loose enough that it never fights a scroll.
const MAGNET = 0.34

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt))

export function createViewer(canvas, { onFloorChange, portraitUrl }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.9))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.92

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(PALETTE.void)
  // Exponential fog does the heavy lifting: it hides the far ends of a 90-unit
  // shaft, sells the depth, and means nothing distant is worth shading.
  scene.fog = new THREE.FogExp2(PALETTE.void, 0.016)

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 220)

  scene.add(new THREE.AmbientLight('#6d5f55', 0.11))
  const down = new THREE.DirectionalLight(PALETTE.brassHot, 0.22)
  down.position.set(0, 40, 6)
  scene.add(down)

  // Two pooled point lights that follow you down, instead of one per floor.
  const lampA = new THREE.PointLight(PALETTE.brassHot, 42, 20, 2)
  const lampB = new THREE.PointLight(PALETTE.brass, 26, 24, 2)
  scene.add(lampA, lampB)

  let silo = null
  let motes = null
  const loader = new THREE.TextureLoader()

  const ready = new Promise((resolve) => {
    loader.load(
      portraitUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        const built = buildSilo(tex)
        silo = built.root
        motes = built.motes
        scene.add(silo)
        resolve()
      },
      undefined,
      () => {
        // No portrait (offline, 404): still build the silo, just without it.
        const built = buildSilo(null)
        silo = built.root
        motes = built.motes
        scene.add(silo)
        resolve()
      },
    )
  })

  // --- camera state -------------------------------------------------------
  let targetY = 0
  let currentY = 0
  const look = { yaw: 0, pitch: 0 }
  const lookTarget = { yaw: 0, pitch: 0 }
  let activeFloor = -1
  let running = true
  let last = performance.now()

  const tmpPos = new THREE.Vector3()
  const tmpLook = new THREE.Vector3()

  function setProgress(p) {
    const raw = -clamp(p, 0, 1) * DEPTH
    // Pull toward the nearest landing so floors feel like stops on a stair.
    const nearest = Math.round(raw / FLOOR_HEIGHT) * FLOOR_HEIGHT
    targetY = raw + (nearest - raw) * MAGNET
  }

  function setLook(yaw, pitch) {
    lookTarget.yaw = clamp(yaw, -LOOK_LIMIT_YAW, LOOK_LIMIT_YAW)
    lookTarget.pitch = clamp(pitch, -LOOK_LIMIT_PITCH, LOOK_LIMIT_PITCH)
  }

  // Hold the HORIZONTAL field of view constant instead of the vertical one.
  // Three.js fov is vertical, so on a tall phone the horizontal view narrows
  // and anything placed off-axis — the window on floor 1 — slides out of frame.
  const H_FOV = 64
  function resize() {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    const aspect = w / h
    camera.aspect = aspect
    const vFov = (2 * Math.atan(Math.tan((H_FOV * Math.PI) / 360) / aspect) * 180) / Math.PI
    camera.fov = Math.min(100, Math.max(44, vFov))
    camera.updateProjectionMatrix()
  }

  function frame(now) {
    if (!running) return
    requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    currentY = damp(currentY, targetY, 4.2, dt)
    look.yaw = damp(look.yaw, lookTarget.yaw, 7, dt)
    look.pitch = damp(look.pitch, lookTarget.pitch, 7, dt)

    const a = angleAt(currentY)
    // Stand on the deck at human eye height, looking outward and slightly down
    // so the deck, the wall and the lamps are all in frame.
    const eyeY = currentY - DECK_DROP + EYE
    tmpPos.set(Math.cos(a) * CAM_RADIUS, eyeY, Math.sin(a) * CAM_RADIUS)
    camera.position.copy(tmpPos)
    tmpLook.set(Math.cos(a) * SHAFT_RADIUS, eyeY + 0.2, Math.sin(a) * SHAFT_RADIUS)
    camera.lookAt(tmpLook)
    camera.rotateY(look.yaw)
    camera.rotateX(look.pitch)

    lampA.position.set(Math.cos(a) * (SHAFT_RADIUS - 3), currentY + 1.4, Math.sin(a) * (SHAFT_RADIUS - 3))
    lampB.position.set(Math.cos(a + 2.2) * (SHAFT_RADIUS - 3), currentY - FLOOR_HEIGHT * 0.5, Math.sin(a + 2.2) * (SHAFT_RADIUS - 3))

    if (motes) motes.rotation.y = now * 0.000018

    const nearest = clamp(Math.round(-currentY / FLOOR_HEIGHT), 0, FLOORS.length - 1)
    if (nearest !== activeFloor) {
      activeFloor = nearest
      onFloorChange?.(nearest, Math.abs(currentY - floorY(nearest)))
    }

    renderer.render(scene, camera)
  }

  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    window.__silo = { scene, camera, renderer }
  }

  resize()
  requestAnimationFrame(frame)

  return {
    ready,
    setProgress,
    setLook,
    resize,
    get activeFloor() {
      return activeFloor
    },
    dispose() {
      running = false
      scene.traverse((o) => {
        o.geometry?.dispose?.()
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose())
        else o.material?.dispose?.()
      })
      renderer.dispose()
    },
  }
}
