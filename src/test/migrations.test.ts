// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// F-SEC-07 (checked statically; policy tests against Postgres arrive with the sharing tables in
// M14): every table the migrations create has row-level security and policies, and every
// security-definer function pins its search_path and isn't callable by anonymous visitors.

const folder = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url))
const files = readdirSync(folder)
  .filter((name) => name.endsWith('.sql'))
  .sort()
const sql = files
  .map((name) => readFileSync(`${folder}${name}`, 'utf8'))
  .join('\n')
  .toLowerCase()

const tables = [...sql.matchAll(/create table (?:if not exists )?([\w.]+)/g)].map((m) => m[1] ?? '')
const functions = [...sql.matchAll(/create (?:or replace )?function ([\w.]+)\(\)([\s\S]*?)\$\$;/g)]

describe('Supabase migrations', () => {
  it('are named for the Supabase CLI (timestamp_name.sql)', () => {
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) expect(name).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/)
  })

  it.each(tables.map((table) => [table]))('%s has row-level security and policies', (table) => {
    expect(sql).toContain(`alter table ${table} enable row level security`)
    expect(sql).toMatch(new RegExp(`create policy "[^"]+" on ${table.replace('.', '\\.')}\\b`))
  })

  it.each(functions.map((match) => [match[1] ?? '', match[2] ?? '']))(
    '%s pins its search_path and keeps anonymous callers out',
    (name, body) => {
      if (!body.includes('security definer')) return
      expect(body).toContain("set search_path = ''")
      expect(sql).toMatch(
        new RegExp(`revoke execute on function ${name.replace('.', '\\.')}\\(\\) from [^;]*anon`),
      )
    },
  )

  it('creates the profiles table', () => {
    expect(tables).toContain('public.profiles')
  })
})
