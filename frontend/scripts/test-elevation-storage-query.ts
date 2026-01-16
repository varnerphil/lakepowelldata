import { getElevationStorageCapacity } from '../../frontend/lib/db'

async function testQuery() {
  console.log('Testing getElevationStorageCapacity query...\n')
  
  try {
    const data = await getElevationStorageCapacity()
    
    console.log(`Total rows returned: ${data.length}\n`)
    
    // Show first 5 rows
    console.log('First 5 rows:')
    data.slice(0, 5).forEach((row, idx) => {
      console.log(`${idx + 1}. Elevation: ${row.elevation_floor}, Range: ${row.elevation_range}, Content: ${row.content}, Acre-ft/ft: ${row.acre_feet_per_foot}`)
    })
    
    // Check if we have a below-3520 row
    const below3520 = data.filter(d => d.elevation_floor < 3520)
    console.log(`\nRows below 3520: ${below3520.length}`)
    if (below3520.length > 0) {
      below3520.forEach(row => {
        console.log(`  - Elevation: ${row.elevation_floor}, Range: ${row.elevation_range}, Content: ${row.content}, Acre-ft/ft: ${row.acre_feet_per_foot}`)
      })
    }
    
    // Check for anomalies
    console.log('\nChecking for anomalies...')
    const anomalies = data.filter(d => 
      d.acre_feet_per_foot !== null && 
      (d.acre_feet_per_foot > 50000 || d.acre_feet_per_foot < 0)
    )
    console.log(`Rows with unusual acre-feet per foot (>50K or <0): ${anomalies.length}`)
    if (anomalies.length > 0) {
      anomalies.slice(0, 10).forEach(row => {
        console.log(`  - Elevation: ${row.elevation_floor}, Range: ${row.elevation_range}, Acre-ft/ft: ${row.acre_feet_per_foot}`)
      })
    }
    
    // Check for gaps
    console.log('\nChecking for elevation gaps...')
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1]
      const curr = data[i]
      if (curr.elevation_floor - prev.elevation_floor > 1) {
        console.log(`  - Gap between ${prev.elevation_floor} and ${curr.elevation_floor}`)
      }
    }
    
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

testQuery()

