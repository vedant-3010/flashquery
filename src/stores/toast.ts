import { create } from 'zustand'

// Short confirmations with an optional action ("Pinned to My dashboard · View", F-DASH-01).

export interface Toast {
  id: number
  message: string
  action: { label: string; run: () => void } | null
}

const DURATION_MS = 6_000
let counter = 0

interface ToastState {
  toasts: Toast[]
  show: (message: string, action?: Toast['action']) => void
  dismiss: (id: number) => void
}

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (message, action = null) => {
    const id = (counter += 1)
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, message, action }] }))
    window.setTimeout(() => get().dismiss(id), DURATION_MS)
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))
