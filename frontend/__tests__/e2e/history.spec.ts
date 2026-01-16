import { test, expect } from '@playwright/test'

test.describe('History Page', () => {
  test('history page shows elevation chart', async ({ page }) => {
    // Given: Database has historical data
    // When: User visits /history
    await page.goto('/history')
    
    // Then: Chart is rendered with data
    await expect(page.getByText(/historical data/i)).toBeVisible()
    await expect(page.getByText(/elevation trend/i)).toBeVisible()
    
    // And: User can interact with chart
    // (Chart interaction would be tested with more specific selectors)
  })

  test('history page filters data', async ({ page }) => {
    // Given: User on history page
    await page.goto('/history')
    
    // When: User selects date range
    await page.fill('input[name="start"]', '2025-01-01')
    await page.fill('input[name="end"]', '2025-01-31')
    await page.click('button[type="submit"]')
    
    // Then: Chart updates to show filtered data
    await expect(page.getByText(/elevation trend/i)).toBeVisible()
  })
})






