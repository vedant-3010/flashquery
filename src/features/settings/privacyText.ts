import type { PrivacyMode } from '@/ai/schemas'

// Plain-language list of what each privacy mode sends (F-AI-02). Must match src/ai/context.ts.

export const PRIVACY_MODES: Record<
  PrivacyMode,
  { label: string; summary: string; sends: string[]; never: string[] }
> = {
  strict: {
    label: 'Strict',
    summary: 'The default: only the shape of your data leaves this device, never a value from it.',
    sends: ['Table names and row counts', 'Column names and types', 'Notes you add to datasets'],
    never: ['Any values from your data', 'Query results (answers are summarized on this device)'],
  },
  balanced: {
    label: 'Balanced',
    summary:
      'Your choice: adds a few example values so the AI writes better SQL, and the answer for a written summary.',
    sends: [
      'Everything in Strict',
      'Per column: % empty, number of distinct values, min and max of numbers and dates',
      'Up to 5 common values of short text columns (cut to 40 characters)',
      '3 example rows per table (text cut to 40 characters)',
      "For the answer's summary: the result if it has up to 50 rows, else its statistics and 20 of its rows (text cut to 40 characters)",
    ],
    never: ['Your files or tables in full', 'Results beyond those 50 rows'],
  },
}
