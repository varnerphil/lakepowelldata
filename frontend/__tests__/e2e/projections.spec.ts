import { test, expect } from '@playwright/test'

const PROJECTIONS_URL = '/simulator?tab=projections'

test.describe('Projections — Page Load & Layout', () => {
  test('page loads with header and key UI elements', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)

    await expect(page.getByText(/simulator/i).first()).toBeVisible({ timeout: 10000 })

    await expect(page.getByText(/release policy/i)).toBeVisible()
    await expect(page.locator('select').first()).toBeVisible()

    await expect(page.getByText(/time horizon/i)).toBeVisible()

    await expect(page.getByText(/starting point/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /today/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /custom/i }).first()).toBeVisible()

    await expect(page.getByRole('button', { name: /run projection/i })).toBeVisible()
  })

  test('tab toggle switches between historical and projections', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /projections/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /historical/i })).toBeVisible()

    await page.getByRole('button', { name: /historical/i }).click()
    await expect(page.getByText(/start date/i)).toBeVisible()

    await page.getByRole('button', { name: /projections/i }).click()
    await expect(page.getByText(/release policy/i)).toBeVisible()
  })

  test('methodology section is available', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)
    await expect(page.getByText(/about these projections/i)).toBeVisible({ timeout: 10000 })

    await page.getByText(/about these projections/i).click()
    await expect(page.getByText(/1,000 simulations/i)).toBeVisible()
    await expect(page.getByText(/probabilistic range/i)).toBeVisible()
  })
})

test.describe('Projections — Policy Selection', () => {
  test('preset policies are available in dropdown', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)
    await page.waitForLoadState('networkidle')

    const select = page.locator('select').first()
    await expect(select).toBeVisible({ timeout: 10000 })

    const options = await select.locator('option').allTextContents()
    expect(options).toContain('Current operations (2007 guidelines)')
    expect(options).toContain('100% of compact (8.23 MAF)')
    expect(options).toContain('95% of compact (7.82 MAF)')
    expect(options).toContain('90% of compact (7.41 MAF)')
    expect(options).toContain('Lower Basin proposal (approx.)')
    expect(options).toContain('Upper Basin proposal (approx.)')
    expect(options).toContain('Federal proposal (approx.)')
    expect(options).toContain('Custom...')
  })

  test('switching policy updates the description text', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)
    await page.waitForLoadState('networkidle')

    const select = page.locator('select').first()
    await expect(select).toBeVisible({ timeout: 10000 })

    await select.selectOption('90% of compact (7.41 MAF)')
    await expect(page.getByText(/7\.41 MAF\/yr/)).toBeVisible()

    await select.selectOption('85% of compact (6.99 MAF)')
    await expect(page.getByText(/6\.99 MAF\/yr/)).toBeVisible()
  })

  test('custom policy shows slider and MAF display', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)
    await page.waitForLoadState('networkidle')

    const select = page.locator('select').first()
    await expect(select).toBeVisible({ timeout: 10000 })

    await select.selectOption('Custom...')

    await expect(page.getByText(/flat release/i)).toBeVisible()
    await expect(page.getByText(/elevation-based/i).first()).toBeVisible()
    await expect(page.getByText(/% of compact release/i)).toBeVisible()
    await expect(page.getByText(/MAF\/yr/)).toBeVisible()
  })

  test('custom tiered mode shows elevation/percent/MAF columns', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)
    await page.waitForLoadState('networkidle')

    const select = page.locator('select').first()
    await expect(select).toBeVisible({ timeout: 10000 })

    await select.selectOption('Custom...')
    await page.getByText(/elevation-based/i).first().click()

    await expect(page.getByText(/above ft/i)).toBeVisible()
    await expect(page.getByText(/add tier/i)).toBeVisible()
  })
})

test.describe('Projections — Starting Point', () => {
  test('custom elevation input appears when custom is selected', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /custom/i }).first().click()

    const elevationInput = page.locator('input[type="number"]').first()
    await expect(elevationInput).toBeVisible()

    const value = await elevationInput.inputValue()
    const elev = parseFloat(value)
    expect(elev).toBeGreaterThanOrEqual(3370)
    expect(elev).toBeLessThanOrEqual(3700)
  })
})

test.describe('Projections — Running Simulation', () => {
  test('auto-runs on page load and shows results', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)

    await expect(
      page.getByText(/computing simulation|run projection/i).first()
    ).toBeVisible({ timeout: 5000 })

    await expect(
      page.getByRole('heading', { name: /projection summary/i })
    ).toBeVisible({ timeout: 60000 })
  })

  test('results show chart and outcome report', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)

    await expect(page.getByText(/projection summary/i)).toBeVisible({ timeout: 60000 })

    await expect(page.getByText(/power generation stays online/i)).toBeVisible()
    await expect(page.getByText(/no risk of going dry/i)).toBeVisible()
    await expect(page.getByText(/lake stays healthy/i)).toBeVisible()
    await expect(page.getByText(/lake reaches full pool/i)).toBeVisible()

    await expect(page.getByText(/where the lake ends up/i)).toBeVisible()
    await expect(page.getByText(/peak elevation/i)).toBeVisible()
    await expect(page.getByText(/low point/i)).toBeVisible()

    await expect(page.getByText(/projected elevation/i)).toBeVisible()
    const chart = page.locator('.recharts-wrapper')
    await expect(chart).toBeVisible()
  })

  test('results show iteration count and compute time', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)
    await expect(page.getByText(/projection summary/i)).toBeVisible({ timeout: 60000 })

    await expect(page.getByText(/computed in/i)).toBeVisible()
    await expect(page.getByText(/scenarios/i)).toBeVisible()
  })

  test('clicking Run Projection re-runs the simulation', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)
    await expect(page.getByText(/projection summary/i)).toBeVisible({ timeout: 60000 })

    const select = page.locator('select').first()
    await select.selectOption('90% of compact (7.41 MAF)')

    await page.getByRole('button', { name: /run projection/i }).click()

    await expect(
      page.getByText(/computing simulation/i).first()
    ).toBeVisible({ timeout: 5000 })

    await expect(page.getByText(/projection summary/i)).toBeVisible({ timeout: 60000 })
  })
})

test.describe('Projections — API Endpoints', () => {
  test('GET /api/projections returns simulation data', async ({ request }) => {
    const response = await request.get('/api/projections')
    expect(response.status()).toBe(200)

    const data = await response.json()

    expect(data.patterns).toBeDefined()
    expect(data.storageCapacity).toBeDefined()
    expect(data.startDate).toBeDefined()
    expect(data.startElevation).toBeGreaterThan(3370)
    expect(data.startContent).toBeGreaterThan(0)
    expect(Array.isArray(data.patterns)).toBe(true)
    expect(data.patterns.length).toBeGreaterThan(5)

    const pattern = data.patterns[0]
    expect(pattern.waterYear).toBeDefined()
    expect(pattern.dailyInflows.length).toBeGreaterThan(300)
    expect(pattern.totalInflowAf).toBeGreaterThan(0)

    expect(data.storageCapacity.length).toBeGreaterThan(10)
    const sorted = [...data.storageCapacity].sort(
      (a: any, b: any) => a.elevation - b.elevation
    )
    expect(sorted[0].elevation).toBeLessThanOrEqual(3375)
    expect(sorted[sorted.length - 1].elevation).toBeGreaterThanOrEqual(3695)
  })

  test('GET /api/projections accepts custom elevation start', async ({ request }) => {
    const response = await request.get('/api/projections?start=elevation:3550')
    expect(response.status()).toBe(200)
  })
})

test.describe('Projections — Critical Reference Lines', () => {
  test('projection chart always shows Dead Pool, Min Power, and Full Pool reference lines', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)
    await expect(page.getByText(/projection summary/i)).toBeVisible({ timeout: 60000 })

    const chart = page.locator('.recharts-wrapper').first()
    await expect(chart).toBeVisible()

    const refLines = chart.locator('.recharts-reference-line')
    const count = await refLines.count()
    expect(count).toBeGreaterThanOrEqual(3)

    const refLineLabels = await chart.locator('.recharts-reference-line text').allTextContents()
    const labelText = refLineLabels.join(' ')
    expect(labelText).toContain('Dead Pool')
    expect(labelText).toContain('Min Power')
    expect(labelText).toContain('Full Pool')
  })

  test('historical chart always shows Dead Pool, Min Power, and Full Pool reference lines', async ({ page }) => {
    await page.goto('/simulator?tab=historical')
    await page.waitForLoadState('networkidle')

    const chart = page.locator('.recharts-wrapper').first()
    await expect(chart).toBeVisible({ timeout: 15000 })

    const refLines = chart.locator('.recharts-reference-line')
    const count = await refLines.count()
    expect(count).toBeGreaterThanOrEqual(3)

    const refLineLabels = await chart.locator('.recharts-reference-line text').allTextContents()
    const labelText = refLineLabels.join(' ')
    expect(labelText).toContain('Dead Pool')
    expect(labelText).toContain('Min Power')
    expect(labelText).toContain('Full Pool')
  })
})

test.describe('Projections — Navigation', () => {
  test('simulator link is in the navigation bar', async ({ page }) => {
    await page.goto(PROJECTIONS_URL)
    await expect(page.getByRole('link', { name: /simulator/i })).toBeVisible({ timeout: 10000 })
  })

  test('/projections redirects to simulator', async ({ page }) => {
    await page.goto('/projections')
    await page.waitForURL('**/simulator')
    await expect(page.getByText(/simulator/i).first()).toBeVisible({ timeout: 10000 })
  })
})
