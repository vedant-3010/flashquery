import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseQuestions, type EvalQuestion } from '@/ai/evals'
import type { Engine } from '@/engine/connection'
import { ingestCsvBytes } from '@/engine/ingest'
import { profileTable } from '@/engine/profile'
import { createGlobalSalesSql, GLOBAL_SALES_TABLE } from '@/engine/samples'
import type { DatasetProfile } from '@/engine/types'

// The datasets the NL→SQL evals run on (F-QA-04): Global Sales (10k generated rows) and the HR
// attrition sample. Used by the eval-set check (src/ai/evalSet.test.ts) and the runner (evals/).

export const EVAL_ROWS = 10_000

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url))

export function loadQuestions(): EvalQuestion[] {
  return parseQuestions(readFileSync(root('evals/questions.jsonl'), 'utf8'))
}

async function profiled(
  engine: Engine,
  table: string,
  label: string,
  source: DatasetProfile['source'],
): Promise<DatasetProfile> {
  const profile = await profileTable(engine, table)
  return {
    id: table,
    table,
    label,
    source,
    rowCount: profile.rowCount,
    schemaHash: profile.schemaHash,
    columns: profile.columns,
    notes: null,
    timings: { loadMs: 0, profileMs: 0 },
    createdAt: 0,
  }
}

/** Loads both eval tables into `engine`; returns their profiles by table name. */
export async function loadEvalDatasets(engine: Engine): Promise<Map<string, DatasetProfile>> {
  await engine.run(createGlobalSalesSql(EVAL_ROWS))
  const hr = await ingestCsvBytes(
    engine,
    'hr_attrition',
    new Uint8Array(readFileSync(root('public/samples/hr_attrition.csv'))),
  )
  const generated = { format: 'generated', fileName: null, sizeBytes: null, sheet: null } as const
  const datasets = [
    await profiled(engine, GLOBAL_SALES_TABLE, 'Global Sales', {
      kind: 'sample',
      ...generated,
      csv: null,
      skippedRows: 0,
    }),
    await profiled(engine, 'hr_attrition', 'HR attrition', {
      kind: 'sample',
      format: 'csv',
      fileName: 'hr_attrition.csv',
      sizeBytes: null,
      sheet: null,
      ...hr,
    }),
  ]
  return new Map(datasets.map((dataset) => [dataset.table, dataset]))
}
