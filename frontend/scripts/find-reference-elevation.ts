import { pool } from '../lib/db'

async function findReferenceElevation() {
  console.log('Finding the normalization reference elevation...\n')
  
  const targetStorage = 1_796_204 // acre-ft (the offset)
  const currentElevation = 3539.18
  const bankStorage = 4_601_210
  const totalStorage = 6_397_414
  
  try {
    // Find the elevation where storage from dead pool equals the offset
    const result = await pool.query(`
      WITH elevation_data AS (
        SELECT 
          FLOOR(elevation)::INTEGER as elevation_floor,
          elevation,
          content::BIGINT as content,
          date
        FROM water_measurements
        WHERE elevation IS NOT NULL AND content IS NOT NULL
          AND elevation >= 3370
      ),
      elevation_storage_max AS (
        SELECT 
          ed.elevation_floor,
          MAX(ed.elevation) as elevation,
          MAX(ed.content::BIGINT) as content
        FROM elevation_data ed
        GROUP BY ed.elevation_floor
      )
      SELECT 
        elevation_floor,
        elevation,
        content,
        ABS(content - $1) as difference
      FROM elevation_storage_max
      WHERE content <= $1 * 1.1  -- Within 10% of target
      ORDER BY ABS(content - $1)
      LIMIT 10
    `, [targetStorage])
    
    console.log(`Looking for elevation where storage from dead pool = ${targetStorage.toLocaleString()} acre-ft\n`)
    
    if (result.rows.length > 0) {
      const closest = result.rows[0]
      console.log('Closest match:')
      console.log(`  Elevation: ${closest.elevation_floor} ft (${parseFloat(closest.elevation).toFixed(2)} ft)`)
      console.log(`  Storage: ${parseInt(closest.content).toLocaleString()} acre-ft`)
      console.log(`  Difference: ${parseInt(closest.difference).toLocaleString()} acre-ft`)
      console.log()
      
      const referenceElevation = parseFloat(closest.elevation)
      
      console.log('='*70)
      console.log('ANSWERS TO YOUR QUESTIONS:')
      console.log('='*70)
      console.log()
      console.log('1. BANK STORAGE (4.6M acre-ft):')
      console.log(`   - Storage from ${referenceElevation.toFixed(0)} ft to ${currentElevation.toFixed(1)} ft`)
      console.log(`   - This is the "upper" portion above ${referenceElevation.toFixed(0)} ft`)
      console.log()
      console.log('2. OFFSET (1.8M acre-ft):')
      console.log(`   - Storage from DEAD POOL (3370 ft) to ${referenceElevation.toFixed(0)} ft`)
      console.log(`   - This is the "lower" portion below ${referenceElevation.toFixed(0)} ft`)
      console.log()
      console.log('3. TOTAL STORAGE (6.4M acre-ft):')
      console.log(`   - Storage from DEAD POOL (3370 ft) to CURRENT ELEVATION (${currentElevation.toFixed(1)} ft)`)
      console.log(`   - This is the COMPLETE storage: 1.8M (lower) + 4.6M (upper) = 6.4M (total)`)
      console.log()
      
      // Verify the math
      const storageFromRefToCurrent = totalStorage - parseInt(closest.content)
      console.log('Verification:')
      console.log(`  Storage at ${referenceElevation.toFixed(0)} ft: ${parseInt(closest.content).toLocaleString()} acre-ft`)
      console.log(`  Storage at ${currentElevation.toFixed(1)} ft: ${totalStorage.toLocaleString()} acre-ft`)
      console.log(`  Storage from ${referenceElevation.toFixed(0)} to ${currentElevation.toFixed(1)} ft: ${storageFromRefToCurrent.toLocaleString()} acre-ft`)
      console.log(`  Bank Storage (from API): ${bankStorage.toLocaleString()} acre-ft`)
      console.log(`  Match: ${Math.abs(storageFromRefToCurrent - bankStorage) < 100000 ? '✓ YES' : '✗ NO'}`)
    } else {
      console.log('No close match found. Showing nearby elevations:')
      const nearby = await pool.query(`
        SELECT 
          elevation_floor,
          elevation,
          content
        FROM (
          SELECT 
            FLOOR(elevation)::INTEGER as elevation_floor,
            MAX(elevation) as elevation,
            MAX(content::BIGINT) as content
          FROM water_measurements
          WHERE elevation >= 3370 AND elevation <= 3600
            AND content IS NOT NULL
          GROUP BY FLOOR(elevation)::INTEGER
        ) sub
        WHERE content BETWEEN $1 * 0.5 AND $1 * 2
        ORDER BY elevation_floor
      `, [targetStorage])
      
      nearby.rows.forEach(row => {
        console.log(`  ${row.elevation_floor} ft: ${parseInt(row.content).toLocaleString()} acre-ft`)
      })
    }
    
    await pool.end()
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    await pool.end()
    process.exit(1)
  }
}

findReferenceElevation()




