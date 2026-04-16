/**
 * Compute Monte Carlo scorecards for each policy/plan under a standardized
 * stress test. Results drive the federal-plan scorecards and the Abundance
 * Act overlay in the article series.
 *
 * Stress test (same for every scenario, only the policy changes):
 *   - Inflow window: last 10 years (driest period on record)
 *   - Streamflow trend: historical (no multiplicative adjustment — inflow
 *     window already captures dryness)
 *   - Horizons reported: 10, 20, 40 years
 *   - Iterations: 2000 (higher than UI default so article numbers are stable
 *     run-to-run within ±1 ft on medians)
 *
 * Output:
 *   scripts/article-data/scorecards.json  (git-tracked receipts)
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/compute-article-scorecards.ts
 */

import { Pool } from 'pg'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

import {
  runMonteCarloSimulation,
  POLICY_PRESETS,
  DEIS_PRESETS,
  AUGMENTATION_PRESETS,
  type OutflowPolicy,
  type WaterYearPattern,
  type StorageCapacityEntry,
  type AugmentationConfig,
  type MonteCarloResult,
} from '../frontend/lib/monte-carlo'

const HORIZONS = [10, 20, 40]
const ITERATIONS = 2000
const INFLOW_SCENARIO = 'last10' as const

// Marinas/ramps we score against. Elevations are approximate minimum-usable.
const SCORECARD_RAMPS = [
  { name: 'Wahweap', elevation: 3555 },
  { name: 'Bullfrog', elevation: 3540 },
  { name: 'Antelope Point', elevation: 3540 },
  { name: 'Halls Crossing', elevation: 3550 },
  { name: 'Stateline', elevation: 3520 },
]

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

// ─── Grading rubric ───────────────────────────────────────────
// Identical for every scenario so articles can compare apples-to-apples.
type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

function grade(result: MonteCarloResult): Grade {
  // Grade on two things that actually matter for advocacy:
  //   (1) median ending elevation — where we end up
  //   (2) worst-case floor (p10 lowest reached) — how bad it gets in bad runs
  // Thresholds correspond to meaningful operational milestones:
  //   3,580 ≈ 60% full, comfortable pool
  //   3,525 ≈ 40% full, healthy pool
  //   3,490 = minimum power pool
  //   3,430 = critical low, marinas impacted
  //   3,370 = dead pool
  const median = result.summary.medianEndingElevation
  const worst = result.summary.lowestElevationReached.p10

  if (median >= 3580 && worst >= 3490) return 'A'
  if (median >= 3525 && worst >= 3430) return 'B'
  if (median >= 3490 && worst >= 3400) return 'C'
  if (median >= 3430 && worst >= 3370) return 'D'
  return 'F'
}

interface HorizonScore {
  years: number
  medianEnd: number
  p10End: number
  lowestP10: number
  stayAboveMinPower: number
  stayAbove3525: number
  stayAboveDeadPool: number
  ramps: Array<{ name: string; probability: number; elevation: number }>
  grade: Grade
}

interface ScenarioResult {
  key: string
  label: string
  policyName: string
  augmentation: string | null
  horizons: HorizonScore[]
  dailyP50: Array<{ monthsOut: number; elevation: number }>
  dailyP10: Array<{ monthsOut: number; elevation: number }>
}

function summarize(result: MonteCarloResult, horizon: number): HorizonScore {
  const ramps = result.thresholdProbabilities.rampProbabilities.map((r) => ({
    name: r.rampName,
    elevation: r.elevation,
    probability: Math.round(r.probabilityAccessible),
  }))
  return {
    years: horizon,
    medianEnd: Math.round(result.summary.medianEndingElevation * 10) / 10,
    p10End: Math.round(result.summary.p10EndingElevation * 10) / 10,
    lowestP10: Math.round(result.summary.lowestElevationReached.p10 * 10) / 10,
    stayAboveMinPower: result.thresholdProbabilities.stayAboveMinPower,
    stayAbove3525: result.thresholdProbabilities.stayAbove3525,
    stayAboveDeadPool: result.thresholdProbabilities.stayAboveDeadPool,
    ramps,
    grade: grade(result),
  }
}

/**
 * Sample the p50/p10 daily curves at monthly intervals for later charting.
 * Keeps the JSON compact while preserving enough fidelity for article charts.
 */
function samplePercentileCurve(
  result: MonteCarloResult,
  which: 'p10' | 'p50'
): Array<{ monthsOut: number; elevation: number }> {
  const dp = result.dailyPercentiles
  if (dp.length === 0) return []
  const startDate = new Date(dp[0].date)
  const out: Array<{ monthsOut: number; elevation: number }> = []
  const STRIDE = 30
  for (let i = 0; i < dp.length; i += STRIDE) {
    const d = new Date(dp[i].date)
    const months = Math.round(
      (d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    )
    const value = which === 'p10' ? dp[i].p10 : dp[i].p50
    out.push({ monthsOut: months, elevation: Math.round(value * 10) / 10 })
  }
  // Ensure last point is included
  const last = dp[dp.length - 1]
  const lastMonths = Math.round(
    (new Date(last.date).getTime() - startDate.getTime()) /
      (1000 * 60 * 60 * 24 * 30.44)
  )
  if (out[out.length - 1]?.monthsOut !== lastMonths) {
    const value = which === 'p10' ? last.p10 : last.p50
    out.push({ monthsOut: lastMonths, elevation: Math.round(value * 10) / 10 })
  }
  return out
}

async function runScenario(params: {
  key: string
  label: string
  policy: OutflowPolicy
  augmentation: AugmentationConfig | null
  latest: { date: string; elevation: number; content: number }
  patterns: WaterYearPattern[]
  storageCapacity: StorageCapacityEntry[]
}): Promise<ScenarioResult> {
  const { key, label, policy, augmentation, latest, patterns, storageCapacity } = params

  // Run a single 40-year simulation; derive the shorter-horizon scorecards from
  // the same daily percentile series so all three horizons are internally
  // consistent (same stochastic draws).
  const config = {
    startDate: latest.date,
    startElevation: latest.elevation,
    startContent: latest.content,
    yearsToProject: 40,
    iterations: ITERATIONS,
    policy,
    recentYearWeight: 1.0,
    recentYearCutoff: 20,
    inflowScenario: INFLOW_SCENARIO,
    ...(augmentation ? { augmentation } : {}),
  }

  const full = runMonteCarloSimulation(
    config,
    patterns,
    storageCapacity,
    SCORECARD_RAMPS
  )

  // For 10 and 20 year horizons we re-run with those yearsToProject so the
  // threshold probabilities reflect only that window (threshold-crossing stats
  // are computed over the whole projection).
  const h10 = runMonteCarloSimulation(
    { ...config, yearsToProject: 10 },
    patterns,
    storageCapacity,
    SCORECARD_RAMPS
  )
  const h20 = runMonteCarloSimulation(
    { ...config, yearsToProject: 20 },
    patterns,
    storageCapacity,
    SCORECARD_RAMPS
  )

  const horizons: HorizonScore[] = [
    summarize(h10, 10),
    summarize(h20, 20),
    summarize(full, 40),
  ]

  return {
    key,
    label,
    policyName: policy.name,
    augmentation: augmentation
      ? `IOC=${augmentation.iocYear}/${augmentation.iocMAF}MAF, FOC=${augmentation.focYear}/${augmentation.focMAF}MAF`
      : null,
    horizons,
    dailyP50: samplePercentileCurve(full, 'p50'),
    dailyP10: samplePercentileCurve(full, 'p10'),
  }
}

async function main() {
  console.log('=== Computing article scorecards ===\n')

  const latest = await getLatestMeasurement()
  if (!latest) {
    console.error('No current lake data found')
    process.exit(1)
  }
  console.log(
    `Start: ${latest.date} | ${latest.elevation} ft | ${latest.content.toLocaleString()} AF`
  )
  console.log(`Stress test: ${INFLOW_SCENARIO} inflow, historical streamflow, ${ITERATIONS} iterations\n`)

  const [patterns, storageCapacity] = await Promise.all([
    getWaterYearPatterns(),
    getStorageCapacity(),
  ])
  console.log(
    `Patterns: ${patterns.length} water years (${patterns[0]?.waterYear}-${patterns[patterns.length - 1]?.waterYear})`
  )
  console.log(`Storage capacity: ${storageCapacity.length} entries\n`)

  // ─── Build the scenario list ───────────────────────────────────────
  const allPolicies = [...POLICY_PRESETS, ...DEIS_PRESETS]
  const scenarios: Array<Omit<Parameters<typeof runScenario>[0], 'latest' | 'patterns' | 'storageCapacity'>> = []

  // 1) Every federal/baseline policy with no augmentation
  for (const p of allPolicies) {
    scenarios.push({
      key: slugify(p.name),
      label: p.name,
      policy: p,
      augmentation: null,
    })
  }

  // 2) Each augmentation preset layered on "Current operations (2007 guidelines)"
  const currentOps = POLICY_PRESETS.find((p) =>
    p.name.includes('Current operations')
  )!
  for (const aug of AUGMENTATION_PRESETS) {
    scenarios.push({
      key: `current-ops-plus-${aug.key}`,
      label: `${currentOps.name} + ${aug.label}`,
      policy: currentOps,
      augmentation: aug.config,
    })
  }

  // ─── Run them ──────────────────────────────────────────────────────
  const results: ScenarioResult[] = []
  let i = 0
  for (const s of scenarios) {
    i++
    const t0 = Date.now()
    const r = await runScenario({ ...s, latest, patterns, storageCapacity })
    const t = Date.now() - t0
    results.push(r)
    const h40 = r.horizons.find((h) => h.years === 40)!
    console.log(
      `[${i}/${scenarios.length}] ${s.label}`
    )
    console.log(
      `        10yr: ${r.horizons[0].medianEnd}ft ${r.horizons[0].grade} · ` +
      `20yr: ${r.horizons[1].medianEnd}ft ${r.horizons[1].grade} · ` +
      `40yr: ${h40.medianEnd}ft ${h40.grade}  (${t}ms)`
    )
  }

  // ─── Write JSON ───────────────────────────────────────────────────
  const outDir = join(__dirname, 'article-data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'scorecards.json')
  const payload = {
    generatedAt: new Date().toISOString(),
    startDate: latest.date,
    startElevation: latest.elevation,
    startContent: latest.content,
    stressTest: {
      inflowScenario: INFLOW_SCENARIO,
      streamflowTrend: 'historical',
      iterations: ITERATIONS,
    },
    ramps: SCORECARD_RAMPS,
    scenarios: results,
  }
  writeFileSync(outPath, JSON.stringify(payload, null, 2))
  console.log(`\nWrote ${outPath}`)

  await pool.end()
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
