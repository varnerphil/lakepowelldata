import { test, expect } from '@playwright/test'

/**
 * Site tour E2E test. Records the full tour flow for preview.
 * Run with: npx playwright test tour.spec.ts
 * Video is saved to test-results/ when run with video: 'on'.
 */
test.describe('Site tour', () => {
  test('tour offer appears with ?tour=1 and full tour can be completed', async ({ page }) => {
    await page.goto('/?tour=1')

    // Offer modal appears
    await expect(page.getByRole('dialog', { name: /take a quick tour/i })).toBeVisible()
    await expect(page.getByText('Take a quick tour?')).toBeVisible()
    await expect(page.getByRole('button', { name: /start tour/i })).toBeVisible()

    // Start the tour
    await page.getByRole('button', { name: /start tour/i }).click()

    // Step 1: Welcome (scope Next to tour dialog to avoid Next.js dev tools button)
    const welcomeDialog = page.getByRole('dialog').filter({ hasText: 'Welcome to Lake Powell Data' })
    await expect(welcomeDialog).toBeVisible()
    await expect(page.getByText(/current water levels, projections/i)).toBeVisible()
    await welcomeDialog.getByRole('button', { name: 'Next' }).click()

    // Step 2: Current status
    const step2 = page.getByRole('dialog').filter({ hasText: 'Current water level' })
    await expect(step2).toBeVisible()
    await step2.getByRole('button', { name: 'Next' }).click()

    // Step 3: Chart & projections
    const step3 = page.getByRole('dialog').filter({ hasText: 'Charts & projections' })
    await expect(step3).toBeVisible()
    await step3.getByRole('button', { name: 'Next' }).click()

    // Step 4: Storage (may need to scroll into view)
    const step4 = page.getByRole('dialog').filter({ hasText: 'Storage profile' })
    await expect(step4).toBeVisible()
    await step4.getByRole('button', { name: 'Next' }).click()

    // Step 5: Snowpack
    const step5 = page.getByRole('dialog').filter({ hasText: 'Snowpack trends' })
    await expect(step5).toBeVisible()
    await step5.getByRole('button', { name: 'Next' }).click()

    // Step 6: Historical averages
    const step6 = page.getByRole('dialog').filter({ hasText: 'Historical averages' })
    await expect(step6).toBeVisible()
    await step6.getByRole('button', { name: 'Next' }).click()

    // Step 7: Nav / Explore
    const step7 = page.getByRole('dialog').filter({ hasText: 'Explore the rest of the site' })
    await expect(step7).toBeVisible()
    await step7.getByRole('button', { name: 'Done' }).click()

    // Tour closed
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('tour can be dismissed from offer', async ({ page }) => {
    await page.goto('/?tour=1')
    await expect(page.getByRole('dialog', { name: /take a quick tour/i })).toBeVisible()
    await page.getByRole('button', { name: /maybe later/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('tour can be skipped with close button', async ({ page }) => {
    await page.goto('/?tour=1')
    await page.getByRole('button', { name: /start tour/i }).click()
    const tourDialog = page.getByRole('dialog').filter({ hasText: 'Welcome to Lake Powell Data' })
    await expect(tourDialog).toBeVisible()
    await tourDialog.getByRole('button', { name: 'Close tour' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})
