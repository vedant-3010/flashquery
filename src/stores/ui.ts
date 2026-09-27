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
  /** Table shown in the side panel's Preview tab. */
  previewTable: string | null
  setView: (view: View) => void
  setSidebarOpen: (open: boolean) => void
  setSidePanelOpen: (open: boolean) => void
  setSidePanelTab: (tab: SidePanelTab) => void
  /** Opens the side panel on a table's preview; null clears it. */
  showPreview: (table: string | null) => void
}

export const useUiStore = create<UiState>()((set) => ({
  view: 'workspace',
  sidebarOpen: false,
  sidePanelOpen: false,
  sidePanelTab: 'preview',
  previewTable: null,
  setView: (view) => set({ view }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidePanelOpen: (sidePanelOpen) => set({ sidePanelOpen }),
  setSidePanelTab: (sidePanelTab) => set({ sidePanelTab }),
  showPreview: (previewTable) =>
    set(
      previewTable === null
        ? { previewTable }
        : { previewTable, sidePanelOpen: true, sidePanelTab: 'preview' },
    ),
}))
