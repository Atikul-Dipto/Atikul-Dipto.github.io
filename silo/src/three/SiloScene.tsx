import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, PerformanceMonitor, Preload } from '@react-three/drei'
import * as THREE from 'three'
import { PALETTE, levelY } from '../content/floors'
import { useSilo } from '../state/useSilo'
import Structure from './Structure'
import Elevator from './Elevator'
import Exterior from './Exterior'
import Rig from './Rig'
import Level01 from './floors/Level01'
import { Dust, LevelSigns, SkyShaft, TravellingLights } from './Atmosphere'

/**
 * Only the floor you are on (and its neighbours) mounts its fit-out. With 12
 * levels of consoles, screens and canvas textures, mounting everything would
 * cost far more than it could ever show at once.
 */
function ActiveFloor() {
  const level = useSilo((s) => s.level)
  const target = useSilo((s) => s.target)
  const near = (n: number) => Math.abs(n - level) <= 1 || Math.abs(n - target) <= 1
  return <>{near(1) && <Level01 />}</>
}

function Interior({ carY }: { carY: React.RefObject<number> }) {
  const phase = useSilo((s) => s.phase)
  // Fog is scene-wide, so the interior's density was swallowing the exterior
  // approach entirely. Thin it right out until we are inside the shaft.
  const density = phase === 'exterior' ? 0.0022 : 0.0155
  return (
    <>
      <fogExp2 attach="fog" args={[PALETTE.void, density]} />
      <ambientLight color="#6d5f55" intensity={0.12} />
      <directionalLight color={PALETTE.brassHot} intensity={0.22} position={[0, 60, 10]} />
      <TravellingLights carY={carY} />
      <Structure />
      <LevelSigns />
      <SkyShaft />
      <Dust />
      <Elevator carY={carY} />
      <ActiveFloor />
    </>
  )
}

function Progress() {
  const setProgress = useSilo((s) => s.setProgress)
  useEffect(() => {
    // drei's useProgress is Suspense-bound; this fires once the tree resolves.
    setProgress(1)
  }, [setProgress])
  return null
}

export default function SiloScene() {
  const phase = useSilo((s) => s.phase)
  const setQuality = useSilo((s) => s.setQuality)
  const setWebglFailed = useSilo((s) => s.setWebglFailed)
  const setPhase = useSilo((s) => s.setPhase)
  // Shared between the rig and the car so they stay locked while travelling.
  const carY = useRef(levelY(1))

  return (
    <Canvas
      className="silo__canvas"
      dpr={[1, 1.9]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 55, near: 0.1, far: 400, position: [0, levelY(1) + 26, 46] }}
      onCreated={({ gl, camera }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 0.95
        // Hold the HORIZONTAL fov constant: three.js fov is vertical, so on a
        // tall phone the horizontal view narrows and off-axis content leaves
        // the frame entirely.
        const cam = camera as THREE.PerspectiveCamera
        const applyFov = () => {
          const aspect = gl.domElement.clientWidth / gl.domElement.clientHeight
          const v = (2 * Math.atan(Math.tan((64 * Math.PI) / 360) / aspect) * 180) / Math.PI
          cam.fov = Math.min(100, Math.max(44, v))
          cam.updateProjectionMatrix()
        }
        applyFov()
        window.addEventListener('resize', applyFov)
        if (useSilo.getState().phase === 'boot') setPhase('exterior')
      }}
      fallback={null}
      onError={() => setWebglFailed()}
    >
      <color attach="background" args={[PALETTE.void]} />
      <PerformanceMonitor onDecline={() => setQuality('low')} />
      <AdaptiveDpr pixelated={false} />
      <Suspense fallback={null}>
        {phase === 'exterior' && <Exterior />}
        <Interior carY={carY} />
        <Progress />
        <Preload all />
      </Suspense>
      <Rig carY={carY} />
    </Canvas>
  )
}
