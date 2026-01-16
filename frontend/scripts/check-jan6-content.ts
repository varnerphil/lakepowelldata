import { pool } from '../lib/db'

async function checkJan6Content() {
  console.log('Checking content value for January 6, 2025...\n')
  
  try {
    // Check for Jan 6, 2025
    const result2025 = await pool.query(`
      SELECT date, elevation, content, inflow, outflow
      FROM water_measurements
      WHERE date = '2025-01-06'
      ORDER BY date DESC
    `)
    
    console.log('January 6, 2025:')
    if (result2025.rows.length > 0) {
      const row = result2025.rows[0]
      console.log(`  Date: ${row.date}`)
      console.log(`  Elevation: ${row.elevation} ft`)
      console.log(`  Content: ${row.content.toLocaleString()} acre-feet (${(row.content / 1000000).toFixed(2)}M)`)
      console.log(`  Inflow: ${row.inflow} cfs`)
      console.log(`  Outflow: ${row.outflow} cfs`)
    } else {
      console.log('  No data found for 2025-01-06')
    }
    
    // Also check Jan 6, 2024 for comparison
    const result2024 = await pool.query(`
      SELECT date, elevation, content, inflow, outflow
      FROM water_measurements
      WHERE date = '2024-01-06'
      ORDER BY date DESC
    `)
    
    console.log('\nJanuary 6, 2024 (for comparison):')
    if (result2024.rows.length > 0) {
      const row = result2024.rows[0]
      console.log(`  Date: ${row.date}`)
      console.log(`  Elevation: ${row.elevation} ft`)
      console.log(`  Content: ${row.content.toLocaleString()} acre-feet (${(row.content / 1000000).toFixed(2)}M)`)
      console.log(`  Inflow: ${row.inflow} cfs`)
      console.log(`  Outflow: ${row.outflow} cfs`)
    } else {
      console.log('  No data found for 2024-01-06')
    }
    
    // Check recent dates to see the pattern
    const recent = await pool.query(`
      SELECT date, elevation, content
      FROM water_measurements
      WHERE date >= '2025-01-01'
      ORDER BY date DESC
      LIMIT 10
    `)
    
    console.log('\nRecent dates (Jan 2025):')
    recent.rows.forEach(row => {
      console.log(`  ${row.date}: ${row.elevation.toFixed(2)} ft, ${row.content.toLocaleString()} acre-ft (${(row.content / 1000000).toFixed(2)}M)`)
    })
    
    // Check what the expected value should be
    console.log('\nExpected value from other website: 6,397,414 acre-feet')
    if (result2025.rows.length > 0) {
      const ourValue = result2025.rows[0].content
      const expectedValue = 6397414
      const difference = ourValue - expectedValue
      const percentDiff = (difference / expectedValue) * 100
      console.log(`\nOur value: ${ourValue.toLocaleString()} acre-feet`)
      console.log(`Expected: ${expectedValue.toLocaleString()} acre-feet`)
      console.log(`Difference: ${difference.toLocaleString()} acre-feet (${percentDiff.toFixed(2)}%)`)
      
      if (Math.abs(percentDiff) > 1) {
        console.log('\n⚠️  WARNING: Significant difference detected!')
        console.log('This suggests a unit conversion or normalization issue.')
      }
    }
    
    await pool.end()
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    await pool.end()
    process.exit(1)
  }
}

checkJan6Content()




