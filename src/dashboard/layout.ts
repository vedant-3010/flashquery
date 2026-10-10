import type { TileLayout, TileType } from '@/dashboard/schema'

// Tile placement on the 12-column grid (F-DASH-02, ui rules). Pure.

export const COLS = 12

/** The grid's geometry (react-grid-layout's gridConfig): here, in presentation and shared. */
export const GRID_CONFIG = {
  cols: COLS,
  rowHeight: 72,
  margin: [12, 12] as const,
  containerPadding: [0, 0] as const,
}

/** Default tile sizes: KPI 3×2, chart 6×4, table 6×5, text 4×2. */
export const DEFAULT_SIZES: Record<TileType, { w: number; h: number }> = {
  kpi: { w: 3, h: 2 },
  chart: { w: 6, h: 4 },
  table: { w: 6, h: 5 },
  text: { w: 4, h: 2 },
}

export type SizePreset = 'small' | 'medium' | 'large'

/** Sizes offered from the tile menu (the keyboard alternative to resizing by drag). */
export function sizePreset(type: TileType, preset: SizePreset): { w: number; h: number } {
  const base = DEFAULT_SIZES[type]
  if (preset === 'medium') return base
  if (preset === 'small') return { w: Math.max(3, base.w / 2), h: Math.max(2, base.h - 1) }
  return { w: COLS, h: base.h + (type === 'kpi' || type === 'text' ? 0 : 1) }
}

const overlaps = (a: TileLayout, b: TileLayout) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** The first free spot (top to bottom, left to right) for a tile of this size. */
export function placeTile(
  taken: readonly TileLayout[],
  size: { w: number; h: number },
): TileLayout {
  const w = Math.min(COLS, size.w)
  const bottom = taken.reduce((max, item) => Math.max(max, item.y + item.h), 0)
  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x + w <= COLS; x += 1) {
      const candidate = { x, y, w, h: size.h }
      if (!taken.some((item) => overlaps(item, candidate))) return candidate
    }
  }
  return { x: 0, y: bottom, w, h: size.h }
}

export type PlanSize = 'kpi' | 'half' | 'full'

/**
 * Layout for a generated dashboard (F-DASH-09): the KPI row first, then full-width trends, then
 * half-width breakdowns in pairs. `sizes` are in plan order; the result is in the same order.
 */
export function planLayout(tiles: { size: PlanSize; type: TileType }[]): TileLayout[] {
  const out = new Array<TileLayout>(tiles.length)
  let y = 0
  const kpis = tiles.flatMap((tile, i) => (tile.size === 'kpi' ? [i] : []))
  const kpiWidth = kpis.length > 0 ? Math.max(3, Math.floor(COLS / Math.min(4, kpis.length))) : 3
  kpis.forEach((index, n) => {
    const perRow = Math.floor(COLS / kpiWidth)
    out[index] = {
      x: (n % perRow) * kpiWidth,
      y: y + Math.floor(n / perRow) * 2,
      w: kpiWidth,
      h: 2,
    }
  })
  if (kpis.length > 0) y += Math.ceil(kpis.length / Math.floor(COLS / kpiWidth)) * 2
  for (const [index, tile] of tiles.entries()) {
    if (tile.size !== 'full') continue
    const h = DEFAULT_SIZES[tile.type === 'kpi' ? 'chart' : tile.type].h
    out[index] = { x: 0, y, w: COLS, h }
    y += h
  }
  const halves = tiles.flatMap((tile, i) => (tile.size === 'half' ? [i] : []))
  halves.forEach((index, n) => {
    const tile = tiles[index]
    const h = tile?.type === 'table' ? 5 : 4
    out[index] = { x: (n % 2) * 6, y: y + Math.floor(n / 2) * 5, w: 6, h }
  })
  return out
}

/** Reading order: top to bottom, then left to right. */
export const byReadingOrder = (a: TileLayout, b: TileLayout) => a.y - b.y || a.x - b.x

/**
 * Moves a tile one place earlier or later in reading order by swapping positions with its
 * neighbour (the keyboard alternative to dragging). Returns layouts by id.
 */
export function moveTile(
  layouts: ReadonlyMap<string, TileLayout>,
  id: string,
  direction: 'earlier' | 'later',
): Map<string, TileLayout> {
  const order = [...layouts].sort((a, b) => byReadingOrder(a[1], b[1]))
  const index = order.findIndex(([key]) => key === id)
  const other = order[direction === 'earlier' ? index - 1 : index + 1]
  const self = order[index]
  const next = new Map(layouts)
  if (index < 0 || !other || !self) return next
  next.set(self[0], { ...self[1], x: other[1].x, y: other[1].y })
  next.set(other[0], { ...other[1], x: self[1].x, y: self[1].y })
  return next
}
