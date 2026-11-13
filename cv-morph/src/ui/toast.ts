import { create } from 'zustand'

interface Toast {
  id: number
  text: string
  bad: boolean
}

interface ToastState {
  toasts: Toast[]
}

export const useToasts = create<ToastState>(() => ({ toasts: [] }))

let next = 0

/** Says something briefly at the foot of the screen. */
export function toast(text: string, bad = false): void {
  const id = ++next
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, bad }] }))
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), bad ? 6500 : 3800)
}
