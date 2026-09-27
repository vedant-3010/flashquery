// Regenerates the bundled sample CSVs in public/samples/ (docs/PRD.md F-DATA-05).
// Deterministic (hash-based, no random()), so re-running produces identical files.
// Usage: node scripts/generate-samples.mjs
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
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

for (const [file, sql] of [
  ['hr_attrition.csv', HR_ATTRITION],
  ['web_traffic.csv', WEB_TRAFFIC],
]) {
  conn.query(`COPY (${sql}) TO '${file}' (FORMAT csv, HEADER)`)
  const bytes = db.copyFileToBuffer(file)
  writeFileSync(out(file), bytes)
  const rows = conn.query(`SELECT count(*) AS n FROM (${sql})`).toArray()[0].toJSON().n
  console.log(`${file}: ${rows} rows, ${(bytes.length / 1024).toFixed(0)} KB`)
}
conn.close()
