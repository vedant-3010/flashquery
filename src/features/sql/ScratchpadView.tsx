import { lazy, Suspense, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SqlView } from '@/features/sql/SqlView'

const NotebookPanel = lazy(() =>
  import('@/features/python/NotebookPanel').then((module) => ({ default: module.NotebookPanel })),
)

/** The scratchpad: SQL (F-EXPL-07) or Python notebook cells (F-PY-06). */
export function ScratchpadView() {
  const [mode, setMode] = useState<'sql' | 'python'>('sql')
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs value={mode} onValueChange={(value) => setMode(value === 'python' ? 'python' : 'sql')}>
        <div className="flex h-9 shrink-0 items-center border-b px-3">
          <TabsList variant="line" aria-label="Scratchpad">
            <TabsTrigger value="sql">Query</TabsTrigger>
            <TabsTrigger value="python">Python notebook</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {mode === 'sql' ? (
        <SqlView />
      ) : (
        <Suspense fallback={<Skeleton className="m-3 h-40" />}>
          <NotebookPanel />
        </Suspense>
      )}
    </div>
  )
}
