import {
  getLatestWaterMeasurement,
  getWaterMeasurementsByRange,
  getHistoricalAverages,
  getWaterYearSummaries,
  getMonthlyAverages,
  getSeasonalTrends,
  getElevationDistribution,
  getFlowStatistics,
  getStorageCapacityAnalysis,
  WaterMeasurement,
  WaterYearSummary,
  MonthlyAverage,
  SeasonalTrend,
  ElevationDistribution,
  FlowStatistics,
  StorageCapacityAnalysis
} from './db'
import { unstable_cache } from 'next/cache'

/**
 * Centralized query functions that combine database queries
 * These provide convenient wrappers for common data fetching patterns
 */

export interface CurrentData {
  current: WaterMeasurement
  recent: WaterMeasurement[]
  averages: Awaited<ReturnType<typeof getHistoricalAverages>>
}

export async function getCurrentData(): Promise<CurrentData | null> {
  const current = await getLatestWaterMeasurement()
  if (!current) return null
  
  const recent = await getWaterMeasurementsByRange(
    new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    current.date
  )
  
  const averages = await getHistoricalAverages()
  
  return {
    current,
    recent,
    averages
  }
}

export type HistoricalRange = 
  | '1month' 
  | '3months' 
  | '6months' 
  | '1year' 
  | '2years' 
  | '3years' 
  | '5years' 
  | '10years' 
  | '15years' 
  | '20years' 
  | 'alltime'

export interface HistoricalData {
  measurements: WaterMeasurement[]
  startDate: string
  endDate: string
  range: HistoricalRange
}

function getDateRange(range: HistoricalRange): { start: string; end: string } {
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const endDate = end.toISOString().split('T')[0]
  
  if (range === 'alltime') {
    return { start: '1969-01-01', end: endDate }
  }
  
  let start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  
  switch (range) {
    case '1month':
      start.setUTCMonth(start.getUTCMonth() - 1)
      break
    case '3months':
      start.setUTCMonth(start.getUTCMonth() - 3)
      break
    case '6months':
      start.setUTCMonth(start.getUTCMonth() - 6)
      break
    case '1year':
      start.setUTCFullYear(start.getUTCFullYear() - 1)
      break
    case '2years':
      start.setUTCFullYear(start.getUTCFullYear() - 2)
      break
    case '3years':
      start.setUTCFullYear(start.getUTCFullYear() - 3)
      break
    case '5years':
      start.setUTCFullYear(start.getUTCFullYear() - 5)
      break
    case '10years':
      start.setUTCFullYear(start.getUTCFullYear() - 10)
      break
    case '15years':
      start.setUTCFullYear(start.getUTCFullYear() - 15)
      break
    case '20years':
      start.setUTCFullYear(start.getUTCFullYear() - 20)
      break
  }
  
  const startDate = start.toISOString().split('T')[0]
  return { start: startDate, end: endDate }
}

export async function getHistoricalData(
  range: HistoricalRange = '1year',
  customStart?: string,
  customEnd?: string
): Promise<HistoricalData> {
  const dateRange = customStart && customEnd 
    ? { start: customStart, end: customEnd }
    : getDateRange(range)
  
  const measurements = await getWaterMeasurementsByRange(dateRange.start, dateRange.end)
  
  return {
    measurements,
    startDate: dateRange.start,
    endDate: dateRange.end,
    range
  }
}

export interface StatisticalSummary {
  current: WaterMeasurement | null
  historicalAverages: Awaited<ReturnType<typeof getHistoricalAverages>>
  waterYearSummaries: WaterYearSummary[]
  monthlyAverages: MonthlyAverage[]
  seasonalTrends: SeasonalTrend[]
  elevationDistribution: ElevationDistribution
  recentFlowStats: FlowStatistics
  storageAnalysis: StorageCapacityAnalysis[]
}

// Cache statistical summary for 1 hour to reduce database load
const getCachedStatisticalSummary = unstable_cache(
  async (startDate?: string, endDate?: string) => {
    const now = new Date()
    const defaultEnd = now.toISOString().split('T')[0]
    const defaultStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0]
    
    const queryStart = startDate || defaultStart
    const queryEnd = endDate || defaultEnd
    
    // Execute queries in smaller batches to avoid exhausting connection pool
    // With pool size of 8, we limit to max 3 concurrent queries per batch
    // Batch 1: Quick single queries (3 queries)
    const [current, historicalAverages, waterYearSummaries] = await Promise.all([
      getLatestWaterMeasurement(),
      getHistoricalAverages(),
      getWaterYearSummaries()
    ])
    
    // Batch 2: First group of date-range queries (3 queries)
    const [monthlyAverages, seasonalTrends, elevationDistribution] = await Promise.all([
      getMonthlyAverages(queryStart, queryEnd),
      getSeasonalTrends(),
      getElevationDistribution(queryStart, queryEnd)
    ])
    
    // Batch 3: Remaining date-range queries (2 queries - these can be heavier)
    const [recentFlowStats, storageAnalysis] = await Promise.all([
      getFlowStatistics(queryStart, queryEnd),
      getStorageCapacityAnalysis(queryStart, queryEnd)
    ])
    
    return {
      current,
      historicalAverages,
      waterYearSummaries,
      monthlyAverages,
      seasonalTrends,
      elevationDistribution,
      recentFlowStats,
      storageAnalysis
    }
  },
  ['statistical-summary'],
  {
    revalidate: 3600, // 1 hour
    tags: ['statistical-summary']
  }
)

export async function getStatisticalSummary(
  startDate?: string,
  endDate?: string
): Promise<StatisticalSummary> {
  return getCachedStatisticalSummary(startDate, endDate)
  const now = new Date()
  const defaultEnd = now.toISOString().split('T')[0]
  const defaultStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0]
  
  const queryStart = startDate || defaultStart
  const queryEnd = endDate || defaultEnd
  
  // Execute queries in smaller batches to avoid exhausting connection pool
  // With pool size of 10, we limit to max 3 concurrent queries per batch
  // Batch 1: Quick single queries (3 queries)
  const [current, historicalAverages, waterYearSummaries] = await Promise.all([
    getLatestWaterMeasurement(),
    getHistoricalAverages(),
    getWaterYearSummaries()
  ])
  
  // Batch 2: First group of date-range queries (3 queries)
  const [monthlyAverages, seasonalTrends, elevationDistribution] = await Promise.all([
    getMonthlyAverages(queryStart, queryEnd),
    getSeasonalTrends(),
    getElevationDistribution(queryStart, queryEnd)
  ])
  
  // Batch 3: Remaining date-range queries (2 queries - these can be heavier)
  const [recentFlowStats, storageAnalysis] = await Promise.all([
    getFlowStatistics(queryStart, queryEnd),
    getStorageCapacityAnalysis(queryStart, queryEnd)
  ])
  
  return {
    current,
    historicalAverages,
    waterYearSummaries,
    monthlyAverages,
    seasonalTrends,
    elevationDistribution,
    recentFlowStats,
    storageAnalysis
  }
}




