import { z } from 'zod'

export const PrivacyModeSchema = z
  .enum(['strict', 'balanced'])
  .describe('What the AI may see; see the privacy-mode table in .claude/rules/ai.md')
export type PrivacyMode = z.infer<typeof PrivacyModeSchema>
