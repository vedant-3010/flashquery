// The questions the sign-in pages' scene answers (D115). The first uses the landing's real figures
// (growth 2022 to 2025 on the 1M-row sample; answerExamples.test.ts keeps them equal to
// landing/data.ts without importing it here, which would share a chunk with the landing page). The
// second is the finance sample's own answer (D117).

export interface AnswerExample {
  question: string
  /** The headline number and what it is. */
  kpi: { value: string; label: string }
  /** The file it was asked of, as the answer card's footer shows it. */
  source: string
  bars: { label: string; value: number; text: string }[]
}

export const ANSWER_EXAMPLES: AnswerExample[] = [
  {
    question: 'Which region grew fastest?',
    kpi: { value: '+140%', label: 'APAC, 2022 to 2025' },
    source: 'sales.csv · 1,000,000 rows',
    bars: [
      { label: 'APAC', value: 1.4018, text: '+140%' },
      { label: 'LATAM', value: 0.6572, text: '+66%' },
      { label: 'MEA', value: 0.4105, text: '+41%' },
      { label: 'Europe', value: 0.1931, text: '+19%' },
      { label: 'N. America', value: 0.1074, text: '+11%' },
    ],
  },
  {
    question: 'Which customers owe us the most?',
    kpi: { value: '$3.5M', label: 'Unpaid across 384 invoices' },
    source: 'invoices.xlsx · 16,252 rows',
    bars: [
      { label: 'Harbor Health', value: 562_805, text: '$563K' },
      { label: 'Orchard Foods', value: 432_995, text: '$433K' },
      { label: 'Bluebird', value: 428_533, text: '$429K' },
      { label: 'Brightside', value: 233_879, text: '$234K' },
      { label: 'Lumen', value: 214_132, text: '$214K' },
    ],
  },
  {
    question: 'Share of revenue by channel',
    kpi: { value: '48%', label: 'Online, this year' },
    source: 'sales.csv · 1,000,000 rows',
    bars: [
      { label: 'Online', value: 48, text: '48%' },
      { label: 'Retail', value: 31, text: '31%' },
      { label: 'Partner', value: 21, text: '21%' },
    ],
  },
  {
    question: 'Which category is returned most?',
    kpi: { value: '9.8%', label: 'Apparel return rate' },
    source: 'orders.parquet · 1,000,000 rows',
    bars: [
      { label: 'Apparel', value: 9.8, text: '9.8%' },
      { label: 'Electronics', value: 6.1, text: '6.1%' },
      { label: 'Home', value: 4.4, text: '4.4%' },
      { label: 'Sports', value: 3.2, text: '3.2%' },
    ],
  },
]
