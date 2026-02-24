/**
 * Monte Carlo simulation engine for projecting future Lake Powell levels.
 * 
 * Pure computation module with no database dependencies — can run server-side
 * in API routes or pre-computation scripts.
 * 
 * Approach: sample entire historical water year inflow patterns (preserving
 * seasonal correlations), apply a policy rule to determine daily outflow,
 * and step forward through a daily water balance model with evaporation.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Annual compact release obligation — the historical average outflow from
 * Glen Canyon Dam, driven by the 1922 Colorado River Compact.
 * All percentage-based policies reference this as the "100%" baseline.
 */
export const COMPACT_RELEASE_AF = 8_230_000

export interface OutflowPolicy {
  type: 'simple' | 'tiered' | 'percentOfPolicy'
  name: string
  /** For simple: percentage of COMPACT_RELEASE_AF to release annually */
  simplePercent?: number
  /** Each tier: percentage of COMPACT_RELEASE_AF at that elevation */
  tiers?: Array<{ aboveElevation: number; percent: number }>
  /** For percentOfPolicy: the policy whose release is scaled */
  basePolicy?: OutflowPolicy
  /** For percentOfPolicy: scale factor applied to base policy release */
  percent?: number
}

export const POLICY_PRESETS: OutflowPolicy[] = [
  {
    type: 'tiered',
    name: 'Current operations (2007 guidelines)',
    tiers: [
      { aboveElevation: 3575, percent: 100 },
      { aboveElevation: 3525, percent: 91 },
      { aboveElevation: 0, percent: 85 },
    ],
  },
  { type: 'simple', name: '100% of compact (8.23 MAF)', simplePercent: 100 },
  { type: 'simple', name: '95% of compact (7.82 MAF)', simplePercent: 95 },
  { type: 'simple', name: '90% of compact (7.41 MAF)', simplePercent: 90 },
  { type: 'simple', name: '85% of compact (6.99 MAF)', simplePercent: 85 },
]

/** Restrict which historical water years can be sampled. Shorter windows = drier, less optimistic. */
export type InflowScenario = 'full' | 'last30' | 'last20' | 'last10'

export interface MonteCarloConfig {
  startDate: string
  startElevation: number
  startContent: number
  yearsToProject: number
  iterations: number
  policy: OutflowPolicy
  recentYearWeight: number
  recentYearCutoff: number
  /** Optional: restrict sampling to recent years only (default 'full'). */
  inflowScenario?: InflowScenario
  /**
   * Cumulative inflow in acre-feet from Oct 1 to startDate for the current
   * water year.  When provided, the first (partial) year is sampled from
   * historically similar years instead of the general pool.
   */
  currentWaterYearInflowToDate?: number
  /**
   * Snowpack-based conditioning for the first water year.
   * When provided, constrains which historical years are sampled and
   * scales spring (Apr-Aug) inflow to match the snowpack forecast.
   */
  snowpackData?: {
    similarWaterYears: number[]
    projectedRunoffInflowAf: number
    currentSnowpackPercent: number
  }
}

export interface WaterYearPattern {
  waterYear: number
  dailyInflows: Array<{ dayOfWaterYear: number; inflowCfs: number }>
  totalInflowAf: number
}

export interface StorageCapacityEntry {
  elevation: number
  storage_at_elevation: number
}

export interface DailyPercentile {
  date: string
  dayIndex: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

export interface RampProbability {
  rampName: string
  elevation: number
  probabilityAccessible: number
}

export interface MonteCarloResult {
  dailyPercentiles: DailyPercentile[]
  thresholdProbabilities: {
    stayAboveDeadPool: number
    stayAboveMinPower: number
    stayAbove3525: number
    reachRecoveryTarget: number
    reachFullPool: number
    rampProbabilities: RampProbability[]
  }
  summary: {
    medianEndingElevation: number
    p10EndingElevation: number
    p90EndingElevation: number
    lowestElevationReached: { p10: number; p50: number; p90: number }
    highestElevationReached: { p10: number; p50: number; p90: number }
  }
  config: MonteCarloConfig
  iterations: number
  computeTimeMs: number
}

// ============================================================================
// Constants
// ============================================================================

const FULL_POOL_ELEV = 3700
const DEAD_POOL_ELEV = 3370
const MIN_POWER_POOL_ELEV = 3490
const RECOVERY_TARGET_ELEV = 3660 // ~90% of full pool capacity
const FULL_POOL_CAPACITY = 24_322_000 // acre-feet
const CFS_TO_AF_PER_DAY = 1.9835

const MONTHLY_EVAPORATION_RATES: Record<number, number> = {
  0: 0.0065,  // Jan
  1: 0.0100,  // Feb
  2: 0.0129,  // Mar
  3: 0.0180,  // Apr
  4: 0.0226,  // May
  5: 0.0300,  // Jun
  6: 0.0323,  // Jul
  7: 0.0290,  // Aug
  8: 0.0227,  // Sep
  9: 0.0155,  // Oct
  10: 0.0100, // Nov
  11: 0.0071, // Dec
}

// ============================================================================
// Helper functions
// ============================================================================

export function getSurfaceAreaAtElevation(elevation: number): number {
  if (elevation <= DEAD_POOL_ELEV) return 0
  if (elevation >= FULL_POOL_ELEV) return 161_000
  return ((elevation - DEAD_POOL_ELEV) / (FULL_POOL_ELEV - DEAD_POOL_ELEV)) * 161_000
}

export function getDailyEvaporationAf(month: number, elevation: number): number {
  const rate = MONTHLY_EVAPORATION_RATES[month] ?? 0.015
  return getSurfaceAreaAtElevation(elevation) * rate
}

/**
 * Convert content (acre-feet) to elevation using linear interpolation
 * on the storage capacity table.
 */
export function contentToElevation(
  content: number,
  storageCapacity: StorageCapacityEntry[]
): number {
  if (storageCapacity.length === 0) return 3500
  if (content <= 0) return storageCapacity[0].elevation
  const last = storageCapacity[storageCapacity.length - 1]
  if (content >= last.storage_at_elevation) return last.elevation

  for (let i = 0; i < storageCapacity.length - 1; i++) {
    const cur = storageCapacity[i]
    const next = storageCapacity[i + 1]
    if (content >= cur.storage_at_elevation && content < next.storage_at_elevation) {
      const frac =
        (content - cur.storage_at_elevation) /
        (next.storage_at_elevation - cur.storage_at_elevation)
      return cur.elevation + frac * (next.elevation - cur.elevation)
    }
  }
  return last.elevation
}

/**
 * Convert elevation to content using linear interpolation (reverse lookup).
 */
function elevationToContent(
  elevation: number,
  storageCapacity: StorageCapacityEntry[]
): number {
  if (storageCapacity.length === 0) return 0
  if (elevation <= storageCapacity[0].elevation) return 0
  const last = storageCapacity[storageCapacity.length - 1]
  if (elevation >= last.elevation) return last.storage_at_elevation

  for (let i = 0; i < storageCapacity.length - 1; i++) {
    const cur = storageCapacity[i]
    const next = storageCapacity[i + 1]
    if (elevation >= cur.elevation && elevation < next.elevation) {
      const frac = (elevation - cur.elevation) / (next.elevation - cur.elevation)
      return cur.storage_at_elevation + frac * (next.storage_at_elevation - cur.storage_at_elevation)
    }
  }
  return last.storage_at_elevation
}

/**
 * Apply the policy rule to determine outflow CFS given inflow and current elevation.
 */
/** Convert a % of compact release to daily CFS. */
function compactPercentToCfs(pct: number): number {
  return (COMPACT_RELEASE_AF * (pct / 100)) / 365 / CFS_TO_AF_PER_DAY
}

export function applyPolicy(inflowCfs: number, currentElevation: number, policy: OutflowPolicy): number {
  if (policy.type === 'percentOfPolicy' && policy.basePolicy) {
    const baseOutflow = applyPolicy(inflowCfs, currentElevation, policy.basePolicy)
    return baseOutflow * ((policy.percent ?? 100) / 100)
  }

  if (policy.type === 'simple') {
    return compactPercentToCfs(policy.simplePercent ?? 100)
  }

  // Tiered: find the matching tier (sorted highest first)
  const tiers = [...(policy.tiers ?? [])].sort((a, b) => b.aboveElevation - a.aboveElevation)
  for (const tier of tiers) {
    if (currentElevation >= tier.aboveElevation) {
      return compactPercentToCfs(tier.percent)
    }
  }
  return compactPercentToCfs(100)
}

/**
 * 0-indexed day within the water year (Oct 1 = 0, Sep 30 = 364).
 */
export function getDayOfWaterYear(date: Date): number {
  const year = date.getFullYear()
  const month = date.getMonth()
  const oct1 = month >= 9
    ? new Date(year, 9, 1)
    : new Date(year - 1, 9, 1)
  const diffMs = date.getTime() - oct1.getTime()
  return Math.floor(diffMs / (24 * 60 * 60 * 1000))
}

/**
 * Weighted random sampling of a water year pattern.
 * Recent years (within cutoff) get higher weight.
 */
function sampleWaterYear(
  patterns: WaterYearPattern[],
  currentWaterYear: number,
  recentYearCutoff: number,
  recentYearWeight: number
): WaterYearPattern {
  const weights = patterns.map((p) => {
    const yearsAgo = currentWaterYear - p.waterYear
    return yearsAgo <= recentYearCutoff ? recentYearWeight : 1.0
  })
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * totalWeight
  for (let i = 0; i < patterns.length; i++) {
    r -= weights[i]
    if (r <= 0) return patterns[i]
  }
  return patterns[patterns.length - 1]
}

// Apr 1 in the water year (0-indexed from Oct 1)
const RUNOFF_START_DOW = 182
// Aug 31 in the water year
const RUNOFF_END_DOW = 334

/**
 * Build a 366-element array where index = 0-indexed day of water year.
 * Fills gaps with nearest neighbor interpolation so every day has a value.
 * dayOfWaterYear in data is 1-indexed; output array is 0-indexed.
 */
export function buildDailyLookup(dailyInflows: Array<{ dayOfWaterYear: number; inflowCfs: number }>): number[] {
  const lookup = new Array<number>(366).fill(-1)

  for (const d of dailyInflows) {
    const idx = d.dayOfWaterYear - 1
    if (idx >= 0 && idx < 366) {
      lookup[idx] = d.inflowCfs
    }
  }

  // Fill gaps: forward-fill then back-fill
  let last = -1
  for (let i = 0; i < 366; i++) {
    if (lookup[i] >= 0) { last = lookup[i] }
    else if (last >= 0) { lookup[i] = last }
  }
  // Back-fill any leading gaps
  let first = lookup.findIndex((v) => v >= 0)
  if (first > 0) {
    const val = lookup[first]
    for (let i = 0; i < first; i++) lookup[i] = val
  }

  return lookup
}

/**
 * For the first partial water year, sample from historical years whose
 * snowpack or inflow-to-date is closest to the current year.
 *
 * When snowpack-similar years are provided, restricts to those years.
 * Otherwise falls back to inflow-to-date similarity.
 */
function sampleFirstYear(
  patterns: WaterYearPattern[],
  similarWaterYears: number[] | null,
  currentInflowToDateAf: number | null,
  startDayOfWY: number
): WaterYearPattern {
  // If we have snowpack-similar years, restrict to those
  if (similarWaterYears && similarWaterYears.length > 0) {
    const pool = patterns.filter((p) =>
      similarWaterYears.includes(p.waterYear)
    )
    if (pool.length > 0) {
      return pool[Math.floor(Math.random() * pool.length)]
    }
  }

  // Fallback: match on cumulative inflow-to-date
  if (currentInflowToDateAf != null && startDayOfWY > 30) {
    const withYTD = patterns.map((p) => {
      const lookup = buildDailyLookup(p.dailyInflows)
      let ytdAf = 0
      for (let i = 0; i < startDayOfWY && i < 366; i++) {
        ytdAf += lookup[i] * CFS_TO_AF_PER_DAY
      }
      return { pattern: p, ytdAf }
    })

    withYTD.sort(
      (a, b) =>
        Math.abs(a.ytdAf - currentInflowToDateAf) -
        Math.abs(b.ytdAf - currentInflowToDateAf)
    )

    const pool = Math.min(8, withYTD.length)
    return withYTD[Math.floor(Math.random() * pool)].pattern
  }

  // No conditioning data — random pick
  return patterns[Math.floor(Math.random() * patterns.length)]
}

/**
 * Compute the scale factor to apply to spring inflows so total
 * Apr-Aug inflow matches the snowpack projection.
 *
 * Returns 1.0 when no adjustment is needed or data is unavailable.
 */
function computeSpringScaleFactor(
  inflowLookup: number[],
  projectedRunoffInflowAf: number
): number {
  let sampledSpringAf = 0
  for (let dow = RUNOFF_START_DOW; dow <= RUNOFF_END_DOW && dow < inflowLookup.length; dow++) {
    sampledSpringAf += inflowLookup[dow] * CFS_TO_AF_PER_DAY
  }
  if (sampledSpringAf <= 0) return 1.0
  const factor = projectedRunoffInflowAf / sampledSpringAf
  return Math.max(0.3, Math.min(2.5, factor))
}

/** Percentile from a sorted array (linear interpolation). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/** Add N days to a date string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// ============================================================================
// Main simulation
// ============================================================================

/** Water year (USGS): Oct 1 = start of next calendar year's WY. */
function getWaterYear(date: Date): number {
  const y = date.getFullYear()
  const m = date.getMonth()
  return m >= 9 ? y + 1 : y
}

export function runMonteCarloSimulation(
  config: MonteCarloConfig,
  historicalPatterns: WaterYearPattern[],
  storageCapacity: StorageCapacityEntry[],
  ramps: Array<{ name: string; elevation: number }> = []
): MonteCarloResult {
  const startTime = Date.now()

  // Sort storage capacity ascending by elevation for interpolation
  const sortedStorage = [...storageCapacity].sort((a, b) => a.elevation - b.elevation)

  const totalDays = config.yearsToProject * 365
  const startDate = new Date(config.startDate + 'T00:00:00')
  const startWaterYear = getWaterYear(startDate)

  // Restrict to recent years when user wants a less optimistic (drier) scenario
  const scenario = config.inflowScenario ?? 'full'
  const effectivePatterns =
    scenario === 'last30'
      ? historicalPatterns.filter((p) => p.waterYear >= startWaterYear - 30)
      : scenario === 'last20'
        ? historicalPatterns.filter((p) => p.waterYear >= startWaterYear - 20)
        : scenario === 'last10'
          ? historicalPatterns.filter((p) => p.waterYear >= startWaterYear - 10)
          : historicalPatterns
  const patternsToUse = effectivePatterns.length > 0 ? effectivePatterns : historicalPatterns

  // Current water year for weighting (used when sampling)
  const currentWaterYear = startWaterYear

  // Storage for all scenario daily elevations: scenarios[iteration][dayIndex]
  const allElevations: number[][] = []
  const endingElevations: number[] = []
  const lowestReached: number[] = []
  const highestReached: number[] = []

  // Threshold tracking per scenario
  let countStayAboveDeadPool = 0
  let countStayAboveMinPower = 0
  let countStayAbove3525 = 0
  let countReachFullPool = 0
  let countReachRecoveryTarget = 0
  const rampAccessibleCounts = ramps.map(() => 0)

  // Pre-compute month lookup for every day of the projection to avoid
  // constructing Date objects inside the hot inner loop.
  const monthByDay: number[] = new Array(totalDays)
  {
    const d = new Date(startDate)
    for (let i = 0; i < totalDays; i++) {
      d.setDate(d.getDate() + 1)
      monthByDay[i] = d.getMonth()
    }
  }

  // Day-of-water-year for the simulation start (0-indexed: Oct 1 = 0)
  const startDayOfWY = getDayOfWaterYear(startDate)
  const snowpack = config.snowpackData ?? null
  const hasFirstYearConditioning =
    snowpack != null ||
    (config.currentWaterYearInflowToDate != null && startDayOfWY > 30)

  // Estimate the winter base flow (Oct-Mar median) for the spring scaling.
  const WINTER_BASE_CFS = 8000

  for (let iter = 0; iter < config.iterations; iter++) {
    let content = config.startContent
    let elevation = config.startElevation

    const dailyElevations: number[] = [elevation]
    let minElev = elevation
    let maxElev = elevation
    let wentBelowDeadPool = false
    let wentBelowMinPower = false
    let wentBelow3525 = false
    let reachedFullPool = false
    let reachedRecoveryTarget = false
    const rampAccessible = ramps.map(() => true)

    // Walk forward day-by-day, sampling a new historical year at each
    // water-year boundary (Oct 1).  waterYearDay tracks our position
    // within the sampled pattern so seasonal inflows align correctly.
    let waterYearDay = startDayOfWY
    let sampledYear: WaterYearPattern
    let inflowLookup: number[]
    let springScaleFactor = 1.0
    let isFirstWaterYear = true

    // ── First partial water year: condition on snowpack ──────────────────
    // Sample from historically similar snowpack years so the spring rise
    // timing is realistic, then scale the total spring inflow volume to
    // match the snowpack projection.  The water balance model naturally
    // translates that volume into the correct elevation change at the
    // current lake level (lower elevation = bigger rise per AF).
    if (hasFirstYearConditioning) {
      sampledYear = sampleFirstYear(
        patternsToUse,
        snowpack?.similarWaterYears ?? null,
        config.currentWaterYearInflowToDate ?? null,
        startDayOfWY
      )
      inflowLookup = buildDailyLookup(sampledYear.dailyInflows)
      if (snowpack && snowpack.projectedRunoffInflowAf > 0) {
        springScaleFactor = computeSpringScaleFactor(
          inflowLookup,
          snowpack.projectedRunoffInflowAf
        )
      }
    } else {
      sampledYear = sampleWaterYear(
        patternsToUse,
        currentWaterYear,
        config.recentYearCutoff,
        config.recentYearWeight
      )
      inflowLookup = buildDailyLookup(sampledYear.dailyInflows)
    }

    for (let simDay = 0; simDay < totalDays; simDay++) {
      // At the start of a new water year, sample a fresh historical pattern
      if (waterYearDay >= 365) {
        waterYearDay = 0
        isFirstWaterYear = false
        springScaleFactor = 1.0
        sampledYear = sampleWaterYear(
          patternsToUse,
          currentWaterYear,
          config.recentYearCutoff,
          config.recentYearWeight
        )
        inflowLookup = buildDailyLookup(sampledYear.dailyInflows)
      }

      let inflowCfs = inflowLookup[waterYearDay % 366]

      // Scale spring inflows in the first water year to match snowpack forecast.
      // Only scale the excess above winter base flow so the timing of when
      // inflow first exceeds outflow isn't pushed later.
      if (
        isFirstWaterYear &&
        springScaleFactor !== 1.0 &&
        waterYearDay >= RUNOFF_START_DOW &&
        waterYearDay <= RUNOFF_END_DOW
      ) {
        const excess = Math.max(0, inflowCfs - WINTER_BASE_CFS)
        inflowCfs = WINTER_BASE_CFS + excess * springScaleFactor
      }

      const outflowCfs = applyPolicy(inflowCfs, elevation, config.policy)

      const month = monthByDay[simDay]

      const inflowAf = inflowCfs * CFS_TO_AF_PER_DAY
      const outflowAf = outflowCfs * CFS_TO_AF_PER_DAY
      const evapAf = getDailyEvaporationAf(month, elevation)

      content = content + inflowAf - outflowAf - evapAf

      if (content > FULL_POOL_CAPACITY) {
        content = FULL_POOL_CAPACITY
        reachedFullPool = true
      }
      if (content < 0) content = 0

      elevation = contentToElevation(content, sortedStorage)

      dailyElevations.push(elevation)

      if (elevation < minElev) minElev = elevation
      if (elevation > maxElev) maxElev = elevation
      if (elevation < DEAD_POOL_ELEV) wentBelowDeadPool = true
      if (elevation < MIN_POWER_POOL_ELEV) wentBelowMinPower = true
      if (elevation < 3525) wentBelow3525 = true
      if (elevation >= RECOVERY_TARGET_ELEV) reachedRecoveryTarget = true
      if (elevation >= FULL_POOL_ELEV) reachedFullPool = true

      for (let r = 0; r < ramps.length; r++) {
        if (elevation < ramps[r].elevation) rampAccessible[r] = false
      }

      waterYearDay++
    }

    allElevations.push(dailyElevations)
    endingElevations.push(elevation)
    lowestReached.push(minElev)
    highestReached.push(maxElev)

    if (!wentBelowDeadPool) countStayAboveDeadPool++
    if (!wentBelowMinPower) countStayAboveMinPower++
    if (!wentBelow3525) countStayAbove3525++
    if (reachedRecoveryTarget) countReachRecoveryTarget++
    if (reachedFullPool) countReachFullPool++
    for (let r = 0; r < ramps.length; r++) {
      if (rampAccessible[r]) rampAccessibleCounts[r]++
    }
  }

  // Compute daily percentiles
  const dailyPercentiles: DailyPercentile[] = []

  // Sample output days to keep response payload manageable
  const outputInterval = totalDays > 3650 ? 7 : totalDays > 730 ? 3 : 1

  for (let d = 0; d <= totalDays; d += outputInterval) {
    const vals: number[] = []
    for (let i = 0; i < config.iterations; i++) {
      const elev = allElevations[i][d]
      if (elev !== undefined) vals.push(elev)
    }
    vals.sort((a, b) => a - b)

    dailyPercentiles.push({
      date: addDays(config.startDate, d),
      dayIndex: d,
      p10: Math.round(percentile(vals, 10) * 100) / 100,
      p25: Math.round(percentile(vals, 25) * 100) / 100,
      p50: Math.round(percentile(vals, 50) * 100) / 100,
      p75: Math.round(percentile(vals, 75) * 100) / 100,
      p90: Math.round(percentile(vals, 90) * 100) / 100,
    })
  }

  // Ending elevation stats
  endingElevations.sort((a, b) => a - b)
  lowestReached.sort((a, b) => a - b)
  highestReached.sort((a, b) => a - b)

  const n = config.iterations

  const computeTimeMs = Date.now() - startTime

  return {
    dailyPercentiles,
    thresholdProbabilities: {
      stayAboveDeadPool: Math.round((countStayAboveDeadPool / n) * 1000) / 10,
      stayAboveMinPower: Math.round((countStayAboveMinPower / n) * 1000) / 10,
      stayAbove3525: Math.round((countStayAbove3525 / n) * 1000) / 10,
      reachRecoveryTarget: Math.round((countReachRecoveryTarget / n) * 1000) / 10,
      reachFullPool: Math.round((countReachFullPool / n) * 1000) / 10,
      rampProbabilities: ramps.map((ramp, i) => ({
        rampName: ramp.name,
        elevation: ramp.elevation,
        probabilityAccessible:
          Math.round((rampAccessibleCounts[i] / n) * 1000) / 10,
      })),
    },
    summary: {
      medianEndingElevation: Math.round(percentile(endingElevations, 50) * 10) / 10,
      p10EndingElevation: Math.round(percentile(endingElevations, 10) * 10) / 10,
      p90EndingElevation: Math.round(percentile(endingElevations, 90) * 10) / 10,
      lowestElevationReached: {
        p10: Math.round(percentile(lowestReached, 10) * 10) / 10,
        p50: Math.round(percentile(lowestReached, 50) * 10) / 10,
        p90: Math.round(percentile(lowestReached, 90) * 10) / 10,
      },
      highestElevationReached: {
        p10: Math.round(percentile(highestReached, 10) * 10) / 10,
        p50: Math.round(percentile(highestReached, 50) * 10) / 10,
        p90: Math.round(percentile(highestReached, 90) * 10) / 10,
      },
    },
    config,
    iterations: n,
    computeTimeMs,
  }
}
