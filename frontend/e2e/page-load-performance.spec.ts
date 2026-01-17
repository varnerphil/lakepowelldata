import { test, expect } from '@playwright/test'

// Performance thresholds in milliseconds
const PERFORMANCE_THRESHOLDS = {
  dashboard: 3000, // Dashboard should load within 3 seconds
  simulator: 3000, // Simulator should load within 3 seconds
  ramps: 2000, // Ramps page should load within 2 seconds
  navigation: 1500, // Navigation between pages should be fast (cached)
}

test.describe('Page Load Performance', () => {
  test('Dashboard page loads within threshold', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto('/')
    
    // Wait for key content to appear (not just the loading spinner)
    await expect(page.locator('text=Current Elevation').or(page.locator('text=Lake Powell'))).toBeVisible({ timeout: PERFORMANCE_THRESHOLDS.dashboard })
    
    const loadTime = Date.now() - startTime
    console.log(`Dashboard initial load time: ${loadTime}ms`)
    
    expect(loadTime).toBeLessThan(PERFORMANCE_THRESHOLDS.dashboard)
  })

  test('Simulator page loads within threshold', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto('/simulator')
    
    // Wait for key content to appear
    await expect(page.locator('text=Outflow Simulator')).toBeVisible({ timeout: PERFORMANCE_THRESHOLDS.simulator })
    
    const loadTime = Date.now() - startTime
    console.log(`Simulator initial load time: ${loadTime}ms`)
    
    expect(loadTime).toBeLessThan(PERFORMANCE_THRESHOLDS.simulator)
  })

  test('Ramps page loads within threshold', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto('/ramps')
    
    // Wait for key content to appear
    await expect(page.locator('text=Boat Ramp Status')).toBeVisible({ timeout: PERFORMANCE_THRESHOLDS.ramps })
    
    const loadTime = Date.now() - startTime
    console.log(`Ramps initial load time: ${loadTime}ms`)
    
    expect(loadTime).toBeLessThan(PERFORMANCE_THRESHOLDS.ramps)
  })

  test('Navigation between pages is fast (cached data)', async ({ page }) => {
    // First, load all pages to warm the cache
    await page.goto('/')
    await expect(page.locator('text=Current Elevation').or(page.locator('text=Lake Powell'))).toBeVisible({ timeout: 5000 })
    
    await page.goto('/simulator')
    await expect(page.locator('text=Outflow Simulator')).toBeVisible({ timeout: 5000 })
    
    await page.goto('/ramps')
    await expect(page.locator('text=Boat Ramp Status')).toBeVisible({ timeout: 5000 })
    
    // Now test navigation speed between cached pages
    const navigationTimes: { from: string; to: string; time: number }[] = []
    
    // Navigate from ramps to dashboard
    let startTime = Date.now()
    await page.click('text=Dashboard')
    await expect(page.locator('text=Current Elevation').or(page.locator('text=Lake Powell'))).toBeVisible({ timeout: PERFORMANCE_THRESHOLDS.navigation })
    navigationTimes.push({ from: 'ramps', to: 'dashboard', time: Date.now() - startTime })
    
    // Navigate from dashboard to simulator
    startTime = Date.now()
    await page.click('text=Simulator')
    await expect(page.locator('text=Outflow Simulator')).toBeVisible({ timeout: PERFORMANCE_THRESHOLDS.navigation })
    navigationTimes.push({ from: 'dashboard', to: 'simulator', time: Date.now() - startTime })
    
    // Navigate from simulator to ramps
    startTime = Date.now()
    await page.click('text=Ramps')
    await expect(page.locator('text=Boat Ramp Status')).toBeVisible({ timeout: PERFORMANCE_THRESHOLDS.navigation })
    navigationTimes.push({ from: 'simulator', to: 'ramps', time: Date.now() - startTime })
    
    // Navigate back to dashboard
    startTime = Date.now()
    await page.click('text=Dashboard')
    await expect(page.locator('text=Current Elevation').or(page.locator('text=Lake Powell'))).toBeVisible({ timeout: PERFORMANCE_THRESHOLDS.navigation })
    navigationTimes.push({ from: 'ramps', to: 'dashboard', time: Date.now() - startTime })
    
    // Log all navigation times
    console.log('Navigation times:')
    navigationTimes.forEach(({ from, to, time }) => {
      console.log(`  ${from} -> ${to}: ${time}ms`)
    })
    
    // Assert all navigation times are within threshold
    for (const { from, to, time } of navigationTimes) {
      expect(time, `Navigation from ${from} to ${to} took too long`).toBeLessThan(PERFORMANCE_THRESHOLDS.navigation)
    }
  })

  test('Loading states appear quickly', async ({ page }) => {
    // Navigate to dashboard and check loading state appears quickly
    await page.goto('/')
    
    // Either loading state or actual content should appear almost immediately
    const loadingOrContent = page.locator('.animate-pulse, text=Current Elevation, text=Lake Powell')
    await expect(loadingOrContent.first()).toBeVisible({ timeout: 500 })
  })
})

test.describe('Dashboard vs Simulator Performance Comparison', () => {
  test('Dashboard and Simulator have similar load times', async ({ page }) => {
    // Load dashboard
    let startTime = Date.now()
    await page.goto('/')
    await expect(page.locator('text=Current Elevation').or(page.locator('text=Lake Powell'))).toBeVisible({ timeout: 5000 })
    const dashboardTime = Date.now() - startTime
    
    // Load simulator
    startTime = Date.now()
    await page.goto('/simulator')
    await expect(page.locator('text=Outflow Simulator')).toBeVisible({ timeout: 5000 })
    const simulatorTime = Date.now() - startTime
    
    console.log(`Dashboard load time: ${dashboardTime}ms`)
    console.log(`Simulator load time: ${simulatorTime}ms`)
    console.log(`Difference: ${Math.abs(dashboardTime - simulatorTime)}ms`)
    
    // Dashboard shouldn't be more than 2x slower than simulator
    const maxRatio = 2.0
    const ratio = dashboardTime / simulatorTime
    console.log(`Ratio (dashboard/simulator): ${ratio.toFixed(2)}`)
    
    expect(ratio, `Dashboard is ${ratio.toFixed(2)}x slower than simulator`).toBeLessThan(maxRatio)
  })

  test('Cached page loads are faster than initial loads', async ({ page }) => {
    // First load (cold cache)
    let startTime = Date.now()
    await page.goto('/')
    await expect(page.locator('text=Current Elevation').or(page.locator('text=Lake Powell'))).toBeVisible({ timeout: 5000 })
    const coldLoadTime = Date.now() - startTime
    
    // Navigate away
    await page.goto('/simulator')
    await expect(page.locator('text=Outflow Simulator')).toBeVisible({ timeout: 5000 })
    
    // Second load (warm cache)
    startTime = Date.now()
    await page.goto('/')
    await expect(page.locator('text=Current Elevation').or(page.locator('text=Lake Powell'))).toBeVisible({ timeout: 5000 })
    const warmLoadTime = Date.now() - startTime
    
    console.log(`Cold cache load time: ${coldLoadTime}ms`)
    console.log(`Warm cache load time: ${warmLoadTime}ms`)
    console.log(`Improvement: ${((coldLoadTime - warmLoadTime) / coldLoadTime * 100).toFixed(1)}%`)
    
    // Warm load should be faster or at least not significantly slower
    expect(warmLoadTime).toBeLessThanOrEqual(coldLoadTime * 1.2) // Allow 20% variance
  })
})

