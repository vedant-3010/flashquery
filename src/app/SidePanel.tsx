import { Table2, X } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { IconButton } from '@/components/IconButton'
import { AiInspector } from '@/features/explain/AiInspector'
import { HistoryPanel } from '@/features/explain/HistoryPanel'
import { TableGrid } from '@/features/grid/TableGrid'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SidePanelTabSchema, useUiStore } from '@/stores/ui'

export function SidePanel() {
  const tab = useUiStore((state) => state.sidePanelTab)
  const setTab = useUiStore((state) => state.setSidePanelTab)
  const setOpen = useUiStore((state) => state.setSidePanelOpen)
  const previewTable = useUiStore((state) => state.previewTable)

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(SidePanelTabSchema.parse(value))}
      className="min-h-0 flex-1 gap-0"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
        <TabsList variant="line" aria-label="Side panel">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="inspector">AI inspector</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <IconButton label="Close side panel" className="ml-auto" onClick={() => setOpen(false)}>
          <X />
        </IconButton>
      </div>
      <TabsContent value="preview" className="flex min-h-0 flex-col">
        {previewTable ? (
          <TableGrid key={previewTable} table={previewTable} />
        ) : (
          <EmptyState
            icon={Table2}
            title="Nothing to preview"
            description="Select a table in the sidebar to see its rows."
          />
        )}
      </TabsContent>
      <TabsContent value="inspector" className="flex min-h-0 flex-col">
        <AiInspector />
      </TabsContent>
      <TabsContent value="history" className="flex min-h-0 flex-col">
        <HistoryPanel />
      </TabsContent>
    </Tabs>
  )
}
