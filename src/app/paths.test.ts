import { describe, expect, it } from 'vitest'
import { DEMO_QUESTIONS } from '@/ai/providers/fixture'
import { appUrl, legacyHashPath, paths, viewFromSegment } from './paths'

describe('routes (F-HOME-01)', () => {
  it('builds project paths per view', () => {
    expect(paths.project('p_1')).toBe('/p/p_1')
    expect(paths.project('p_1', 'dashboard')).toBe('/p/p_1/dashboard')
    expect(appUrl(paths.project('p_1', 'sql'))).toBe('/app/p/p_1/sql')
    expect(appUrl(paths.home)).toBe('/app/')
  })

  it('reads the view from the path', () => {
    expect(viewFromSegment(undefined)).toBe('workspace')
    expect(viewFromSegment('dashboard')).toBe('dashboard')
    expect(viewFromSegment('nope')).toBeNull()
  })

  it('sends the v1 hash links to their routes', () => {
    expect(legacyHashPath('#/bench')).toBe('/bench')
    expect(legacyHashPath('#/try')).toBe('/try')
    expect(legacyHashPath('#/try?from=landing')).toBe('/try')
    expect(legacyHashPath('#privacy')).toBeNull()
    expect(legacyHashPath('')).toBeNull()
  })

  it('the try link asks the landing page headline question', () => {
    expect(DEMO_QUESTIONS[0]).toBe('Which region grew fastest?')
  })
})
