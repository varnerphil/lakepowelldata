import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test('displays current water level', async ({ page }) => {
    // Given: Database has current water data
    // When: User visits homepage
    await page.goto('/')
    
    // Then: Current elevation is displayed
    await expect(page.getByText(/elevation/i)).toBeVisible()
    
    // And: Recent change is shown
    await expect(page.getByText(/daily change/i)).toBeVisible()
    
    // And: Key metrics are visible
    await expect(page.getByText(/content/i)).toBeVisible()
    await expect(page.getByText(/inflow/i)).toBeVisible()
    await expect(page.getByText(/outflow/i)).toBeVisible()
  })

  test('shows historical averages', async ({ page }) => {
    // Given: Database has historical data
    // When: User visits homepage
    await page.goto('/')
    
    // Then: Comparison to averages is displayed
    await expect(page.getByText(/historical averages/i)).toBeVisible()
  })
})






