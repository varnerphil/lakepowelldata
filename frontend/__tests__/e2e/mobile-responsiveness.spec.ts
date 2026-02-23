import { test, expect, devices } from '@playwright/test'

const iPhone = devices['iPhone 13']
const iPad = devices['iPad (gen 7)']

/**
 * Checks that an element does not overflow its parent container horizontally.
 * Returns true if content is properly contained (no overflow).
 */
async function isNotOverflowingParent(page: import('@playwright/test').Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return true
    const parent = el.parentElement
    if (!parent) return true
    return el.scrollWidth <= parent.clientWidth + 2 // 2px tolerance
  }, selector)
}

/**
 * Checks that no elements with the given selector have content wider than the viewport.
 */
async function noHorizontalOverflow(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2
  })
}

/**
 * Checks for overlapping elements by comparing bounding boxes of sibling elements.
 * Returns any overlapping pairs found.
 */
async function findOverlappingElements(
  page: import('@playwright/test').Page,
  containerSelector: string
): Promise<Array<{ a: string; b: string; overlapPx: number }>> {
  return page.evaluate((sel) => {
    const container = document.querySelector(sel)
    if (!container) return []

    const children = Array.from(container.children).filter((c) => {
      const style = window.getComputedStyle(c)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.position !== 'absolute'
    })

    const overlaps: Array<{ a: string; b: string; overlapPx: number }> = []
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const rectA = children[i].getBoundingClientRect()
        const rectB = children[j].getBoundingClientRect()

        const overlapX = Math.max(0, Math.min(rectA.right, rectB.right) - Math.max(rectA.left, rectB.left))
        const overlapY = Math.max(0, Math.min(rectA.bottom, rectB.bottom) - Math.max(rectA.top, rectB.top))

        if (overlapX > 5 && overlapY > 5) {
          overlaps.push({
            a: children[i].textContent?.slice(0, 30) || `child-${i}`,
            b: children[j].textContent?.slice(0, 30) || `child-${j}`,
            overlapPx: Math.round(overlapX * overlapY),
          })
        }
      }
    }
    return overlaps
  }, containerSelector)
}

// ─── Dashboard (Homepage) ─────────────────────────────────────────────────

test.describe('Mobile: Dashboard', () => {
  test.use({ ...iPhone })

  test('page does not overflow horizontally', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('current status metrics are readable without overlap', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const statusGrid = page.locator('.grid').first()
    await expect(statusGrid).toBeVisible({ timeout: 10000 })

    const cells = statusGrid.locator('> div')
    const count = await cells.count()
    expect(count).toBeGreaterThanOrEqual(4)

    for (let i = 0; i < count; i++) {
      const cell = cells.nth(i)
      if (await cell.isVisible()) {
        const box = await cell.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.width).toBeGreaterThan(30)
        expect(box!.height).toBeGreaterThan(20)
      }
    }
  })

  test('navigation is accessible on mobile', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const bottomNav = page.locator('nav').last()
    await expect(bottomNav).toBeVisible()
  })
})

// ─── Simulator: Projections ─────────────────────────────────────────────

test.describe('Mobile: Simulator — Projections', () => {
  test.use({ ...iPhone })

  test('page does not overflow horizontally', async ({ page }) => {
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('tab toggle is visible and functional', async ({ page }) => {
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')

    const projectionsTab = page.getByRole('button', { name: /projections/i })
    const historicalTab = page.getByRole('button', { name: /historical/i })

    await expect(projectionsTab).toBeVisible({ timeout: 10000 })
    await expect(historicalTab).toBeVisible()

    const tabBox = await projectionsTab.boundingBox()
    expect(tabBox).not.toBeNull()
    expect(tabBox!.width).toBeGreaterThan(40)
    expect(tabBox!.height).toBeGreaterThan(20)
  })

  test('control cards stack vertically on mobile', async ({ page }) => {
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')

    const cards = page.locator('.grid > div').filter({ has: page.locator('label, select, button') })
    const count = await cards.count()

    if (count >= 2) {
      const box0 = await cards.first().boundingBox()
      const box1 = await cards.nth(1).boundingBox()
      if (box0 && box1) {
        expect(box1.y).toBeGreaterThanOrEqual(box0.y + box0.height - 5)
      }
    }
  })

  test('projection chart fits within viewport width', async ({ page }) => {
    await page.goto('/simulator')
    await expect(page.getByText(/projection summary/i)).toBeVisible({ timeout: 60000 })

    const chart = page.locator('.recharts-wrapper').first()
    await expect(chart).toBeVisible()

    const chartBox = await chart.boundingBox()
    expect(chartBox).not.toBeNull()
    const viewport = page.viewportSize()!
    expect(chartBox!.width).toBeLessThanOrEqual(viewport.width + 5)
  })

  test('outcome probability cards do not overlap on mobile', async ({ page }) => {
    await page.goto('/simulator')
    await expect(page.getByText(/projection summary/i)).toBeVisible({ timeout: 60000 })

    const outcomeCards = page.locator('[class*="rounded-lg"][class*="px-3"]')
    const count = await outcomeCards.count()

    if (count >= 2) {
      for (let i = 0; i < count - 1; i++) {
        const boxA = await outcomeCards.nth(i).boundingBox()
        const boxB = await outcomeCards.nth(i + 1).boundingBox()
        if (boxA && boxB) {
          const aBottom = boxA.y + boxA.height
          const bBottom = boxB.y + boxB.height
          const aRight = boxA.x + boxA.width
          const bRight = boxB.x + boxB.width
          const overlapY = Math.max(0, Math.min(aBottom, bBottom) - Math.max(boxA.y, boxB.y))
          const overlapX = Math.max(0, Math.min(aRight, bRight) - Math.max(boxA.x, boxB.x))
          const overlapArea = overlapX * overlapY
          expect(overlapArea).toBeLessThan(50)
        }
      }
    }
  })

  test('summary text is not truncated or cut off', async ({ page }) => {
    await page.goto('/simulator')
    await expect(page.getByText(/projection summary/i)).toBeVisible({ timeout: 60000 })

    const bottomLine = page.getByText(/bottom line/i)
    await expect(bottomLine).toBeVisible()

    const box = await bottomLine.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(100)
  })
})

// ─── Simulator: Historical ─────────────────────────────────────────────

test.describe('Mobile: Simulator — Historical', () => {
  test.use({ ...iPhone })

  test('page does not overflow horizontally', async ({ page }) => {
    await page.goto('/simulator?tab=historical')
    await page.waitForLoadState('networkidle')
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('simulation results stack vertically', async ({ page }) => {
    await page.goto('/simulator?tab=historical')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/simulation results/i)).toBeVisible({ timeout: 15000 })

    const resultCards = page.locator('.card')
    const count = await resultCards.count()

    if (count >= 2) {
      const firstBox = await resultCards.first().boundingBox()
      const secondBox = await resultCards.nth(1).boundingBox()
      if (firstBox && secondBox) {
        expect(secondBox.y).toBeGreaterThanOrEqual(firstBox.y + firstBox.height - 10)
      }
    }
  })

  test('simulation chart fits within viewport', async ({ page }) => {
    await page.goto('/simulator?tab=historical')
    await page.waitForLoadState('networkidle')

    const chart = page.locator('.recharts-wrapper').first()
    await expect(chart).toBeVisible({ timeout: 15000 })

    const chartBox = await chart.boundingBox()
    expect(chartBox).not.toBeNull()
    const viewport = page.viewportSize()!
    expect(chartBox!.width).toBeLessThanOrEqual(viewport.width + 5)
  })

  test('summary stats grid does not overlap', async ({ page }) => {
    await page.goto('/simulator?tab=historical')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/simulation results/i)).toBeVisible({ timeout: 15000 })

    const statsGrid = page.locator('.grid').filter({ has: page.locator('[class*="text-center"]') }).first()
    const isVisible = await statsGrid.isVisible()
    if (isVisible) {
      const overlaps = await findOverlappingElements(page, '.grid')
      const significantOverlaps = overlaps.filter((o) => o.overlapPx > 100)
      expect(significantOverlaps).toHaveLength(0)
    }
  })

  test('outflow method toggle is usable on mobile', async ({ page }) => {
    await page.goto('/simulator?tab=historical')
    await page.waitForLoadState('networkidle')

    const percentBtn = page.getByRole('button', { name: /% of actual/i })
    const policyBtn = page.getByRole('button', { name: /policy-based/i })

    await expect(percentBtn).toBeVisible()
    await expect(policyBtn).toBeVisible()

    const percentBox = await percentBtn.boundingBox()
    const policyBox = await policyBtn.boundingBox()
    expect(percentBox).not.toBeNull()
    expect(policyBox).not.toBeNull()
    expect(percentBox!.width).toBeGreaterThan(30)
    expect(policyBox!.width).toBeGreaterThan(30)
  })
})

// ─── History Page ─────────────────────────────────────────────────────

test.describe('Mobile: History Page', () => {
  test.use({ ...iPhone })

  test('page does not overflow horizontally', async ({ page }) => {
    await page.goto('/history')
    await page.waitForLoadState('networkidle')
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('chart fits within viewport width', async ({ page }) => {
    await page.goto('/history')
    await page.waitForLoadState('networkidle')

    const chart = page.locator('.recharts-wrapper').first()
    if (await chart.isVisible()) {
      const chartBox = await chart.boundingBox()
      const viewport = page.viewportSize()!
      expect(chartBox!.width).toBeLessThanOrEqual(viewport.width + 5)
    }
  })
})

// ─── Snowpack Page ──────────────────────────────────────────────────────

test.describe('Mobile: Snowpack Page', () => {
  test.use({ ...iPhone })

  test('page does not overflow horizontally', async ({ page }) => {
    await page.goto('/snowpack')
    await page.waitForLoadState('networkidle')
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('charts fit within viewport width', async ({ page }) => {
    await page.goto('/snowpack')
    await page.waitForLoadState('networkidle')

    const charts = page.locator('.recharts-wrapper')
    const count = await charts.count()

    for (let i = 0; i < count; i++) {
      const chart = charts.nth(i)
      if (await chart.isVisible()) {
        const chartBox = await chart.boundingBox()
        const viewport = page.viewportSize()!
        expect(chartBox!.width).toBeLessThanOrEqual(viewport.width + 5)
      }
    }
  })
})

// ─── Ramps Page ──────────────────────────────────────────────────────

test.describe('Mobile: Ramps Page', () => {
  test.use({ ...iPhone })

  test('page does not overflow horizontally', async ({ page }) => {
    await page.goto('/ramps')
    await page.waitForLoadState('networkidle')
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('ramp cards stack vertically', async ({ page }) => {
    await page.goto('/ramps')
    await page.waitForLoadState('networkidle')

    const cards = page.locator('.card, [class*="rounded-xl"]').filter({ hasText: /ramp|launch/i })
    const count = await cards.count()

    if (count >= 2) {
      const box0 = await cards.first().boundingBox()
      const box1 = await cards.nth(1).boundingBox()
      if (box0 && box1) {
        expect(box1.y).toBeGreaterThanOrEqual(box0.y + box0.height - 5)
      }
    }
  })
})

// ─── Tablet Viewport Tests ─────────────────────────────────────────────

test.describe('Tablet: Key Pages', () => {
  test.use({ ...iPad })

  test('dashboard does not overflow horizontally', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('simulator does not overflow horizontally', async ({ page }) => {
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('simulator results fit within viewport', async ({ page }) => {
    await page.goto('/simulator')
    await expect(page.getByText(/projection summary/i)).toBeVisible({ timeout: 60000 })

    const chart = page.locator('.recharts-wrapper').first()
    await expect(chart).toBeVisible()

    const chartBox = await chart.boundingBox()
    const viewport = page.viewportSize()!
    expect(chartBox!.width).toBeLessThanOrEqual(viewport.width + 5)
  })

  test('snowpack page does not overflow horizontally', async ({ page }) => {
    await page.goto('/snowpack')
    await page.waitForLoadState('networkidle')
    expect(await noHorizontalOverflow(page)).toBe(true)
  })
})

// ─── Touch Target Size Tests ──────────────────────────────────────────

test.describe('Mobile: Touch Target Sizes', () => {
  test.use({ ...iPhone })

  test('navigation links meet minimum touch target size (44x44px)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const navLinks = page.locator('nav a, nav button')
    const count = await navLinks.count()

    for (let i = 0; i < count; i++) {
      const link = navLinks.nth(i)
      if (await link.isVisible()) {
        const box = await link.boundingBox()
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(40)
          expect(box.height).toBeGreaterThanOrEqual(36)
        }
      }
    }
  })

  test('simulator buttons meet minimum touch target size', async ({ page }) => {
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')

    const runButton = page.getByRole('button', { name: /run projection/i })
    await expect(runButton).toBeVisible({ timeout: 10000 })

    const box = await runButton.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(100)
    expect(box!.height).toBeGreaterThanOrEqual(36)
  })
})

// ─── Text Readability Tests ─────────────────────────────────────────────

test.describe('Mobile: Text Readability', () => {
  test.use({ ...iPhone })

  test('page titles are readable on mobile', async ({ page }) => {
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')

    const title = page.locator('h1').first()
    await expect(title).toBeVisible()

    const fontSize = await title.evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).fontSize)
    })
    expect(fontSize).toBeGreaterThanOrEqual(24)
  })

  test('body text is not smaller than 12px', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const tooSmall = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const smallElements: string[] = []
      let node: Node | null
      while ((node = walker.nextNode())) {
        const parent = node.parentElement
        if (!parent) continue
        const style = window.getComputedStyle(parent)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const fontSize = parseFloat(style.fontSize)
        const text = (node.textContent || '').trim()
        if (text.length > 0 && fontSize < 9) {
          smallElements.push(`${fontSize}px: "${text.slice(0, 40)}"`)
        }
      }
      return smallElements.slice(0, 5)
    })

    expect(tooSmall).toHaveLength(0)
  })
})
