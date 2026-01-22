/**
 * Browser rendering performance test
 * Run with: node scripts/render-perf-test.js
 */

const { chromium } = require('playwright');

async function measureRenderingPerformance() {
  console.log('='.repeat(60));
  console.log('BROWSER RENDERING PERFORMANCE TEST');
  console.log('='.repeat(60));
  console.log('URL: http://localhost:3000');
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const metrics = [];

  for (let i = 0; i < 5; i++) {
    console.log(`Run ${i + 1}...`);
    const page = await browser.newPage();
    
    // Start tracking performance before navigation
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Wait for charts to render
    await page.waitForTimeout(2000);

    // Get performance metrics
    const perfMetrics = await page.evaluate(() => {
      const perfData = performance.getEntriesByType('navigation')[0];
      const paintMetrics = performance.getEntriesByType('paint');
      const fcp = paintMetrics.find((entry) => entry.name === 'first-contentful-paint');
      const fp = paintMetrics.find((entry) => entry.name === 'first-paint');

      // Get LCP from PerformanceObserver entries
      let lcp = 0;
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      if (lcpEntries.length > 0) {
        const lastEntry = lcpEntries[lcpEntries.length - 1];
        lcp = lastEntry.renderTime || lastEntry.loadTime;
      }

      // Get CLS
      let cls = 0;
      const clsEntries = performance.getEntriesByType('layout-shift');
      for (const entry of clsEntries) {
        if (!entry.hadRecentInput) {
          cls += entry.value;
        }
      }

      // Get long tasks for TBT
      const longTasks = performance.getEntriesByType('longtask');
      let tbt = 0;
      for (const task of longTasks) {
        if (task.duration > 50) {
          tbt += task.duration - 50;
        }
      }

      return {
        loadTime: perfData.loadEventEnd - perfData.fetchStart,
        domContentLoaded: perfData.domContentLoadedEventEnd - perfData.fetchStart,
        firstPaint: fp ? fp.startTime : 0,
        firstContentfulPaint: fcp ? fcp.startTime : 0,
        largestContentfulPaint: lcp,
        cumulativeLayoutShift: cls,
        totalBlockingTime: tbt,
        jsHeapUsedSize: performance.memory?.usedJSHeapSize || 0,
        jsHeapTotalSize: performance.memory?.totalJSHeapSize || 0,
      };
    });

    // Measure TTI
    const tti = await page.evaluate(() => {
      return new Promise((resolve) => {
        let lastLongTask = 0;
        
        const checkLongTasks = () => {
          const longTasks = performance.getEntriesByType('longtask');
          if (longTasks.length > 0) {
            const lastTask = longTasks[longTasks.length - 1];
            lastLongTask = lastTask.startTime + lastTask.duration;
          }
          
          const now = performance.now();
          if (now - lastLongTask > 5000 && lastLongTask > 0) {
            resolve(lastLongTask);
          } else {
            setTimeout(checkLongTasks, 100);
          }
        };
        
        setTimeout(checkLongTasks, 1000);
      });
    });

    metrics.push({
      ...perfMetrics,
      timeToInteractive: tti,
    });

    console.log(
      `  FCP: ${perfMetrics.firstContentfulPaint.toFixed(0)}ms, ` +
      `LCP: ${perfMetrics.largestContentfulPaint.toFixed(0)}ms, ` +
      `TTI: ${tti.toFixed(0)}ms, ` +
      `TBT: ${perfMetrics.totalBlockingTime.toFixed(0)}ms`
    );

    await page.close();
  }

  await browser.close();

  // Calculate averages
  const avg = (key) =>
    metrics.reduce((sum, m) => sum + m[key], 0) / metrics.length;

  console.log('');
  console.log('-'.repeat(60));
  console.log('RENDERING METRICS SUMMARY (BASELINE):');
  console.log(`  First Contentful Paint (FCP): ${avg('firstContentfulPaint').toFixed(0)}ms`);
  console.log(`  Largest Contentful Paint (LCP): ${avg('largestContentfulPaint').toFixed(0)}ms`);
  console.log(`  Time to Interactive (TTI): ${avg('timeToInteractive').toFixed(0)}ms`);
  console.log(`  Total Blocking Time (TBT): ${avg('totalBlockingTime').toFixed(0)}ms`);
  console.log(`  Cumulative Layout Shift (CLS): ${avg('cumulativeLayoutShift').toFixed(3)}`);
  console.log(`  DOM Content Loaded: ${avg('domContentLoaded').toFixed(0)}ms`);
  console.log(`  Full Load Time: ${avg('loadTime').toFixed(0)}ms`);
  console.log(`  JS Heap Used: ${(avg('jsHeapUsedSize') / 1024 / 1024).toFixed(1)}MB`);
  console.log('-'.repeat(60));

  return metrics;
}

measureRenderingPerformance().catch(console.error);
