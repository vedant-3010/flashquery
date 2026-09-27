import { z } from 'zod'
import { create } from 'zustand'

export const ViewSchema = z.enum(['workspace', 'dashboard'])
export type View = z.infer<typeof ViewSchema>

export const SidePanelTabSchema = z.enum(['preview', 'inspector', 'history'])
export type SidePanelTab = z.infer<typeof SidePanelTabSchema>

interface UiState {
  view: View
  /** Overlay sidebar below 1280 px; wider layouts always dock it. */
  sidebarOpen: boolean
  sidePanelOpen: boolean
  sidePanelTab: SidePanelTab
  setView: (view: View) => void
  setSidebarOpen: (open: boolean) => void
  setSidePanelOpen: (open: boolean) => void
  setSidePanelTab: (tab: SidePanelTab) => void
}

export const useUiStore = create<UiState>()((set) => ({
  view: 'workspace',
  sidebarOpen: false,
  sidePanelOpen: false,
  sidePanelTab: 'preview',
  setView: (view) => set({ view }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidePanelOpen: (sidePanelOpen) => set({ sidePanelOpen }),
  setSidePanelTab: (sidePanelTab) => set({ sidePanelTab }),
}))
