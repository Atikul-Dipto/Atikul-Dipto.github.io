import { create } from 'zustand'
import { LEVEL_COUNT } from '../content/floors'

/** Where the visitor is in the experience, not where the camera is. */
export type Phase =
  | 'boot' // assets loading
  | 'exterior' // cinematic approach
  | 'riding' // elevator in motion
  | 'onFloor' // standing on a deck
  | 'airlock' // stepped into the personnel airlock on level 1

export type Quality = 'high' | 'low'

/**
 * How the visitor moves. 'cinematic' is the camera on rails that the whole
 * site shipped with; 'walk' hands them a physical body. Walking is opt-in and
 * only meaningful while standing on a deck -- nothing in the portfolio is
 * reachable only by walking.
 */
export type Mode = 'cinematic' | 'walk'

interface SiloState {
  phase: Phase
  level: number
  /** Level the elevator is travelling to; equals `level` when stationary. */
  target: number
  doorsOpen: boolean
  directoryOpen: boolean
  cvOpen: boolean
  muted: boolean
  reducedMotion: boolean
  quality: Quality
  webglFailed: boolean
  progress: number
  mode: Mode
  /** Mirrors document.pointerLockElement, so the UI follows the browser. */
  pointerLocked: boolean

  setPhase: (p: Phase) => void
  enter: () => void
  goToLevel: (level: number) => void
  arrive: () => void
  setDoors: (open: boolean) => void
  toggleDirectory: (open?: boolean) => void
  setCvOpen: (open: boolean) => void
  /** Walk into the airlock; the rig opens the record once the camera arrives. */
  enterAirlock: () => void
  /** Seal it again and step back onto the deck. */
  closeAirlock: () => void
  toggleMute: () => void
  setReducedMotion: (v: boolean) => void
  setQuality: (q: Quality) => void
  setWebglFailed: () => void
  setProgress: (v: number) => void
  setMode: (m: Mode) => void
  toggleMode: () => void
  setPointerLocked: (v: boolean) => void
}

const clampLevel = (n: number) => Math.min(LEVEL_COUNT, Math.max(1, Math.round(n)))

const prefersReduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const useSilo = create<SiloState>((set, get) => ({
  phase: 'boot',
  level: 1,
  target: 1,
  doorsOpen: false,
  directoryOpen: false,
  cvOpen: false,
  muted: true, // never autoplay audio before an interaction (spec §8)
  reducedMotion: Boolean(prefersReduced),
  quality: 'high',
  webglFailed: false,
  progress: 0,
  mode: 'cinematic',
  pointerLocked: false,

  setPhase: (phase) => set({ phase }),

  enter: () => set({ phase: 'riding', target: 1, doorsOpen: false }),

  goToLevel: (level) => {
    const next = clampLevel(level)
    const { level: current, phase } = get()
    if (next === current && phase === 'onFloor') {
      set({ directoryOpen: false })
      return
    }
    // The ride is a scripted camera move, so walking hands control back for
    // the duration. The visitor re-enters walk mode on arrival.
    set({
      phase: 'riding',
      target: next,
      doorsOpen: false,
      directoryOpen: false,
      mode: 'cinematic',
    })
  },

  arrive: () => set((s) => ({ phase: 'onFloor', level: s.target, doorsOpen: true })),

  setDoors: (doorsOpen) => set({ doorsOpen }),
  toggleDirectory: (open) => set((s) => ({ directoryOpen: open ?? !s.directoryOpen })),
  setCvOpen: (cvOpen) => set({ cvOpen }),

  enterAirlock: () => {
    if (get().phase !== 'onFloor' || get().level !== 1) return
    // The airlock walk is a scripted camera move, so hand control back.
    set({ phase: 'airlock', directoryOpen: false, mode: 'cinematic' })
  },

  closeAirlock: () =>
    set((s) => ({ cvOpen: false, phase: s.phase === 'airlock' ? 'onFloor' : s.phase })),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setQuality: (quality) => set({ quality }),
  setWebglFailed: () => set({ webglFailed: true }),
  setProgress: (progress) => set({ progress }),

  setMode: (mode) => set({ mode }),
  // Walking only makes sense with both feet on a deck, so the toggle is a
  // no-op mid-ride or inside the airlock rather than dropping a body into
  // the shaft.
  toggleMode: () =>
    set((s) => {
      if (s.mode === 'walk') return { mode: 'cinematic' as Mode }
      if (s.phase !== 'onFloor') return {}
      return { mode: 'walk' as Mode, directoryOpen: false }
    }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
}))
