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
import {
  projectFromSnowpack,
  computePhase1Projection,
  type Phase1Result,
} from '../frontend/lib/calculations'
import { CURRENT_ANNOUNCEMENT } from '../frontend/lib/federal-announcement'

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

// Richer storage-capacity row than StorageCapacityEntry — includes the
// storage_per_foot field that projectFromSnowpack and computePhase1Projection
// need. Monte Carlo only reads elevation + storage_at_elevation so it
// structurally accepts this wider shape.
interface FullStorageCapacityRow {
  elevation: number
  storage_at_elevation: number
  storage_per_foot: number | null
}

async function getStorageCapacity(): Promise<FullStorageCapacityRow[]> {
  const result = await query(
    'SELECT elevation, storage_at_elevation, storage_per_foot FROM elevation_storage_capacity ORDER BY elevation'
  )
  return result.rows.map((r: any) => ({
    elevation: parseInt(r.elevation),
    storage_at_elevation: parseInt(r.storage_at_elevation),
    storage_per_foot: r.storage_per_foot !== null ? parseFloat(r.storage_per_foot) : null,
  }))
}

// ─── Federal-plan Phase 1 inputs ──────────────────────────────────

async function getCurrentSnowpackPercent(referenceDate: Date): Promise<number | null> {
  const month = referenceDate.getMonth()
  const currentWaterYear =
    month >= 9 ? referenceDate.getFullYear() + 1 : referenceDate.getFullYear()
  const dateStr = `${String(referenceDate.getMonth() + 1).padStart(2, '0')}-${String(
    referenceDate.getDate()
  ).padStart(2, '0')}`

  const result = await query(
    `
    WITH current_swe AS (
      SELECT swe_value
      FROM basin_plots_data
      WHERE year = $1 AND date_str = $2 AND swe_value IS NOT NULL
      LIMIT 1
    ),
    historical_median AS (
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY swe_value) as median_swe
      FROM basin_plots_data
      WHERE date_str = $2 AND year != $1 AND swe_value IS NOT NULL
    )
    SELECT c.swe_value, h.median_swe
    FROM current_swe c, historical_median h
    `,
    [currentWaterYear, dateStr]
  )
  if (result.rows.length === 0) return null
  const { swe_value, median_swe } = result.rows[0]
  if (!swe_value || !median_swe) return null
  return (parseFloat(swe_value) / parseFloat(median_swe)) * 100
}

async function getSimilarSnowpackYears(
  targetPercent: number,
  tolerance = 15,
  limit = 10
): Promise<any[]> {
  const fields = `
    water_year,
    peak_swe, peak_swe_date, peak_swe_percent_of_median,
    april_1_swe, april_1_percent_of_median,
    pre_runoff_low_elevation, pre_runoff_low_date,
    runoff_start_date, runoff_start_elevation,
    peak_elevation, peak_date, end_of_year_elevation,
    runoff_gain_ft, had_runoff_rise, days_of_rise,
    runoff_inflow_af, runoff_outflow_af, runoff_net_af,
    total_inflow_af, total_outflow_af, net_flow_af,
    inflow_per_inch_swe, ft_gained_per_inch_swe
  `
  let result = await query(
    `SELECT ${fields}, ABS(peak_swe_percent_of_median - $1) as diff
     FROM water_year_analysis
     WHERE peak_swe_percent_of_median IS NOT NULL
       AND ABS(peak_swe_percent_of_median - $1) <= $2
     ORDER BY diff ASC
     LIMIT $3`,
    [targetPercent, tolerance, limit]
  )
  if (result.rows.length === 0) {
    // Fall back to the two lowest-snowpack years on record for unprecedented conditions
    result = await query(
      `SELECT ${fields}, ABS(peak_swe_percent_of_median - $1) as diff
       FROM water_year_analysis
       WHERE peak_swe_percent_of_median IS NOT NULL
       ORDER BY peak_swe_percent_of_median ASC
       LIMIT 2`,
      [targetPercent]
    )
  }
  return result.rows
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

function grade(result: MonteCarloResult, startElevation: number): Grade {
  // Grade on three things:
  //   (1) median ending elevation — where we end up
  //   (2) worst-case floor (p10 lowest reached) — how bad it gets in bad runs
  //   (3) elevation gain — how much recovery does the plan produce?
  // Thresholds correspond to meaningful operational milestones:
  //   3,580 ≈ 60% full, comfortable pool
  //   3,525 ≈ 40% full, healthy pool
  //   3,490 = minimum power pool
  //   3,430 = critical low, marinas impacted
  //   3,370 = dead pool
  const median = result.summary.medianEndingElevation
  const worst = result.summary.lowestElevationReached.p10
  const gain = median - startElevation

  // A: strong recovery + floor stays above min power (best combined)
  if (median >= 3580 && worst >= 3490) return 'A'
  // A: exceptional recovery (100+ ft gain) even if floor dips slightly
  if (median >= 3620 && worst >= 3430 && gain >= 100) return 'A'
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
  gain: number
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

function summarize(result: MonteCarloResult, horizon: number, startElevation: number): HorizonScore {
  const ramps = result.thresholdProbabilities.rampProbabilities.map((r) => ({
    name: r.rampName,
    elevation: r.elevation,
    probability: Math.round(r.probabilityAccessible),
  }))
  const medianEnd = Math.round(result.summary.medianEndingElevation * 10) / 10
  return {
    years: horizon,
    medianEnd,
    p10End: Math.round(result.summary.p10EndingElevation * 10) / 10,
    lowestP10: Math.round(result.summary.lowestElevationReached.p10 * 10) / 10,
    gain: Math.round((medianEnd - startElevation) * 10) / 10,
    stayAboveMinPower: result.thresholdProbabilities.stayAboveMinPower,
    stayAbove3525: result.thresholdProbabilities.stayAbove3525,
    stayAboveDeadPool: result.thresholdProbabilities.stayAboveDeadPool,
    ramps,
    grade: grade(result, startElevation),
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
    summarize(h10, 10, latest.elevation),
    summarize(h20, 20, latest.elevation),
    summarize(full, 40, latest.elevation),
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

  // ─── Phase 1: apply federal plan deterministically ────────────────
  // If we're still inside the federal-plan window (through Apr 30, 2027),
  // walk today's lake state forward through the reduced-release + Flaming
  // Gorge transfer period. Monte Carlo then starts from Phase 1's p50
  // ending state instead of today — matching how the simulator UI behaves.
  let phase1Start = {
    date: latest.date,
    elevation: latest.elevation,
    content: latest.content,
  }
  let phase1: Phase1Result | null = null
  const referenceDate = new Date(latest.date + 'T00:00:00')
  const planEnd = new Date(CURRENT_ANNOUNCEMENT.planEndDate + 'T00:00:00')
  if (referenceDate < planEnd) {
    const snowpackPct = await getCurrentSnowpackPercent(referenceDate)
    if (snowpackPct !== null) {
      const similarYears = await getSimilarSnowpackYears(snowpackPct)
      const snowproj = projectFromSnowpack(
        snowpackPct,
        latest.elevation,
        similarYears as any,
        storageCapacity
      )
      if (snowproj.projectedRunoffInflow > 0) {
        phase1 = computePhase1Projection({
          startDate: latest.date,
          startElevation: latest.elevation,
          startContent: latest.content,
          projectedRunoffInflowAf: snowproj.projectedRunoffInflow,
          announcement: CURRENT_ANNOUNCEMENT,
          storageCapacity: storageCapacity as any,
        })
        phase1Start = {
          date: phase1.endDate,
          elevation: phase1.ending.p50Elevation,
          content: phase1.ending.p50Content,
        }
        console.log(
          `Federal Phase 1 applied: ${latest.elevation.toFixed(1)} ft → ${phase1.ending.p50Elevation.toFixed(1)} ft by ${phase1.endDate}`
        )
        console.log(
          `  snowpack: ${snowpackPct.toFixed(0)}% of median · projected WY2026 runoff: ${(snowproj.projectedRunoffInflow / 1_000_000).toFixed(2)} MAF\n`
        )
      } else {
        console.log('Phase 1 skipped — no snowpack-based runoff projection\n')
      }
    } else {
      console.log('Phase 1 skipped — no snowpack data available\n')
    }
  } else {
    console.log('Phase 1 skipped — federal plan window has ended\n')
  }

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
    const r = await runScenario({
      ...s,
      latest: phase1Start,
      patterns,
      storageCapacity,
    })
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
    // Today's lake state before the federal plan was applied (for context/audit)
    actualDate: latest.date,
    actualElevation: latest.elevation,
    actualContent: latest.content,
    // The actual Monte Carlo starting point — after Phase 1 federal plan if applied
    startDate: phase1Start.date,
    startElevation: phase1Start.elevation,
    startContent: phase1Start.content,
    federalPhase1: phase1
      ? {
          announcement: CURRENT_ANNOUNCEMENT,
          endDate: phase1.endDate,
          startElevation: latest.elevation,
          endElevationP50: phase1.ending.p50Elevation,
          endContentP50: phase1.ending.p50Content,
        }
      : null,
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
