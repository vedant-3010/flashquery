// The questions the sign-in pages' scene answers (D115). The first uses the landing's real figures
// (growth 2022 to 2025 on the 1M-row sample; answerExamples.test.ts keeps them equal to
// landing/data.ts without importing it here, which would share a chunk with the landing page).

export interface AnswerExample {
  question: string
  /** The headline number and what it is. */
  kpi: { value: string; label: string }
  bars: { label: string; value: number; text: string }[]
}

export const ANSWER_EXAMPLES: AnswerExample[] = [
  {
    question: 'Which region grew fastest?',
    kpi: { value: '+140%', label: 'APAC, 2022 to 2025' },
    bars: [
      { label: 'APAC', value: 1.4018, text: '+140%' },
      { label: 'LATAM', value: 0.6572, text: '+66%' },
      { label: 'MEA', value: 0.4105, text: '+41%' },
      { label: 'Europe', value: 0.1931, text: '+19%' },
      { label: 'N. America', value: 0.1074, text: '+11%' },
    ],
  },
  {
    question: 'Share of revenue by channel',
    kpi: { value: '48%', label: 'Online, this year' },
    bars: [
      { label: 'Online', value: 48, text: '48%' },
      { label: 'Retail', value: 31, text: '31%' },
      { label: 'Partner', value: 21, text: '21%' },
    ],
  },
  {
    question: 'Which category is returned most?',
    kpi: { value: '9.8%', label: 'Apparel return rate' },
    bars: [
      { label: 'Apparel', value: 9.8, text: '9.8%' },
      { label: 'Electronics', value: 6.1, text: '6.1%' },
      { label: 'Home', value: 4.4, text: '4.4%' },
      { label: 'Sports', value: 3.2, text: '3.2%' },
    ],
  },
]
