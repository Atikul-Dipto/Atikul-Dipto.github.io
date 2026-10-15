import { Suspense, lazy, useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { AdaptiveDpr, PerformanceMonitor, Preload, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { DECK_INNER, PALETTE, contentAngle, levelY, walkY } from '../content/floors'
import * as stairs from '../content/stairs'
import { dayPhase, daylight, setDayPhase } from '../lib/daylight'
import { useSilo } from '../state/useSilo'
import Structure from './Structure'
import Elevator from './Elevator'
import Exterior from './Exterior'
import Rig from './Rig'
import Effects from './Effects'
import Dome from './Dome'
import Lighting from './Lighting'
import LiftDriver from './LiftDriver'
import Level01 from './floors/Level01'
import { Dust } from './Atmosphere'

/**
 * Rapier inlines its engine as WebAssembly, which is about 850 kB gzipped --
 * more than the rest of the site put together. It is fetched while the
 * visitor watches the approach, so it has usually arrived by the time they
 * are handed a body, and never blocks the first frame.
 */
const loadWalk = () => import('./physics/WalkMode')
const WalkMode = lazy(loadWalk)

/**
 * Only the floor you are on (and its neighbours) mounts its fit-out. With
 * twelve levels of rooms, screens and canvas textures, mounting everything
 * would cost far more than it could ever show at once.
 */
function ActiveFloor() {
  const level = useSilo((s) => s.level)
  const near = Math.abs(1 - level) <= 1
  return <>{near && <Level01 />}</>
}

function Interior() {
  const phase = useSilo((s) => s.phase)
  // Fog is scene-wide; thin it right out for the approach. Inside, it is
  // kept thin enough that the far side of a 44 m atrium still reads.
  const density = phase === 'exterior' ? 0.0011 : 0.0072
  return (
    <>
      <fogExp2 attach="fog" args={[PALETTE.void, density]} />
      <Lighting />
      <Structure />
      <Dome />
      <Dust />
      <Elevator />
      <ActiveFloor />
    </>
  )
}

/**
 * Field of view, held constant HORIZONTALLY so a tall phone does not lose the
 * sides of the room. Wider on foot than for the opening shot: a first-person
 * view at the old 64 degrees made every room feel smaller than it is.
 */
function FovControl() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const mode = useSilo((s) => s.mode)
  useEffect(() => {
    const horizontal = mode === 'walk' ? 86 : 64
    const aspect = size.width / Math.max(1, size.height)
    const v = (2 * Math.atan(Math.tan((horizontal * Math.PI) / 360) / aspect) * 180) / Math.PI
    camera.fov = Math.min(100, Math.max(44, v))
    camera.updateProjectionMatrix()
  }, [camera, size, mode])
  return null
}

/**
 * Holds the boot screen until the scene's assets have actually resolved, and
 * reports real progress while they load.
 */
function LoadGate() {
  const { progress, active } = useProgress()
  const setProgress = useSilo((s) => s.setProgress)
  const setPhase = useSilo((s) => s.setPhase)
  const started = useRef(false)

  useEffect(() => {
    if (active) started.current = true
    setProgress(active ? progress / 100 : 1)
    if (!active && started.current && useSilo.getState().phase === 'boot') setPhase('exterior')
  }, [active, progress, setPhase, setProgress])

  // Nothing may hold the boot screen up indefinitely.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (useSilo.getState().phase !== 'boot') return
      setProgress(1)
      setPhase('exterior')
    }, 3000)
    return () => window.clearTimeout(id)
  }, [setPhase, setProgress])

  return null
}

export default function SiloScene() {
  const phase = useSilo((s) => s.phase)
  const level = useSilo((s) => s.level)
  const mode = useSilo((s) => s.mode)
  const quality = useSilo((s) => s.quality)
  const setQuality = useSilo((s) => s.setQuality)
  const setWebglFailed = useSilo((s) => s.setWebglFailed)

  // Start fetching the physics while the visitor watches the approach.
  useEffect(() => {
    if (phase === 'exterior') void loadWalk()
  }, [phase])

  return (
    <Canvas
      className="silo__canvas"
      dpr={[1, 1.9]}
      // PCF. The soft variant was removed from this version of three.js and
      // it says so on every load; asking for it only produced the warning.
      shadows={quality === 'high' ? 'percentage' : false}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 55, near: 0.08, far: 500, position: [0, levelY(1) + 26, 46] }}
      onCreated={({ gl, camera, scene }) => {
        // Dev-only handle, so the scene can be probed from the console or a
        // headless browser instead of guessed at.
        if (import.meta.env.DEV) {
          ;(window as unknown as { __silo?: unknown }).__silo = {
            gl,
            camera,
            scene,
            THREE,
            store: useSilo,
            contentAngle,
            walkY,
            daylight,
            dayPhase,
            setDayPhase,
            geometry: { DECK_INNER, ...stairs },
          }
        }
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.08
      }}
      fallback={null}
      onError={() => setWebglFailed()}
    >
      <color attach="background" args={[PALETTE.void]} />
      <PerformanceMonitor onDecline={() => setQuality('low')} />
      <AdaptiveDpr pixelated={false} />
      <FovControl />
      <LoadGate />
      <Suspense fallback={null}>
        {phase === 'exterior' && <Exterior />}
        <Interior />
        <Preload all />
      </Suspense>
      <Rig />
      <LiftDriver />
      {mode === 'walk' && (
        <Suspense fallback={null}>
          <WalkMode level={level} />
        </Suspense>
      )}
      <Effects />
    </Canvas>
  )
}
