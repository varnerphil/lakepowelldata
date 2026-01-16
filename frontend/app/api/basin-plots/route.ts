import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getBasinPlotsData, BasinPlotsDataPoint } from '@/lib/db'

// Cache basin plots data processing for 1 hour
const getCachedBasinPlotsData = unstable_cache(
  async () => {
    return await getBasinPlotsData()
  },
  ['basin-plots-data'],
  {
    revalidate: 3600, // 1 hour
    tags: ['basin-plots']
  }
)

interface YearData {
  year: number
  data: Array<{ date: string; swe: number | null }>
}

interface BasinPlotsResponse {
  years: YearData[]
  percentiles: {
    date: string
    p10: number | null
    p30: number | null
    p70: number | null
    p90: number | null
  }[]
  statistics: {
    date: string
    min: number | null
    median_91_20: number | null
    median_por: number | null
    max: number | null
    median_peak_swe: number | null
  }[]
  currentYear: number
  currentStats: {
    percentOfMedian: number | null
    percentOfMedianPeak: number | null
    daysUntilMedianPeak: number | null
    percentile: number | null
  }
}

function getCurrentWaterYear(): number {
  const now = new Date()
  // Water year runs from Oct 1 to Sep 30
  if (now.getMonth() >= 9) { // October (month 9) or later
    return now.getFullYear() + 1
  }
  return now.getFullYear()
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
  const currentYearData = data
    .filter(d => d.year === currentYear && d.swe_value !== null)
    .sort((a, b) => new Date(b.water_year_date).getTime() - new Date(a.water_year_date).getTime())
  
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

export async function GET() {
  try {
    const rawData = await getCachedBasinPlotsData()
    
    if (rawData.length === 0) {
      return NextResponse.json(
        { error: 'No basin plots data available' },
        { status: 404 }
      )
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
    const years: YearData[] = Array.from(yearsMap.entries())
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
    
    const response: BasinPlotsResponse = {
      years,
      percentiles,
      statistics,
      currentYear,
      currentStats
    }
    
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
      }
    })
  } catch (error) {
    console.error('Error fetching basin plots data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch basin plots data' },
      { status: 500 }
    )
  }
}

