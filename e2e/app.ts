import { expect, type Page } from '@playwright/test'

// Shared e2e steps. Since M12, /app/ is Home; tests that need the workspace open a project.

/** Opens a new, empty project: the workspace, as `page.goto('/app/')` showed before projects. */
export async function openProject(page: Page): Promise<void> {
  await page.goto('/app/new')
  await expect(page).toHaveURL(/\/app\/p\/[\w-]+$/)
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
}
