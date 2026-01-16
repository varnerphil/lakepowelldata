import { WaterMeasurement } from './db'

/**
 * Calculate projected runoff based on snowpack percentage and historical data
 * Uses historical correlation between snowpack and runoff
 */
export interface ProjectedRunoffResult {
  projectedRunoffAF: number
  confidenceRange: {
    low: number
    high: number
  }
  correlation: number
  methodology: string
}

export function calculateProjectedRunoff(
  snowpackPercent: number,
  historicalSnowpack: number[],
  historicalRunoff: number[]
): ProjectedRunoffResult {
  // Calculate correlation coefficient
  const correlation = calculateCorrelation(historicalSnowpack, historicalRunoff)
  
  // Simple linear regression: runoff = a * snowpack + b
  const regression = calculateLinearRegression(historicalSnowpack, historicalRunoff)
  
  // Project runoff based on current snowpack
  const projectedRunoffAF = regression.slope * snowpackPercent + regression.intercept
  
  // Calculate confidence interval based on historical variance
  const residuals = historicalRunoff.map((runoff, i) => {
    const predicted = regression.slope * historicalSnowpack[i] + regression.intercept
    return runoff - predicted
  })
  
  const stdDev = calculateStandardDeviation(residuals)
  const confidenceRange = {
    low: Math.max(0, projectedRunoffAF - 1.96 * stdDev), // 95% confidence
    high: projectedRunoffAF + 1.96 * stdDev
  }
  
  return {
    projectedRunoffAF: Math.max(0, projectedRunoffAF),
    confidenceRange,
    correlation,
    methodology: 'Linear regression based on historical snowpack-to-runoff correlation. Confidence intervals represent 95% prediction interval based on historical variance.'
  }
}

/**
 * Calculate linear regression (y = mx + b)
 */
function calculateLinearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = x.length
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0)
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0)
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  
  return { slope, intercept }
}

/**
 * Calculate Pearson correlation coefficient
 */
export function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0
  
  const n = x.length
  const meanX = x.reduce((a, b) => a + b, 0) / n
  const meanY = y.reduce((a, b) => a + b, 0) / n
  
  let numerator = 0
  let sumXSquared = 0
  let sumYSquared = 0
  
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX
    const dy = y[i] - meanY
    numerator += dx * dy
    sumXSquared += dx * dx
    sumYSquared += dy * dy
  }
  
  const denominator = Math.sqrt(sumXSquared * sumYSquared)
  return denominator === 0 ? 0 : numerator / denominator
}

/**
 * Calculate standard deviation
 */
function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Calculate statistical trends over time
 */
export interface TrendResult {
  slope: number // Change per unit time
  direction: 'increasing' | 'decreasing' | 'stable'
  significance: number // R-squared value
}

export function calculateTrends(
  data: Array<{ date: string; value: number }>,
  period: 'daily' | 'monthly' | 'yearly' = 'daily'
): TrendResult {
  if (data.length < 2) {
    return { slope: 0, direction: 'stable', significance: 0 }
  }
  
  // Convert dates to numeric values (days since first date)
  const firstDate = new Date(data[0].date).getTime()
  const x = data.map(d => (new Date(d.date).getTime() - firstDate) / (1000 * 60 * 60 * 24))
  const y = data.map(d => d.value)
  
  const regression = calculateLinearRegression(x, y)
  
  // Calculate R-squared
  const meanY = y.reduce((a, b) => a + b, 0) / y.length
  const totalSumSquares = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0)
  const residualSumSquares = y.reduce((sum, yi, i) => {
    const predicted = regression.slope * x[i] + regression.intercept
    return sum + Math.pow(yi - predicted, 2)
  }, 0)
  const rSquared = totalSumSquares === 0 ? 0 : 1 - (residualSumSquares / totalSumSquares)
  
  let direction: 'increasing' | 'decreasing' | 'stable' = 'stable'
  if (Math.abs(regression.slope) > 0.001) {
    direction = regression.slope > 0 ? 'increasing' : 'decreasing'
  }
  
  return {
    slope: regression.slope,
    direction,
    significance: rSquared
  }
}

/**
 * Calculate percentiles for a dataset
 */
export function calculatePercentiles(
  data: number[],
  percentiles: number[] = [10, 25, 50, 75, 90]
): Record<number, number> {
  const sorted = [...data].sort((a, b) => a - b)
  const result: Record<number, number> = {}
  
  for (const percentile of percentiles) {
    if (sorted.length === 0) {
      result[percentile] = 0
      continue
    }
    
    const index = (percentile / 100) * (sorted.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    const weight = index - lower
    
    if (lower === upper) {
      result[percentile] = sorted[lower]
    } else {
      result[percentile] = sorted[lower] * (1 - weight) + sorted[upper] * weight
    }
  }
  
  return result
}

/**
 * Get historical snowpack-to-runoff correlation data
 * This would ideally use actual historical snowpack data, but for now
 * we'll use a simplified approach based on water year inflow patterns
 */
export async function getHistoricalSnowpackRunoffCorrelation(): Promise<{
  snowpack: number[]
  runoff: number[]
}> {
  // This is a placeholder - in a real implementation, you would:
  // 1. Fetch historical SNOTEL data for the same dates
  // 2. Correlate with actual inflow data from water_measurements
  // 3. Account for seasonal timing (snowpack in Jan vs May)
  
  // For now, return empty arrays - the ProjectedRunoff component will handle this
  return {
    snowpack: [],
    runoff: []
  }
}

/**
 * Convert storage change (acre-feet) to elevation change (feet)
 * Uses the V-shaped reservoir model: storage is proportional to (elevation - deadPool)^3
 */
export function calculateElevationChange(
  storageChangeAF: number,
  currentElevation: number,
  currentStorageAF: number
): number {
  const DEAD_POOL_ELEV = 3370
  const FULL_POOL_ELEV = 3700
  const FULL_POOL_CAPACITY = 24322000 // acre-feet
  
  // For V-shaped reservoirs, use cubic relationship
  // Storage = a * (elevation - deadPool)^3
  // Calculate 'a' from current position
  const elevDiff = currentElevation - DEAD_POOL_ELEV
  if (elevDiff <= 0) return 0
  
  const a = currentStorageAF / Math.pow(elevDiff, 3)
  
  // New storage after change
  const newStorageAF = currentStorageAF + storageChangeAF
  
  // Calculate new elevation
  const newElevDiff = Math.pow(newStorageAF / a, 1/3)
  const newElevation = DEAD_POOL_ELEV + newElevDiff
  
  return newElevation - currentElevation
}

/**
 * Calculate projected elevation change based on:
 * - Projected runoff (inflow)
 * - Typical outflow during runoff season
 * - Current elevation and storage
 */
export interface ElevationProjection {
  projectedElevationChange: number
  projectedElevation: number
  waterYearLow: number
  waterYearLowDate: string
  waterYearHigh: number
  waterYearHighDate: string
  confidenceRange: {
    low: number
    high: number
  }
}

/**
 * Calculate daily elevation projection from current date to target date
 * Uses historical drop patterns to create more accurate projections
 */
export function calculateDailyElevationProjection(
  startDate: string,
  endDate: string,
  startElevation: number,
  historicalDrops: Array<{ drop_amount: number; days_to_low: number }>
): Array<{
  date: string
  projected: number
  low: number
  high: number
}> {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  
  if (days <= 0 || historicalDrops.length === 0) return []
  
  // Calculate average drop and variance from historical data
  const avgDrop = historicalDrops.reduce((sum, d) => sum + d.drop_amount, 0) / historicalDrops.length
  const avgDays = historicalDrops.reduce((sum, d) => sum + d.days_to_low, 0) / historicalDrops.length
  
  // Calculate standard deviation for confidence intervals
  const variance = historicalDrops.reduce((sum, d) => {
    const diff = d.drop_amount - avgDrop
    return sum + (diff * diff)
  }, 0) / historicalDrops.length
  const stdDev = Math.sqrt(variance)
  
  // Target elevation based on average historical drop
  const targetElevation = startElevation - avgDrop
  const targetElevationLow = startElevation - (avgDrop + stdDev) // More drop (lower elevation)
  const targetElevationHigh = startElevation - (avgDrop - stdDev) // Less drop (higher elevation)
  
  const projections: Array<{ date: string; projected: number; low: number; high: number }> = []
  
  for (let i = 0; i <= days; i++) {
    const currentDate = new Date(start)
    currentDate.setDate(currentDate.getDate() + i)
    const dateStr = currentDate.toISOString().split('T')[0]
    
    // Use average days to low to create a more realistic curve
    // Most of the drop happens in the first part of the period
    const progress = i / days
    // Apply a slight curve - more drop early, less later (based on historical patterns)
    const curvedProgress = Math.pow(progress, 0.8) // Slight curve
    
    const projected = startElevation - (avgDrop * curvedProgress)
    const low = startElevation - ((avgDrop + stdDev) * curvedProgress)
    const high = startElevation - ((avgDrop - stdDev) * curvedProgress)
    
    projections.push({
      date: dateStr,
      projected,
      low,
      high
    })
  }
  
  return projections
}

/**
 * Calculate projected drop based on historical patterns
 */
export interface DropProjection {
  projectedDrop: number
  projectedLowElevation: number
  confidenceRange: {
    low: number // More drop (lower elevation)
    high: number // Less drop (higher elevation)
  }
  historicalAverage: number
  historicalCount: number
}

export function calculateDropProjection(
  currentElevation: number,
  historicalDrops: Array<{ drop_amount: number; days_to_low: number }>
): DropProjection {
  if (historicalDrops.length === 0) {
    // Default fallback
    return {
      projectedDrop: 8,
      projectedLowElevation: currentElevation - 8,
      confidenceRange: {
        low: 10,
        high: 6
      },
      historicalAverage: 8,
      historicalCount: 0
    }
  }
  
  const avgDrop = historicalDrops.reduce((sum, d) => sum + d.drop_amount, 0) / historicalDrops.length
  
  // Calculate standard deviation
  const variance = historicalDrops.reduce((sum, d) => {
    const diff = d.drop_amount - avgDrop
    return sum + (diff * diff)
  }, 0) / historicalDrops.length
  const stdDev = Math.sqrt(variance)
  
  const projectedLowElevation = currentElevation - avgDrop
  
  return {
    projectedDrop: avgDrop,
    projectedLowElevation,
    confidenceRange: {
      low: avgDrop + stdDev, // More drop means lower elevation
      high: Math.max(0, avgDrop - stdDev) // Less drop means higher elevation
    },
    historicalAverage: avgDrop,
    historicalCount: historicalDrops.length
  }
}

export function calculateElevationProjection(
  projectedInflowAF: number,
  typicalOutflowAF: number,
  currentElevation: number,
  currentStorageAF: number,
  historicalLows: Array<{ min_elevation: number; date_of_min: string }>,
  historicalHighs: Array<{ max_elevation: number; date_of_max: string }> = []
): ElevationProjection {
  // Net storage change = inflow - outflow
  const netStorageChangeAF = projectedInflowAF - typicalOutflowAF
  
  // Calculate elevation change
  const elevationChange = calculateElevationChange(
    netStorageChangeAF,
    currentElevation,
    currentStorageAF
  )
  
  const projectedElevation = currentElevation + elevationChange
  
  // Calculate water year low based on historical patterns
  // Find average low for years starting at similar elevations
  const avgHistoricalLow = historicalLows.length > 0
    ? historicalLows.reduce((sum, low) => sum + low.min_elevation, 0) / historicalLows.length
    : currentElevation - 20 // Default assumption if no historical data
  
  // Calculate typical high date and elevation
  // Find average high date (typically late summer/early fall)
  let avgHighDate = ''
  let avgHighElevation = currentElevation
  
  if (historicalHighs.length > 0) {
    // Extract month/day from historical high dates
    const highDates = historicalHighs
      .filter(h => h.date_of_max)
      .map(h => {
        const date = new Date(h.date_of_max)
        return {
          month: date.getMonth(),
          day: date.getDate(),
          elevation: h.max_elevation
        }
      })
    
    if (highDates.length > 0) {
      // Calculate average month and day (circular average for months)
      const avgMonth = Math.round(
        highDates.reduce((sum, d) => sum + d.month, 0) / highDates.length
      )
      const avgDay = Math.round(
        highDates.reduce((sum, d) => sum + d.day, 0) / highDates.length
      )
      
      // Use current year for the date
      const currentYear = new Date().getFullYear()
      const highDate = new Date(currentYear, avgMonth, avgDay)
      avgHighDate = highDate.toISOString().split('T')[0]
      
      avgHighElevation = highDates.reduce((sum, d) => sum + d.elevation, 0) / highDates.length
    }
  } else {
    // Default: assume high occurs in late August
    const currentYear = new Date().getFullYear()
    const highDate = new Date(currentYear, 7, 15) // August 15
    avgHighDate = highDate.toISOString().split('T')[0]
    avgHighElevation = currentElevation + 30 // Default assumption
  }
  
  // Confidence range (assume ±15% variance in projections)
  const variance = 0.15
  const confidenceRange = {
    low: elevationChange * (1 - variance),
    high: elevationChange * (1 + variance)
  }
  
  // Estimate when low typically occurs (average from historical data)
  const avgLowDate = historicalLows.length > 0
    ? historicalLows[Math.floor(historicalLows.length / 2)].date_of_min
    : ''
  
  return {
    projectedElevationChange: elevationChange,
    projectedElevation,
    waterYearLow: avgHistoricalLow,
    waterYearLowDate: avgLowDate,
    waterYearHigh: avgHighElevation,
    waterYearHighDate: avgHighDate,
    confidenceRange
  }
}

// ============================================================
// Snowpack-Based Projection Functions
// ============================================================

import type { WaterYearAnalysis } from './db'

export interface SnowpackProjection {
  // Input data
  currentSnowpackPercent: number
  currentElevation: number
  
  // Projected outcomes
  projectedRunoffGain: number           // Expected ft of rise
  projectedPeakElevation: number        // Expected peak elevation
  projectedPeakDate: string             // Typical peak date (MM-DD)
  projectedRunoffInflow: number         // Expected acre-feet inflow
  
  // Confidence range
  minGain: number                       // Minimum from similar years
  maxGain: number                       // Maximum from similar years
  
  // Supporting data
  similarYears: Array<{
    water_year: number
    snowpack_percent: number
    runoff_gain: number
    peak_date: string
  }>
  yearsUsed: number
}

/**
 * Project runoff gain and peak elevation based on current snowpack percentage
 * Uses historical correlation from similar snowpack years
 */
export function projectFromSnowpack(
  currentSnowpackPercent: number,
  currentElevation: number,
  similarYears: WaterYearAnalysis[],
  elevationStorageCapacity: Array<{ elevation: number; storage_per_foot: number | null }>
): SnowpackProjection {
  // Filter to years with valid runoff data
  const validYears = similarYears.filter(
    y => y.runoff_gain_ft !== null && y.peak_swe_percent_of_median !== null
  )
  
  if (validYears.length === 0) {
    return {
      currentSnowpackPercent,
      currentElevation,
      projectedRunoffGain: 0,
      projectedPeakElevation: currentElevation,
      projectedPeakDate: 'Jun-15',
      projectedRunoffInflow: 0,
      minGain: 0,
      maxGain: 0,
      similarYears: [],
      yearsUsed: 0
    }
  }
  
  // Calculate statistics from similar years
  const gains = validYears.map(y => y.runoff_gain_ft!)
  const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length
  const minGain = Math.min(...gains)
  const maxGain = Math.max(...gains)
  
  // Average runoff inflow
  const inflows = validYears.filter(y => y.runoff_inflow_af).map(y => y.runoff_inflow_af!)
  const avgInflow = inflows.length > 0 
    ? inflows.reduce((a, b) => a + b, 0) / inflows.length 
    : 0
  
  // Typical peak date (extract month-day from peak_date)
  const peakDates = validYears.filter(y => y.peak_date).map(y => {
    const d = new Date(y.peak_date!)
    return { month: d.getMonth() + 1, day: d.getDate() }
  })
  
  let projectedPeakDate = 'Jun-15'
  if (peakDates.length > 0) {
    const avgMonth = Math.round(peakDates.reduce((a, b) => a + b.month, 0) / peakDates.length)
    const avgDay = Math.round(peakDates.reduce((a, b) => a + b.day, 0) / peakDates.length)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    projectedPeakDate = `${monthNames[avgMonth - 1]}-${avgDay.toString().padStart(2, '0')}`
  }
  
  // Project peak elevation
  const projectedPeakElevation = currentElevation + avgGain
  
  // Build similar years summary
  const similarYearsSummary = validYears.map(y => ({
    water_year: y.water_year,
    snowpack_percent: y.peak_swe_percent_of_median!,
    runoff_gain: y.runoff_gain_ft!,
    peak_date: y.peak_date || ''
  }))
  
  return {
    currentSnowpackPercent,
    currentElevation,
    projectedRunoffGain: Math.round(avgGain * 10) / 10,
    projectedPeakElevation: Math.round(projectedPeakElevation * 10) / 10,
    projectedPeakDate,
    projectedRunoffInflow: Math.round(avgInflow),
    minGain: Math.round(minGain * 10) / 10,
    maxGain: Math.round(maxGain * 10) / 10,
    similarYears: similarYearsSummary,
    yearsUsed: validYears.length
  }
}

/**
 * Calculate the average ft gained per inch of SWE from historical data
 */
export function calculateSnowpackEfficiency(
  waterYearData: WaterYearAnalysis[]
): {
  avgFtPerInchSwe: number
  avgInflowPerInchSwe: number
  dataPoints: number
} {
  const validYears = waterYearData.filter(
    y => y.ft_gained_per_inch_swe !== null && 
         y.inflow_per_inch_swe !== null &&
         y.had_runoff_rise
  )
  
  if (validYears.length === 0) {
    return { avgFtPerInchSwe: 0, avgInflowPerInchSwe: 0, dataPoints: 0 }
  }
  
  const avgFt = validYears.reduce((a, b) => a + b.ft_gained_per_inch_swe!, 0) / validYears.length
  const avgInflow = validYears.reduce((a, b) => a + b.inflow_per_inch_swe!, 0) / validYears.length
  
  return {
    avgFtPerInchSwe: Math.round(avgFt * 100) / 100,
    avgInflowPerInchSwe: Math.round(avgInflow),
    dataPoints: validYears.length
  }
}

