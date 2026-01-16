/**
 * Database client for Next.js API routes.
 * Connects to Supabase PostgreSQL database.
 */
import { Pool } from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : {
    rejectUnauthorized: false
  }
})

export interface WaterMeasurement {
  date: string
  elevation: number
  change: number | null  // Change in elevation from previous day (feet), null for first record
  content: number
  inflow: number
  outflow: number
}

export interface Ramp {
  id: number
  name: string
  min_safe_elevation: number
  min_usable_elevation: number
  location: string | null
}

export interface RampStatus extends Ramp {
  status: 'Open and Usable' | 'Use at Own Risk' | 'Unusable'
  current_elevation: number
  elevation_difference: number
}

export async function getLatestWaterMeasurement(): Promise<WaterMeasurement | null> {
  const result = await pool.query(
    'SELECT date, elevation, change, content, inflow, outflow FROM water_measurements ORDER BY date DESC LIMIT 1'
  )
  if (result.rows.length === 0) {
    return null
  }
  const row = result.rows[0]
  return {
    date: row.date.toISOString().split('T')[0],
    elevation: parseFloat(row.elevation),
    change: row.change ? parseFloat(row.change) : null,
    content: parseInt(row.content),
    inflow: parseInt(row.inflow),
    outflow: parseInt(row.outflow)
  }
}

export async function getEarliestWaterMeasurement(): Promise<WaterMeasurement | null> {
  const result = await pool.query(
    'SELECT date, elevation, change, content, inflow, outflow FROM water_measurements ORDER BY date ASC LIMIT 1'
  )
  if (result.rows.length === 0) {
    return null
  }
  const row = result.rows[0]
  return {
    date: row.date.toISOString().split('T')[0],
    elevation: parseFloat(row.elevation),
    change: row.change ? parseFloat(row.change) : null,
    content: parseInt(row.content),
    inflow: parseInt(row.inflow),
    outflow: parseInt(row.outflow)
  }
}

export async function getWaterMeasurementsByRange(
  startDate: string,
  endDate: string
): Promise<WaterMeasurement[]> {
  const result = await pool.query(
    'SELECT date, elevation, change, content, inflow, outflow FROM water_measurements WHERE date >= $1 AND date <= $2 ORDER BY date ASC',
    [startDate, endDate]
  )
  return result.rows.map(row => ({
    date: row.date.toISOString().split('T')[0],
    elevation: parseFloat(row.elevation),
    change: row.change ? parseFloat(row.change) : null,
    content: parseInt(row.content),
    inflow: parseInt(row.inflow),
    outflow: parseInt(row.outflow)
  }))
}

export async function getAllRamps(): Promise<Ramp[]> {
  const result = await pool.query(
    'SELECT id, name, min_safe_elevation, min_usable_elevation, location FROM ramps ORDER BY name'
  )
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    min_safe_elevation: parseFloat(row.min_safe_elevation),
    min_usable_elevation: parseFloat(row.min_usable_elevation),
    location: row.location
  }))
}

export function calculateRampStatus(
  ramp: Ramp,
  currentElevation: number
): 'Open and Usable' | 'Use at Own Risk' | 'Unusable' {
  if (currentElevation >= ramp.min_safe_elevation) {
    return 'Open and Usable'
  } else if (currentElevation >= ramp.min_usable_elevation) {
    return 'Use at Own Risk'
  } else {
    return 'Unusable'
  }
}

export interface WaterYearSummary {
  water_year: number
  start_date: string
  end_date: string
  total_inflow_cfs: number  // Total cfs-days (sum of daily inflow)
  total_outflow_cfs: number  // Total cfs-days (sum of daily outflow)
  total_inflow_af: number    // Total in acre-feet
  total_outflow_af: number   // Total in acre-feet
  net_flow_af: number        // Net in acre-feet
  avg_elevation: number
  min_elevation: number
  max_elevation: number
  avg_content: number
  days: number
}

export async function getWaterYearSummaries(): Promise<WaterYearSummary[]> {
  // Water year runs from October 1 to September 30
  // Water Year 2024 = Oct 1, 2023 to Sep 30, 2024
  // Convert cfs-days to acre-feet: 1 cfs-day = 1.983 acre-feet (86400 seconds / 43560 cubic feet)
  const CFS_DAYS_TO_ACRE_FEET = 1.983
  
  const result = await pool.query(`
    SELECT 
      CASE 
        WHEN EXTRACT(MONTH FROM date) >= 10 THEN EXTRACT(YEAR FROM date) + 1
        ELSE EXTRACT(YEAR FROM date)
      END as water_year,
      MIN(date) as start_date,
      MAX(date) as end_date,
      SUM(inflow) as total_inflow_cfs,
      SUM(outflow) as total_outflow_cfs,
      AVG(elevation) as avg_elevation,
      MIN(elevation) as min_elevation,
      MAX(elevation) as max_elevation,
      AVG(content) as avg_content,
      COUNT(*) as days
    FROM water_measurements
    GROUP BY water_year
    ORDER BY water_year DESC
  `)
  
  return result.rows.map(row => {
    const total_inflow_cfs = parseInt(row.total_inflow_cfs) || 0
    const total_outflow_cfs = parseInt(row.total_outflow_cfs) || 0
    const total_inflow_af = Math.round(total_inflow_cfs * CFS_DAYS_TO_ACRE_FEET)
    const total_outflow_af = Math.round(total_outflow_cfs * CFS_DAYS_TO_ACRE_FEET)
    const net_flow_af = total_inflow_af - total_outflow_af
    
    return {
      water_year: parseInt(row.water_year),
      start_date: row.start_date.toISOString().split('T')[0],
      end_date: row.end_date.toISOString().split('T')[0],
      total_inflow_cfs,
      total_outflow_cfs,
      total_inflow_af,
      total_outflow_af,
      net_flow_af,
      avg_elevation: parseFloat(row.avg_elevation) || 0,
      min_elevation: parseFloat(row.min_elevation) || 0,
      max_elevation: parseFloat(row.max_elevation) || 0,
      avg_content: parseFloat(row.avg_content) || 0,
      days: parseInt(row.days) || 0
    }
  })
}

export async function getHistoricalAverages() {
  // All-time averages
  const allTimeResult = await pool.query(`
    SELECT 
      AVG(elevation) as avg_elevation,
      AVG(content) as avg_content,
      AVG(inflow) as avg_inflow,
      AVG(outflow) as avg_outflow
    FROM water_measurements
  `)

  // Since filled (June 22, 1980)
  const sinceFilledResult = await pool.query(`
    SELECT 
      AVG(elevation) as avg_elevation,
      AVG(content) as avg_content,
      AVG(inflow) as avg_inflow,
      AVG(outflow) as avg_outflow
    FROM water_measurements
    WHERE date >= '1980-06-22'
  `)

  // Since Water Year 2000 (October 1, 1999)
  const sinceWY2000Result = await pool.query(`
    SELECT 
      AVG(elevation) as avg_elevation,
      AVG(content) as avg_content,
      AVG(inflow) as avg_inflow,
      AVG(outflow) as avg_outflow
    FROM water_measurements
    WHERE date >= '1999-10-01'
  `)

  return {
    allTime: allTimeResult.rows[0] ? {
      elevation: parseFloat(allTimeResult.rows[0].avg_elevation) || 0,
      content: parseFloat(allTimeResult.rows[0].avg_content) || 0,
      inflow: parseFloat(allTimeResult.rows[0].avg_inflow) || 0,
      outflow: parseFloat(allTimeResult.rows[0].avg_outflow) || 0
    } : null,
    sinceFilled: sinceFilledResult.rows[0] ? {
      elevation: parseFloat(sinceFilledResult.rows[0].avg_elevation) || 0,
      content: parseFloat(sinceFilledResult.rows[0].avg_content) || 0,
      inflow: parseFloat(sinceFilledResult.rows[0].avg_inflow) || 0,
      outflow: parseFloat(sinceFilledResult.rows[0].avg_outflow) || 0
    } : null,
    sinceWY2000: sinceWY2000Result.rows[0] ? {
      elevation: parseFloat(sinceWY2000Result.rows[0].avg_elevation) || 0,
      content: parseFloat(sinceWY2000Result.rows[0].avg_content) || 0,
      inflow: parseFloat(sinceWY2000Result.rows[0].avg_inflow) || 0,
      outflow: parseFloat(sinceWY2000Result.rows[0].avg_outflow) || 0
    } : null
  }
}

export interface MonthlyAverage {
  year: number
  month: number
  avg_elevation: number
  avg_content: number
  avg_inflow: number
  avg_outflow: number
  total_inflow_af: number
  total_outflow_af: number
}

export async function getMonthlyAverages(
  startDate: string,
  endDate: string
): Promise<MonthlyAverage[]> {
  const CFS_DAYS_TO_ACRE_FEET = 1.983
  
  const result = await pool.query(`
    SELECT 
      EXTRACT(YEAR FROM date)::INTEGER as year,
      EXTRACT(MONTH FROM date)::INTEGER as month,
      AVG(elevation) as avg_elevation,
      AVG(content) as avg_content,
      AVG(inflow) as avg_inflow,
      AVG(outflow) as avg_outflow,
      SUM(inflow) as total_inflow_cfs,
      SUM(outflow) as total_outflow_cfs
    FROM water_measurements
    WHERE date >= $1 AND date <= $2
    GROUP BY year, month
    ORDER BY year, month
  `, [startDate, endDate])
  
  return result.rows.map(row => ({
    year: parseInt(row.year),
    month: parseInt(row.month),
    avg_elevation: parseFloat(row.avg_elevation) || 0,
    avg_content: parseFloat(row.avg_content) || 0,
    avg_inflow: parseFloat(row.avg_inflow) || 0,
    avg_outflow: parseFloat(row.avg_outflow) || 0,
    total_inflow_af: Math.round((parseInt(row.total_inflow_cfs) || 0) * CFS_DAYS_TO_ACRE_FEET),
    total_outflow_af: Math.round((parseInt(row.total_outflow_cfs) || 0) * CFS_DAYS_TO_ACRE_FEET)
  }))
}

export interface SeasonalTrend {
  season: 'spring' | 'summer' | 'fall' | 'winter'
  avg_elevation: number
  avg_content: number
  avg_inflow: number
  avg_outflow: number
  total_inflow_af: number
  total_outflow_af: number
}

export async function getSeasonalTrends(): Promise<SeasonalTrend[]> {
  const CFS_DAYS_TO_ACRE_FEET = 1.983
  
  const result = await pool.query(`
    WITH seasonal_data AS (
      SELECT 
        CASE 
          WHEN EXTRACT(MONTH FROM date) IN (3, 4, 5) THEN 'spring'
          WHEN EXTRACT(MONTH FROM date) IN (6, 7, 8) THEN 'summer'
          WHEN EXTRACT(MONTH FROM date) IN (9, 10, 11) THEN 'fall'
          ELSE 'winter'
        END as season,
        AVG(elevation) as avg_elevation,
        AVG(content) as avg_content,
        AVG(inflow) as avg_inflow,
        AVG(outflow) as avg_outflow,
        SUM(inflow) as total_inflow_cfs,
        SUM(outflow) as total_outflow_cfs
      FROM water_measurements
      GROUP BY 
        CASE 
          WHEN EXTRACT(MONTH FROM date) IN (3, 4, 5) THEN 'spring'
          WHEN EXTRACT(MONTH FROM date) IN (6, 7, 8) THEN 'summer'
          WHEN EXTRACT(MONTH FROM date) IN (9, 10, 11) THEN 'fall'
          ELSE 'winter'
        END
    )
    SELECT * FROM seasonal_data
    ORDER BY 
      CASE season
        WHEN 'spring' THEN 1
        WHEN 'summer' THEN 2
        WHEN 'fall' THEN 3
        WHEN 'winter' THEN 4
      END
  `)
  
  return result.rows.map(row => ({
    season: row.season as 'spring' | 'summer' | 'fall' | 'winter',
    avg_elevation: parseFloat(row.avg_elevation) || 0,
    avg_content: parseFloat(row.avg_content) || 0,
    avg_inflow: parseFloat(row.avg_inflow) || 0,
    avg_outflow: parseFloat(row.avg_outflow) || 0,
    total_inflow_af: Math.round((parseInt(row.total_inflow_cfs) || 0) * CFS_DAYS_TO_ACRE_FEET),
    total_outflow_af: Math.round((parseInt(row.total_outflow_cfs) || 0) * CFS_DAYS_TO_ACRE_FEET)
  }))
}

export interface ElevationDistribution {
  period: string
  min: number
  max: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  avg: number
}

export async function getElevationDistribution(
  startDate?: string,
  endDate?: string
): Promise<ElevationDistribution> {
  const dateFilter = startDate && endDate 
    ? `WHERE date >= '${startDate}' AND date <= '${endDate}'`
    : ''
  
  const result = await pool.query(`
    SELECT 
      MIN(elevation) as min,
      MAX(elevation) as max,
      PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY elevation) as p10,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY elevation) as p25,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY elevation) as p50,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY elevation) as p75,
      PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY elevation) as p90,
      AVG(elevation) as avg
    FROM water_measurements
    ${dateFilter}
  `)
  
  const row = result.rows[0]
  return {
    period: startDate && endDate ? `${startDate} to ${endDate}` : 'all-time',
    min: parseFloat(row.min) || 0,
    max: parseFloat(row.max) || 0,
    p10: parseFloat(row.p10) || 0,
    p25: parseFloat(row.p25) || 0,
    p50: parseFloat(row.p50) || 0,
    p75: parseFloat(row.p75) || 0,
    p90: parseFloat(row.p90) || 0,
    avg: parseFloat(row.avg) || 0
  }
}

export interface FlowStatistics {
  period: string
  avg_inflow: number
  avg_outflow: number
  max_inflow: number
  max_outflow: number
  min_inflow: number
  min_outflow: number
  total_inflow_af: number
  total_outflow_af: number
  net_flow_af: number
}

export async function getFlowStatistics(
  startDate: string,
  endDate: string
): Promise<FlowStatistics> {
  const CFS_DAYS_TO_ACRE_FEET = 1.983
  
  const result = await pool.query(`
    SELECT 
      AVG(inflow) as avg_inflow,
      AVG(outflow) as avg_outflow,
      MAX(inflow) as max_inflow,
      MAX(outflow) as max_outflow,
      MIN(inflow) as min_inflow,
      MIN(outflow) as min_outflow,
      SUM(inflow) as total_inflow_cfs,
      SUM(outflow) as total_outflow_cfs
    FROM water_measurements
    WHERE date >= $1 AND date <= $2
  `, [startDate, endDate])
  
  const row = result.rows[0]
  const total_inflow_cfs = parseInt(row.total_inflow_cfs) || 0
  const total_outflow_cfs = parseInt(row.total_outflow_cfs) || 0
  const total_inflow_af = Math.round(total_inflow_cfs * CFS_DAYS_TO_ACRE_FEET)
  const total_outflow_af = Math.round(total_outflow_cfs * CFS_DAYS_TO_ACRE_FEET)
  
  return {
    period: `${startDate} to ${endDate}`,
    avg_inflow: parseFloat(row.avg_inflow) || 0,
    avg_outflow: parseFloat(row.avg_outflow) || 0,
    max_inflow: parseInt(row.max_inflow) || 0,
    max_outflow: parseInt(row.max_outflow) || 0,
    min_inflow: parseInt(row.min_inflow) || 0,
    min_outflow: parseInt(row.min_outflow) || 0,
    total_inflow_af,
    total_outflow_af,
    net_flow_af: total_inflow_af - total_outflow_af
  }
}

export interface StorageCapacityAnalysis {
  date: string
  elevation: number
  content: number
  percent_of_capacity: number
}

export async function getStorageCapacityAnalysis(
  startDate?: string,
  endDate?: string
): Promise<StorageCapacityAnalysis[]> {
  const FULL_POOL_CAPACITY = 24322000 // acre-feet at 3700 ft
  
  const dateFilter = startDate && endDate 
    ? `WHERE date >= '${startDate}' AND date <= '${endDate}'`
    : ''
  
  const result = await pool.query(`
    SELECT 
      date,
      elevation,
      content,
      (content::FLOAT / ${FULL_POOL_CAPACITY} * 100) as percent_of_capacity
    FROM water_measurements
    ${dateFilter}
    ORDER BY date
  `)
  
  return result.rows.map(row => ({
    date: row.date.toISOString().split('T')[0],
    elevation: parseFloat(row.elevation),
    content: parseInt(row.content),
    percent_of_capacity: parseFloat(row.percent_of_capacity) || 0
  }))
}

export interface ElevationStorageCapacity {
  elevation: number
  storage_at_elevation: number
  storage_per_foot: number | null
  percent_of_full: number
  percent_per_foot: number | null  // What % of total capacity this foot adds
  elevation_range: string  // e.g., "3539-3540"
}

/**
 * Get storage capacity per foot of elevation from the pre-calculated table.
 * The table is populated by the Python migration script:
 *   python -m migrations.calculate_elevation_storage
 */
export async function getElevationStorageCapacity(): Promise<ElevationStorageCapacity[]> {
  const result = await pool.query(`
    SELECT 
      elevation,
      storage_at_elevation,
      storage_per_foot,
      percent_of_full,
      percent_per_foot,
      LEAD(elevation) OVER (ORDER BY elevation) as next_elevation
    FROM elevation_storage_capacity
    ORDER BY elevation
  `)
  
  return result.rows.map((row) => {
    const elevation = parseInt(row.elevation)
    const nextElevation = row.next_elevation ? parseInt(row.next_elevation) : elevation + 1
    
    // For dead pool or entries with gaps, show the actual range
    const elevationRange = nextElevation > elevation + 1 
      ? `${elevation}-${nextElevation}` 
      : `${elevation}-${elevation + 1}`
    
    return {
      elevation,
      storage_at_elevation: parseInt(row.storage_at_elevation),
      storage_per_foot: row.storage_per_foot ? parseInt(row.storage_per_foot) : null,
      percent_of_full: parseFloat(row.percent_of_full),
      percent_per_foot: row.percent_per_foot ? parseFloat(row.percent_per_foot) : null,
      elevation_range: elevationRange
    }
  })
}

export interface WaterYearLow {
  water_year: number
  min_elevation: number
  min_content: number
  date_of_min: string
  starting_elevation: number
  starting_content: number
}

/**
 * Get historical water year lows for years that started at similar elevations
 */
export async function getHistoricalWaterYearLows(
  currentElevation: number,
  elevationTolerance: number = 50
): Promise<WaterYearLow[]> {
  const result = await pool.query(`
    WITH water_years AS (
      SELECT 
        CASE 
          WHEN EXTRACT(MONTH FROM date) >= 10 THEN EXTRACT(YEAR FROM date) + 1
          ELSE EXTRACT(YEAR FROM date)
        END as water_year,
        date,
        elevation,
        content
      FROM water_measurements
    ),
    year_mins AS (
      SELECT 
        water_year,
        MIN(elevation) as min_elevation,
        MIN(content) as min_content
      FROM water_years
      GROUP BY water_year
    ),
    year_stats AS (
      SELECT 
        ym.water_year,
        ym.min_elevation,
        ym.min_content,
        (SELECT date FROM water_years wy 
         WHERE wy.water_year = ym.water_year 
         AND wy.elevation = ym.min_elevation 
         ORDER BY date ASC LIMIT 1) as date_of_min,
        (SELECT elevation FROM water_years wy2 
         WHERE wy2.water_year = ym.water_year 
         ORDER BY date ASC LIMIT 1) as starting_elevation,
        (SELECT content FROM water_years wy3 
         WHERE wy3.water_year = ym.water_year 
         ORDER BY date ASC LIMIT 1) as starting_content
      FROM year_mins ym
    )
    SELECT 
      water_year,
      min_elevation,
      min_content,
      date_of_min,
      starting_elevation,
      starting_content
    FROM year_stats
    WHERE starting_elevation IS NOT NULL 
      AND ABS(starting_elevation - $1) <= $2
    ORDER BY water_year DESC
    LIMIT 10
  `, [currentElevation, elevationTolerance])
  
  return result.rows.map(row => ({
    water_year: parseInt(row.water_year),
    min_elevation: parseFloat(row.min_elevation),
    min_content: parseInt(row.min_content),
    date_of_min: row.date_of_min ? row.date_of_min.toISOString().split('T')[0] : '',
    starting_elevation: parseFloat(row.starting_elevation) || 0,
    starting_content: parseInt(row.starting_content) || 0
  }))
}

export interface RunoffSeasonOutflow {
  water_year: number
  spring_outflow_af: number // March, April, May
  summer_outflow_af: number // June, July, August
  total_runoff_season_outflow_af: number
}

/**
 * Get typical outflow during runoff season (spring/summer) for historical water years
 */
export async function getRunoffSeasonOutflow(): Promise<RunoffSeasonOutflow[]> {
  const CFS_DAYS_TO_ACRE_FEET = 1.983
  
  const result = await pool.query(`
    SELECT 
      CASE 
        WHEN EXTRACT(MONTH FROM date) >= 10 THEN EXTRACT(YEAR FROM date) + 1
        ELSE EXTRACT(YEAR FROM date)
      END as water_year,
      SUM(outflow) FILTER (WHERE EXTRACT(MONTH FROM date) IN (3, 4, 5)) as spring_outflow_cfs,
      SUM(outflow) FILTER (WHERE EXTRACT(MONTH FROM date) IN (6, 7, 8)) as summer_outflow_cfs
    FROM water_measurements
    GROUP BY water_year
    ORDER BY water_year DESC
  `)
  
  return result.rows.map(row => {
    const springOutflowAF = Math.round((parseInt(row.spring_outflow_cfs) || 0) * CFS_DAYS_TO_ACRE_FEET)
    const summerOutflowAF = Math.round((parseInt(row.summer_outflow_cfs) || 0) * CFS_DAYS_TO_ACRE_FEET)
    
    return {
      water_year: parseInt(row.water_year),
      spring_outflow_af: springOutflowAF,
      summer_outflow_af: summerOutflowAF,
      total_runoff_season_outflow_af: springOutflowAF + summerOutflowAF
    }
  })
}

export interface WaterYearHigh {
  water_year: number
  max_elevation: number
  max_content: number
  date_of_max: string
}

export interface HistoricalDropToLow {
  water_year: number
  start_date: string
  start_elevation: number
  low_date: string
  low_elevation: number
  drop_amount: number
  days_to_low: number
}

/**
 * Get historical water year highs to determine typical high date
 */
export async function getHistoricalWaterYearHighs(): Promise<WaterYearHigh[]> {
  const result = await pool.query(`
    WITH water_years AS (
      SELECT 
        CASE 
          WHEN EXTRACT(MONTH FROM date) >= 10 THEN EXTRACT(YEAR FROM date) + 1
          ELSE EXTRACT(YEAR FROM date)
        END as water_year,
        date,
        elevation,
        content
      FROM water_measurements
    ),
    year_maxs AS (
      SELECT 
        water_year,
        MAX(elevation) as max_elevation,
        MAX(content) as max_content
      FROM water_years
      GROUP BY water_year
    ),
    year_maxs_with_dates AS (
      SELECT 
        ym.water_year,
        ym.max_elevation,
        ym.max_content,
        (SELECT wy.date FROM water_years wy 
         WHERE wy.water_year = ym.water_year 
         AND wy.elevation = ym.max_elevation 
         ORDER BY wy.date ASC LIMIT 1) as date_of_max
      FROM year_maxs ym
    )
    SELECT 
      water_year,
      max_elevation,
      max_content,
      date_of_max
    FROM year_maxs_with_dates
    WHERE date_of_max IS NOT NULL
    ORDER BY water_year DESC
    LIMIT 20
  `)
  
  return result.rows.map(row => ({
    water_year: parseInt(row.water_year),
    max_elevation: parseFloat(row.max_elevation),
    max_content: parseInt(row.max_content),
    date_of_max: row.date_of_max ? row.date_of_max.toISOString().split('T')[0] : ''
  }))
}

/**
 * Get historical elevation drops from a similar date to the typical low date (April 21)
 * This helps predict how much the lake will drop from today to the typical low date
 * Returns all matches within tolerance, sorted by elevation similarity
 */
export async function getHistoricalDropsToLow(
  currentDate: string,
  currentElevation: number,
  typicalLowDate: string,
  elevationTolerance: number = 50,
  limit?: number
): Promise<HistoricalDropToLow[]> {
  // Extract month and day from current date and typical low date
  const currentDateObj = new Date(currentDate)
  const currentMonth = currentDateObj.getMonth() + 1 // 1-12
  const currentDay = currentDateObj.getDate()
  
  const lowDateObj = new Date(typicalLowDate)
  const lowMonth = lowDateObj.getMonth() + 1
  const lowDay = lowDateObj.getDate()
  
  const result = await pool.query(`
    WITH water_years AS (
      SELECT 
        CASE 
          WHEN EXTRACT(MONTH FROM date) >= 10 THEN EXTRACT(YEAR FROM date) + 1
          ELSE EXTRACT(YEAR FROM date)
        END as water_year,
        date,
        elevation,
        EXTRACT(MONTH FROM date) as month,
        EXTRACT(DAY FROM date) as day
      FROM water_measurements
    ),
    start_points AS (
      SELECT 
        wy.water_year,
        wy.date as start_date,
        wy.elevation as start_elevation
      FROM water_years wy
      WHERE wy.month = $1 
        AND wy.day = $2
        AND ABS(wy.elevation - $3) <= $4
        AND wy.water_year >= 1986
    ),
    low_points AS (
      SELECT 
        wy.water_year,
        wy.date as low_date,
        wy.elevation as low_elevation
      FROM water_years wy
      WHERE wy.month = $5 
        AND wy.day = $6
    ),
    drops AS (
      SELECT 
        sp.water_year,
        sp.start_date,
        sp.start_elevation,
        lp.low_date,
        lp.low_elevation,
        (sp.start_elevation - lp.low_elevation) as drop_amount,
        (lp.low_date - sp.start_date)::INTEGER as days_to_low
      FROM start_points sp
      INNER JOIN low_points lp ON sp.water_year = lp.water_year
      WHERE lp.low_date > sp.start_date
    )
    SELECT 
      water_year,
      start_date,
      start_elevation,
      low_date,
      low_elevation,
      drop_amount,
      days_to_low
    FROM drops
    ORDER BY ABS(start_elevation - $3) ASC
    ${limit !== undefined ? `LIMIT $7` : ''}
  `, limit !== undefined ? [currentMonth, currentDay, currentElevation, elevationTolerance, lowMonth, lowDay, limit] : [currentMonth, currentDay, currentElevation, elevationTolerance, lowMonth, lowDay])
  
  return result.rows.map(row => ({
    water_year: parseInt(row.water_year),
    start_date: row.start_date.toISOString().split('T')[0],
    start_elevation: parseFloat(row.start_elevation),
    low_date: row.low_date.toISOString().split('T')[0],
    low_elevation: parseFloat(row.low_elevation),
    drop_amount: parseFloat(row.drop_amount),
    days_to_low: parseInt(row.days_to_low)
  }))
}

export interface BasinPlotsDataPoint {
  date_str: string
  water_year_date: string
  year: number
  swe_value: number | null
  percentile_10: number | null
  percentile_30: number | null
  percentile_70: number | null
  percentile_90: number | null
  min_value: number | null
  median_91_20: number | null
  median_por: number | null
  max_value: number | null
  median_peak_swe: number | null
}

export async function getBasinPlotsData(): Promise<BasinPlotsDataPoint[]> {
  const result = await pool.query(`
    SELECT 
      date_str,
      water_year_date,
      year,
      swe_value,
      percentile_10,
      percentile_30,
      percentile_70,
      percentile_90,
      min_value,
      median_91_20,
      median_por,
      max_value,
      median_peak_swe
    FROM basin_plots_data
    ORDER BY water_year_date ASC, year ASC
  `)
  
  return result.rows.map(row => ({
    date_str: row.date_str,
    water_year_date: row.water_year_date.toISOString().split('T')[0],
    year: parseInt(row.year),
    swe_value: row.swe_value ? parseFloat(row.swe_value) : null,
    percentile_10: row.percentile_10 ? parseFloat(row.percentile_10) : null,
    percentile_30: row.percentile_30 ? parseFloat(row.percentile_30) : null,
    percentile_70: row.percentile_70 ? parseFloat(row.percentile_70) : null,
    percentile_90: row.percentile_90 ? parseFloat(row.percentile_90) : null,
    min_value: row.min_value ? parseFloat(row.min_value) : null,
    median_91_20: row.median_91_20 ? parseFloat(row.median_91_20) : null,
    median_por: row.median_por ? parseFloat(row.median_por) : null,
    max_value: row.max_value ? parseFloat(row.max_value) : null,
    median_peak_swe: row.median_peak_swe ? parseFloat(row.median_peak_swe) : null
  }))
}

export interface SNOTELSite {
  site_id: string
  name: string
  elevation: number | null
  basin: string | null
  state: string | null
  latitude: number | null
  longitude: number | null
}

export interface SNOTELMeasurement {
  site_id: string
  date: string
  snow_water_equivalent: number | null
  snow_depth: number | null
  precipitation: number | null
  temperature_max: number | null
  temperature_min: number | null
  temperature_avg: number | null
}

export interface SNOTELSiteWithLatest extends SNOTELSite {
  latest_measurement: SNOTELMeasurement | null
}

export async function getAllSNOTELSites(): Promise<SNOTELSite[]> {
  const result = await pool.query(`
    SELECT 
      site_id, 
      name, 
      elevation, 
      basin, 
      state, 
      latitude, 
      longitude
    FROM snotel_sites
    ORDER BY basin, name
  `)
  return result.rows.map(row => ({
    site_id: row.site_id,
    name: row.name,
    elevation: row.elevation,
    basin: row.basin,
    state: row.state,
    latitude: row.latitude,
    longitude: row.longitude
  }))
}

export async function getSNOTELSitesWithLatestMeasurements(): Promise<SNOTELSiteWithLatest[]> {
  const result = await pool.query(`
    SELECT 
      s.site_id, 
      s.name, 
      s.elevation, 
      s.basin, 
      s.state, 
      s.latitude, 
      s.longitude,
      m.date,
      m.snow_water_equivalent,
      m.snow_depth,
      m.precipitation,
      m.temperature_max,
      m.temperature_min,
      m.temperature_avg
    FROM snotel_sites s
    LEFT JOIN LATERAL (
      SELECT * FROM snotel_measurements
      WHERE site_id = s.site_id
      ORDER BY date DESC
      LIMIT 1
    ) m ON true
    ORDER BY s.basin, s.name
  `)
  return result.rows.map(row => ({
    site_id: row.site_id,
    name: row.name,
    elevation: row.elevation,
    basin: row.basin,
    state: row.state,
    latitude: row.latitude,
    longitude: row.longitude,
    latest_measurement: row.date ? {
      site_id: row.site_id,
      date: row.date.toISOString().split('T')[0],
      snow_water_equivalent: row.snow_water_equivalent,
      snow_depth: row.snow_depth,
      precipitation: row.precipitation,
      temperature_max: row.temperature_max,
      temperature_min: row.temperature_min,
      temperature_avg: row.temperature_avg
    } : null
  }))
}

export async function getSNOTELBasins(): Promise<Array<{ name: string; site_count: number }>> {
  const result = await pool.query(`
    SELECT 
      basin as name,
      COUNT(*) as site_count
    FROM snotel_sites
    WHERE basin IS NOT NULL
    GROUP BY basin
    ORDER BY basin
  `)
  return result.rows.map(row => ({
    name: row.name,
    site_count: parseInt(row.site_count)
  }))
}

