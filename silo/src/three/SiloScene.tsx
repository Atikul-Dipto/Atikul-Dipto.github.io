import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { PROBE } from '../lib/probe'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr, PerformanceMonitor, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { DECK_INNER, PALETTE, contentAngle, levelY, walkY } from '../content/floors'
import * as stairs from '../content/stairs'
import { dayPhase, daylight, setDayPhase } from '../lib/daylight'
import { doorTransform, vaultDoor } from '../lib/vault'
import * as plan from '../content/level1'
import * as plan6 from '../content/level6'
import { LEVEL as REC_LEVEL } from '../content/level6'
import { LEVEL as CORE_LEVEL } from '../content/level12'
import { chamber } from '../lib/chamber'
import { jukeboxDebug } from '../lib/jukebox'
import { drone } from '../lib/drone'
import { move } from '../lib/input'
import { contactLog } from '../lib/contact'
import { droneTouch } from '../lib/drone'
import { reactor } from '../lib/reactor'
import { aim, aimFire } from '../lib/aim'
import { citizens } from '../lib/citizens'
import { soundbox } from '../lib/soundbox'
import * as plan12 from '../content/level12'
import { useSilo } from '../state/useSilo'
import FloorGuard from './FloorGuard'
import LightPool from './LightPool'
import { warmEffects, warmUp } from './warm'
import { ENV_INTENSITY, loadEnvironment } from './envmap'
import Structure from './Structure'
import LevelLife from './LevelLife'
import Elevator from './Elevator'
import Exterior from './Exterior'
import Rig from './Rig'
import Effects from './Effects'
import Dome from './Dome'
import Lighting from './Lighting'
import LiftDriver from './LiftDriver'
import Level01 from './floors/Level01'
import WallRooms from './floors/WallRooms'
import { CAREERS_LEVEL, SKILLS_LEVEL } from '../content/wallRooms'
import Level06 from './floors/Level06'
import Level12, { PowerConduits } from './floors/Level12'
import DroneFlight from './DroneFlight'
import RecordWalls from './floors/RecordWall'
import FlowerPortraits from './FlowerPortraits'
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
/** The floors with a fit-out of their own, nearest the drone's pad first. */
const FLIGHT_ORDER = [SKILLS_LEVEL, CAREERS_LEVEL, 1, CORE_LEVEL].sort((a, b) => Math.abs(a - REC_LEVEL) - Math.abs(b - REC_LEVEL))

function ActiveFloor() {
  const level = useSilo((s) => s.level)
  // While the drone flies, every floor is fitted out -- but not as it passes
  // them: building a floor's rooms and compiling them mid-flight stuttered
  // the flight for up to a second each time. Instead they are built at
  // take-off, one in each quiet moment while the drone sits on its pad,
  // nearest first, and kept until it lands.
  const flying = useSilo((s) => s.droneFlying)
  const [fleet, setFleet] = useState(0)
  useEffect(() => {
    if (!flying) {
      setFleet(0)
      return
    }
    if (fleet >= FLIGHT_ORDER.length) return
    const idle = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 120))
    const handle = idle(() => setFleet((n) => n + 1), { timeout: 400 }) as number
    return () => window.cancelIdleCallback?.(handle)
  }, [flying, fleet])
  const forFlight = (n: number) => flying && FLIGHT_ORDER.indexOf(n) >= 0 && FLIGHT_ORDER.indexOf(n) < fleet
  // A lift journey's destination is fitted out as the journey starts, so it
  // is compiled and ready by the time the doors open.
  const bound = useSilo((s) => (s.phase === 'riding' ? s.target : s.level))
  const inside = useSilo((s) => s.phase !== 'boot' && s.phase !== 'exterior')
  const approach = useSilo((s) => s.phase === 'exterior')
  // Level 1 is fitted out while the visitor watches the approach, once the
  // page has a quiet moment -- not at boot, where it would lengthen the
  // loading screen, and not on Enter, where building its rooms and uploading
  // their textures stuttered the flight in.
  // Built in steps, each in its own quiet moment, so no one step is a long
  // stall: level 1, then the careers rooms, then the skills rooms.
  const [early, setEarly] = useState(0)
  useEffect(() => {
    if (!approach || early >= 3) return
    const idle = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 200))
    let handle = 0
    const id = window.setTimeout(
      () => {
        handle = idle(() => setEarly((n) => n + 1), { timeout: 2500 }) as number
      },
      early === 0 ? 1200 : 600,
    )
    return () => {
      window.clearTimeout(id)
      window.cancelIdleCallback?.(handle)
    }
  }, [approach, early])
  const near = (n: number) => Math.abs(n - level) <= 1 || Math.abs(n - bound) <= 1 || forFlight(n)
  return (
    <>
      {near(1) && (inside || early >= 1) && (
        <FloorGuard name="level 1">
          <Level01 />
        </FloorGuard>
      )}
      {[CAREERS_LEVEL, SKILLS_LEVEL].map(
        (L, i) =>
          near(L) &&
          (inside || early >= 2 + i) && (
            <FloorGuard key={L} name={`level ${L}`}>
              <WallRooms level={L} />
            </FloorGuard>
          ),
      )}
      {near(REC_LEVEL) && (
        <FloorGuard name="level 6">
          <Level06 />
        </FloorGuard>
      )}
      {near(CORE_LEVEL) && (
        <FloorGuard name="level 12">
          <Level12 />
        </FloorGuard>
      )}
      <DroneFlight />
      <PowerConduits />
      <RecordWalls />
      <FlowerPortraits />
    </>
  )
}

function Interior() {
  const phase = useSilo((s) => s.phase)
  // Fog is scene-wide; thin it right out for the approach. Inside, it is
  // kept thin enough that the far side of a 44 m atrium still reads.
  const density = phase === 'exterior' ? 0.0011 : 0.0072
  return (
    <>
      <fogExp2 attach="fog" args={[PALETTE.void, density]} />
      <LightPool />
      <Lighting />
      <Structure />
      <LevelLife />
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
 * Holds the boot screen until the scene's assets have resolved AND every
 * shader it needs has compiled, and reports progress meanwhile.
 *
 * The compile is the slow part, not the download: a couple of hundred shader
 * programs. Drawn the usual way, each compiles the first time it is used and
 * the page freezes while it does -- seconds of a stuck loading bar. Instead
 * nothing is drawn at all until `compileAsync` has had the driver compile them
 * all in the background (KHR_parallel_shader_compile), so the loading screen
 * keeps moving and the first frame is smooth.
 */
function LoadGate() {
  const { progress, active } = useProgress()
  const setProgress = useSilo((s) => s.setProgress)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const started = useRef(false)
  const warming = useRef(false)

  const warm = useCallback(() => {
    if (warming.current) return
    warming.current = true
    setProgress(0.96)
    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      // Start drawing -- still behind the loading screen; RevealWhenSmooth
      // lifts it.
      useSilo.setState({ compiled: true })
      setProgress(0.99)
      performance.mark('silo:compiled')
    }
    // Fetch each program's uniforms, a few milliseconds' worth a frame: where
    // the driver only pretends to compile in the background, this is where it
    // really finishes, and spreading it out keeps the loading bar moving
    // instead of freezing it for the lot.
    const settle = () => {
      const programs = [...(gl.info.programs ?? [])]
      let i = 0
      const step = () => {
        if (finished) return
        const t0 = performance.now()
        while (i < programs.length && performance.now() - t0 < 12) programs[i++].getUniforms()
        setProgress(0.96 + 0.04 * (i / Math.max(1, programs.length)))
        if (i < programs.length) requestAnimationFrame(step)
        else done()
      }
      step()
    }
    // The environment first -- it is in every lit shader -- then two frames
    // for Suspense to commit what has just loaded, then the compile.
    void loadEnvironment().then((env) => {
      if (env && !scene.environment) {
        scene.environment = env
        scene.environmentIntensity = ENV_INTENSITY
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() => void Promise.all([warmUp(gl, scene, camera, scene), warmEffects(gl)]).then(settle, done)),
      )
    })
    // Never hold the boot screen up indefinitely.
    window.setTimeout(done, 15000)
  }, [gl, scene, camera, setProgress])

  // RevealWhenSmooth may drop the quality and ask for the shaders again.
  useEffect(() => {
    rewarm.current = () => {
      warming.current = false
      useSilo.setState({ compiled: false })
      warm()
    }
  }, [warm])

  useEffect(() => {
    if (active) started.current = true
    setProgress(active ? (progress / 100) * 0.95 : warming.current ? 0.96 : 0.95)
    if (!active && started.current) warm()
  }, [active, progress, setProgress, warm])

  // If nothing is loading at all, warm up anyway.
  useEffect(() => {
    const id = window.setTimeout(warm, 1500)
    return () => window.clearTimeout(id)
  }, [warm])

  return null
}

/** Set by LoadGate: compile everything again, for a new quality tier. */
const rewarm: { current: () => void } = { current: () => {} }

/**
 * Lifts the loading screen once the first frames are coming through -- and
 * decides the quality tier first, while it is still up.
 *
 * A few shaders cannot be compiled ahead: the depth shaders the sun draws its
 * shadows with, and the blur bloom builds on first use. They compile on the
 * first frames, behind the loading screen. Then a handful of frames are timed:
 * if this machine cannot hold fifty frames a second here, the resolution comes
 * down to one pixel per CSS pixel; if it still cannot, the shadows and screen
 * effects are switched off and everything compiled again,
 * still behind the loading screen. Switching them later meant recompiling
 * every shader in the scene at once, mid-flight: an eight-second freeze.
 */
function RevealWhenSmooth({ lowerResolution }: { lowerResolution: () => boolean }) {
  const frames = useRef<number[]>([])
  const since = useRef(0)
  const step = useRef(0)
  const gl = useThree((s) => s.gl)
  useFrame((_, dt) => {
    const s = useSilo.getState()
    if (!s.compiled || s.phase !== 'boot') return
    if (!since.current) since.current = performance.now()
    frames.current.push(dt)
    // The first frames are the ones still compiling; time the ones after,
    // and by the median, so one last stall does not count as the machine.
    const sample = frames.current.slice(4).sort((a, b) => a - b)
    const timedOut = performance.now() - since.current > 9000
    if (sample.length < 9 && !timedOut) return
    const median = sample[sample.length >> 1] ?? 1
    const again = () => {
      frames.current = []
      since.current = 0
    }
    // The approach is the lightest view in the silo -- inside costs about
    // twice as much -- so it has to run near fifty frames a second.
    // Slow: first fewer pixels, which costs nothing to change...
    if (step.current === 0 && median > 1 / 50 && gl.getPixelRatio() > 1 && lowerResolution()) {
      step.current = 1
      performance.mark('silo:resolution-low', { detail: { median } })
      again()
      return
    }
    // ...and only if that is still well short, the quality tier, which means
    // compiling everything again.
    if (step.current < 2 && s.quality === 'high' && (median > 1 / 50 || timedOut)) {
      step.current = 2
      s.setQuality('low')
      performance.mark('silo:quality-low', { detail: { median } })
      again()
      rewarm.current()
      return
    }
    s.setProgress(1)
    s.setPhase('exterior')
    performance.mark('silo:revealed', { detail: { median } })
  })
  return null
}

export default function SiloScene() {
  const [dprCap, setDprCap] = useState(1.9)
  const phase = useSilo((s) => s.phase)
  const compiled = useSilo((s) => s.compiled)
  const level = useSilo((s) => s.level)
  const mode = useSilo((s) => s.mode)
  const quality = useSilo((s) => s.quality)
  const setWebglFailed = useSilo((s) => s.setWebglFailed)

  // Start fetching the physics while the visitor watches the approach.
  useEffect(() => {
    if (phase === 'exterior') void loadWalk()
  }, [phase])

  return (
    <Canvas
      className="silo__canvas"
      dpr={[Math.min(1, dprCap), dprCap]}
      // Nothing is drawn until the shaders are ready: see LoadGate.
      frameloop={compiled ? 'always' : 'never'}
      // PCF. The soft variant was removed from this version of three.js and
      // it says so on every load; asking for it only produced the warning.
      shadows={quality === 'high' ? 'percentage' : false}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 55, near: 0.08, far: 500, position: [0, levelY(1) + 26, 46] }}
      onCreated={({ gl, camera, scene }) => {
        // Dev-only handle, so the scene can be probed from the console or a
        // headless browser instead of guessed at.
        if (PROBE) {
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
            vaultDoor,
            vaultTransform: doorTransform,
            plan,
            plan6,
            chamber,
            jukebox: jukeboxDebug,
            drone,
            input: move,
            droneTouch,
            contactLog,
            reactor,
            plan12,
            aim: { state: aim, fire: aimFire },
            citizens,
            soundbox,
          }
        }
        // Checking every shader for errors makes each one block until it has
        // compiled, which defeats compiling them in the background.
        gl.debug.checkShaderErrors = import.meta.env.DEV
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.08
      }}
      fallback={null}
      onError={() => setWebglFailed()}
    >
      <color attach="background" args={[PALETTE.void]} />
      {/* Struggling later on, it lowers the resolution -- never the quality
          tier, which would recompile every shader in the scene at once. */}
      <PerformanceMonitor onDecline={() => setDprCap(1)} />
      <AdaptiveDpr pixelated={false} />
      <FovControl />
      <LoadGate />
      <RevealWhenSmooth
        lowerResolution={() => {
          if (dprCap <= 1) return false
          setDprCap(1)
          return true
        }}
      />
      <Suspense fallback={null}>
        {/* Mounted while booting too, so its shaders are compiled with the rest. */}
        {(phase === 'exterior' || phase === 'boot') && <Exterior />}
        <Interior />
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
