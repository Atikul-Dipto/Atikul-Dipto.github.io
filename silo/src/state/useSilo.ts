import { create } from 'zustand'
import { drone, launch, type DroneMode } from '../lib/drone'
import { LEVEL_COUNT } from '../content/floors'
import { LEVEL as REC_LEVEL } from '../content/level6'
import { isLowPower, isModestGpu } from '../lib/capability'

/** Where the visitor is in the experience, not where the camera is. */
export type Phase =
  | 'boot' // assets loading
  | 'exterior' // cinematic approach
  | 'riding' // travelling: the opening flight in, or aboard the lift
  | 'onFloor' // standing somewhere in the silo

export type Quality = 'high' | 'low'

/**
 * How the camera is driven. 'cinematic' is the scripted camera, and it is now
 * only used for the opening: the approach from outside and the flight in. The
 * moment the visitor arrives on level 1 the mode becomes 'walk' and stays
 * there -- there is no guided camera to switch back to, and nothing to drag.
 */
export type Mode = 'cinematic' | 'walk'

/** What pressing E would do, right here. Drives the on-screen prompt. */
export type Interact =
  | 'lift-controls'
  | 'call-lift'
  | 'vault' // open the vault door
  | 'vault-close' // swing it shut again
  | 'record' // read the personnel record, at the terminal in the vault
  | 'sealed' // the second door, which does not open
  | `chamber:${number}` // roll one of the recreation rooms' doors open
  | `chamber-close:${number}` // and shut
  | 'maze-map' // the map of the maze, on the plaza
  | 'jukebox' // the gramophone and the cassettes
  | `arcade:${string}` // one of the game cabinets
  | 'drone' // the drone's controls
  | 'reactor' // the reactor's console, on the core level
  | `contact:${string}` // a contact plate in the communications room
  | null

/** The panels that open over the walk from things in the recreation chamber. */
export type Panel = 'jukebox' | 'arcade' | 'drone' | 'map' | null

interface SiloState {
  phase: Phase
  /** The level the visitor is on. */
  level: number
  /** Where the current journey ends; equals `level` when not travelling. */
  target: number
  /** Where the lift car is, or is heading. Independent of the visitor: you
   *  can take the stair and leave the car behind. */
  carLevel: number
  carMoving: boolean
  /** Car and landing doors at `carLevel`. */
  doorsOpen: boolean
  /** A level the empty car has been called to, waiting for the lift to act. */
  liftCall: number | null
  /** Where the opening sequence should continue to after landing on level 1. */
  pendingDest: number | null
  directoryOpen: boolean
  cvOpen: boolean
  /** The vault door on level 1 is wanted open. Whether it IS open is the
   *  door's own business (lib/vault.ts): it will not swing through a body. */
  vaultOpen: boolean
  /** The vault door is waiting for someone to step out of its way. */
  doorBlocked: boolean
  /** Each of the recreation rooms' round doors is wanted open. */
  chambersOpen: boolean[]
  /** A panel opened from the chamber, and which game the arcade is showing. */
  panel: Panel
  arcadeGame: string | null
  /** A short line of status over the walk: the maze's clock, a door waiting. */
  hudNote: string | null
  /** The drone is in the air: its camera is the view, and the body waits. */
  droneFlying: boolean
  droneMode: DroneMode
  /** The level the drone is flying past, while it flies. */
  droneAt: number
  /** How the last flight ended, for the desk to show. */
  droneResult: { mode: DroneMode; time: number | null; gates: number; bumps: number; reason: string } | null
  muted: boolean
  /** The score, which plays with the sound unless turned off on its own. */
  music: boolean
  reducedMotion: boolean
  quality: Quality
  webglFailed: boolean
  progress: number
  /** Every shader the scene needs has compiled: drawing may begin. */
  compiled: boolean
  mode: Mode
  /** Mirrors document.pointerLockElement, so the UI follows the browser. */
  pointerLocked: boolean
  interact: Interact
  /** A short fade to black, for the one cut the walk mode makes: boarding the
   *  lift from the directory when you are not standing in it. */
  fading: boolean
  /** The floor's record panel, opened on demand while walking. It covers a
   *  third of the screen, so it is not left up while someone is moving. */
  recordOpen: boolean
  /** The body exists. Walk mode starts the moment the opening lands, but the
   *  body needs the physics engine -- a separate download and a WebAssembly
   *  compile -- and until then clicks and keys have nothing to move. */
  bodyReady: boolean

  setPhase: (p: Phase) => void
  /** Leave the approach. `dest` is where to go once inside; level 1 by default. */
  enter: (dest?: number) => void
  goToLevel: (level: number) => void
  arrive: () => void
  setDoors: (open: boolean) => void
  setCar: (level: number, moving: boolean) => void
  callLift: (level: number) => void
  clearLiftCall: () => void
  toggleDirectory: (open?: boolean) => void
  setCvOpen: (open: boolean) => void
  /** The personnel record, straight away, from anywhere: it is never locked
   *  behind the walk. In the silo it is read at the terminal in the vault. */
  openRecord: () => void
  closeRecord: () => void
  /** Swing the vault door open, or shut. Level 1 only. */
  openVault: () => void
  sealVault: () => void
  setDoorBlocked: (v: boolean) => void
  openChamber: (k: number) => void
  closeChamber: (k: number) => void
  openPanel: (panel: Exclude<Panel, null>, game?: string | null) => void
  closePanel: () => void
  setHudNote: (note: string | null) => void
  startDrone: (mode: DroneMode) => void
  endDrone: (reason: 'landed' | 'battery' | 'finished') => void
  toggleMute: () => void
  /** Sound on or off without it counting as the visitor's choice. */
  setMuted: (muted: boolean) => void
  toggleMusic: () => void
  setReducedMotion: (v: boolean) => void
  setQuality: (q: Quality) => void
  setWebglFailed: () => void
  setProgress: (v: number) => void
  /** Report the level the walking body has reached on the stair, without
   *  starting a journey. */
  setWalkLevel: (level: number) => void
  setMode: (m: Mode) => void
  setPointerLocked: (v: boolean) => void
  setInteract: (v: Interact) => void
  setFading: (v: boolean) => void
  toggleRecord: (open?: boolean) => void
  setBodyReady: (v: boolean) => void
}

/**
 * The level the view is at: the body's, or the drone's while it flies. What
 * is drawn and how it is lit follows the view, not the body.
 */
export const viewLevel = (s: { droneFlying: boolean; droneAt: number; level: number }) =>
  s.droneFlying ? s.droneAt : s.level

/** Where the visitor's own choice of sound on or off is kept. */
export const SOUND_KEY = 'silo.sound'

const clampLevel = (n: number) => Math.min(LEVEL_COUNT, Math.max(1, Math.round(n)))

const prefersReduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const useSilo = create<SiloState>((set, get) => ({
  phase: 'boot',
  level: 1,
  target: 1,
  carLevel: 1,
  carMoving: false,
  doorsOpen: false,
  liftCall: null,
  pendingDest: null,
  directoryOpen: false,
  cvOpen: false,
  vaultOpen: false,
  doorBlocked: false,
  chambersOpen: [false, false, false],
  panel: null,
  arcadeGame: null,
  hudNote: null,
  droneFlying: false,
  droneMode: 'free',
  droneAt: 6,
  droneResult: null,
  muted: true, // never autoplay audio before an interaction (spec §8)
  music: true,
  reducedMotion: Boolean(prefersReduced),
  // The tier is settled before anything compiles: see isModestGpu, and
  // RevealWhenSmooth in SiloScene for machines this cannot tell about.
  quality: isLowPower() || isModestGpu() ? 'low' : 'high',
  webglFailed: false,
  progress: 0,
  compiled: false,
  mode: 'cinematic',
  pointerLocked: false,
  interact: null,
  fading: false,
  recordOpen: false,
  bodyReady: false,

  setPhase: (phase) => set({ phase }),

  enter: (dest = 1) =>
    set({
      phase: 'riding',
      target: 1,
      doorsOpen: false,
      pendingDest: clampLevel(dest) === 1 ? null : clampLevel(dest),
    }),

  goToLevel: (level) => {
    const next = clampLevel(level)
    const s = get()
    // From the approach, every route in starts on level 1.
    if (s.phase === 'boot' || s.phase === 'exterior') {
      get().enter(next)
      return
    }
    if (s.phase === 'riding') return
    if (next === s.level && s.carLevel === s.level && !s.carMoving) {
      set({ directoryOpen: false })
      return
    }
    // A journey by lift. The lift driver boards the visitor if they are not
    // already aboard, shuts the doors and carries them; arrival comes from it.
    set({ phase: 'riding', target: next, directoryOpen: false, interact: null, vaultOpen: false, chambersOpen: [false, false, false], panel: null })
  },

  arrive: () =>
    set((s) => ({
      phase: 'onFloor',
      level: s.target,
      carLevel: s.target,
      carMoving: false,
      doorsOpen: true,
      // Arriving is the moment the visitor is handed a body.
      mode: 'walk',
    })),

  setDoors: (doorsOpen) => set({ doorsOpen }),
  setCar: (carLevel, carMoving) => set({ carLevel, carMoving }),

  callLift: (level) => {
    const s = get()
    if (s.carLevel === level && !s.carMoving) {
      if (!s.doorsOpen) set({ doorsOpen: true })
      return
    }
    set({ liftCall: clampLevel(level) })
  },
  clearLiftCall: () => set({ liftCall: null }),

  toggleDirectory: (open) => set((s) => ({ directoryOpen: open ?? !s.directoryOpen })),
  setCvOpen: (cvOpen) => set({ cvOpen }),

  openRecord: () => set({ cvOpen: true, directoryOpen: false }),
  closeRecord: () => set({ cvOpen: false }),

  openVault: () => {
    const s = get()
    if (s.level === 1 && s.phase === 'onFloor') set({ vaultOpen: true })
  },
  sealVault: () => set({ vaultOpen: false }),
  setDoorBlocked: (doorBlocked) => set({ doorBlocked }),
  openChamber: (k) => {
    const s = get()
    if (s.level === REC_LEVEL && s.phase === 'onFloor') set({ chambersOpen: s.chambersOpen.map((v, i) => (i === k ? true : v)) })
  },
  closeChamber: (k) => set((s) => ({ chambersOpen: s.chambersOpen.map((v, i) => (i === k ? false : v)) })),
  openPanel: (panel, game = null) => set({ panel, arcadeGame: game, directoryOpen: false }),
  closePanel: () => set({ panel: null }),
  setHudNote: (hudNote) => set({ hudNote }),
  startDrone: (mode) => {
    launch(mode)
    set({ droneFlying: true, droneMode: mode, droneResult: null, panel: null, interact: null })
  },
  endDrone: (reason) => {
    if (!get().droneFlying) return
    drone.flying = false
    set({
      droneFlying: false,
      droneResult: { mode: drone.mode, time: drone.finish, gates: drone.gate, bumps: drone.bumps, reason },
      panel: 'drone',
    })
  },

  toggleMute: () =>
    set((s) => {
      // Remembered, so someone who turned the sound off is not met with it
      // again on their next visit.
      try {
        localStorage.setItem(SOUND_KEY, s.muted ? 'on' : 'off')
      } catch {
        // Storage blocked; the choice lasts for this visit only.
      }
      return { muted: !s.muted }
    }),
  setMuted: (muted) => set({ muted }),
  toggleMusic: () => set((s) => ({ music: !s.music })),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setQuality: (quality) => set({ quality }),
  setWebglFailed: () => set({ webglFailed: true }),
  setProgress: (progress) => set({ progress }),

  setWalkLevel: (level) =>
    set((s) => {
      const next = clampLevel(level)
      if (s.level === next) return {}
      return {
        level: next,
        target: next,
        vaultOpen: next === 1 ? s.vaultOpen : false,
        chambersOpen: next === REC_LEVEL ? s.chambersOpen : [false, false, false],
      }
    }),

  setMode: (mode) => set({ mode }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setInteract: (interact) => set({ interact }),
  setFading: (fading) => set({ fading }),
  toggleRecord: (open) => set((s) => ({ recordOpen: open ?? !s.recordOpen })),
  setBodyReady: (bodyReady) => set({ bodyReady }),
}))
