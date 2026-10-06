// Every number and sample on the landing page, in one place, and all of it real (PRD D99):
// - growth: the demo question's own SQL run on the 1,000,000-row Global Sales sample;
// - bench: the benchmark run recorded in PRD D79 (production build, Chrome 153, 10 cores);
// - payloads: what src/ai/context.ts builds for TOY_DATASET in each privacy mode.
// data.test.ts checks the SQL against the demo fixture and the payloads against the context builder.

export const ROWS = 1_000_000
export const DEMO_FILE = { name: 'sales.csv', columns: 14 }
export const DEMO_QUESTION = 'Which region grew fastest?'

export const DEMO_SQL = `WITH yearly AS (
  SELECT region, year(order_date) AS yr, sum(revenue) AS revenue
  FROM global_sales
  WHERE year(order_date) IN (2022, 2025)
  GROUP BY ALL
)
SELECT region,
       round(sum(revenue) FILTER (WHERE yr = 2022), 2) AS revenue_2022,
       round(sum(revenue) FILTER (WHERE yr = 2025), 2) AS revenue_2025,
       round((revenue_2025 - revenue_2022) / revenue_2022, 4) AS growth_pct
FROM yearly
GROUP BY region
ORDER BY growth_pct DESC`

export interface RegionGrowth {
  region: string
  revenue2022: number
  revenue2025: number
  growth: number
}

export const GROWTH: RegionGrowth[] = [
  { region: 'APAC', revenue2022: 57_400_174.6, revenue2025: 137_865_024.26, growth: 1.4018 },
  { region: 'LATAM', revenue2022: 33_844_829.49, revenue2025: 56_088_248.26, growth: 0.6572 },
  { region: 'MEA', revenue2022: 22_268_298.91, revenue2025: 31_408_569.28, growth: 0.4105 },
  { region: 'Europe', revenue2022: 79_297_087.28, revenue2025: 94_612_089.33, growth: 0.1931 },
  {
    region: 'North America',
    revenue2022: 92_233_842.08,
    revenue2025: 102_138_436.54,
    growth: 0.1074,
  },
]

export const PIPELINE_STEPS = [
  { label: 'Reading schema', ms: 2 },
  { label: 'Writing SQL', ms: 1840 },
  { label: 'Checking SQL', ms: 31 },
  { label: 'Running', ms: 23 },
] as const

/** PRD D79: localhost production build, headless Chrome 153, 10 cores, 1M rows. */
export const BENCH = {
  environment: 'Production build, Chrome 153, 10 cores, 1,000,000 rows',
  stats: [
    {
      id: 'generate',
      value: 0.78,
      unit: 's',
      digits: 2,
      label: 'to generate 1,000,000 rows',
      budget: 5,
      budgetLabel: 'budget 5 s',
    },
    {
      id: 'ingest',
      value: 0.56,
      unit: 's',
      digits: 2,
      label: 'to load a 102 MB CSV',
      budget: 15,
      budgetLabel: 'budget 15 s',
    },
    {
      id: 'query',
      value: 23,
      unit: 'ms',
      digits: 0,
      label: 'p95 for an aggregation over 1M rows',
      budget: 500,
      budgetLabel: 'budget 500 ms',
    },
    {
      id: 'scroll',
      value: 0,
      unit: '',
      digits: 0,
      label: 'long tasks while scrolling 1M rows',
      budget: 1,
      budgetLabel: 'budget: none over 50 ms',
    },
    {
      id: 'bundle',
      value: 278,
      unit: 'KB',
      digits: 0,
      label: 'of JavaScript before the app is usable',
      budget: 350,
      budgetLabel: 'budget 350 KB',
    },
  ],
} as const

// ---- Privacy modes: the request's table line, exactly as src/ai/context.ts builds it ----

export const PAYLOAD_STRICT = {
  name: 'orders',
  rows: 1000000,
  columns: [
    { name: 'order_date', type: 'DATE', role: 'time' },
    { name: 'region', type: 'VARCHAR', role: 'geo' },
    {
      name: 'revenue',
      type: 'DOUBLE',
      role: 'measure',
      description: 'Order value after discount',
      unit: 'USD',
    },
  ],
  notes: 'Fiscal year starts in April.',
}

export const PAYLOAD_BALANCED = {
  name: 'orders',
  rows: 1000000,
  columns: [
    {
      name: 'order_date',
      type: 'DATE',
      role: 'time',
      nullPct: 0,
      distinct: 1461,
      min: '2022-01-01',
      max: '2025-12-31',
    },
    {
      name: 'region',
      type: 'VARCHAR',
      role: 'geo',
      nullPct: 0,
      distinct: 5,
      topValues: ['North America', 'Europe', 'APAC'],
    },
    {
      name: 'revenue',
      type: 'DOUBLE',
      role: 'measure',
      description: 'Order value after discount',
      unit: 'USD',
      nullPct: 0,
      distinct: 213904,
      min: 4.5,
      max: 29980,
    },
  ],
  notes: 'Fiscal year starts in April.',
  sampleColumns: ['order_date', 'region', 'revenue'],
  sampleRows: [
    ['2022-01-01', 'North America', 1798],
    ['2022-01-01', 'APAC', 642.6],
    ['2022-01-02', 'Europe', 87.2],
  ],
}

export interface PayloadField {
  key: string
  /** The value as JSON. */
  value: string
  /** Sent in Strict mode too. */
  strict: boolean
}

/** Each column's fields, marking the ones Strict mode leaves out. */
export function columnFields(): PayloadField[][] {
  return PAYLOAD_BALANCED.columns.map((column, index) => {
    const strict = (PAYLOAD_STRICT.columns[index] ?? {}) as Record<string, unknown>
    return Object.entries(column).map(([key, value]) => ({
      key,
      value: JSON.stringify(value),
      strict: key in strict,
    }))
  })
}

export const APP_URL = '/app/'
export const TRY_URL = '/app/#/try'
export const BENCH_URL = '/app/#/bench'
