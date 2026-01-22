/**
 * Browser rendering performance test
 * Measures Time to Interactive, First Contentful Paint, Largest Contentful Paint, etc.
 * Run with: npx tsx scripts/render-perf-test.ts
 */

import { chromium } from 'playwright'

interface PerformanceMetrics {
  loadTime: number
  domContentLoaded: number
  firstPaint: number
  firstContentfulPaint: number
  largestContentfulPaint: number
  timeToInteractive: number
  totalBlockingTime: number
  cumulativeLayoutShift: number
  jsHeapUsedSize: number
  jsHeapTotalSize: number
}

async function measureRenderingPerformance() {
  console.log('='.repeat(60))
  console.log('BROWSER RENDERING PERFORMANCE TEST')
  console.log('='.repeat(60))
  console.log('URL: http://localhost:3000')
  console.log('')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  // Enable performance metrics
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })

  // Wait for page to be fully interactive
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2000) // Wait for charts to render

  // Collect performance metrics
  const metrics: PerformanceMetrics[] = []

  for (let i = 0; i < 5; i++) {
    console.log(`Run ${i + 1}...`)

    // Create new page for each run
    const testPage = await browser.newPage()
    
    // Track LCP and CLS
    let lcpValue = 0
    let clsValue = 0
    
    await testPage.evaluateOnNewDocument(() => {
      // Track LCP
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1] as any
        // @ts-ignore
        window.__lcp = lastEntry.renderTime || lastEntry.loadTime
      }).observe({ entryTypes: ['largest-contentful-paint'] })
      
      // Track CLS
      // @ts-ignore
      window.__cls = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            // @ts-ignore
            window.__cls += (entry as any).value
          }
        }
      }).observe({ entryTypes: ['layout-shift'] })
    })

    const startTime = Date.now()
    await testPage.goto('http://localhost:3000', { waitUntil: 'networkidle' })
    
    // Wait for charts to render
    await testPage.waitForTimeout(2000)

    // Get performance metrics
    const perfMetrics = await testPage.evaluate(() => {
      const perfData = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      const paintMetrics = performance.getEntriesByType('paint')
      const fcp = paintMetrics.find((entry) => entry.name === 'first-contentful-paint')
      const fp = paintMetrics.find((entry) => entry.name === 'first-paint')

      // Get long tasks for TBT
      const longTasks = performance.getEntriesByType('longtask') as PerformanceEntry[]
      let tbt = 0
      for (const task of longTasks) {
        if (task.duration > 50) {
          tbt += task.duration - 50
        }
      }

      return {
        loadTime: perfData.loadEventEnd - perfData.fetchStart,
        domContentLoaded: perfData.domContentLoadedEventEnd - perfData.fetchStart,
        firstPaint: fp ? fp.startTime : 0,
        firstContentfulPaint: fcp ? fcp.startTime : 0,
        // @ts-ignore
        largestContentfulPaint: window.__lcp || 0,
        // @ts-ignore
        cumulativeLayoutShift: window.__cls || 0,
        totalBlockingTime: tbt,
        jsHeapUsedSize: (performance as any).memory?.usedJSHeapSize || 0,
        jsHeapTotalSize: (performance as any).memory?.totalJSHeapSize || 0,
      }
    })

    // Measure TTI - time until no long tasks for 5 seconds
    const tti = await testPage.evaluate(() => {
      return new Promise<number>((resolve) => {
        const start = performance.now()
        let lastLongTask = 0
        
        const checkLongTasks = () => {
          const longTasks = performance.getEntriesByType('longtask') as PerformanceEntry[]
          if (longTasks.length > 0) {
            const lastTask = longTasks[longTasks.length - 1]
            lastLongTask = (lastTask as any).startTime + lastTask.duration
          }
          
          const now = performance.now()
          if (now - lastLongTask > 5000 && lastLongTask > 0) {
            resolve(lastLongTask)
          } else {
            setTimeout(checkLongTasks, 100)
          }
        }
        
        setTimeout(checkLongTasks, 1000)
      })
    })

    metrics.push({
      ...perfMetrics,
      timeToInteractive: tti,
    })

    console.log(
      `  FCP: ${perfMetrics.firstContentfulPaint.toFixed(0)}ms, ` +
      `LCP: ${perfMetrics.largestContentfulPaint.toFixed(0)}ms, ` +
      `TTI: ${tti.toFixed(0)}ms, ` +
      `TBT: ${perfMetrics.totalBlockingTime.toFixed(0)}ms`
    )

    await testPage.close()
  }

  await browser.close()

  // Calculate averages
  const avg = (key: keyof PerformanceMetrics) =>
    metrics.reduce((sum, m) => sum + m[key], 0) / metrics.length

  console.log('')
  console.log('-'.repeat(60))
  console.log('RENDERING METRICS SUMMARY (BASELINE):')
  console.log(`  First Contentful Paint (FCP): ${avg('firstContentfulPaint').toFixed(0)}ms`)
  console.log(`  Largest Contentful Paint (LCP): ${avg('largestContentfulPaint').toFixed(0)}ms`)
  console.log(`  Time to Interactive (TTI): ${avg('timeToInteractive').toFixed(0)}ms`)
  console.log(`  Total Blocking Time (TBT): ${avg('totalBlockingTime').toFixed(0)}ms`)
  console.log(`  Cumulative Layout Shift (CLS): ${avg('cumulativeLayoutShift').toFixed(3)}`)
  console.log(`  DOM Content Loaded: ${avg('domContentLoaded').toFixed(0)}ms`)
  console.log(`  Full Load Time: ${avg('loadTime').toFixed(0)}ms`)
  console.log(`  JS Heap Used: ${(avg('jsHeapUsedSize') / 1024 / 1024).toFixed(1)}MB`)
  console.log('-'.repeat(60))

  return metrics
}

measureRenderingPerformance().catch(console.error)
