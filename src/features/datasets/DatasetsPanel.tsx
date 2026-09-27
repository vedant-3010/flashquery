import { Database } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { DatasetItem } from '@/features/datasets/DatasetItem'
import { IngestJobRow } from '@/features/datasets/IngestJobRow'
import { SampleMenu } from '@/features/datasets/SampleMenu'
import { UploadButton } from '@/features/datasets/UploadButton'
import { useDatasetsStore } from '@/stores/datasets'

/** Sidebar catalog: loading jobs, then tables with their columns (F-PROF-01, F-DATA-06). */
export function DatasetsPanel() {
  const datasets = useDatasetsStore((state) => state.datasets)
  const jobs = useDatasetsStore((state) => state.jobs)
  const empty = datasets.length === 0 && jobs.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 pr-1.5 pl-3">
        <h2 className="flex-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Datasets
        </h2>
        {!empty && (
          <>
            <SampleMenu compact />
            <UploadButton compact />
          </>
        )}
      </div>
      {empty ? (
        <EmptyState
          icon={Database}
          title="No datasets yet"
          description="Load a sample, or drop CSV, Excel, Parquet or JSON files anywhere. Files never leave this device."
        >
          <SampleMenu />
          <UploadButton />
        </EmptyState>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {jobs.map((job) => (
            <IngestJobRow key={job.id} job={job} />
          ))}
          {datasets.map((dataset) => (
            <DatasetItem key={dataset.id} dataset={dataset} />
          ))}
        </div>
      )}
    </div>
  )
}
