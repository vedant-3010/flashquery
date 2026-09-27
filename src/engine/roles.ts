import { toLogicalType } from '@/engine/normalize'
import type { ColumnRole } from '@/engine/types'

// Semantic role of a column, from its type, name and cardinality. Drives suggested questions,
// chart choice and what the AI context says about each column. Pure.

const ID_NAME = /(^|_)(id|uuid|guid|key|sku|number|no|code)$/
const GEO_NAME =
  /(^|_)(country|countries|region|state|province|city|continent|territory|zip|zipcode|postcode|postal_code|lat|latitude|lon|lng|longitude|geo|location)$/
const TIME_NAME = /(^|_)(year|yr|month|quarter|week|fiscal_year|fy)$/
const MEASURE_NAME =
  /(amount|price|revenue|cost|sales|qty|quantity|units|count|total|profit|income|salary|spend|value|score|balance)/

/** Text/integer columns with at most this many distinct values are categories. */
export const CATEGORY_MAX_DISTINCT = 50

export interface RoleInput {
  name: string
  /** DuckDB type, e.g. "BIGINT". */
  type: string
  approxDistinct: number
  rowCount: number
  nullPct: number
}

export function inferRole(input: RoleInput): ColumnRole {
  const name = input.name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
  const logical = toLogicalType(input.type)

  if (logical === 'boolean') return 'boolean'
  if (logical === 'date' || logical === 'timestamp') return 'time'
  if (logical === 'integer' && TIME_NAME.test(name)) return 'time'
  // Identifier by name. Uniqueness can't be tested reliably (approx_unique is off by up to ~25%), and
  // repeated keys (customer_id on orders) are still identifiers; only low-cardinality codes aren't.
  if ((logical === 'integer' || logical === 'text') && (name === 'id' || ID_NAME.test(name))) {
    return name === 'id' || input.approxDistinct > CATEGORY_MAX_DISTINCT ? 'id' : 'category'
  }
  if (GEO_NAME.test(name) && logical !== 'other') return 'geo'

  if (logical === 'text') {
    const ratio = input.rowCount > 0 ? input.approxDistinct / input.rowCount : 1
    return input.approxDistinct <= CATEGORY_MAX_DISTINCT ||
      (input.approxDistinct <= 1000 && ratio <= 0.2)
      ? 'category'
      : 'text'
  }
  if (logical === 'integer') {
    if (!MEASURE_NAME.test(name) && input.approxDistinct <= 10) return 'category'
    return 'measure'
  }
  if (logical === 'number') return 'measure'
  return 'text'
}
