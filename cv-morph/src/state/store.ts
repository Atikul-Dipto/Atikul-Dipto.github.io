import { create } from 'zustand'
import { writeField } from '../model/fields.ts'
import { reviveProject, type Project } from '../model/project.ts'

const STORAGE_KEY = 'cv-morph:project:v1'
const HISTORY = 60
/** Typing in one field within this long is one step back, not one per letter. */
const COALESCE_MS = 1500

export type Panel = 'design' | 'sections' | 'match'

interface State {
  project: Project | null
  past: Project[]
  future: Project[]
  /** The last change's key and time, for folding a run of typing into one undo step. */
  stamp: { key: string; at: number } | null
  /** A field the page should put the caret in, after a change that made it. */
  focus: { field: string; nonce: number } | null
  /** The field picked on a touch screen, edited in the bar above the keyboard. */
  picked: string | null
  /** Counts changes that move things about (not typing), so the page can glide them into place. */
  epoch: number
  panel: Panel

  open(project: Project): void
  close(): void
  /**
   * Changes the project. `change` is handed a copy to alter and may return a
   * field to focus. Changes with the same `key` in quick succession are one
   * undo step; `moves` says sections may have shifted.
   */
  edit(change: (draft: Project) => string | void, options?: { key?: string; moves?: boolean }): void
  setField(field: string, value: string): void
  undo(): void
  redo(): void
  focusOn(field: string): void
  pick(field: string | null): void
  setPanel(panel: Panel): void
}

function load(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? reviveProject(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

let nonce = 0

export const useStore = create<State>((set, get) => ({
  project: typeof localStorage === 'undefined' ? null : load(),
  past: [],
  future: [],
  stamp: null,
  focus: null,
  picked: null,
  epoch: 0,
  panel: 'design',

  open: (project) => set({ project, past: [], future: [], stamp: null, focus: null, picked: null, epoch: get().epoch + 1 }),
  close: () => set({ project: null, past: [], future: [], stamp: null, focus: null, picked: null }),

  edit: (change, options = {}) => {
    const { project, past, stamp, epoch } = get()
    if (!project) return
    const draft = structuredClone(project)
    const focusField = change(draft)
    const now = Date.now()
    const folds = !!options.key && stamp?.key === options.key && now - stamp.at < COALESCE_MS
    set({
      project: draft,
      past: folds ? past : [...past.slice(-(HISTORY - 1)), project],
      future: [],
      stamp: options.key ? { key: options.key, at: now } : null,
      epoch: options.moves ? epoch + 1 : epoch,
      ...(typeof focusField === 'string' && focusField ? { focus: { field: focusField, nonce: ++nonce } } : {}),
    })
  },

  setField: (field, value) => get().edit((draft) => writeField(draft.cv, field, value), { key: `field:${field}` }),

  undo: () => {
    const { project, past, future, epoch } = get()
    const previous = past[past.length - 1]
    if (!project || !previous) return
    set({ project: previous, past: past.slice(0, -1), future: [project, ...future], stamp: null, epoch: epoch + 1 })
  },
  redo: () => {
    const { project, past, future, epoch } = get()
    const next = future[0]
    if (!project || !next) return
    set({ project: next, past: [...past, project], future: future.slice(1), stamp: null, epoch: epoch + 1 })
  },

  focusOn: (field) => set({ focus: { field, nonce: ++nonce } }),
  pick: (field) => set({ picked: field }),
  setPanel: (panel) => set({ panel }),
}))

// The CV is kept in this browser only, saved a moment after each change.
let saving: ReturnType<typeof setTimeout> | undefined
if (typeof localStorage !== 'undefined') {
  useStore.subscribe((state, before) => {
    if (state.project === before.project) return
    clearTimeout(saving)
    saving = setTimeout(() => {
      try {
        if (state.project) localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project))
        else localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Storage is full or blocked: the CV is still on screen and can be exported.
      }
    }, 350)
  })
}

/** Shorthand for components that only change things. */
export const edit = (change: (draft: Project) => string | void, options?: { key?: string; moves?: boolean }): void => useStore.getState().edit(change, options)
