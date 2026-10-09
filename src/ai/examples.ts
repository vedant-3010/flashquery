import { keywords, overlap } from '@/ai/keywords'

// The example library (F-ASK-19, D112): DuckDB patterns that models often get wrong, on the toy
// schema of the planning prompt. The few nearest a question go into its message (not the cached
// prefix). Every SQL here is run against the toy schema in examples.test.ts. Pure.

export interface Example {
  question: string
  sql: string
  /** Extra words that should match this example ("yoy", "share"). */
  tags: string
}

export const TOY_SCHEMA =
  'orders(order_id BIGINT, order_date DATE, customer_id BIGINT, region VARCHAR, channel VARCHAR, product VARCHAR, units INTEGER, revenue DOUBLE, discount DOUBLE), customers(customer_id BIGINT, segment VARCHAR, signup_date DATE, country VARCHAR)'

export const EXAMPLES: Example[] = [
  {
    question: 'How did revenue change month over month?',
    sql: "WITH monthly AS (SELECT date_trunc('month', order_date) AS month, sum(revenue) AS revenue FROM orders GROUP BY ALL) SELECT month, revenue, revenue / lag(revenue) OVER (ORDER BY month) - 1 AS mom_change_pct FROM monthly ORDER BY month",
    tags: 'mom previous prior monthly change growth trend',
  },
  {
    question: 'Year-over-year revenue growth by region',
    sql: 'WITH yearly AS (SELECT region, year(order_date) AS yr, sum(revenue) AS revenue FROM orders GROUP BY ALL) SELECT region, yr, revenue, revenue / lag(revenue) OVER (PARTITION BY region ORDER BY yr) - 1 AS yoy_growth_pct FROM yearly ORDER BY region, yr',
    tags: 'yoy annual yearly growth increase',
  },
  {
    question: 'Revenue in 2025 compared with 2024, by region',
    sql: 'SELECT region, sum(revenue) FILTER (WHERE year(order_date) = 2024) AS revenue_2024, sum(revenue) FILTER (WHERE year(order_date) = 2025) AS revenue_2025, revenue_2025 - revenue_2024 AS revenue_change FROM orders GROUP BY region ORDER BY revenue_change DESC',
    tags: 'versus vs compare difference change period',
  },
  {
    question: 'What share of revenue does each channel bring in?',
    sql: 'SELECT channel, sum(revenue) AS revenue, sum(revenue) / sum(sum(revenue)) OVER () AS revenue_share FROM orders GROUP BY channel ORDER BY revenue DESC',
    tags: 'percentage percent proportion mix contribution total breakdown',
  },
  {
    question: 'Top 3 products in each region by revenue',
    sql: 'SELECT region, product, sum(revenue) AS revenue FROM orders GROUP BY region, product QUALIFY row_number() OVER (PARTITION BY region ORDER BY sum(revenue) DESC) <= 3 ORDER BY region, revenue DESC',
    tags: 'best top per within group rank highest',
  },
  {
    question: 'Rank regions by revenue',
    sql: 'SELECT region, sum(revenue) AS revenue, dense_rank() OVER (ORDER BY sum(revenue) DESC) AS revenue_rank FROM orders GROUP BY region ORDER BY revenue_rank',
    tags: 'rank ranking position order',
  },
  {
    question: '7-day moving average of daily revenue',
    sql: 'WITH daily AS (SELECT order_date AS day, sum(revenue) AS revenue FROM orders GROUP BY ALL) SELECT day, revenue, avg(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS revenue_7d_avg FROM daily ORDER BY day',
    tags: 'rolling smoothed window weekly average daily trend',
  },
  {
    question: 'Running total of revenue in 2025',
    sql: 'SELECT order_date, sum(sum(revenue)) OVER (ORDER BY order_date) AS cumulative_revenue FROM orders WHERE year(order_date) = 2025 GROUP BY order_date ORDER BY order_date',
    tags: 'cumulative ytd year date accumulated',
  },
  {
    question: 'Median and 90th percentile order value by customer segment',
    sql: 'SELECT c.segment, median(o.revenue) AS median_order_value, quantile_cont(o.revenue, 0.9) AS p90_order_value FROM orders AS o JOIN customers AS c USING (customer_id) GROUP BY c.segment ORDER BY median_order_value DESC',
    tags: 'percentile quantile distribution typical p90',
  },
  {
    question: 'Average order value by channel',
    sql: 'SELECT channel, sum(revenue) / count(DISTINCT order_id) AS avg_order_value FROM orders GROUP BY channel ORDER BY avg_order_value DESC',
    tags: 'aov mean basket',
  },
  {
    question: 'How many unique customers ordered each month?',
    sql: "SELECT date_trunc('month', order_date) AS month, count(DISTINCT customer_id) AS customers FROM orders GROUP BY ALL ORDER BY month",
    tags: 'distinct active buyer count monthly',
  },
  {
    question: 'Which weekday has the most orders?',
    sql: 'SELECT dayname(order_date) AS weekday, isodow(order_date) AS day_number, count(*) AS orders FROM orders GROUP BY ALL ORDER BY day_number',
    tags: 'day week weekend monday busiest',
  },
  {
    question: 'Discount rate by product',
    sql: 'SELECT product, sum(revenue * discount) / NULLIF(sum(revenue), 0) AS discount_rate FROM orders GROUP BY product ORDER BY discount_rate DESC',
    tags: 'ratio rate weighted divide division',
  },
  {
    question: 'How many customers ordered only once?',
    sql: 'SELECT count(*) AS one_time_customers FROM (SELECT customer_id FROM orders GROUP BY customer_id HAVING count(*) = 1)',
    tags: 'repeat single once having frequency',
  },
  {
    question: 'Revenue by customer segment',
    sql: 'SELECT c.segment, sum(o.revenue) AS revenue FROM orders AS o JOIN customers AS c USING (customer_id) GROUP BY c.segment ORDER BY revenue DESC',
    tags: 'join customer segment',
  },
  {
    question: 'Revenue per customer, by country',
    sql: 'WITH per_customer AS (SELECT customer_id, sum(revenue) AS revenue FROM orders GROUP BY customer_id) SELECT c.country, avg(p.revenue) AS revenue_per_customer FROM per_customer AS p JOIN customers AS c USING (customer_id) GROUP BY c.country ORDER BY revenue_per_customer DESC',
    tags: 'join aggregate before average per customer country',
  },
  {
    question: 'Monthly revenue by signup cohort',
    sql: "SELECT date_trunc('month', c.signup_date) AS cohort, date_trunc('month', o.order_date) AS month, sum(o.revenue) AS revenue FROM orders AS o JOIN customers AS c USING (customer_id) GROUP BY ALL ORDER BY cohort, month",
    tags: 'cohort retention signup join',
  },
  {
    question: 'Distribution of order sizes',
    sql: 'SELECT floor(revenue / 100) * 100 AS revenue_bucket, count(*) AS orders FROM orders GROUP BY ALL ORDER BY revenue_bucket',
    tags: 'histogram bucket bin range spread size',
  },
  {
    question: 'Revenue in the latest month versus the month before',
    sql: "WITH monthly AS (SELECT date_trunc('month', order_date) AS month, sum(revenue) AS revenue FROM orders GROUP BY ALL) SELECT month, revenue FROM monthly ORDER BY month DESC LIMIT 2",
    tags: 'latest recent last current previous',
  },
  {
    question: 'Days since each customer last ordered, as of 2025-12-31',
    sql: "SELECT customer_id, date_diff('day', max(order_date), DATE '2025-12-31') AS days_since_last_order FROM orders GROUP BY customer_id ORDER BY days_since_last_order DESC LIMIT 100",
    tags: 'recency inactive since ago days',
  },
  {
    question: 'Products with "pro" in the name',
    sql: "SELECT DISTINCT product FROM orders WHERE product ILIKE '%pro%' ORDER BY product",
    tags: 'contains name search like match text',
  },
]

/** The toy schema's nouns (order, revenue, region…) say nothing about a question's shape. */
const SCHEMA_WORDS = keywords(TOY_SCHEMA.replace(/\b[A-Z]+\b/g, ' '))

const INDEXED = EXAMPLES.map((example) => {
  const words = keywords(`${example.question} ${example.tags}`)
  for (const word of SCHEMA_WORDS) words.delete(word)
  return { example, words }
})

/**
 * The examples nearest a question (shared intent words), best first; ties keep library order. A
 * plain question ("Revenue by region?") gets none.
 */
export function pickExamples(question: string, count = 3): Example[] {
  const asked = keywords(question)
  return INDEXED.map(({ example, words }, i) => ({ example, i, score: overlap(asked, words) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, count)
    .map((entry) => entry.example)
}
