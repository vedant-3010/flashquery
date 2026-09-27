import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { createSerialQueue, duckdbError } from './connection'

describe('duckdbError', () => {
  it('uses the first line as the message and keeps the rest as detail', () => {
    const error = duckdbError(new Error('Binder Error: column "x" not found\nLINE 1: select x'))
    expect(error).toMatchObject({
      code: 'duckdb',
      message: 'Binder Error: column "x" not found',
      detail: 'Binder Error: column "x" not found\nLINE 1: select x',
    })
  })

  it('reads the JSON error form the browser build uses', () => {
    const json = JSON.stringify({
      exception_type: 'Parser',
      exception_message: 'syntax error at or near "table"\n\nLINE 1: drop table t',
      error_subtype: 'SYNTAX_ERROR',
    })
    const error = duckdbError(new Error(json))
    expect(error.message).toBe('Parser Error: syntax error at or near "table"')
    expect(error.detail).toBe(
      'Parser Error: syntax error at or near "table"\n\nLINE 1: drop table t',
    )
  })

  it('passes AppErrors through', () => {
    const original = new AppError({ code: 'cancelled', message: 'Cancelled.', detail: null })
    expect(duckdbError(original)).toBe(original)
  })
})

describe('createSerialQueue', () => {
  it('runs tasks one at a time, in order, even after a failure', async () => {
    const enqueue = createSerialQueue()
    const log: string[] = []
    const task =
      (name: string, fail = false) =>
      async () => {
        log.push(`start ${name}`)
        await new Promise((resolve) => setTimeout(resolve, 5))
        log.push(`end ${name}`)
        if (fail) throw new Error(name)
        return name
      }
    const results = await Promise.allSettled([
      enqueue(task('a')),
      enqueue(task('b', true)),
      enqueue(task('c')),
    ])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c'])
  })
})
