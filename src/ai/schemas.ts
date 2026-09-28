import { z } from 'zod'
import { ChartTypeSchema } from '@/charts/spec'

// What the LLM returns (validated before anything runs) and the settings that shape requests.
// Required fields + .nullable(), never .optional(): that works across providers' structured
// outputs. No min/max constraints either: structured outputs don't support them.

export const PrivacyModeSchema = z
  .enum(['strict', 'balanced'])
  .describe('What the AI may see; see the privacy-mode table in .claude/rules/ai.md')
export type PrivacyMode = z.infer<typeof PrivacyModeSchema>

export const ProviderIdSchema = z.enum(['anthropic', 'openai'])
export type ProviderId = z.infer<typeof ProviderIdSchema>

export const ChartHintSchema = z
  .object({
    type: ChartTypeSchema.nullable().describe(
      'Preferred chart type, or null to let the app choose.',
    ),
    x: z.string().nullable().describe('Result column for the x axis / categories.'),
    y: z.array(z.string()).describe('Result columns to plot as values.'),
    series: z.string().nullable().describe('Result column that splits the data into series.'),
  })
  .describe('A suggestion only; the app keeps it when it fits the result.')
export type ChartHint = z.infer<typeof ChartHintSchema>

export const SqlPlanSchema = z.object({
  kind: z
    .enum(['sql', 'python', 'clarify', 'unanswerable'])
    .describe(
      "'sql' for normal answers. 'python' only for statistics, forecasting, regression, clustering or " +
        "outlier detection. 'clarify' only when readings differ materially and no default is " +
        "sensible. 'unanswerable' when the tables can't answer it.",
    ),
  title: z.string().describe('Short title for the answer, at most 8 words.'),
  sql: z
    .string()
    .nullable()
    .describe(
      "One DuckDB SELECT (CTEs allowed) over the listed tables. For 'python', the input rows. " +
        "Null for 'clarify' and 'unanswerable'.",
    ),
  python: z
    .string()
    .nullable()
    .describe("For 'python' only: pandas code that reads df and assigns result. Otherwise null."),
  explanation: z
    .string()
    .describe('1-3 plain-English sentences on how the answer is computed. No jargon.'),
  assumptions: z
    .array(z.string())
    .describe('Choices made where the question was ambiguous, e.g. which years were compared.'),
  tablesUsed: z.array(z.string()).describe('Tables the SQL reads.'),
  columnsUsed: z.array(z.string()).describe('Columns the SQL reads, as table.column.'),
  clarification: z
    .object({
      question: z.string().describe('What to ask the user.'),
      options: z.array(z.string()).describe('2-4 short answers the user can pick.'),
    })
    .nullable()
    .describe("For 'clarify' only; otherwise null."),
  alternatives: z
    .array(z.string())
    .describe(
      "For 'unanswerable': 2-3 related questions these tables can answer. Otherwise empty.",
    ),
  chartHint: ChartHintSchema.nullable(),
})
export type SqlPlan = z.infer<typeof SqlPlanSchema>

export const AnswerSummarySchema = z.object({
  headline: z.string().describe('At most 20 words, including the key number.'),
  bullets: z.array(z.string()).describe('Up to 3 supporting points.'),
  caveats: z.array(z.string()).describe('Limits of the answer worth knowing.'),
})
export type AnswerSummary = z.infer<typeof AnswerSummarySchema>
