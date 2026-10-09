import { create } from 'zustand'
import { LEVEL_COUNT } from '../content/floors'

/** Where the visitor is in the experience, not where the camera is. */
export type Phase =
  | 'boot' // assets loading
  | 'exterior' // cinematic approach
  | 'riding' // elevator in motion
  | 'onFloor' // standing on a deck

export type Quality = 'high' | 'low'

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

  setPhase: (p: Phase) => void
  enter: () => void
  goToLevel: (level: number) => void
  arrive: () => void
  setDoors: (open: boolean) => void
  toggleDirectory: (open?: boolean) => void
  setCvOpen: (open: boolean) => void
  toggleMute: () => void
  setReducedMotion: (v: boolean) => void
  setQuality: (q: Quality) => void
  setWebglFailed: () => void
  setProgress: (v: number) => void
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

  setPhase: (phase) => set({ phase }),

  enter: () => set({ phase: 'riding', target: 1, doorsOpen: false }),

  goToLevel: (level) => {
    const next = clampLevel(level)
    const { level: current, phase } = get()
    if (next === current && phase === 'onFloor') {
      set({ directoryOpen: false })
      return
    }
    set({ phase: 'riding', target: next, doorsOpen: false, directoryOpen: false })
  },

  arrive: () => set((s) => ({ phase: 'onFloor', level: s.target, doorsOpen: true })),

  setDoors: (doorsOpen) => set({ doorsOpen }),
  toggleDirectory: (open) => set((s) => ({ directoryOpen: open ?? !s.directoryOpen })),
  setCvOpen: (cvOpen) => set({ cvOpen }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setQuality: (quality) => set({ quality }),
  setWebglFailed: () => set({ webglFailed: true }),
  setProgress: (progress) => set({ progress }),
}))
