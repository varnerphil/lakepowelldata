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

export interface DualIndicatorCurve {
  minFlowMaf: number
  segments: Array<{ storagePercent: number; releaseMaf: number }>
}

export interface DualIndicatorCurves {
  /** @deprecated No longer used — CRSP_TOTAL_CAPACITY constant is used instead */
  storageCapacityAf?: number
  curves: DualIndicatorCurve[]
}

export interface TargetStorageDistribution {
  curve: Array<{ combinedPercentFull: number; powellPercentOfCombined: number }>
  minReleaseMaf: number
  maxReleaseMaf: number
  maxMonthlyKaf: number
  runningAvgYears: number
  /** Fraction of the storage discrepancy to correct per year (0-1). Default 0.33 (~3-year ramp). */
  correctionFraction?: number
}

export interface SimulationContext {
  completedYearInflows: number[]
  completedYearNaturalFlows: number[]
  currentYearInflowAccum: number
  meadStorage: number
  meadElevation: number
}

export interface OutflowPolicy {
  type: 'simple' | 'tiered' | 'percentOfPolicy' | 'flowBased' | 'dualIndicator' | 'storageDistribution'
  name: string
  /** For simple: percentage of COMPACT_RELEASE_AF to release annually */
  simplePercent?: number
  /** Each tier: percentage of COMPACT_RELEASE_AF at that elevation */
  tiers?: Array<{ aboveElevation: number; percent: number }>
  /** For tiered: linearly interpolate between tier boundaries (DEIS Basic Coordination) */
  interpolate?: boolean
  /** For percentOfPolicy: the policy whose release is scaled */
  basePolicy?: OutflowPolicy
  /** For percentOfPolicy: scale factor applied to base policy release */
  percent?: number
  /** For flowBased: fraction of rolling avg natural flow to release (DEIS Section 2.8.2) */
  flowPercent?: number
  /** For flowBased: number of years in rolling average */
  flowAvgYears?: number
  /** For flowBased: minimum annual release MAF */
  flowMinMaf?: number
  /** For flowBased: maximum annual release MAF */
  flowMaxMaf?: number
  /** For dualIndicator: release curves by CRSP storage % and flow category (DEIS Table 2-6) */
  releaseCurves?: DualIndicatorCurves
  /** For dualIndicator: switch to run-of-river below this Powell elevation (DEIS Section 2.7.2.3) */
  runOfRiverBelowElev?: number
  /** For storageDistribution: target Powell/Mead storage split (DEIS Section 2.6.2, Figure 2-6) */
  targetDistribution?: TargetStorageDistribution
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

export const DEIS_PRESETS: OutflowPolicy[] = [
  {
    type: 'simple',
    name: 'Federal Plan: No Action',
    simplePercent: 100,
  },
  {
    type: 'tiered',
    name: 'Federal Plan: Basic Coordination',
    interpolate: true,
    tiers: [
      { aboveElevation: 3650, percent: 115.4 },
      { aboveElevation: 3635, percent: 100 },
      { aboveElevation: 3575, percent: 100 },
      { aboveElevation: 3525, percent: 85.1 },
      { aboveElevation: 3490, percent: 85.1 },
      { aboveElevation: 0, percent: 85.1 },
    ],
  },
  {
    type: 'storageDistribution',
    name: 'Federal Plan: Enhanced Coordination',
    targetDistribution: {
      curve: [
        { combinedPercentFull: 0.00, powellPercentOfCombined: 0.50 },
        { combinedPercentFull: 0.10, powellPercentOfCombined: 0.52 },
        { combinedPercentFull: 0.20, powellPercentOfCombined: 0.54 },
        { combinedPercentFull: 0.30, powellPercentOfCombined: 0.55 },
        { combinedPercentFull: 0.40, powellPercentOfCombined: 0.56 },
        { combinedPercentFull: 0.50, powellPercentOfCombined: 0.55 },
        { combinedPercentFull: 0.63, powellPercentOfCombined: 0.50 },
        { combinedPercentFull: 0.70, powellPercentOfCombined: 0.47 },
        { combinedPercentFull: 0.80, powellPercentOfCombined: 0.44 },
        { combinedPercentFull: 0.90, powellPercentOfCombined: 0.42 },
        { combinedPercentFull: 1.00, powellPercentOfCombined: 0.40 },
      ],
      minReleaseMaf: 4.7,
      maxReleaseMaf: 10.8,
      maxMonthlyKaf: 900,
      runningAvgYears: 10,
      correctionFraction: 0.33,
    },
  },
  {
    type: 'dualIndicator',
    name: 'Federal Plan: Max Operational Flexibility',
    runOfRiverBelowElev: 3510,
    releaseCurves: {
      curves: [
        {
          minFlowMaf: 10.0,
          segments: [
            { storagePercent: 1.00, releaseMaf: 11.0 },
            { storagePercent: 0.70, releaseMaf: 8.6 },
            { storagePercent: 0.50, releaseMaf: 7.0 },
            { storagePercent: 0.37, releaseMaf: 6.0 },
            { storagePercent: 0.00, releaseMaf: 6.0 },
          ],
        },
        {
          minFlowMaf: 8.0,
          segments: [
            { storagePercent: 1.00, releaseMaf: 11.0 },
            { storagePercent: 0.70, releaseMaf: 8.6 },
            { storagePercent: 0.50, releaseMaf: 6.5 },
            { storagePercent: 0.37, releaseMaf: 5.5 },
            { storagePercent: 0.00, releaseMaf: 5.5 },
          ],
        },
        {
          minFlowMaf: 0,
          segments: [
            { storagePercent: 1.00, releaseMaf: 11.0 },
            { storagePercent: 0.70, releaseMaf: 8.6 },
            { storagePercent: 0.50, releaseMaf: 6.0 },
            { storagePercent: 0.37, releaseMaf: 5.0 },
            { storagePercent: 0.00, releaseMaf: 5.0 },
          ],
        },
      ],
    },
  },
  {
    type: 'flowBased',
    name: 'Federal Plan: Supply Driven',
    flowPercent: 0.65,
    flowAvgYears: 3,
    flowMinMaf: 4.7,
    flowMaxMaf: 12.0,
  },
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
  /** Starting Lake Mead elevation for policies that require Mead state (default ~1062 ft). */
  meadStartElevation?: number
  /**
   * Annual percentage by which Upper Basin depletions grow, reducing inflow to Powell.
   * Models increasing upstream consumption. 0.1 = 0.1% less inflow each year,
   * compounding. Default 0.1 (~20 KAF/yr reduction on ~12 MAF average inflow).
   * Set to 0 to disable.
   */
  demandGrowthPctPerYear?: number
  /** Max total demand growth reduction (0-1 fraction). Default 0.05 (5%). */
  demandGrowthMaxReduction?: number
  /**
   * Annual percentage by which streamflow declines, tapering over time.
   * Applied for the first ~10-13 years then plateaus at the max reduction cap
   * so that very long projections don't produce unrealistically low inflows.
   * 1.0 = moderate (~10% cap), 1.5 = federal baseline (~18% cap, matching CRSS).
   * Default 0 (disabled). Combined with demandGrowthPctPerYear.
   */
  dryingTrendPctPerYear?: number
  /** Max total streamflow reduction from drying trend (0-1 fraction). Default 0.18 (18%). */
  dryingTrendMaxReduction?: number
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
// CRSP (Colorado River Storage Project) constants
// ============================================================================

/** Total active capacity of all four CRSP reservoirs: Powell + Flaming Gorge + Blue Mesa + Navajo */
const CRSP_TOTAL_CAPACITY = 30_706_000

/**
 * Assumed baseline storage in the three upper CRSP units (Flaming Gorge, Blue Mesa, Navajo).
 * Current (2025) combined storage is ~5.0 MAF. This is used as an offset when computing
 * CRSP storage percentage for the Max Operational Flexibility dual-indicator policy.
 */
const UPPER_UNITS_ASSUMED_STORAGE = 5_000_000

// ============================================================================
// USBR Lees Ferry Natural Flow data (water years 1906–2024)
// Source: Bureau of Reclamation, provisional natural flow dataset
// Units: acre-feet per water year
// ============================================================================

const LEES_FERRY_NATURAL_FLOW_AF: Record<number, number> = {
  1906: 19_451_000, 1907: 22_451_000, 1908: 15_720_000, 1909: 22_170_000,
  1910: 14_830_000, 1911: 17_190_000, 1912: 19_430_000, 1913: 14_640_000,
  1914: 19_670_000, 1915: 13_870_000, 1916: 18_270_000, 1917: 24_030_000,
  1918: 14_050_000, 1919: 15_110_000, 1920: 20_050_000, 1921: 20_920_000,
  1922: 18_680_000, 1923: 16_890_000, 1924: 13_840_000, 1925: 13_440_000,
  1926: 13_190_000, 1927: 17_640_000, 1928: 16_360_000, 1929: 20_780_000,
  1930: 12_660_000, 1931:  8_990_000, 1932: 16_440_000, 1933: 11_410_000,
  1934:  6_500_000, 1935: 12_600_000, 1936: 14_430_000, 1937: 13_590_000,
  1938: 16_290_000, 1939: 11_050_000, 1940: 10_220_000, 1941: 17_280_000,
  1942: 16_010_000, 1943: 12_850_000, 1944: 12_350_000, 1945: 12_740_000,
  1946: 10_580_000, 1947: 14_150_000, 1948: 13_350_000, 1949: 15_120_000,
  1950: 12_760_000, 1951: 12_090_000, 1952: 18_550_000, 1953: 11_530_000,
  1954:  7_900_000, 1955: 10_030_000, 1956: 10_850_000, 1957: 17_170_000,
  1958: 15_600_000, 1959:  8_930_000, 1960: 10_880_000, 1961:  9_100_000,
  1962: 14_810_000, 1963:  8_060_000, 1964: 10_310_000, 1965: 16_250_000,
  1966: 10_060_000, 1967: 13_350_000, 1968: 11_320_000, 1969: 15_600_000,
  1970: 13_010_000, 1971: 13_670_000, 1972: 12_080_000, 1973: 17_120_000,
  1974: 13_140_000, 1975: 14_510_000, 1976: 11_710_000, 1977:  7_240_000,
  1978: 15_820_000, 1979: 16_370_000, 1980: 15_690_000, 1981: 10_060_000,
  1982: 16_030_000, 1983: 21_410_000, 1984: 19_280_000, 1985: 14_460_000,
  1986: 17_490_000, 1987: 10_710_000, 1988: 10_050_000, 1989:  9_370_000,
  1990:  9_020_000, 1991: 10_490_000, 1992:  9_950_000, 1993: 16_760_000,
  1994:  9_030_000, 1995: 16_870_000, 1996: 14_070_000, 1997: 17_410_000,
  1998: 16_610_000, 1999: 13_080_000, 2000:  9_700_000, 2001:  8_670_000,
  2002:  6_380_000, 2003:  8_220_000, 2004:  7_800_000, 2005: 14_690_000,
  2006: 11_740_000, 2007:  9_530_000, 2008: 12_300_000, 2009: 10_880_000,
  2010: 11_820_000, 2011: 16_400_000, 2012:  8_170_000, 2013:  8_610_000,
  2014:  8_680_000, 2015:  9_670_000, 2016: 10_620_000, 2017: 13_690_000,
  2018:  6_640_000, 2019: 13_280_000, 2020:  7_300_000, 2021:  6_140_000,
  2022:  6_600_000, 2023: 14_590_000, 2024:  8_710_000,
}

/**
 * Look up or estimate natural flow for a given water year.
 * Falls back to the 30-year trailing average if the year isn't in our dataset.
 */
function getNaturalFlowAf(waterYear: number): number {
  if (LEES_FERRY_NATURAL_FLOW_AF[waterYear]) {
    return LEES_FERRY_NATURAL_FLOW_AF[waterYear]
  }
  const years = Object.keys(LEES_FERRY_NATURAL_FLOW_AF).map(Number).sort((a, b) => a - b)
  const recent = years.slice(-30)
  const sum = recent.reduce((acc, y) => acc + (LEES_FERRY_NATURAL_FLOW_AF[y] ?? 0), 0)
  return sum / recent.length
}

/**
 * Rolling average of completed natural flows in MAF.
 * Used by Supply Driven and Max Operational Flexibility policies
 * which reference "natural flow at Lees Ferry" per DEIS Sections 2.7 and 2.8.
 */
export function rollingAvgNaturalFlowMaf(completedNaturalFlows: number[], nYears: number): number {
  if (completedNaturalFlows.length === 0) return 0
  const slice = completedNaturalFlows.slice(-nYears)
  const sum = slice.reduce((a, b) => a + b, 0)
  return sum / slice.length / 1_000_000
}

// ============================================================================
// Lake Mead simplified model (for Enhanced Coordination policy)
// ============================================================================

const MEAD_FULL_POOL_CAPACITY = 26_120_000
const MEAD_DEAD_POOL_ELEV = 895
const MEAD_FULL_POOL_ELEV = 1220
const MEAD_DEFAULT_START_ELEV = 1062
const MEAD_SIDE_INFLOW_AF_PER_DAY = 820
const MEAD_BASE_DELIVERY_AF = 7_500_000

const MEAD_CAPACITY_TABLE: StorageCapacityEntry[] = [
  { elevation: 895,  storage_at_elevation: 2_000_000 },
  { elevation: 950,  storage_at_elevation: 4_552_000 },
  { elevation: 1000, storage_at_elevation: 7_853_000 },
  { elevation: 1025, storage_at_elevation: 9_601_000 },
  { elevation: 1050, storage_at_elevation: 11_543_000 },
  { elevation: 1075, storage_at_elevation: 13_586_000 },
  { elevation: 1100, storage_at_elevation: 15_853_000 },
  { elevation: 1135, storage_at_elevation: 19_087_000 },
  { elevation: 1145, storage_at_elevation: 20_045_000 },
  { elevation: 1165, storage_at_elevation: 21_564_000 },
  { elevation: 1220, storage_at_elevation: 26_120_000 },
]

const MEAD_MONTHLY_EVAP_RATES: Record<number, number> = {
  0: 0.0045, 1: 0.0065, 2: 0.0100, 3: 0.0145, 4: 0.0195,
  5: 0.0240, 6: 0.0260, 7: 0.0235, 8: 0.0180, 9: 0.0120,
  10: 0.0070, 11: 0.0050,
}

function meadSurfaceArea(elevation: number): number {
  if (elevation <= MEAD_DEAD_POOL_ELEV) return 0
  if (elevation >= MEAD_FULL_POOL_ELEV) return 162_700
  return ((elevation - MEAD_DEAD_POOL_ELEV) / (MEAD_FULL_POOL_ELEV - MEAD_DEAD_POOL_ELEV)) * 162_700
}

function meadElevationFromStorage(storage: number): number {
  return contentToElevation(storage, MEAD_CAPACITY_TABLE)
}

/**
 * Mead shortage tiers based on 2007 Interim Guidelines / 2019 DCP.
 * At lower elevations, Lower Basin deliveries are reduced, which keeps
 * Mead from draining as fast — a critical feedback loop the full CRSS
 * model captures and that we now approximate.
 */
const MEAD_SHORTAGE_TIERS: Array<{ aboveElev: number; deliveryMaf: number }> = [
  { aboveElev: 1090, deliveryMaf: 7.5 },
  { aboveElev: 1075, deliveryMaf: 7.0 },
  { aboveElev: 1050, deliveryMaf: 6.5 },
  { aboveElev: 1025, deliveryMaf: 6.0 },
  { aboveElev:  950, deliveryMaf: 5.5 },
  { aboveElev:    0, deliveryMaf: 5.0 },
]

function meadDeliveryAfPerDay(elevation: number): number {
  for (const tier of MEAD_SHORTAGE_TIERS) {
    if (elevation >= tier.aboveElev) return tier.deliveryMaf * 1_000_000 / 365
  }
  return MEAD_SHORTAGE_TIERS[MEAD_SHORTAGE_TIERS.length - 1].deliveryMaf * 1_000_000 / 365
}

export function stepMead(
  meadStorage: number,
  powellOutflowAf: number,
  month: number
): { storage: number; elevation: number } {
  const elev = meadElevationFromStorage(meadStorage)
  const inflow = powellOutflowAf * 0.97 + MEAD_SIDE_INFLOW_AF_PER_DAY
  const outflow = meadDeliveryAfPerDay(elev)
  const evapRate = MEAD_MONTHLY_EVAP_RATES[month] ?? 0.015
  const evap = meadSurfaceArea(elev) * evapRate

  let newStorage = meadStorage + inflow - outflow - evap
  if (newStorage > MEAD_FULL_POOL_CAPACITY) newStorage = MEAD_FULL_POOL_CAPACITY
  if (newStorage < 0) newStorage = 0

  return { storage: newStorage, elevation: meadElevationFromStorage(newStorage) }
}

// ============================================================================
// Helper functions
// ============================================================================

/** Convert MAF/year to daily CFS. */
function mafToDailyCfs(maf: number): number {
  return (maf * 1_000_000) / 365 / CFS_TO_AF_PER_DAY
}

/**
 * Rolling average of completed annual inflows in MAF.
 * Uses whatever years are available; returns 0 if none.
 */
export function rollingAvgInflowMaf(completedYears: number[], nYears: number): number {
  if (completedYears.length === 0) return 0
  const slice = completedYears.slice(-nYears)
  const sum = slice.reduce((a, b) => a + b, 0)
  return sum / slice.length / 1_000_000
}

/**
 * Linearly interpolate a value from a sorted array of {x, y} points.
 */
function lerpFromCurve(
  curve: Array<{ x: number; y: number }>,
  x: number
): number {
  if (curve.length === 0) return 0
  if (x <= curve[0].x) return curve[0].y
  if (x >= curve[curve.length - 1].x) return curve[curve.length - 1].y
  for (let i = 0; i < curve.length - 1; i++) {
    if (x >= curve[i].x && x <= curve[i + 1].x) {
      const frac = (x - curve[i].x) / (curve[i + 1].x - curve[i].x)
      return curve[i].y + frac * (curve[i + 1].y - curve[i].y)
    }
  }
  return curve[curve.length - 1].y
}

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

export function applyPolicy(
  inflowCfs: number,
  currentElevation: number,
  policy: OutflowPolicy,
  ctx?: SimulationContext,
  powellContent?: number
): number {
  if (policy.type === 'percentOfPolicy' && policy.basePolicy) {
    const baseOutflow = applyPolicy(inflowCfs, currentElevation, policy.basePolicy, ctx, powellContent)
    return baseOutflow * ((policy.percent ?? 100) / 100)
  }

  if (policy.type === 'simple') {
    return compactPercentToCfs(policy.simplePercent ?? 100)
  }

  if (policy.type === 'tiered') {
    const tiers = [...(policy.tiers ?? [])].sort((a, b) => b.aboveElevation - a.aboveElevation)

    if (policy.interpolate && tiers.length >= 2) {
      for (let i = 0; i < tiers.length - 1; i++) {
        const upper = tiers[i]
        const lower = tiers[i + 1]
        if (currentElevation >= upper.aboveElevation) {
          return compactPercentToCfs(upper.percent)
        }
        if (currentElevation >= lower.aboveElevation && currentElevation < upper.aboveElevation) {
          const frac = (currentElevation - lower.aboveElevation) / (upper.aboveElevation - lower.aboveElevation)
          const pct = lower.percent + frac * (upper.percent - lower.percent)
          return compactPercentToCfs(pct)
        }
      }
      return compactPercentToCfs(tiers[tiers.length - 1].percent)
    }

    for (const tier of tiers) {
      if (currentElevation >= tier.aboveElevation) {
        return compactPercentToCfs(tier.percent)
      }
    }
    return compactPercentToCfs(100)
  }

  if (policy.type === 'flowBased' && ctx) {
    const avgNaturalFlowMaf = rollingAvgNaturalFlowMaf(ctx.completedYearNaturalFlows, policy.flowAvgYears ?? 3)
    let releaseMaf = avgNaturalFlowMaf * (policy.flowPercent ?? 0.65)
    releaseMaf = Math.max(policy.flowMinMaf ?? 4.7, Math.min(policy.flowMaxMaf ?? 12.0, releaseMaf))
    return mafToDailyCfs(releaseMaf)
  }

  if (policy.type === 'dualIndicator' && ctx && policy.releaseCurves) {
    const curves = policy.releaseCurves
    const crspStorage = (powellContent ?? 0) + UPPER_UNITS_ASSUMED_STORAGE
    const storagePct = crspStorage / CRSP_TOTAL_CAPACITY
    const avgFlow = rollingAvgNaturalFlowMaf(ctx.completedYearNaturalFlows, 3)

    const sorted = [...curves.curves].sort((a, b) => b.minFlowMaf - a.minFlowMaf)
    let selectedCurve = sorted[sorted.length - 1]
    for (const c of sorted) {
      if (avgFlow >= c.minFlowMaf) { selectedCurve = c; break }
    }

    const segs = [...selectedCurve.segments].sort((a, b) => b.storagePercent - a.storagePercent)
    let releaseMaf: number
    if (storagePct >= segs[0].storagePercent) {
      releaseMaf = segs[0].releaseMaf
    } else if (storagePct <= segs[segs.length - 1].storagePercent) {
      releaseMaf = segs[segs.length - 1].releaseMaf
    } else {
      const curvePoints = segs.map(s => ({ x: s.storagePercent, y: s.releaseMaf }))
      releaseMaf = lerpFromCurve(curvePoints.reverse(), storagePct)
    }

    if (currentElevation <= (policy.runOfRiverBelowElev ?? 3510)) {
      const inflowMafPerYear = inflowCfs * CFS_TO_AF_PER_DAY * 365 / 1_000_000
      releaseMaf = Math.min(releaseMaf, inflowMafPerYear)
    }

    return mafToDailyCfs(releaseMaf)
  }

  if (policy.type === 'storageDistribution' && ctx && policy.targetDistribution) {
    const td = policy.targetDistribution
    const combinedStorage = (powellContent ?? 0) + ctx.meadStorage
    const combinedCapacity = FULL_POOL_CAPACITY + MEAD_FULL_POOL_CAPACITY
    const combinedPct = combinedStorage / combinedCapacity

    const curvePoints = td.curve.map(p => ({ x: p.combinedPercentFull, y: p.powellPercentOfCombined }))
    const targetPowellFraction = lerpFromCurve(curvePoints, combinedPct)
    const targetPowellStorage = combinedStorage * targetPowellFraction

    const avgInflowMaf = rollingAvgInflowMaf(ctx.completedYearInflows, td.runningAvgYears)
    const storageDiscrepancyMaf = ((powellContent ?? 0) - targetPowellStorage) / 1_000_000
    const correction = td.correctionFraction ?? 0.33
    let releaseMaf = avgInflowMaf + storageDiscrepancyMaf * correction

    releaseMaf = Math.max(td.minReleaseMaf, Math.min(td.maxReleaseMaf, releaseMaf))
    return mafToDailyCfs(releaseMaf)
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

  const demandGrowthRate = (config.demandGrowthPctPerYear ?? 0.1) / 100
  const demandMaxReduction = config.demandGrowthMaxReduction ?? 0.05
  const dryingTrendRate = (config.dryingTrendPctPerYear ?? 0) / 100
  const dryingMaxReduction = config.dryingTrendMaxReduction ?? 0.18
  const policyNeedsContext = ['flowBased', 'dualIndicator', 'storageDistribution'].includes(config.policy.type)
  const meadStartElev = config.meadStartElevation ?? MEAD_DEFAULT_START_ELEV
  const meadStartStorage = (() => {
    for (let i = 0; i < MEAD_CAPACITY_TABLE.length - 1; i++) {
      const cur = MEAD_CAPACITY_TABLE[i]
      const next = MEAD_CAPACITY_TABLE[i + 1]
      if (meadStartElev >= cur.elevation && meadStartElev <= next.elevation) {
        const frac = (meadStartElev - cur.elevation) / (next.elevation - cur.elevation)
        return cur.storage_at_elevation + frac * (next.storage_at_elevation - cur.storage_at_elevation)
      }
    }
    return 11_543_000
  })()

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

    let waterYearDay = startDayOfWY
    let sampledYear: WaterYearPattern
    let inflowLookup: number[]
    let springScaleFactor = 1.0
    let isFirstWaterYear = true
    let projectionYear = 0
    let demandFactor = 1.0

    const simCtx: SimulationContext = {
      completedYearInflows: [],
      completedYearNaturalFlows: [],
      currentYearInflowAccum: 0,
      meadStorage: meadStartStorage,
      meadElevation: meadStartElev,
    }

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

    if (policyNeedsContext) {
      simCtx.completedYearInflows = [sampledYear.totalInflowAf]
      simCtx.completedYearNaturalFlows = [getNaturalFlowAf(sampledYear.waterYear)]
    }

    for (let simDay = 0; simDay < totalDays; simDay++) {
      if (waterYearDay >= 365) {
        if (policyNeedsContext) {
          simCtx.completedYearInflows.push(simCtx.currentYearInflowAccum)
          if (simCtx.completedYearInflows.length > 10) {
            simCtx.completedYearInflows = simCtx.completedYearInflows.slice(-10)
          }
          simCtx.currentYearInflowAccum = 0
        }
        waterYearDay = 0
        isFirstWaterYear = false
        springScaleFactor = 1.0
        projectionYear++
        const demandComponent = demandGrowthRate > 0
          ? Math.max(1 - demandMaxReduction, Math.pow(1 - demandGrowthRate, projectionYear))
          : 1
        const dryingComponent = dryingTrendRate > 0
          ? Math.max(1 - dryingMaxReduction, Math.pow(1 - dryingTrendRate, projectionYear))
          : 1
        demandFactor = demandComponent * dryingComponent
        sampledYear = sampleWaterYear(
          patternsToUse,
          currentWaterYear,
          config.recentYearCutoff,
          config.recentYearWeight
        )
        inflowLookup = buildDailyLookup(sampledYear.dailyInflows)
        if (policyNeedsContext) {
          simCtx.completedYearNaturalFlows.push(getNaturalFlowAf(sampledYear.waterYear))
          if (simCtx.completedYearNaturalFlows.length > 10) {
            simCtx.completedYearNaturalFlows = simCtx.completedYearNaturalFlows.slice(-10)
          }
        }
      }

      let inflowCfs = inflowLookup[waterYearDay % 366]

      if (
        isFirstWaterYear &&
        springScaleFactor !== 1.0 &&
        waterYearDay >= RUNOFF_START_DOW &&
        waterYearDay <= RUNOFF_END_DOW
      ) {
        const excess = Math.max(0, inflowCfs - WINTER_BASE_CFS)
        inflowCfs = WINTER_BASE_CFS + excess * springScaleFactor
      }

      inflowCfs *= demandFactor

      const month = monthByDay[simDay]
      const inflowAf = inflowCfs * CFS_TO_AF_PER_DAY

      if (policyNeedsContext) {
        simCtx.currentYearInflowAccum += inflowAf
      }

      const outflowCfs = applyPolicy(
        inflowCfs, elevation, config.policy,
        policyNeedsContext ? simCtx : undefined,
        policyNeedsContext ? content : undefined
      )

      const outflowAf = outflowCfs * CFS_TO_AF_PER_DAY
      const evapAf = getDailyEvaporationAf(month, elevation)

      content = content + inflowAf - outflowAf - evapAf

      if (policyNeedsContext) {
        const meadResult = stepMead(simCtx.meadStorage, outflowAf, month)
        simCtx.meadStorage = meadResult.storage
        simCtx.meadElevation = meadResult.elevation
      }

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
