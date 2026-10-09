import { test, expect } from '@playwright/test'
import { openProject } from './app.ts'

test('app boots', async ({ page }) => {
  await openProject(page)
  await expect(page.locator('#root')).not.toBeEmpty()
})
