import type { PrivacyMode } from '@/ai/schemas'

// Plain-language list of what each privacy mode sends (F-AI-02). Must match src/ai/context.ts.

export const PRIVACY_MODES: Record<
  PrivacyMode,
  { label: string; summary: string; sends: string[]; never: string[] }
> = {
  strict: {
    label: 'Strict',
    summary: 'Only the shape of your data leaves this device.',
    sends: ['Table names and row counts', 'Column names and types', 'Notes you add to datasets'],
    never: ['Any values from your data', 'Query results (answers are summarized on this device)'],
  },
  balanced: {
    label: 'Balanced',
    summary: 'Adds a few example values so the AI writes better SQL.',
    sends: [
      'Everything in Strict',
      'Per column: % empty, number of distinct values, min and max of numbers and dates',
      'Up to 5 common values of short text columns (cut to 40 characters)',
      '3 example rows per table (text cut to 40 characters)',
    ],
    never: ['Full rows or files', 'Query results (answers are summarized on this device)'],
  },
}
