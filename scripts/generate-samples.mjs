// Regenerates the bundled sample CSVs in public/samples/ (docs/PRD.md F-DATA-05).
// Deterministic (hash-based, no random()), so re-running produces identical files.
// Usage: node scripts/generate-samples.mjs
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
const dist = (file) =>
  fileURLToPath(new URL(`../node_modules/@duckdb/duckdb-wasm/dist/${file}`, import.meta.url))
const out = (file) => fileURLToPath(new URL(`../public/samples/${file}`, import.meta.url))

const u = (key, salt) => `((hash(${key}, '${salt}') % 1000003) / 1000003.0)`

const HR_ATTRITION = `
WITH d AS (
  SELECT i,
    ${u('i', 'dept')} AS u_dept, ${u('i', 'level')} AS u_level, ${u('i', 'age')} AS u_age,
    ${u('i', 'gender')} AS u_gender, ${u('i', 'edu')} AS u_edu, ${u('i', 'tenure')} AS u_tenure,
    ${u('i', 'income')} AS u_income, ${u('i', 'ot')} AS u_ot, ${u('i', 'sat')} AS u_sat,
    ${u('i', 'perf')} AS u_perf, ${u('i', 'mode')} AS u_mode, ${u('i', 'attr')} AS u_attr,
    ${u('i', 'hire')} AS u_hire
  FROM range(1470) r(i)
), p AS (
  SELECT *,
    CASE WHEN u_dept < 0.30 THEN 'Engineering' WHEN u_dept < 0.52 THEN 'Sales'
         WHEN u_dept < 0.68 THEN 'Support' WHEN u_dept < 0.80 THEN 'Operations'
         WHEN u_dept < 0.88 THEN 'Marketing' WHEN u_dept < 0.94 THEN 'Finance' ELSE 'HR' END AS department,
    CASE WHEN u_level < 0.35 THEN 1 WHEN u_level < 0.65 THEN 2 WHEN u_level < 0.85 THEN 3
         WHEN u_level < 0.95 THEN 4 ELSE 5 END AS job_level,
    CASE WHEN u_ot < 0.28 THEN 'Yes' ELSE 'No' END AS overtime,
    1 + CAST(floor(u_sat * 4) AS INTEGER) AS job_satisfaction
  FROM d
), q AS (
  SELECT *,
    least(60, 22 + CAST(floor(u_age * 18) AS INTEGER) + job_level * 4) AS age,
    CAST(floor(pow(u_tenure, 1.6) * 20) AS INTEGER) AS tenure_raw
  FROM p
), r AS (
  SELECT *,
    least(tenure_raw, age - 21) AS years_at_company,
    CAST(round((2500 + job_level * 2200 + u_income * 3000
      + CASE department WHEN 'Engineering' THEN 900 WHEN 'Finance' THEN 500 ELSE 0 END) / 10) * 10 AS INTEGER) AS monthly_income
  FROM q
)
SELECT
  1000 + i AS employee_id,
  department,
  job_level,
  age,
  CASE WHEN u_gender < 0.46 THEN 'Female' WHEN u_gender < 0.97 THEN 'Male' ELSE 'Non-binary' END AS gender,
  CASE WHEN u_edu < 0.12 THEN 'High School' WHEN u_edu < 0.67 THEN 'Bachelor'
       WHEN u_edu < 0.95 THEN 'Master' ELSE 'Doctorate' END AS education,
  CASE WHEN u_mode < 0.35 THEN 'Remote' WHEN u_mode < 0.65 THEN 'Hybrid' ELSE 'Office' END AS work_mode,
  DATE '2025-06-30' - (years_at_company * 365 + CAST(floor(u_hire * 365) AS INTEGER)) AS hire_date,
  years_at_company,
  monthly_income,
  overtime,
  job_satisfaction,
  CASE WHEN u_perf < 0.15 THEN 2 WHEN u_perf < 0.80 THEN 3 ELSE 4 END AS performance_rating,
  CASE WHEN u_attr < 0.06
      + CASE WHEN overtime = 'Yes' THEN 0.13 ELSE 0 END
      + CASE WHEN job_satisfaction = 1 THEN 0.10 ELSE 0 END
      + CASE WHEN job_level = 1 THEN 0.06 ELSE 0 END
      + CASE WHEN years_at_company < 2 THEN 0.07 ELSE 0 END
      - CASE WHEN monthly_income > 12000 THEN 0.04 ELSE 0 END
    THEN 'Yes' ELSE 'No' END AS attrition
FROM r
ORDER BY employee_id`

const WEB_TRAFFIC = `
WITH days AS (
  SELECT CAST(d AS DATE) AS date FROM range(DATE '2024-01-01', DATE '2025-07-01', INTERVAL 1 DAY) t(d)
), channels AS (
  SELECT * FROM (VALUES ('Organic Search', 1.00, 0.021), ('Paid Search', 0.55, 0.034),
    ('Social', 0.45, 0.012), ('Email', 0.22, 0.041), ('Direct', 0.60, 0.028), ('Referral', 0.18, 0.025))
    v(channel, weight, cvr)
), devices AS (
  SELECT * FROM (VALUES ('Desktop', 0.42, 1.25), ('Mobile', 0.50, 0.75), ('Tablet', 0.08, 0.90)) v(device, share, cvr_mult)
), grid AS (
  SELECT date, channel, device, weight, cvr, share, cvr_mult,
    ${u('date, channel, device', 'sessions')} AS u_sessions,
    ${u('date, channel, device', 'users')} AS u_users,
    ${u('date, channel, device', 'pages')} AS u_pages,
    ${u('date, channel, device', 'bounce')} AS u_bounce,
    ${u('date, channel, device', 'conv')} AS u_conv,
    ${u('date, channel, device', 'aov')} AS u_aov
  FROM days, channels, devices
), metrics AS (
  SELECT *,
    CAST(round(1800 * weight * share
      * (1 + (date - DATE '2024-01-01') * 0.0009)
      * CASE WHEN dayofweek(date) IN (0, 6) THEN 0.8 ELSE 1 END
      * (0.85 + u_sessions * 0.3)) AS INTEGER) AS sessions
  FROM grid
)
SELECT
  date, channel, device, sessions,
  CAST(round(sessions * (0.74 + u_users * 0.12)) AS INTEGER) AS users,
  CAST(round(sessions * (1.8 + u_pages * 1.4)) AS INTEGER) AS pageviews,
  round(CASE WHEN device = 'Mobile' THEN 0.46 ELSE 0.36 END + (u_bounce - 0.5) * 0.12, 3) AS bounce_rate,
  CAST(round(sessions * cvr * cvr_mult * (0.8 + u_conv * 0.4)) AS INTEGER) AS conversions,
  round(round(sessions * cvr * cvr_mult * (0.8 + u_conv * 0.4)) * (48 + u_aov * 40), 2) AS revenue
FROM metrics
ORDER BY date, channel, device`

// A small company's books, 2023–2025 (F-DATA-05, D117): invoices to customers (income) and bills
// from vendors (expenses), each with its due and paid dates as of 2025-12-31, so receivables,
// payables, margins and spend can all be asked about. Payroll and rent are monthly.
const AS_OF = "DATE '2025-12-31'"
const CUSTOMERS = [
  'Bluebird Logistics',
  'Harbor Health Clinics',
  'Summit Outdoor Co.',
  'Lumen Analytics',
  'Orchard Foods',
  'Granite Builders',
  'Atlas Freight',
  'Brightside Dental',
  'Copperleaf Hotels',
  'Driftwood Studios',
  'Evergreen Schools',
  'Foxglove Pharmacy',
  'Ironclad Security',
  'Juniper Retail',
  'Keystone Legal',
  'Larkspur Media',
  'Meridian Travel',
  'Nimbus Cloud Labs',
  'Oakridge Farms',
  'Pioneer Auto Parts',
  'Quarry Lane Architects',
  'Riverbend Clinics',
  'Silverline Events',
  'Tidewater Marine',
  'Upland Coffee Roasters',
  'Vantage Fitness',
  'Willow Creek Vets',
  'Cedar & Pine Interiors',
  'Maple Street Bakery',
  'Northfield Insurance',
]
// Slow payers: some of the larger customers, so "who owes us most" has an answer worth seeing.
const SLOW = [1, 4, 9, 17]
// category, P&L group, department, weight, typical amount, vendors
const EXPENSES = [
  [
    'Hosting',
    'Cost of sales',
    'Engineering',
    0.12,
    2200,
    ['Skyline Cloud Hosting', 'Stratus Data Centers'],
  ],
  [
    'Contractors',
    'Cost of sales',
    'Operations',
    0.12,
    4800,
    ['Brightwire Contractors', 'Keel & Co Consulting', 'Fieldwork Partners'],
  ],
  ['Payment fees', 'Cost of sales', 'Finance', 0.08, 600, ['Paylane Payments']],
  [
    'Software',
    'Operating expenses',
    null,
    0.14,
    900,
    ['Codebase Software', 'Teamtools', 'Inkwell Docs'],
  ],
  [
    'Marketing',
    'Operating expenses',
    'Marketing',
    0.14,
    3200,
    ['Adwise Marketing', 'Pixelcraft Design', 'Signal Events'],
  ],
  ['Travel', 'Operating expenses', 'Sales', 0.12, 1100, ['Wayfarer Travel', 'Northline Air']],
  ['Office supplies', 'Operating expenses', 'Operations', 0.08, 350, ['Paper & Pen Supplies']],
  [
    'Professional fees',
    'Operating expenses',
    'Finance',
    0.06,
    2600,
    ['Ledgerline Accountants', 'Northgate Legal'],
  ],
  ['Utilities', 'Operating expenses', 'Operations', 0.05, 700, ['Metro Power & Water']],
  ['Insurance', 'Operating expenses', 'Finance', 0.03, 1900, ['Clearview Insurance']],
  ['Training', 'Operating expenses', 'HR', 0.06, 800, ['Pinnacle Training']],
]
const DEPARTMENTS = ['Engineering', 'Sales', 'Marketing', 'Operations', 'Finance', 'HR']
const PAYROLL = {
  Engineering: 96000,
  Sales: 54000,
  Marketing: 30000,
  Operations: 38000,
  Finance: 22000,
  HR: 16000,
}

const quote = (text) => `'${text.replaceAll("'", "''")}'`
const pick = (list, uniform) =>
  list.length === 1
    ? quote(list[0])
    : `CASE ${list.map((item, i) => (i < list.length - 1 ? `WHEN ${uniform} < ${(i + 1) / list.length} THEN ${quote(item)}` : `ELSE ${quote(item)}`)).join(' ')} END`
let cumulative = 0
const expenseCase = (field) =>
  `CASE ${EXPENSES.map((e, i) => {
    cumulative = i === 0 ? e[3] : cumulative + e[3]
    const value = typeof field === 'function' ? field(e) : quote(e[field])
    return i < EXPENSES.length - 1
      ? `WHEN u_cat < ${cumulative.toFixed(4)} THEN ${value}`
      : `ELSE ${value}`
  }).join(' ')} END`

const COMPANY_FINANCES = `
WITH base AS (
  SELECT i,
    ${u('i', 'type')} AS u_type, ${u('i', 'day')} AS u_day, ${u('i', 'cat')} AS u_cat,
    ${u('i', 'who')} AS u_who, ${u('i', 'amt')} AS u_amt, ${u('i', 'pay')} AS u_pay,
    ${u('i', 'dept')} AS u_dept, ${u('i', 'bad')} AS u_bad
  FROM range(16000) r(i)
), dated AS (
  SELECT *, DATE '2023-01-01' + CAST(floor(pow(u_day, 0.85) * 1096) AS INTEGER) AS date
  FROM base
), income AS (
  SELECT i, date, u_amt, u_pay, u_bad,
    CAST(floor(pow(u_who, 1.7) * ${CUSTOMERS.length}) AS INTEGER) AS k,
    CASE WHEN u_cat < 0.5 THEN 'Subscriptions' WHEN u_cat < 0.8 THEN 'Services'
         WHEN u_cat < 0.92 THEN 'Licenses' ELSE 'Training' END AS category
  FROM dated WHERE u_type < 0.46
), income_rows AS (
  SELECT date, 'Income' AS type, 'Revenue' AS pl_group, category,
    list_extract([${CUSTOMERS.map(quote).join(', ')}], k + 1) AS counterparty,
    'Sales' AS department,
    round(CASE category WHEN 'Subscriptions' THEN 1800 WHEN 'Services' THEN 5200
                        WHEN 'Licenses' THEN 9000 ELSE 1500 END
      * (0.5 + u_amt * 1.2) * (1 + datediff('month', DATE '2023-01-01', date) * 0.015)
      * (1 + (${CUSTOMERS.length - 1} - k) / 60.0), 2) AS amount,
    'INV-' || lpad(CAST(row_number() OVER (ORDER BY date, i) AS VARCHAR), 5, '0') AS document_no,
    CASE k % 3 WHEN 0 THEN 30 WHEN 1 THEN 45 ELSE 14 END AS terms,
    CASE WHEN k IN (${SLOW.join(', ')}) THEN 25 + CAST(floor(u_pay * 70) AS INTEGER)
         ELSE -8 + CAST(floor(u_pay * 20) AS INTEGER) END AS late,
    u_bad < 0.008 AS bad_debt
  FROM income
), expense AS (
  SELECT i, date, u_amt, u_pay, u_who, u_dept,
    ${expenseCase(0)} AS category,
    ${expenseCase(1)} AS pl_group,
    ${expenseCase((e) => (e[2] ? quote(e[2]) : pick(DEPARTMENTS, 'u_dept')))} AS department,
    ${expenseCase((e) => String(e[4]))} AS typical,
    ${expenseCase((e) => pick(e[5], 'u_who'))} AS counterparty
  FROM dated WHERE u_type >= 0.46
), expense_rows AS (
  SELECT date, 'Expense' AS type, pl_group, category, counterparty, department,
    round(typical * (0.4 + u_amt * 1.3) * (1 + datediff('month', DATE '2023-01-01', date) * 0.01), 2) AS amount,
    'BILL-' || lpad(CAST(row_number() OVER (ORDER BY date, i) AS VARCHAR), 5, '0') AS document_no,
    30 AS terms, -12 + CAST(floor(u_pay * 22) AS INTEGER) AS late, false AS bad_debt
  FROM expense
), months AS (
  SELECT CAST(m AS DATE) AS month FROM range(DATE '2023-01-01', DATE '2026-01-01', INTERVAL 1 MONTH) t(m)
), fixed_rows AS (
  SELECT last_day(month) AS date, 'Expense' AS type, 'Operating expenses' AS pl_group, 'Payroll' AS category,
    'Staff payroll' AS counterparty, d.department,
    round(d.monthly * (1 + datediff('month', DATE '2023-01-01', month) * 0.008), 2) AS amount,
    'PAY-' || strftime(month, '%Y%m') || '-' || upper(left(d.department, 3)) AS document_no,
    0 AS terms, 0 AS late, false AS bad_debt
  FROM months, (VALUES ${Object.entries(PAYROLL)
    .map(([dept, monthly]) => `(${quote(dept)}, ${monthly})`)
    .join(', ')}) d(department, monthly)
  UNION ALL
  SELECT month, 'Expense', 'Operating expenses', 'Rent', 'DeskSpace Properties', 'Operations',
    CASE WHEN month < DATE '2024-07-01' THEN 14500 ELSE 18900 END,
    'RENT-' || strftime(month, '%Y%m'), 5, 0, false
  FROM months
), all_rows AS (
  SELECT * FROM income_rows UNION ALL SELECT * FROM expense_rows UNION ALL SELECT * FROM fixed_rows
), paid AS (
  SELECT *, date + terms AS due_date,
    CASE WHEN bad_debt OR date + terms + late > ${AS_OF} THEN NULL ELSE date + terms + late END AS paid_date
  FROM all_rows
)
SELECT date, type, pl_group, category, counterparty, department, amount,
  CASE WHEN category IN ('Payroll', 'Insurance') THEN 0 ELSE round(amount * 0.10, 2) END AS tax,
  document_no, due_date, paid_date,
  CASE WHEN paid_date IS NOT NULL THEN 'Paid' WHEN due_date < ${AS_OF} THEN 'Overdue' ELSE 'Open' END AS status
FROM paid
ORDER BY date, document_no`

const db = await duckdb.createDuckDB(
  {
    mvp: { mainModule: dist('duckdb-mvp.wasm'), mainWorker: dist('duckdb-node-mvp.worker.cjs') },
    eh: { mainModule: dist('duckdb-eh.wasm'), mainWorker: dist('duckdb-node-eh.worker.cjs') },
  },
  new duckdb.VoidLogger(),
  duckdb.NODE_RUNTIME,
)
await db.instantiate()
db.open({})
const conn = db.connect()

// DuckDB's Node runtime writes COPY output to the real disk: use a temp dir, then copy the result.
const scratch = mkdtempSync(join(tmpdir(), 'flashQuery-samples-'))
for (const [file, sql] of [
  ['hr_attrition.csv', HR_ATTRITION],
  ['web_traffic.csv', WEB_TRAFFIC],
  ['company_finances.csv', COMPANY_FINANCES],
]) {
  const path = join(scratch, file)
  conn.query(`COPY (${sql}) TO '${path}' (FORMAT csv, HEADER)`)
  const bytes = readFileSync(path)
  writeFileSync(out(file), bytes)
  const rows = conn.query(`SELECT count(*) AS n FROM (${sql})`).toArray()[0].toJSON().n
  console.log(`${file}: ${rows} rows, ${(bytes.length / 1024).toFixed(0)} KB`)
}
rmSync(scratch, { recursive: true, force: true })
conn.close()
