import { 
  getLatestWaterMeasurement, 
  getWaterMeasurementsByRange,
  getWaterMeasurementsByRangeSampled,
  getHistoricalAverages, 
  getAllRamps,
  getElevationStorageCapacity,
  getHistoricalWaterYearLows,
  getHistoricalDropsToLow,
  getBasinPlotsDataOptimized,
  getPreRunoffLow,
  getWaterYearPeakSoFar,
  getSimilarSnowpackYears,
  type BasinPlotsDataPoint,
  type WaterYearAnalysis
} from '@/lib/db'

// Use optimized basin plots data for home page (5 recent years instead of all 40)
const getBasinPlotsData = () => getBasinPlotsDataOptimized(5)
import { unstable_cache } from 'next/cache'
import { getSeasonalStatus, getCurrentWaterYear, type SeasonalStatus } from '@/lib/seasonal-utils'
import { projectFromSnowpack, type SnowpackProjection } from '@/lib/calculations'

// Cache water measurements by range for 1 hour
// Each date range gets its own cache entry
async function getCachedWaterMeasurements(startDate: string, endDate: string) {
  const cacheKey = `water-measurements-${startDate}-${endDate}`
  const cached = unstable_cache(
    async () => {
      return getWaterMeasurementsByRange(startDate, endDate)
    },
    [cacheKey],
    {
      revalidate: 3600, // 1 hour
      tags: ['water-measurements', cacheKey]
    }
  )
  return cached()
}

// Cache historical averages for 1 hour  
const getCachedHistoricalAverages = unstable_cache(
  async () => {
    return getHistoricalAverages()
  },
  ['historical-averages'],
  {
    revalidate: 3600, // 1 hour
    tags: ['historical-averages']
  }
)

// Cache elevation storage capacity for 24 hours (rarely changes)
const getCachedElevationStorageCapacity = unstable_cache(
  async () => {
    return getElevationStorageCapacity()
  },
  ['elevation-storage-capacity'],
  {
    revalidate: 86400, // 24 hours
    tags: ['elevation-storage']
  }
)

// Cache all ramps for 24 hours (rarely changes)
const getCachedAllRamps = unstable_cache(
  async () => {
    return getAllRamps()
  },
  ['all-ramps'],
  {
    revalidate: 86400, // 24 hours
    tags: ['ramps']
  }
)

// Cache latest water measurement for 5 minutes
const getCachedLatestMeasurement = unstable_cache(
  async () => {
    return getLatestWaterMeasurement()
  },
  ['latest-measurement-home'],
  {
    revalidate: 300, // 5 minutes
    tags: ['water-measurements']
  }
)

// Cache historical water year lows for 1 hour
const getCachedHistoricalWaterYearLows = unstable_cache(
  async (currentElevation: number) => {
    return getHistoricalWaterYearLows(currentElevation, 50)
  },
  ['historical-water-year-lows'],
  {
    revalidate: 3600, // 1 hour
    tags: ['water-year-analysis']
  }
)

// Note: Basin plots data is too large (>2MB) for Next.js cache, so we fetch it directly
// The database query itself should be fast enough without caching
import { CurrentStatus, HistoricalAverages, StorageVisualization } from '@/components/data-display'
import HomeChartsWithFavorites from '@/components/data-display/HomeChartsWithFavorites'
import WaterAdditionCalculator from '@/components/data-display/WaterAdditionCalculator'
import FeaturedArticlesStrip, { type FeaturedArticle } from '@/components/articles/FeaturedArticlesStrip'
import SimulatorPromoCard from '@/components/articles/SimulatorPromoCard'

// Hand-picked articles surfaced on the home page. Gradients evoke Lake Powell
// (sandstone + water) — swap the backgrounds for real hero images later by
// replacing the gradient div in FeaturedArticlesStrip.
const FEATURED_ARTICLES_PRIMARY: FeaturedArticle[] = [
  {
    slug: 'real-problem-isnt-drought-its-math',
    title: "The real problem isn't drought — it's math",
    subtitle: "Why Powell keeps dropping even in normal years, and what has to change.",
    badge: 'Start here',
    badgeColor: 'bg-teal-100 text-teal-800',
    gradient: 'from-amber-400 via-orange-400 to-rose-400',
    imageUrl: '/lp-pictures/reflection-canyon-bathtub.jpg',
    imageAlt: 'Reflection Canyon aerial showing drawdown bathtub rings',
    readMinutes: 6,
  },
  {
    slug: 'plans-head-to-head',
    title: 'The five federal plans, head to head',
    subtitle: 'Same drought, same inflows — which policy actually keeps Powell alive?',
    badge: 'The verdict',
    badgeColor: 'bg-gray-900 text-white',
    gradient: 'from-indigo-500 via-sky-500 to-teal-400',
    imageUrl: '/lp-pictures/lake-aerial-panorama.jpg',
    imageAlt: 'Aerial panorama of Lake Powell',
    readMinutes: 8,
  },
  {
    slug: 'supply-driven-plan',
    title: 'Supply Driven — best recovery potential',
    subtitle: 'Releases tied to how much water the river is actually producing. Wet years pay off and the lake climbs.',
    badge: 'Top pick · Recovery',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    gradient: 'from-sky-500 via-cyan-400 to-teal-500',
    imageUrl: '/lp-pictures/sunset-reflections.webp',
    imageAlt: 'Sunset sandstone cliffs reflected in Lake Powell',
    readMinutes: 5,
  },
  {
    slug: 'max-operational-flexibility-plan',
    title: 'Max Operational Flexibility — strongest drawdown protection',
    subtitle: "Storage + flow-aware releases, with a run-of-river safeguard when Powell runs low.",
    badge: 'Top pick · Safety',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    gradient: 'from-emerald-500 via-teal-500 to-sky-500',
    imageUrl: '/lp-pictures/sunset-panorama.webp',
    imageAlt: 'Lake Powell at sunset with blue water',
    readMinutes: 5,
  },
]

const FEATURED_ARTICLES_SECONDARY: FeaturedArticle[] = [
  // Lead with the head-to-head so readers can jump straight to the verdict
  // across all five plans. Then the worth-considering plans (Enhanced as the
  // fallback behind SD and MOF, the Abundance Act as the long-run
  // complement). Not-recommended plans (Basic, No Action) go at the end so
  // readers don't hit the "fails fast" copy before the credible options.
  {
    slug: 'plans-head-to-head',
    title: 'Head-to-head — every plan on the same chart',
    subtitle: 'Side-by-side grades across recovery, floor, bad-case ending, and speed. The full verdict.',
    gradient: 'from-indigo-500 via-sky-500 to-teal-400',
    imageUrl: '/lp-pictures/lake-aerial-panorama.jpg',
    imageAlt: 'Aerial panorama of Lake Powell',
    readMinutes: 8,
  },
  {
    slug: 'enhanced-coordination-plan',
    title: 'Enhanced Coordination — balancing Powell and Mead',
    subtitle: 'A middle-ground plan that coordinates the two biggest reservoirs on the river.',
    gradient: 'from-teal-400 via-sky-400 to-indigo-400',
    imageUrl: '/lp-pictures/butte-landscape.jpg',
    imageAlt: 'Lake Powell butte landscape',
    readMinutes: 5,
  },
  {
    slug: 'colorado-river-abundance-act',
    title: 'The Abundance Act — what if we added new water?',
    subtitle: 'Desalination at scale. How much it would cost, and how much it would actually help.',
    gradient: 'from-emerald-400 via-cyan-400 to-blue-500',
    imageUrl: '/lp-pictures/reflection-canyon-sunrise.webp',
    imageAlt: 'Sunrise over Reflection Canyon',
    readMinutes: 7,
  },
  {
    slug: 'basic-coordination-plan',
    title: 'Basic Coordination — elevation-based cuts',
    subtitle: 'Better than No Action, but still not enough to recover from a deep drawdown.',
    gradient: 'from-amber-400 via-orange-300 to-yellow-300',
    imageUrl: '/lp-pictures/sandstone-shore.jpg',
    imageAlt: 'Sandstone shoreline meeting clear Lake Powell water',
    readMinutes: 4,
  },
  {
    slug: 'no-action-plan',
    title: 'No Action — the post-2026 default if nothing changes',
    subtitle: 'Full 8.23 MAF out the door every year, drought or not. Why it fails fast.',
    gradient: 'from-red-400 via-orange-400 to-amber-400',
    imageUrl: '/lp-pictures/bathtub-rings-aerial.jpg',
    imageAlt: 'Aerial view of deeply drawn-down Lake Powell side canyons',
    readMinutes: 4,
  },
]
import QuickJumpHeader from '@/components/layout/QuickJumpHeader'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { calculateDropProjection, calculateDailyElevationProjection } from '@/lib/calculations'

// Lazy load below-the-fold components to improve initial render
const BasinPlotsChart = dynamic(() => import('@/components/snowpack/BasinPlotsChart'), {
  loading: () => (
    <div className="h-[400px] flex items-center justify-center">
      <div className="text-gray-400">Loading chart...</div>
    </div>
  ),
  ssr: true
})

const TributarySnowpack = dynamic(() => import('@/components/snowpack/TributarySnowpack'), {
  loading: () => (
    <div className="h-[300px] flex items-center justify-center">
      <div className="text-gray-400">Loading snowpack data...</div>
    </div>
  ),
  ssr: true
})

// Revalidate every 5 minutes for fresh data while still benefiting from cache
export const revalidate = 300

// Historical data start date (earliest Lake Powell data available)
const EARLIEST_DATA_DATE = '1963-01-01'

interface BasinPlotsData {
  years: Array<{
    year: number
    data: Array<{ date: string; swe: number | null }>
  }>
  percentiles: Array<{
    date: string
    p10: number | null
    p30: number | null
    p70: number | null
    p90: number | null
  }>
  statistics: Array<{
    date: string
    min: number | null
    median_91_20: number | null
    median_por: number | null
    max: number | null
    median_peak_swe: number | null
  }>
  currentYear: number
  currentStats: {
    percentOfMedian: number | null
    percentOfMedianPeak: number | null
    daysUntilMedianPeak: number | null
    percentile: number | null
  }
}

/**
 * Convert date_str (MM-DD) to a water year day number for proper sorting
 * Water year runs Oct 1 (day 1) to Sep 30 (day 365)
 * Oct=1-31, Nov=32-61, Dec=62-92, Jan=93-123, Feb=124-151, etc.
 */
function dateStrToWaterYearDay(dateStr: string): number {
  const [monthStr, dayStr] = dateStr.split('-')
  const month = parseInt(monthStr, 10)
  const day = parseInt(dayStr, 10)
  
  // Days in each month
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  
  // Calculate cumulative days from October 1
  // Water year months: Oct(10)=0, Nov(11)=1, Dec(12)=2, Jan(1)=3, Feb(2)=4, etc.
  const waterYearMonth = month >= 10 ? month - 10 : month + 2
  
  let cumulativeDays = 0
  const monthOrder = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9] // Water year month order
  for (let i = 0; i < waterYearMonth; i++) {
    cumulativeDays += daysInMonth[monthOrder[i] - 1]
  }
  
  return cumulativeDays + day
}

function calculateCurrentStats(
  data: BasinPlotsDataPoint[],
  currentYear: number,
  currentDate: Date
): {
  percentOfMedian: number | null
  percentOfMedianPeak: number | null
  daysUntilMedianPeak: number | null
  percentile: number | null
} {
  // Find the most recent data point for the current year
  // Sort by water year day (Oct 1 = day 1, Sep 30 = day 365)
  const currentYearData = data
    .filter(d => d.year === currentYear && d.swe_value !== null)
    .sort((a, b) => dateStrToWaterYearDay(b.date_str) - dateStrToWaterYearDay(a.date_str))
  
  if (currentYearData.length === 0) {
    return {
      percentOfMedian: null,
      percentOfMedianPeak: null,
      daysUntilMedianPeak: null,
      percentile: null
    }
  }
  
  const latest = currentYearData[0]
  const dateStr = latest.date_str
  
  // Find the same date in other years to calculate percentiles
  const sameDateData = data
    .filter(d => d.date_str === dateStr && d.swe_value !== null && d.year !== currentYear)
    .map(d => d.swe_value!)
    .sort((a, b) => a - b)
  
  if (sameDateData.length === 0) {
    return {
      percentOfMedian: null,
      percentOfMedianPeak: null,
      daysUntilMedianPeak: null,
      percentile: null
    }
  }
  
  // Calculate percent of median
  const median = sameDateData[Math.floor(sameDateData.length / 2)]
  const percentOfMedian = latest.swe_value && median ? (latest.swe_value / median) * 100 : null
  
  // Calculate percentile
  const currentValue = latest.swe_value!
  const percentile = sameDateData.filter(v => v <= currentValue).length / sameDateData.length * 100
  
  // Calculate percent of median peak (need to find median peak SWE for this date)
  const percentOfMedianPeak = latest.swe_value && latest.median_peak_swe
    ? (latest.swe_value / latest.median_peak_swe) * 100
    : null
  
  // Calculate days until median peak (simplified - would need to find peak date)
  const daysUntilMedianPeak = null // TODO: Calculate based on historical peak dates
  
  return {
    percentOfMedian,
    percentOfMedianPeak,
    daysUntilMedianPeak,
    percentile
  }
}

async function processBasinPlotsData(): Promise<BasinPlotsData | null> {
  try {
    const rawData = await getBasinPlotsData()
    
    if (rawData.length === 0) {
      return null
    }
    
    const currentYear = getCurrentWaterYear()
    const currentDate = new Date()
    
    // Group data by year
    const yearsMap = new Map<number, Array<{ date: string; swe: number | null }>>()
    const percentilesMap = new Map<string, { p10: number | null; p30: number | null; p70: number | null; p90: number | null }>()
    const statisticsMap = new Map<string, { min: number | null; median_91_20: number | null; median_por: number | null; max: number | null; median_peak_swe: number | null }>()
    
    for (const point of rawData) {
      // Group by year for time series
      if (!yearsMap.has(point.year)) {
        yearsMap.set(point.year, [])
      }
      yearsMap.get(point.year)!.push({
        date: point.water_year_date,
        swe: point.swe_value
      })
      
      // Group percentiles by date (same for all years on a given date)
      if (!percentilesMap.has(point.water_year_date)) {
        percentilesMap.set(point.water_year_date, {
          p10: point.percentile_10,
          p30: point.percentile_30,
          p70: point.percentile_70,
          p90: point.percentile_90
        })
      }
      
      // Group statistics by date (same for all years on a given date)
      if (!statisticsMap.has(point.water_year_date)) {
        statisticsMap.set(point.water_year_date, {
          min: point.min_value,
          median_91_20: point.median_91_20,
          median_por: point.median_por,
          max: point.max_value,
          median_peak_swe: point.median_peak_swe
        })
      }
    }
    
    // Convert maps to arrays
    const years = Array.from(yearsMap.entries())
      .map(([year, data]) => ({
        year,
        data: data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      }))
      .sort((a, b) => a.year - b.year)
    
    const percentiles = Array.from(percentilesMap.entries())
      .map(([date, values]) => ({
        date,
        ...values
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    const statistics = Array.from(statisticsMap.entries())
      .map(([date, values]) => ({
        date,
        ...values
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    // Calculate current statistics
    const currentStats = calculateCurrentStats(rawData, currentYear, currentDate)
    
    return {
      years,
      percentiles,
      statistics,
      currentYear,
      currentStats
    }
  } catch (error) {
    console.error('Error processing basin plots data:', error)
    return null
  }
}

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

interface BasinData {
  name: string
  snowWaterEquivalentIndex: number | null
  totalPrecipitationIndex: number | null
}

interface SNOTELData {
  date: string
  sites: SNOTELSite[]
  basins: BasinData[]
}

function parseSNOTELData(text: string): SNOTELData {
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
  const basins: BasinData[] = []
  
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

async function getSNOTELData(): Promise<SNOTELData | null> {
  try {
    return await getCachedSNOTELData()
  } catch (error) {
    // If fetch fails, return null gracefully
    // The component will handle missing SNOTEL data
    console.error('Error fetching SNOTEL data:', error)
    return null
  }
}

// Calculate date ranges
function getDateRange(range: string): { start: string; end: string } {
  // Use UTC dates to avoid timezone issues
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const endDate = end.toISOString().split('T')[0]
  
  // For "alltime", use earliest available data date
  if (range === 'alltime') {
    return { start: EARLIEST_DATA_DATE, end: endDate }
  }
  
  let start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  
  switch (range) {
    case '1month':
      start.setUTCMonth(start.getUTCMonth() - 1)
      break
    case '6months':
      start.setUTCMonth(start.getUTCMonth() - 6)
      break
    case '40years':
      start.setUTCFullYear(start.getUTCFullYear() - 40)
      break
    case '20years':
      start.setUTCFullYear(start.getUTCFullYear() - 20)
      break
    case '10years':
      start.setUTCFullYear(start.getUTCFullYear() - 10)
      break
    case '5years':
      start.setUTCFullYear(start.getUTCFullYear() - 5)
      break
    case '1year':
      start.setUTCFullYear(start.getUTCFullYear() - 1)
      break
    default:
      start.setUTCFullYear(start.getUTCFullYear() - 5) // Default to 5 years
  }
  
  const startDate = start.toISOString().split('T')[0]
  return { start: startDate, end: endDate }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const params = await searchParams
  const currentRange = params.range || '5years'
  
  // Fetch initial data in parallel for faster loading
  const [current, averages, elevationStorageData, allRamps, basinPlotsData, snotelData] = await Promise.all([
    getCachedLatestMeasurement(),
    getCachedHistoricalAverages(),
    getCachedElevationStorageCapacity(),
    getCachedAllRamps(),
    processBasinPlotsData(),
    getSNOTELData()
  ])
  
  // Process SNOTEL data for TributarySnowpack
  const sitesWithData = snotelData?.sites.filter(s => 
    s.snowWaterEquivalent.current !== null || 
    s.totalPrecipitation.current !== null ||
    s.snowWaterEquivalent.percentOfMedian !== null ||
    s.totalPrecipitation.percentOfMedian !== null ||
    s.snowWaterEquivalent.median !== null ||
    s.totalPrecipitation.median !== null
  ) || []
  
  const sitesByBasin = sitesWithData.reduce((acc, site) => {
    if (!acc[site.basin]) {
      acc[site.basin] = []
    }
    acc[site.basin].push(site)
    return acc
  }, {} as Record<string, SNOTELSite[]>)
  
  // Calculate basin averages from sites when basin index is missing
  const basinsWithCalculatedIndex = snotelData?.basins.map(basin => {
    // If basin already has an index, use it
    if (basin.snowWaterEquivalentIndex !== null) {
      return basin
    }
    
    // Otherwise, calculate from sites
    const basinSites = sitesByBasin[basin.name] || []
    const sitesWithSWE = basinSites.filter(s => s.snowWaterEquivalent.percentOfMedian !== null)
    
    if (sitesWithSWE.length > 0) {
      const avgSWE = sitesWithSWE.reduce((sum, s) => sum + (s.snowWaterEquivalent.percentOfMedian || 0), 0) / sitesWithSWE.length
      return {
        ...basin,
        snowWaterEquivalentIndex: Math.round(avgSWE)
      }
    }
    
    return basin
  }) || []
  
  // Get historical data for the chart based on selected range
  const dateRange = getDateRange(currentRange)
  const startDate = dateRange.start
  const endDate = dateRange.end
  
  // Prepare date values for queries
  const recentStartDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const today = current?.date || new Date().toISOString().split('T')[0]
  const currentYear = new Date().getFullYear()
  const currentWaterYear = getCurrentWaterYear(new Date())
  
  // Calculate current snowpack percentage from SNOTEL tributary data
  // This is more accurate for Lake Powell as it uses direct measurements from sites that feed the lake
  // Weighted by flow contribution: Colorado River 65%, San Juan 20%, SE Utah 15%
  let currentSnowpackPercent = 100 // Default fallback
  
  // Calculate from site-level data for accuracy (same approach as TributarySnowpack)
  if (sitesWithData.length > 0) {
    // Define tributary configurations with weights
    const tributaries = [
      { name: 'Colorado River', basins: ['UPPER COLORADO', 'COLORADO'], weight: 0.65 },
      { name: 'San Juan River', basins: ['SAN JUAN'], weight: 0.20 },
      { name: 'South Eastern Utah', basins: ['SOUTH EASTERN UTAH', 'GREEN RIVER', 'DIRTY DEVIL', 'ESCALANTE'], weight: 0.15 }
    ]
    
    let weightedSum = 0
    let totalWeight = 0
    
    for (const trib of tributaries) {
      // Find sites matching this tributary
      const tribSites = sitesWithData.filter(site => 
        trib.basins.some(basinName => 
          site.basin.toUpperCase().includes(basinName)
        )
      )
      
      // Calculate average from sites with percentOfMedian
      const tribSitesWithPct = tribSites.filter(s => s.snowWaterEquivalent.percentOfMedian !== null)
      if (tribSitesWithPct.length > 0) {
        const avgPct = tribSitesWithPct.reduce((sum, s) => sum + (s.snowWaterEquivalent.percentOfMedian || 0), 0) / tribSitesWithPct.length
        weightedSum += avgPct * trib.weight
        totalWeight += trib.weight
      }
    }
    
    if (totalWeight > 0) {
      currentSnowpackPercent = weightedSum / totalWeight
    }
  } else if (basinPlotsData?.currentStats?.percentOfMedian) {
    // Fallback to basin plots if SNOTEL data not available
    currentSnowpackPercent = basinPlotsData.currentStats.percentOfMedian
  }
  
  // OPTIMIZATION: Run all dependent queries in parallel
  // This significantly reduces load time by not waiting for each query sequentially
  const [
    measurements,
    recent,
    historicalLows,
    preRunoffLow,
    peakSoFar,
    similarSnowpackYears,
    recentHistoricalDataRaw
  ] = await Promise.all([
    // Measurements for chart
    current
      ? (currentRange === 'alltime' || currentRange === '40years')
        ? getWaterMeasurementsByRangeSampled(startDate, endDate, currentRange === 'alltime' ? 7 : 3)
        : getCachedWaterMeasurements(startDate, endDate)
      : Promise.resolve([]),
    // Recent measurements for CurrentStatus
    current 
      ? getCachedWaterMeasurements(recentStartDate, current.date)
      : Promise.resolve([]),
    // Historical water year lows
    current 
      ? getCachedHistoricalWaterYearLows(current.elevation)
      : Promise.resolve([]),
    // Pre-runoff low
    getPreRunoffLow(currentWaterYear),
    // Peak so far
    getWaterYearPeakSoFar(currentWaterYear),
    // Similar snowpack years (15% tolerance to ensure matches for low snowpack years)
    getSimilarSnowpackYears(currentSnowpackPercent, 15, 10),
    // Recent historical data for projection
    current
      ? getCachedWaterMeasurements(thirtyDaysAgo.toISOString().split('T')[0], endDate)
      : Promise.resolve([])
  ])
  
  // Process recent historical data
  const recentHistoricalData = recentHistoricalDataRaw.map(d => ({ date: d.date, elevation: d.elevation }))

  // 2022 DROA window — Flaming Gorge released ~500 KAF into Powell May 2022 → Apr 2023.
  // We overlay this on the Phase 1 projection chart (shifted forward 4 years) so users
  // can see how the last emergency release actually affected lake levels.
  const historical2022Measurements = await getCachedWaterMeasurements('2022-04-01', '2023-04-30')
    .then((rows) => rows.map((d) => ({ date: d.date, elevation: d.elevation })))
    .catch(() => [] as Array<{ date: string; elevation: number }>)
  
  // Get typical low date - use median historical low date's month/day, but apply to CURRENT year
  let typicalLowDate: string
  if (historicalLows.length > 0 && historicalLows[Math.floor(historicalLows.length / 2)]?.date_of_min) {
    const medianLowDate = new Date(historicalLows[Math.floor(historicalLows.length / 2)].date_of_min)
    typicalLowDate = new Date(currentYear, medianLowDate.getMonth(), medianLowDate.getDate()).toISOString().split('T')[0]
  } else {
    typicalLowDate = new Date(currentYear, 3, 21).toISOString().split('T')[0]
  }
  
  // This query depends on typicalLowDate, so it runs after the parallel batch
  const historicalDrops = current
    ? await getHistoricalDropsToLow(today, current.elevation, typicalLowDate, 50, undefined)
    : []
  
  // Calculate projected drop and daily projections
  let projectedDrop = 0
  let dailyProjections: Array<{ date: string; projected: number; low: number; high: number }> = []
  let projectedLowElevation = 0
  let dropToLowLow = 0
  let dropToLowHigh = 0
  
  if (current && historicalDrops.length > 0) {
    const dropProj = calculateDropProjection(current.elevation, historicalDrops)
    projectedDrop = dropProj.projectedDrop
    projectedLowElevation = current.elevation - projectedDrop
    dropToLowLow = dropProj.confidenceRange.low
    dropToLowHigh = dropProj.confidenceRange.high
    dailyProjections = calculateDailyElevationProjection(today, typicalLowDate, current.elevation, historicalDrops)
  }

  // Calculate weekly change for current trend line
  let weeklyChange: number | null = null
  if (current && recent.length > 0) {
    const sevenDaysAgo = new Date(current.date)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoTime = sevenDaysAgo.getTime()
    
    let measurement7DaysAgo: typeof recent[0] | null = null
    let minDiff = Infinity
    
    for (const measurement of recent) {
      const measurementDate = new Date(measurement.date).getTime()
      const diff = Math.abs(measurementDate - sevenDaysAgoTime)
      if (diff < minDiff && diff <= 2 * 24 * 60 * 60 * 1000) {
        minDiff = diff
        measurement7DaysAgo = measurement
      }
    }
    
    if (measurement7DaysAgo) {
      weeklyChange = current.elevation - measurement7DaysAgo.elevation
    }
  }
  
  // Get seasonal status for conditional rendering
  const seasonalStatus = current 
    ? getSeasonalStatus(new Date(), current.elevation, weeklyChange, preRunoffLow, peakSoFar)
    : null
  
  // Calculate projected spring low for runoff projection
  // Use average of historical projection and current trend projection for balance
  let projectedSpringLowElevation: number | undefined = undefined
  if (current && typicalLowDate) {
    // Historical average projection
    const historicalProjectedLow = projectedLowElevation > 0 ? projectedLowElevation : current.elevation
    
    // Current trend projection (if we have weekly change data)
    let trendProjectedLow = historicalProjectedLow
    if (weeklyChange !== null) {
      const today = new Date()
      const lowDate = new Date(typicalLowDate)
      const weeksUntilLow = Math.max(0, (lowDate.getTime() - today.getTime()) / (7 * 24 * 60 * 60 * 1000))
      trendProjectedLow = current.elevation + (weeklyChange * weeksUntilLow)
    }
    
    // Average of historical and trend projections for a balanced estimate
    projectedSpringLowElevation = (historicalProjectedLow + trendProjectedLow) / 2
  }
  
  // Calculate snowpack projection (reuse elevationStorageData instead of fetching again)
  // Uses volume-based calculation starting from projected spring low
  let snowpackProjection: SnowpackProjection | null = null
  if (current && similarSnowpackYears.length > 0) {
    snowpackProjection = projectFromSnowpack(
      currentSnowpackPercent,
      current.elevation,
      similarSnowpackYears,
      elevationStorageData,  // Reuse instead of duplicate fetch
      projectedSpringLowElevation  // Start projection from expected spring low
    )
  }

  if (!current) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-4">Lake Powell Water Data</h1>
        <p>No water measurement data available.</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-3 lg:px-4 py-6 lg:py-16">
      {/* 1. Current Water Level */}
      <CurrentStatus current={current} recent={recent} ramps={allRamps} />

      {/* Quick jumps + sticky mini-header on scroll */}
      <QuickJumpHeader
        elevation={current.elevation}
        dailyChangeInches={(() => {
          const previous = recent.length > 1 ? recent[recent.length - 2] : null
          if (!previous) return null
          const d = current.elevation - previous.elevation
          if (d === 0) return '0'
          const abs = Math.abs(d)
          let ft = Math.floor(abs)
          let inches = Math.round((abs - ft) * 12)
          if (inches === 12) { ft += 1; inches = 0 }
          const sign = d > 0 ? '+' : '−'
          if (ft === 0 && inches === 0) return '0'
          if (ft === 0) return `${sign}${inches}in`
          if (inches === 0) return `${sign}${ft}ft`
          return `${sign}${ft}ft ${inches}in`
        })()}
        sections={[
          { href: '#chart', label: 'Chart' },
          { href: '#projection', label: 'Projection' },
          { href: '#storage', label: 'Storage' },
          { href: '#snowpack', label: 'Snowpack' },
        ]}
      />

      {/* Simulator CTA — placed up high so readers can jump to the long-term
          outcomes right after seeing today's lake level. */}
      <div className="mt-6 lg:mt-8">
        <SimulatorPromoCard />
      </div>

      {/* 2. Historical Chart + 3. Elevation Projection + 4. Snowpack Projection - with favorite ramps */}
      <HomeChartsWithFavorites
        measurements={measurements}
        startDate={startDate}
        endDate={endDate}
        currentRange={currentRange}
        currentElevation={current.elevation}
        today={today}
        typicalLowDate={typicalLowDate}
        projectedDrop={projectedDrop}
        projectedLowElevation={projectedLowElevation}
        dropToLowLow={dropToLowLow}
        dropToLowHigh={dropToLowHigh}
        historicalDrops={historicalDrops}
        dailyProjections={dailyProjections}
        recentHistoricalData={recentHistoricalData}
        weeklyChange={weeklyChange}
        allRamps={allRamps}
        favoriteRampIds={[]}
        seasonalStatus={seasonalStatus}
        snowpackProjection={snowpackProjection}
        currentSnowpackPercent={currentSnowpackPercent}
      />

      {/* Featured articles — frame the federal plan and point to the deep dives */}
      <FeaturedArticlesStrip
        kicker="The bigger picture"
        heading="What each federal long-term plan would look like"
        articles={FEATURED_ARTICLES_PRIMARY}
      />

      {/* 5. Water Addition Calculator — what does X MAF mean for the lake? */}
      <div className="mt-8 lg:mt-12">
        <div id="calculator" className="scroll-mt-24" />
        <WaterAdditionCalculator
          elevationStorageData={elevationStorageData}
          currentElevation={current.elevation}
          currentContent={current.content}
          currentDate={today}
          projectedRunoffInflowAf={snowpackProjection?.projectedRunoffInflow}
          allRamps={allRamps}
          historical2022Measurements={historical2022Measurements}
        />
      </div>

      {/* More articles — the specific plan breakdowns */}
      <FeaturedArticlesStrip
        kicker="Compare the plans"
        heading="Which plan actually holds the lake up?"
        articles={FEATURED_ARTICLES_SECONDARY}
      />

      {/* 6. Storage Profile - Below the fold, can load after initial render */}
      <Suspense fallback={
        <div className="mt-12 h-[400px] flex items-center justify-center">
          <div className="text-gray-400">Loading storage visualization...</div>
        </div>
      }>
        <div className="mt-12">
          <div id="storage" className="scroll-mt-24" />
          <StorageVisualization
            elevationStorageData={elevationStorageData}
            currentElevation={current.elevation}
          />
        </div>
      </Suspense>

      {/* 6. Snowpack Chart - Lazy loaded */}
      {basinPlotsData && (
        <Suspense fallback={
          <div className="mt-8 lg:mt-12 card p-4 lg:p-8">
            <div className="h-[400px] flex items-center justify-center">
              <div className="text-gray-400">Loading snowpack chart...</div>
            </div>
          </div>
        }>
          <div className="mt-8 lg:mt-12">
            <div id="snowpack" className="scroll-mt-24" />
            <div className="card p-4 lg:p-8">
              <h2 className="text-xl lg:text-2xl font-light mb-2 lg:mb-4 text-gray-900">Snow Water Equivalent Trends</h2>
              <p className="text-xs lg:text-sm text-gray-500 mb-4 lg:mb-6 font-light">
                Historical SWE trends for Upper Colorado. Current year shown in black.
              </p>
              <BasinPlotsChart
                years={basinPlotsData.years}
                percentiles={basinPlotsData.percentiles}
                statistics={basinPlotsData.statistics}
                currentYear={basinPlotsData.currentYear}
                currentStats={{
                  ...basinPlotsData.currentStats,
                  // Override with SNOTEL-derived weighted average for consistency
                  percentOfMedian: currentSnowpackPercent
                }}
              />
              <p className="text-xs text-gray-400 mt-4 font-light">
                Statistical shading percentiles are calculated from period of record (POR) data, excluding the current water year. 
                Percentile categories range from: minimum to 10th percentile, 10th-30th, 30th-70th, 70th-90th, and 90th-maximum.
              </p>
            </div>
          </div>
        </Suspense>
      )}

      {/* 7. Tributary Snowpack - Lazy loaded */}
      {snotelData && (
        <Suspense fallback={
          <div className="mt-12 h-[300px] flex items-center justify-center">
            <div className="text-gray-400">Loading tributary snowpack...</div>
          </div>
        }>
          <div className="mt-12">
            <TributarySnowpack sites={sitesWithData} basins={basinsWithCalculatedIndex} />
          </div>
        </Suspense>
      )}

    </div>
  )
}
