import { NextResponse } from 'next/server'
import { getSNOTELSitesWithLatestMeasurements, getSNOTELBasins } from '@/lib/db'

interface SNOTELSite {
  name: string
  elevation: number
  basin: string
  snowWaterEquivalent: {
    current: number | null
    median: number | null
    percentOfMedian: number | null
  }
  totalPrecipitation: {
    current: number | null
    median: number | null
    percentOfMedian: number | null
  }
}

interface ParsedSNOTELData {
  date: string
  sites: SNOTELSite[]
  basins: {
    name: string
    snowWaterEquivalentIndex: number | null
    totalPrecipitationIndex: number | null
  }[]
}

function parseSNOTELData(text: string): ParsedSNOTELData {
  const lines = text.split('\n')
  
  // Extract date from header
  let date = ''
  for (const line of lines) {
    if (line.includes('As of')) {
      // Try multiple date formats - handle with or without colon after day of week
      let match = line.match(/As of\s+(\w+):?\s+(\w+)\s+(\d+)\s*,\s*(\d+)/)
      if (match) {
        const [, dayOfWeek, month, day, year] = match
        date = `${month} ${day}, ${year}`
        break
      }
    }
  }
  
  const sites: SNOTELSite[] = []
  const basins: { name: string; snowWaterEquivalentIndex: number | null; totalPrecipitationIndex: number | null }[] = []
  
  let currentBasin = ''
  let inDataSection = false
  
  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i]
    const line = originalLine.trim()
    
    // Skip header lines
    if (line.includes('BASIN') || line.includes('Data Site Name') || line.includes('---')) {
      inDataSection = true
      continue
    }
    
    if (!inDataSection) continue
    
    // Check for basin name - all caps, contains "BASIN" or "RIVER", or is a known basin pattern
    // Basin names are typically all caps, no leading spaces (or minimal), and contain keywords
    const isBasinName = line.match(/^[A-Z\s\/#]+$/) && 
                        line.length > 5 && 
                        !line.match(/^\d/) && // Doesn't start with a number
                        (line.includes('BASIN') || line.includes('RIVER') || 
                         ['UPPER COLORADO', 'DUCHESNE', 'YAMPA', 'PRICE', 'ESCALANTE', 'DIRTY DEVIL', 'GUNNISON', 'ROARING FORK', 'SOUTH EASTERN', 'SAN JUAN'].some(b => line.includes(b)))
    
    if (isBasinName) {
      // Check if previous basin had an index
      if (currentBasin) {
        // Look for basin index in next few lines (up to 20 lines ahead)
        let foundIndex = false
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          const indexLine = lines[j].trim()
          if (indexLine.includes('Basin Index')) {
            const match = indexLine.match(/Basin Index\s+\(%\)\s+(\d+|\*)\s+(\d+|\*)/)
            if (match) {
              const sweIndex = match[1] === '*' ? null : parseInt(match[1])
              const precipIndex = match[2] === '*' ? null : parseInt(match[2])
              basins.push({
                name: currentBasin,
                snowWaterEquivalentIndex: sweIndex,
                totalPrecipitationIndex: precipIndex
              })
              foundIndex = true
              break
            }
          }
        }
        if (!foundIndex) {
          basins.push({
            name: currentBasin,
            snowWaterEquivalentIndex: null,
            totalPrecipitationIndex: null
          })
        }
      }
      currentBasin = line
      continue
    }
    
    // Skip empty lines, basin index lines, and header lines
    if (!line || line.includes('Basin Index') || line.includes('-----')) continue
    
    // Parse site data line
    // Lines start with a space, then have name, elevation, and data values
    // Format: " Name                Elevation  SWE_curr  SWE_med  SWE_%  Precip_curr  Precip_med  Precip_%"
    if (!originalLine.startsWith(' ') || !currentBasin) continue
    
    // Split by multiple spaces (2 or more) to get fields
    const parts = line.split(/\s{2,}/)
    
    // Need at least 8 fields: name, elevation, and 6 data values
    if (parts.length < 8) continue
    
    // First field should be the name (not a number)
    const name = parts[0].trim()
    if (!name || name.match(/^\d+$/)) continue // Skip if name is missing or is a number
    
    // Second field should be elevation (3-5 digits)
    const elevationStr = parts[1].trim()
    const elevation = parseInt(elevationStr)
    if (isNaN(elevation) || elevation < 100 || elevation > 15000) continue
    
    // Skip if name looks like a basin name (all caps, long, no lowercase)
    if (name.toUpperCase() === name && name.length > 15 && !name.match(/[a-z]/)) continue
    
    const parseValue = (val: string): number | null => {
      const cleaned = val.trim()
      if (cleaned === '-M' || cleaned === '*' || cleaned === '' || cleaned === 'M') return null
      const parsed = parseFloat(cleaned)
      return isNaN(parsed) ? null : parsed
    }
    
    const sweCurrent = parseValue(parts[2])
    const sweMedian = parseValue(parts[3])
    const swePercent = parseValue(parts[4])
    
    const precipCurrent = parseValue(parts[5])
    const precipMedian = parseValue(parts[6])
    const precipPercent = parseValue(parts[7])
    
    sites.push({
      name,
      elevation,
      basin: currentBasin,
      snowWaterEquivalent: {
        current: sweCurrent,
        median: sweMedian,
        percentOfMedian: swePercent
      },
      totalPrecipitation: {
        current: precipCurrent,
        median: precipMedian,
        percentOfMedian: precipPercent
      }
    })
  }
  
  // Add last basin if it exists - look backwards from end of file
  if (currentBasin) {
    // Look for basin index for the last basin - search backwards from the end
    let foundIndex = false
    for (let j = lines.length - 1; j >= Math.max(0, lines.length - 50); j--) {
      const indexLine = lines[j].trim()
      if (indexLine.includes('Basin Index') && indexLine.includes(currentBasin.split(' ')[0])) {
        const match = indexLine.match(/Basin Index\s+\(%\)\s+(\d+|\*)\s+(\d+|\*)/)
        if (match) {
          const sweIndex = match[1] === '*' ? null : parseInt(match[1])
          const precipIndex = match[2] === '*' ? null : parseInt(match[2])
          basins.push({
            name: currentBasin,
            snowWaterEquivalentIndex: sweIndex,
            totalPrecipitationIndex: precipIndex
          })
          foundIndex = true
          break
        }
      }
    }
    
    // Also try searching forward from where we last saw this basin
    if (!foundIndex) {
      const lastBasinIndex = lines.findIndex((l, idx) => idx > lines.length - 50 && l.includes('Basin Index'))
      if (lastBasinIndex !== -1) {
        const indexLine = lines[lastBasinIndex].trim()
        const match = indexLine.match(/Basin Index\s+\(%\)\s+(\d+|\*)\s+(\d+|\*)/)
        if (match) {
          const sweIndex = match[1] === '*' ? null : parseInt(match[1])
          const precipIndex = match[2] === '*' ? null : parseInt(match[2])
          basins.push({
            name: currentBasin,
            snowWaterEquivalentIndex: sweIndex,
            totalPrecipitationIndex: precipIndex
          })
          foundIndex = true
        }
      }
    }
    
    if (!foundIndex) {
      basins.push({
        name: currentBasin,
        snowWaterEquivalentIndex: null,
        totalPrecipitationIndex: null
      })
    }
  }
  
  return { date, sites, basins }
}

import { unstable_cache } from 'next/cache'

// Cache the SNOTEL text file fetch and parsing for 1 hour
const getCachedSNOTELData = unstable_cache(
  async () => {
    const response = await fetch('https://www.water-data.com/colorado_snotel_rpt.txt', {
      next: { revalidate: 3600 } // Revalidate every hour
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch SNOTEL data from text file')
    }
    
    const text = await response.text()
    return parseSNOTELData(text)
  },
  ['snotel-data'],
  {
    revalidate: 3600, // 1 hour
    tags: ['snotel']
  }
)

export async function GET(request: Request) {
  try {
    // Check if we should force text file parsing (via query parameter)
    const { searchParams } = new URL(request.url)
    const forceTextFile = searchParams.get('source') === 'text' || searchParams.get('forceText') === 'true'
    
    // Always use text file for now to ensure we have complete data with medians and percentages
    // The database data doesn't have medians/percentages calculated yet
    if (forceTextFile || true) {
      console.log('Fetching SNOTEL data from text file (cached)')
      const parsed = await getCachedSNOTELData()
      
      console.log(`Parsed ${parsed.sites.length} sites and ${parsed.basins.length} basins from text file`)
      return NextResponse.json(parsed, {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200'
        }
      })
    }
    
    // Try to fetch from database first (only if not forcing text file)
    const sitesWithData = await getSNOTELSitesWithLatestMeasurements()
    const basins = await getSNOTELBasins()
    
    if (sitesWithData.length > 0) {
      // Calculate medians from historical data (for now, we'll use the latest measurement's values)
      // TODO: Calculate actual medians from historical measurements
      const sites: SNOTELSite[] = sitesWithData.map(site => {
        const latest = site.latest_measurement
        return {
          name: site.name,
          elevation: site.elevation || 0,
          basin: site.basin || '',
          snowWaterEquivalent: {
            current: latest?.snow_water_equivalent || null,
            median: null, // TODO: Calculate from historical data
            percentOfMedian: null // TODO: Calculate from historical data
          },
          totalPrecipitation: {
            current: latest?.precipitation || null,
            median: null, // TODO: Calculate from historical data
            percentOfMedian: null // TODO: Calculate from historical data
          }
        }
      })
      
      // Group sites by basin and calculate basin indices
      const basinMap = new Map<string, { sites: SNOTELSite[] }>()
      sites.forEach(site => {
        if (!basinMap.has(site.basin)) {
          basinMap.set(site.basin, { sites: [] })
        }
        basinMap.get(site.basin)!.sites.push(site)
      })
      
      const basinData = Array.from(basinMap.entries()).map(([name, data]) => {
        // Calculate basin index as average of site percentages
        // For now, return null since we don't have medians calculated
        return {
          name,
          snowWaterEquivalentIndex: null, // TODO: Calculate from site data
          totalPrecipitationIndex: null // TODO: Calculate from site data
        }
      })
      
      return NextResponse.json({
        date: new Date().toLocaleDateString('en-US', { 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric' 
        }),
        sites,
        basins: basinData
      })
    }
    
    // Fallback to text file if database is empty
    console.log('Database empty, falling back to text file')
    const response = await fetch('https://www.water-data.com/colorado_snotel_rpt.txt', {
      next: { revalidate: 3600 } // Revalidate every hour
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch SNOTEL data')
    }
    
    const text = await response.text()
    const parsed = parseSNOTELData(text)
    
    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Error fetching SNOTEL data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch SNOTEL data' },
      { status: 500 }
    )
  }
}

