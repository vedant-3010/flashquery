// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// F-SEC-07, checked statically (the policies themselves are tested in Postgres:
// supabase/tests/, `npx supabase test db`): every table the migrations create has row-level
// security and policies, and every security-definer function pins its search_path and isn't
// callable by anonymous visitors, except the view-only link's.

const folder = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url))
const files = readdirSync(folder)
  .filter((name) => name.endsWith('.sql'))
  .sort()
const sql = files
  .map((name) => readFileSync(`${folder}${name}`, 'utf8'))
  .join('\n')
  .toLowerCase()

const tables = [...sql.matchAll(/create table (?:if not exists )?([\w.]+)/g)].map((m) => m[1] ?? '')
const functions = [
  ...sql.matchAll(/create (?:or replace )?function ([\w.]+)\(([^)]*)\)([\s\S]*?)\$\$;/g),
]

/** Readable without an account on purpose: a view-only link (F-SHARE-04, D116). */
const OPEN_TO_ANYONE = new Set(['public.shared_dashboard'])

/** "dashboard uuid, link text" → "uuid, text": the signature a `revoke` names. */
const argTypes = (args: string) =>
  args
    .split(',')
    .map((arg) => arg.trim().split(/\s+/).at(-1) ?? '')
    .filter(Boolean)
    .join(', ')

const escape = (text: string) => text.replace(/[.()]/g, (c) => `\\${c}`)

describe('Supabase migrations', () => {
  it('are named for the Supabase CLI (timestamp_name.sql)', () => {
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) expect(name).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/)
  })

  it.each(tables.map((table) => [table]))('%s has row-level security and policies', (table) => {
    expect(sql).toContain(`alter table ${table} enable row level security`)
    expect(sql).toMatch(new RegExp(`create policy "[^"]+" on ${table.replace('.', '\\.')}\\b`))
  })

  it.each(functions.map((match) => [match[1] ?? '', argTypes(match[2] ?? ''), match[3] ?? '']))(
    '%s(%s) pins its search_path and keeps anonymous callers out',
    (name, args, body) => {
      if (!body.includes('security definer')) return
      expect(body).toContain("set search_path = ''")
      const revoked = new RegExp(
        `revoke execute on function ${escape(`${name}(${args})`)} from ([^;]*)`,
      )
      const from = revoked.exec(sql)?.[1] ?? ''
      expect(from).toContain('public')
      if (!OPEN_TO_ANYONE.has(name)) expect(from).toContain('anon')
    },
  )

  it('creates the profiles and sharing tables', () => {
    expect(tables).toEqual(
      expect.arrayContaining([
        'public.profiles',
        'public.dashboards',
        'public.dashboard_members',
        'public.dashboard_invites',
        'public.share_links',
      ]),
    )
  })
})
