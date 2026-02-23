/**
 * Pre-compute common Monte Carlo projection scenarios.
 * 
 * Designed to run daily via cron. Computes the 40-scenario matrix:
 *   2 starting points x 5 policy presets x 4 time horizons = 40 scenarios
 * 
 * Usage:
 *   npx tsx scripts/precompute-projections.ts
 * 
 * Requires DATABASE_URL environment variable.
 */

import { Pool } from 'pg'

// Inline the types and engine to avoid Next.js import issues
import {
  runMonteCarloSimulation,
  POLICY_PRESETS,
  type OutflowPolicy,
  type WaterYearPattern,
  type StorageCapacityEntry,
} from '../frontend/lib/monte-carlo'

const TIME_HORIZONS = [1, 5, 10, 20]
const ITERATIONS = 1000

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
  max: 2,
})

async function query(text: string, params?: any[]) {
  return pool.query(text, params)
}

async function getLatestMeasurement() {
  const result = await query(
    'SELECT date, elevation, content FROM water_measurements ORDER BY date DESC LIMIT 1'
  )
  if (result.rows.length === 0) return null
  const r = result.rows[0]
  return {
    date: r.date.toISOString().split('T')[0],
    elevation: parseFloat(r.elevation),
    content: parseInt(r.content),
  }
}

async function getStorageCapacity(): Promise<StorageCapacityEntry[]> {
  const result = await query(
    'SELECT elevation, storage_at_elevation FROM elevation_storage_capacity ORDER BY elevation'
  )
  return result.rows.map((r: any) => ({
    elevation: parseInt(r.elevation),
    storage_at_elevation: parseInt(r.storage_at_elevation),
  }))
}

async function getWaterYearPatterns(): Promise<WaterYearPattern[]> {
  const result = await query(`
    WITH water_year_days AS (
      SELECT
        date, inflow,
        CASE WHEN EXTRACT(MONTH FROM date) >= 10
          THEN EXTRACT(YEAR FROM date) + 1
          ELSE EXTRACT(YEAR FROM date)
        END AS water_year,
        ROW_NUMBER() OVER (
          PARTITION BY CASE WHEN EXTRACT(MONTH FROM date) >= 10
            THEN EXTRACT(YEAR FROM date) + 1
            ELSE EXTRACT(YEAR FROM date)
          END ORDER BY date
        ) AS day_of_water_year
      FROM water_measurements
      WHERE inflow IS NOT NULL AND inflow > 0
    ),
    year_counts AS (
      SELECT water_year, COUNT(*) as day_count, SUM(inflow * 1.9835) as total_inflow_af
      FROM water_year_days
      GROUP BY water_year
      HAVING COUNT(*) >= 360
    )
    SELECT d.water_year, d.day_of_water_year, d.inflow, yc.total_inflow_af
    FROM water_year_days d
    JOIN year_counts yc ON d.water_year = yc.water_year
    ORDER BY d.water_year, d.day_of_water_year
  `)

  const yearMap = new Map<number, WaterYearPattern>()
  for (const row of result.rows) {
    const wy = parseInt(row.water_year)
    if (!yearMap.has(wy)) {
      yearMap.set(wy, {
        waterYear: wy,
        dailyInflows: [],
        totalInflowAf: Math.round(parseFloat(row.total_inflow_af)),
      })
    }
    yearMap.get(wy)!.dailyInflows.push({
      dayOfWaterYear: parseInt(row.day_of_water_year),
      inflowCfs: parseInt(row.inflow),
    })
  }

  return Array.from(yearMap.values()).sort((a, b) => a.waterYear - b.waterYear)
}

async function saveResult(params: {
  policyType: string
  policyConfig: object
  startDate: string
  startElevation: number
  startContent: number
  yearsToProject: number
  iterations: number
  result: object
  computeTimeMs: number
  lakeStateDate: string
}) {
  await query(
    `INSERT INTO monte_carlo_results
       (policy_type, policy_config, start_date, start_elevation, start_content,
        years_to_project, iterations, result, compute_time_ms, lake_state_date)
     VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
     ON CONFLICT (policy_type, policy_config, start_date, years_to_project)
     DO UPDATE SET
       start_elevation = EXCLUDED.start_elevation,
       start_content = EXCLUDED.start_content,
       iterations = EXCLUDED.iterations,
       result = EXCLUDED.result,
       compute_time_ms = EXCLUDED.compute_time_ms,
       lake_state_date = EXCLUDED.lake_state_date,
       computed_at = NOW()`,
    [
      params.policyType,
      JSON.stringify(params.policyConfig),
      params.startDate,
      params.startElevation,
      params.startContent,
      params.yearsToProject,
      params.iterations,
      JSON.stringify(params.result),
      params.computeTimeMs,
      params.lakeStateDate,
    ]
  )
}

async function main() {
  console.log('=== Pre-computing Monte Carlo Projections ===\n')

  const latest = await getLatestMeasurement()
  if (!latest) {
    console.error('No current lake data found')
    process.exit(1)
  }
  console.log(`Lake state: ${latest.date} | ${latest.elevation} ft | ${latest.content.toLocaleString()} AF\n`)

  const [patterns, storageCapacity] = await Promise.all([
    getWaterYearPatterns(),
    getStorageCapacity(),
  ])
  console.log(`Historical patterns: ${patterns.length} water years (${patterns[0]?.waterYear}-${patterns[patterns.length - 1]?.waterYear})`)
  console.log(`Storage capacity: ${storageCapacity.length} entries\n`)

  // Starting points: today only for now
  // (spring low projection would need the full calculations module)
  const startingPoints = [
    { label: 'Today', date: latest.date, elevation: latest.elevation, content: latest.content },
  ]

  let computed = 0
  let totalTime = 0
  const totalScenarios = startingPoints.length * POLICY_PRESETS.length * TIME_HORIZONS.length

  for (const start of startingPoints) {
    for (const policy of POLICY_PRESETS) {
      for (const horizon of TIME_HORIZONS) {
        const config = {
          startDate: start.date,
          startElevation: start.elevation,
          startContent: start.content,
          yearsToProject: horizon,
          iterations: ITERATIONS,
          policy,
          recentYearWeight: 2.0,
          recentYearCutoff: 20,
        }

        const result = runMonteCarloSimulation(config, patterns, storageCapacity)

        const policyConfig =
          policy.type === 'simple'
            ? { simplePercent: policy.simplePercent }
            : { tiers: policy.tiers }

        await saveResult({
          policyType: policy.type,
          policyConfig,
          startDate: start.date,
          startElevation: start.elevation,
          startContent: start.content,
          yearsToProject: horizon,
          iterations: ITERATIONS,
          result,
          computeTimeMs: result.computeTimeMs,
          lakeStateDate: latest.date,
        })

        computed++
        totalTime += result.computeTimeMs
        const pct = Math.round((computed / totalScenarios) * 100)
        console.log(
          `[${pct}%] ${start.label} | ${policy.name} | ${horizon}yr → median ${result.summary.medianEndingElevation}ft (${result.computeTimeMs}ms)`
        )
      }
    }
  }

  console.log(`\nDone! Computed ${computed} scenarios in ${(totalTime / 1000).toFixed(1)}s total compute time.`)

  await pool.end()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
