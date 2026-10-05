import { crossFilterTarget, toggleCrossFilter } from '@/dashboard/crossFilter'
import { useDashboardStore } from '@/stores/dashboard'
import { applyFilters } from '@/stores/dashboardJobs'
import { useDatasetsStore } from '@/stores/datasets'
import { useToastStore } from '@/stores/toast'

/** A click on `value` in a tile's chart (F-DASH-11): filter the dashboard by it, or clear that. */
export function crossFilterFrom(tileId: string, value: string): void {
  const dashboard = useDashboardStore
    .getState()
    .dashboards.find((d) => d.tiles.some((t) => t.id === tileId))
  const tile = dashboard?.tiles.find((t) => t.id === tileId)
  if (!dashboard || !tile) return
  const target = crossFilterTarget(tile, useDatasetsStore.getState().datasets)
  if (!target) return
  const toast = useToastStore.getState().show
  const result = toggleCrossFilter(dashboard.filters, target, value)
  if (!result.ok) {
    toast(result.reason)
    return
  }
  void applyFilters(dashboard.id, result.filters)
  toast(
    result.cleared
      ? `Cleared the ${target.column} filter.`
      : `Filtered the dashboard to ${target.column} = ${value}. Click it again to clear.`,
  )
}
