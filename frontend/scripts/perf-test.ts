/**
 * Performance test script for home page
 * Run with: npx tsx scripts/perf-test.ts
 */

async function runPerfTest() {
  const url = 'http://localhost:3000'
  const iterations = 5
  
  console.log('='.repeat(60))
  console.log('HOME PAGE PERFORMANCE TEST')
  console.log('='.repeat(60))
  console.log(`URL: ${url}`)
  console.log(`Iterations: ${iterations}`)
  console.log('')
  
  const results: number[] = []
  const firstByteResults: number[] = []
  const sizeResults: number[] = []
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    
    const response = await fetch(url)
    const firstByte = performance.now() - start
    
    const html = await response.text()
    const total = performance.now() - start
    
    results.push(total)
    firstByteResults.push(firstByte)
    sizeResults.push(html.length)
    
    console.log(`Run ${i + 1}: ${total.toFixed(0)}ms (TTFB: ${firstByte.toFixed(0)}ms, Size: ${(html.length / 1024).toFixed(0)}KB)`)
  }
  
  // Calculate stats
  const avg = results.reduce((a, b) => a + b, 0) / results.length
  const min = Math.min(...results)
  const max = Math.max(...results)
  const avgFirstByte = firstByteResults.reduce((a, b) => a + b, 0) / firstByteResults.length
  const avgSize = sizeResults.reduce((a, b) => a + b, 0) / sizeResults.length
  
  console.log('')
  console.log('-'.repeat(60))
  console.log('SUMMARY:')
  console.log(`  Average: ${avg.toFixed(0)}ms`)
  console.log(`  Min: ${min.toFixed(0)}ms`)
  console.log(`  Max: ${max.toFixed(0)}ms`)
  console.log(`  Avg TTFB: ${avgFirstByte.toFixed(0)}ms`)
  console.log(`  Avg Size: ${(avgSize / 1024).toFixed(0)}KB`)
  console.log('-'.repeat(60))
  
  return { avg, min, max, avgFirstByte, avgSize }
}

runPerfTest().catch(console.error)
