import type { ColumnMeta } from '@/engine/types'

// A grid column's starting width, from its type and name length (resizable afterwards).

const WIDTH_BY_TYPE: Record<ColumnMeta['logicalType'], number> = {
  integer: 96,
  number: 116,
  date: 108,
  timestamp: 168,
  boolean: 80,
  text: 176,
  other: 176,
}

export function defaultWidth(column: ColumnMeta): number {
  return Math.min(320, Math.max(WIDTH_BY_TYPE[column.logicalType], column.name.length * 7.5 + 60))
}
