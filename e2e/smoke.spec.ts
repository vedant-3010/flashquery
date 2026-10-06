import { test, expect } from '@playwright/test'

test('app boots', async ({ page }) => {
  await page.goto('/app/')
  await expect(page.locator('#root')).not.toBeEmpty()
})
