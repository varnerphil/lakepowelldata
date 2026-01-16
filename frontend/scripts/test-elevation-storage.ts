/**
 * Test script to validate elevation storage capacity calculations
 * Run with: npx tsx scripts/test-elevation-storage.ts
 */

import { getElevationStorageCapacity } from '../lib/db'

async function testElevationStorage() {
  console.log('Testing elevation storage capacity calculation...\n')
  
  try {
    const data = await getElevationStorageCapacity()
    
    console.log(`Total elevation floors with data: ${data.length}\n`)
    
    // Validate data
    let errors: string[] = []
    let warnings: string[] = []
    
    for (let i = 0; i < data.length; i++) {
      const current = data[i]
      const next = data[i + 1]
      
      // Check that content increases with elevation
      if (next && current.content >= next.content) {
        errors.push(
          `ERROR: Content decreases at elevation ${current.elevation_floor} (${current.content}) -> ${next.elevation_floor} (${next.content})`
        )
      }
      
      // Check that elevation increases
      if (next && current.elevation_floor >= next.elevation_floor) {
        errors.push(
          `ERROR: Elevation floor not increasing: ${current.elevation_floor} -> ${next.elevation_floor}`
        )
      }
      
      // Check acre-feet per foot is reasonable (should generally increase with elevation)
      if (current.acre_feet_per_foot !== null) {
        // Typical range: 1K to 500K acre-feet per foot
        // Lower elevations: 1K-50K, Higher elevations: 50K-500K
        if (current.acre_feet_per_foot < 0) {
          errors.push(
            `ERROR: Negative acre-feet per foot at elevation ${current.elevation_floor}: ${current.acre_feet_per_foot}`
          )
        }
        if (current.acre_feet_per_foot > 1000000) {
          warnings.push(
            `WARNING: Very large acre-feet per foot at elevation ${current.elevation_floor}: ${current.acre_feet_per_foot}`
          )
        }
        
        // Check if next elevation has data and compare
        if (next && next.acre_feet_per_foot !== null) {
          // Generally, higher elevations should have more acre-feet per foot (V-shaped basin)
          // But this isn't always true, so just warn
          if (current.elevation_floor > 3600 && current.acre_feet_per_foot > next.acre_feet_per_foot * 2) {
            warnings.push(
              `WARNING: Acre-feet per foot decreases significantly at elevation ${current.elevation_floor} (${current.acre_feet_per_foot}) -> ${next.elevation_floor} (${next.acre_feet_per_foot})`
            )
          }
        }
      }
    }
    
    // Print sample data
    console.log('Sample data (first 10 and last 10 rows):\n')
    console.log('Elevation Range | Storage at Elevation | Acre-Ft per Foot')
    console.log('-'.repeat(70))
    
    const sampleSize = Math.min(10, data.length)
    for (let i = 0; i < sampleSize; i++) {
      const item = data[i]
      const afpf = item.acre_feet_per_foot !== null 
        ? `${(item.acre_feet_per_foot / 1000).toFixed(1)}K` 
        : 'N/A'
      console.log(
        `${item.elevation_range.padEnd(15)} | ${(item.content / 1000000).toFixed(2)}M`.padEnd(35) + 
        ` | ${afpf}`
      )
    }
    
    if (data.length > 20) {
      console.log('...')
      for (let i = data.length - sampleSize; i < data.length; i++) {
        const item = data[i]
        const afpf = item.acre_feet_per_foot !== null 
          ? `${(item.acre_feet_per_foot / 1000).toFixed(1)}K` 
          : 'N/A'
        console.log(
          `${item.elevation_range.padEnd(15)} | ${(item.content / 1000000).toFixed(2)}M`.padEnd(35) + 
          ` | ${afpf}`
        )
      }
    }
    
    // Print statistics
    const validAfpf = data.filter(d => d.acre_feet_per_foot !== null)
    if (validAfpf.length > 0) {
      const afpfValues = validAfpf.map(d => d.acre_feet_per_foot!)
      const minAfpf = Math.min(...afpfValues)
      const maxAfpf = Math.max(...afpfValues)
      const avgAfpf = afpfValues.reduce((a, b) => a + b, 0) / afpfValues.length
      
      console.log('\nStatistics:')
      console.log(`  Valid acre-feet per foot calculations: ${validAfpf.length}/${data.length}`)
      console.log(`  Min acre-feet per foot: ${(minAfpf / 1000).toFixed(1)}K`)
      console.log(`  Max acre-feet per foot: ${(maxAfpf / 1000).toFixed(1)}K`)
      console.log(`  Avg acre-feet per foot: ${(avgAfpf / 1000).toFixed(1)}K`)
    }
    
    // Print errors and warnings
    if (errors.length > 0) {
      console.log('\n❌ ERRORS FOUND:')
      errors.forEach(err => console.log(`  ${err}`))
    }
    
    if (warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:')
      warnings.forEach(warn => console.log(`  ${warn}`))
    }
    
    if (errors.length === 0 && warnings.length === 0) {
      console.log('\n✅ Data validation passed!')
    }
    
    process.exit(errors.length > 0 ? 1 : 0)
  } catch (error) {
    console.error('Error testing elevation storage:', error)
    process.exit(1)
  }
}

testElevationStorage()




