# NL→SQL eval report

2026-10-09 · OpenAI `gpt-6-luna` · balanced mode · medium effort · Global Sales 10,000 rows

**Execution accuracy: 51/53 (96.2%)**, 0 after a self-correction. 192,727 tokens, ≈ $0.02.

| Dataset | Correct | Accuracy |
|---|---|---|
| global_sales | 37/38 | 97.4% |
| hr_attrition | 14/15 | 93.3% |

| Outcome | Questions |
|---|---|
| Correct | 51 |
| Wrong result | 2 |

## Questions

| Id | Question | Outcome | Attempts | Seconds |
|---|---|---|---|---|
| gs-total-revenue | What is the total revenue? | ✅ | 1 | 2.8 |
| gs-order-count | How many orders are there? | ✅ | 1 | 4.4 |
| gs-revenue-by-region | Total revenue by region | ✅ | 1 | 2.8 |
| gs-region-growth-rank | Rank regions by revenue growth from 2022 to 2025 | ✅ | 1 | 5.2 |
| gs-top5-countries | Top 5 countries by revenue | ✅ | 1 | 2.3 |
| gs-monthly-revenue | Monthly revenue over time | ✅ | 1 | 3.0 |
| gs-revenue-by-year | Revenue by year | ✅ | 1 | 3.1 |
| gs-avg-order-value | What is the average order value? | ✅ | 1 | 2.5 |
| gs-revenue-by-channel | Revenue by channel | ✅ | 1 | 2.4 |
| gs-top10-products-units | Top 10 products by units sold | ✅ | 1 | 2.5 |
| gs-returns-by-category | How many orders were returned in each category? | ✅ | 1 | 3.9 |
| gs-profit-by-category | Profit (revenue minus cost) by category | ✅ | 1 | 2.6 |
| gs-electronics-q4-2024 | Electronics revenue in Q4 2024 | ✅ | 1 | 2.6 |
| gs-apac-2025 | Total APAC revenue in 2025 | ✅ | 1 | 3.2 |
| gs-orders-by-segment | Number of orders by customer segment | ✅ | 1 | 3.8 |
| gs-avg-discount-by-channel | Average discount by channel | ✅ | 1 | 3.3 |
| gs-units-category-year | Units sold per category per year | ✅ | 1 | 3.1 |
| gs-best-month-2024 | Which month in 2024 had the highest revenue? | ✅ | 1 | 3.1 |
| gs-country-count | How many countries do we sell in? | ✅ | 1 | 2.6 |
| gs-europe-countries | Revenue by country in Europe | ✅ | 1 | 2.7 |
| gs-max-order-revenue | What is the highest revenue of any single order? | ✅ | 1 | 4.2 |
| gs-enterprise-avg-units | Average units per order for Enterprise customers | ❌ Wrong result | 2 | 9.9 |
| gs-most-returns-category | Which category has the most returned orders? | ✅ | 1 | 5.3 |
| gs-quarterly-2025 | Quarterly revenue in 2025 | ✅ | 1 | 2.5 |
| gs-top3-products-apac | Top 3 products by revenue in APAC | ✅ | 1 | 2.5 |
| gs-avg-price-by-category | Average unit price by category | ✅ | 1 | 2.4 |
| gs-mexico-orders-2023 | How many orders came from Mexico in 2023? | ✅ | 1 | 2.4 |
| gs-partner-vs-retail | Compare revenue from the Partner and Retail channels | ✅ | 1 | 3.0 |
| gs-cost-2024 | Total cost in 2024 | ✅ | 1 | 2.9 |
| gs-discounted-orders | How many orders had a discount? | ✅ | 1 | 3.5 |
| gs-monthly-orders-2025 | Number of orders per month in 2025 | ✅ | 1 | 3.5 |
| gs-revenue-region-year | Revenue by region and year | ✅ | 1 | 2.8 |
| gs-online-revenue-last-year | How much revenue came from the Online channel last year? | ✅ | 1 | 2.9 |
| gs-laptop-units | How many Laptop Pro 14 units were sold? | ✅ | 1 | 2.2 |
| gs-category-revenue-rank | Rank categories by revenue | ✅ | 1 | 2.6 |
| gs-avg-revenue-segment | Average order revenue by customer segment | ✅ | 1 | 3.6 |
| gs-unanswerable-satisfaction | What is the average customer satisfaction score by region? | ✅ | 1 | 2.9 |
| gs-unanswerable-weather | Did rainy weather reduce online sales? | ✅ | 1 | 4.4 |
| hr-headcount | How many employees are there? | ✅ | 1 | 2.9 |
| hr-attrition-pct | What percentage of employees left the company? | ✅ | 1 | 4.1 |
| hr-attrition-by-dept | Attrition rate by department, as a percentage | ❌ Wrong result | 1 | 3.9 |
| hr-income-by-level | Average monthly income by job level | ✅ | 1 | 2.8 |
| hr-overtime-leavers | How many employees who work overtime left the company? | ✅ | 1 | 3.4 |
| hr-dept-sizes | Number of employees per department | ✅ | 1 | 2.8 |
| hr-age-by-gender | Average age by gender | ✅ | 1 | 2.7 |
| hr-remote-count | How many employees work remotely? | ✅ | 1 | 2.9 |
| hr-hires-by-year | How many people were hired each year? | ✅ | 1 | 3.1 |
| hr-highest-paid-dept | Which department has the highest average monthly income? | ✅ | 1 | 2.9 |
| hr-satisfaction-attrition | Average job satisfaction of employees who left vs stayed | ✅ | 1 | 2.8 |
| hr-tenure-by-dept | Average years at company by department | ✅ | 1 | 3.3 |
| hr-median-income-education | Median monthly income by education level | ✅ | 1 | 2.8 |
| hr-performance-counts | How many employees have each performance rating? | ✅ | 1 | 2.6 |
| hr-unanswerable-raise | What was each employee's last salary raise? | ✅ | 1 | 3.2 |

## Failures

### gs-enterprise-avg-units: Average units per order for Enterprise customers

Wrong result: 3 rows, expected 1

```sql
WITH segment_orders AS (SELECT customer_segment, order_id, sum(units) AS order_units FROM global_sales GROUP BY customer_segment, order_id) SELECT customer_segment, avg(order_units) AS average_units_per_order, count(*) AS order_count FROM segment_orders GROUP BY customer_segment ORDER BY average_units_per_order DESC
```

### hr-attrition-by-dept: Attrition rate by department, as a percentage

Wrong result: no column matches "attrition_pct"

```sql
SELECT department, count(*) FILTER (WHERE attrition) / count(*) AS attrition_rate FROM hr_attrition GROUP BY department ORDER BY attrition_rate DESC
```
