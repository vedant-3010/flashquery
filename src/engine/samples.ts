import { quoteIdent } from '@/engine/naming'

/*
 * "Global Sales" demo data (docs/PRD.md §9), generated in DuckDB from range(n). Deterministic: every
 * pseudo-random value is u('<salt>') = (hash(i, '<salt>') % 1000003) / 1000003, never random(), so the
 * same n always produces the same table. Shape of the generated SQL (see globalSalesSql()):
 *
 *   WITH draws AS (SELECT i, u('cell'), u('country'), u('channel'), ... FROM range(n) r(i)),
 *        picks AS (SELECT *, CASE u_cell < p1 THEN 0 ... END AS cell,           -- (region, year) cell
 *                            CASE u_category ... END AS category_idx, ... FROM draws),
 *        dated AS (SELECT *, make_date(2022 + cell % 4, month, 1) + day offset AS order_date ...),
 *        priced AS (SELECT *, discount, units, unit_price ... FROM dated)
 *   SELECT row_number() OVER (ORDER BY order_date, i) AS order_id, order_date, region, country, ...,
 *          round(units * unit_price * (1 - discount), 2) AS revenue, ... FROM priced ORDER BY order_id
 *
 * Region × year volumes grow at the PRD rates (APAC +35%/yr ... North America +4%/yr), so "Which region
 * grew fastest?" always answers APAC. Electronics and Apparel get +25% volume in Q4. Rows are ordered
 * by date and order_id follows that order (PRD D14), so previews look like a real order log.
 */

export const GLOBAL_SALES_TABLE = 'global_sales'
export const FIRST_YEAR = 2022
const YEARS = 4

interface Region {
  name: string
  /** Share of 2022 order volume. */
  base: number
  /** Year-over-year volume growth. */
  growth: number
  countries: string[]
}

const REGIONS: Region[] = [
  {
    name: 'North America',
    base: 0.32,
    growth: 0.04,
    countries: ['United States', 'Canada', 'Mexico'],
  },
  {
    name: 'Europe',
    base: 0.28,
    growth: 0.06,
    countries: ['Germany', 'United Kingdom', 'France', 'Spain'],
  },
  {
    name: 'APAC',
    base: 0.2,
    growth: 0.35,
    countries: ['India', 'Japan', 'Australia', 'Singapore'],
  },
  {
    name: 'LATAM',
    base: 0.12,
    growth: 0.18,
    countries: ['Brazil', 'Argentina', 'Chile', 'Colombia'],
  },
  {
    name: 'MEA',
    base: 0.08,
    growth: 0.12,
    countries: ['United Arab Emirates', 'Saudi Arabia', 'South Africa', 'Egypt'],
  },
]

interface Category {
  name: string
  share: number
  /** cost = revenue × this (± 3%); profit margin is 1 − factor. */
  costFactor: number
  returnRate: number
  q4Uplift: number
  products: [name: string, unitPrice: number][]
}

const CATEGORIES: Category[] = [
  {
    name: 'Electronics',
    share: 0.24,
    costFactor: 0.8,
    returnRate: 0.045,
    q4Uplift: 0.25,
    products: [
      ['Laptop Pro 14', 1499],
      ['Smartphone X', 899],
      ['4K Monitor', 399],
      ['Smartwatch', 249],
      ['Wireless Earbuds', 149],
    ],
  },
  {
    name: 'Home',
    share: 0.22,
    costFactor: 0.66,
    returnRate: 0.025,
    q4Uplift: 0,
    products: [
      ['Robot Vacuum', 349],
      ['Air Purifier', 219],
      ['Cookware Set', 129],
      ['Coffee Maker', 89],
      ['Desk Lamp', 39],
    ],
  },
  {
    name: 'Apparel',
    share: 0.2,
    costFactor: 0.55,
    returnRate: 0.09,
    q4Uplift: 0.25,
    products: [
      ['Running Jacket', 119],
      ['Sneakers', 109],
      ['Wool Sweater', 89],
      ['Denim Jeans', 69],
      ['Cotton T-Shirt', 19],
    ],
  },
  {
    name: 'Beauty',
    share: 0.16,
    costFactor: 0.6,
    returnRate: 0.025,
    q4Uplift: 0,
    products: [
      ['Perfume', 95],
      ['Hair Dryer', 79],
      ['Skincare Set', 65],
      ['Face Serum', 45],
      ['Lip Balm', 5],
    ],
  },
  {
    name: 'Sports',
    share: 0.18,
    costFactor: 0.72,
    returnRate: 0.025,
    q4Uplift: 0,
    products: [
      ['Road Bike', 1199],
      ['Tennis Racket', 179],
      ['Dumbbell Set', 149],
      ['Hiking Backpack', 99],
      ['Yoga Mat', 35],
    ],
  },
]

const CHANNELS: [string, number][] = [
  ['Online', 0.55],
  ['Retail', 0.3],
  ['Partner', 0.15],
]

const SEGMENTS: [string, number, number][] = [
  // name, share, units multiplier
  ['Consumer', 0.62, 1],
  ['SMB', 0.26, 1.2],
  ['Enterprise', 0.12, 1.6],
]

const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`
const sqlList = (values: (string | number)[]) =>
  `[${values.map((v) => (typeof v === 'string' ? sqlString(v) : String(v))).join(', ')}]`

/** CASE returning the 0-based index of the bucket `u` falls into, given bucket weights. */
function bucketCase(u: string, weights: number[]): string {
  const total = weights.reduce((sum, w) => sum + w, 0)
  let cumulative = 0
  const branches = weights.slice(0, -1).map((weight, index) => {
    cumulative += weight / total
    return `WHEN ${u} < ${cumulative.toFixed(6)} THEN ${index}`
  })
  return `CASE ${branches.join(' ')} ELSE ${weights.length - 1} END`
}

const u = (salt: string) => `(hash(i, '${salt}') % 1000003) / 1000003.0`

/** Weights of the region × year cells, index = regionIndex * YEARS + yearOffset. */
function cellWeights(): number[] {
  return REGIONS.flatMap((region) =>
    Array.from({ length: YEARS }, (_, year) => region.base * (1 + region.growth) ** year),
  )
}

function monthWeights(uplift: number): number[] {
  return Array.from({ length: 12 }, (_, month) => (month >= 9 ? 1 + uplift : 1))
}

export function globalSalesSql(rows: number): string {
  const n = Math.max(0, Math.floor(rows))
  const seasonal = bucketCase('u_month', monthWeights(0.25))
  const flat = bucketCase('u_month', monthWeights(0))
  const upliftCategories = CATEGORIES.flatMap((c, index) => (c.q4Uplift > 0 ? [index] : []))
  const products = CATEGORIES.flatMap((c) => c.products)
  const countries = `[${REGIONS.map((r) => sqlList(r.countries)).join(', ')}][region_idx + 1]`

  return `WITH draws AS (
  SELECT i,
    ${u('cell')} AS u_cell, ${u('country')} AS u_country, ${u('channel')} AS u_channel,
    ${u('category')} AS u_category, ${u('product')} AS u_product, ${u('segment')} AS u_segment,
    ${u('month')} AS u_month, ${u('day')} AS u_day, ${u('units')} AS u_units,
    ${u('discount')} AS u_discount, ${u('returned')} AS u_returned, ${u('cost')} AS u_cost
  FROM range(${n}) r(i)
), picks AS (
  SELECT *,
    ${bucketCase('u_cell', cellWeights())} AS cell,
    ${bucketCase(
      'u_category',
      CATEGORIES.map((c) => c.share),
    )} AS category_idx,
    ${bucketCase(
      'u_channel',
      CHANNELS.map(([, share]) => share),
    )} AS channel_idx,
    ${bucketCase(
      'u_segment',
      SEGMENTS.map(([, share]) => share),
    )} AS segment_idx
  FROM draws
), dated AS (
  SELECT *,
    cell // ${YEARS} AS region_idx,
    ${FIRST_YEAR} + cell % ${YEARS} AS yr,
    1 + CASE WHEN category_idx IN (${upliftCategories.join(', ')}) THEN ${seasonal} ELSE ${flat} END AS mon
  FROM picks
), priced AS (
  SELECT *,
    make_date(yr, mon, 1) + CAST(floor(u_day * day(last_day(make_date(yr, mon, 1)))) AS INTEGER) AS order_date,
    round(greatest(0, u_discount - 0.4) / 0.6 * 0.30, 2) AS discount,
    category_idx * 5 + CAST(floor(u_product * 5) AS INTEGER) AS product_idx
  FROM dated
)
SELECT
  CAST(row_number() OVER (ORDER BY order_date, i) AS BIGINT) AS order_id,
  order_date,
  ${sqlList(REGIONS.map((r) => r.name))}[region_idx + 1] AS region,
  list_extract(${countries}, 1 + CAST(floor(u_country * len(${countries})) AS INTEGER)) AS country,
  ${sqlList(CHANNELS.map(([name]) => name))}[channel_idx + 1] AS channel,
  ${sqlList(CATEGORIES.map((c) => c.name))}[category_idx + 1] AS category,
  ${sqlList(products.map(([name]) => name))}[product_idx + 1] AS product,
  ${sqlList(SEGMENTS.map(([name]) => name))}[segment_idx + 1] AS customer_segment,
  CAST(least(20, 1 + floor(pow(u_units, 2.2) * 12 * (1 + discount * 2.5)
    * ${sqlList(SEGMENTS.map(([, , multiplier]) => multiplier))}[segment_idx + 1])) AS INTEGER) AS units,
  CAST(${sqlList(products.map(([, price]) => price))}[product_idx + 1] AS DOUBLE) AS unit_price,
  discount,
  round(units * unit_price * (1 - discount), 2) AS revenue,
  round(revenue * (${sqlList(CATEGORIES.map((c) => c.costFactor))}[category_idx + 1] + (u_cost - 0.5) * 0.06), 2) AS cost,
  u_returned < ${sqlList(CATEGORIES.map((c) => c.returnRate))}[category_idx + 1] AS returned
FROM priced
ORDER BY order_id`
}

export function createGlobalSalesSql(rows: number, table = GLOBAL_SALES_TABLE): string {
  return `CREATE OR REPLACE TABLE ${quoteIdent(table)} AS\n${globalSalesSql(rows)}`
}

export type SampleId =
  'global-sales-10k' | 'global-sales-100k' | 'global-sales-1m' | 'hr-attrition' | 'web-traffic'

export type SampleDefinition = {
  id: SampleId
  label: string
  description: string
  table: string
} & ({ kind: 'generated'; rows: number } | { kind: 'csv'; path: string; fileName: string })

export const SAMPLES: SampleDefinition[] = [
  {
    id: 'global-sales-1m',
    kind: 'generated',
    rows: 1_000_000,
    table: GLOBAL_SALES_TABLE,
    label: 'Global Sales · 1M rows',
    description: 'Orders 2022–2025 by region, product and channel, generated in your browser.',
  },
  {
    id: 'global-sales-100k',
    kind: 'generated',
    rows: 100_000,
    table: GLOBAL_SALES_TABLE,
    label: 'Global Sales · 100k rows',
    description: 'Same data, smaller.',
  },
  {
    id: 'global-sales-10k',
    kind: 'generated',
    rows: 10_000,
    table: GLOBAL_SALES_TABLE,
    label: 'Global Sales · 10k rows',
    description: 'Same data, smallest.',
  },
  {
    id: 'hr-attrition',
    kind: 'csv',
    path: '/samples/hr_attrition.csv',
    fileName: 'hr_attrition.csv',
    table: 'hr_attrition',
    label: 'HR attrition (CSV)',
    description: '1,470 synthetic employees with department, pay, overtime and attrition.',
  },
  {
    id: 'web-traffic',
    kind: 'csv',
    path: '/samples/web_traffic.csv',
    fileName: 'web_traffic.csv',
    table: 'web_traffic',
    label: 'Web traffic (CSV)',
    description: 'Daily sessions, conversions and revenue by channel and device, 2024–mid 2025.',
  },
]
