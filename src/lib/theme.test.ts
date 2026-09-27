import { afterEach, describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY, applyTheme, readStoredTheme, resolveTheme, storeTheme } from './theme'

afterEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
})

describe('resolveTheme', () => {
  it.each([
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
  ] as const)('%s with system dark=%s → %s', (preference, systemDark, expected) => {
    expect(resolveTheme(preference, systemDark)).toBe(expected)
  })
})

describe('theme storage', () => {
  it('round-trips a preference', () => {
    storeTheme('dark')
    expect(readStoredTheme()).toBe('dark')
  })

  it('falls back to system for missing or invalid values', () => {
    expect(readStoredTheme()).toBe('system')
    localStorage.setItem(THEME_STORAGE_KEY, 'purple')
    expect(readStoredTheme()).toBe('system')
  })
})

describe('applyTheme', () => {
  it('toggles the dark class and color-scheme on <html>', () => {
    applyTheme('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    applyTheme('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
