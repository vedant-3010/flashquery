import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { DatasetProfile } from '@/engine/types'
import { useDatasetsStore } from '@/stores/datasets'

interface RemoveDatasetDialogProps {
  dataset: DatasetProfile
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RemoveDatasetDialog({ dataset, open, onOpenChange }: RemoveDatasetDialogProps) {
  const removeDataset = useDatasetsStore((state) => state.removeDataset)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {dataset.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            The table <span className="font-mono">{dataset.table}</span> is dropped from this
            session. Your original file isn&apos;t touched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void removeDataset(dataset.id)}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
