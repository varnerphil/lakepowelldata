import { describe, it, expect } from 'vitest'
import {
  runMonteCarloSimulation,
  getSurfaceAreaAtElevation,
  getDailyEvaporationAf,
  contentToElevation,
  applyPolicy,
  buildDailyLookup,
  POLICY_PRESETS,
  COMPACT_RELEASE_AF,
  type MonteCarloConfig,
  type WaterYearPattern,
  type StorageCapacityEntry,
  type OutflowPolicy,
} from '@/lib/monte-carlo'

// ============================================================================
// Test fixtures — realistic but deterministic data
// ============================================================================

const STORAGE_CAPACITY: StorageCapacityEntry[] = [
  { elevation: 3370, storage_at_elevation: 0 },
  { elevation: 3400, storage_at_elevation: 1_210_000 },
  { elevation: 3450, storage_at_elevation: 4_820_000 },
  { elevation: 3490, storage_at_elevation: 8_110_000 },
  { elevation: 3525, storage_at_elevation: 11_560_000 },
  { elevation: 3550, storage_at_elevation: 14_100_000 },
  { elevation: 3575, storage_at_elevation: 16_870_000 },
  { elevation: 3600, storage_at_elevation: 19_230_000 },
  { elevation: 3625, storage_at_elevation: 21_000_000 },
  { elevation: 3650, storage_at_elevation: 22_450_000 },
  { elevation: 3675, storage_at_elevation: 23_500_000 },
  { elevation: 3700, storage_at_elevation: 24_322_000 },
]

function makeWaterYearPattern(
  waterYear: number,
  scaleFactor: number = 1.0
): WaterYearPattern {
  const dailyInflows: Array<{ dayOfWaterYear: number; inflowCfs: number }> = []
  let totalAf = 0

  for (let d = 1; d <= 365; d++) {
    const seasonalFactor = 0.3 + 0.7 * Math.max(0, Math.sin(((d - 120) / 365) * Math.PI * 2) * 0.5 + 0.5)
    const baseCfs = 8000 * scaleFactor * seasonalFactor
    const inflowCfs = Math.round(Math.max(500, baseCfs))
    dailyInflows.push({ dayOfWaterYear: d, inflowCfs })
    totalAf += inflowCfs * 1.9835
  }

  return {
    waterYear,
    dailyInflows,
    totalInflowAf: Math.round(totalAf),
  }
}

const HISTORICAL_PATTERNS: WaterYearPattern[] = [
  makeWaterYearPattern(2000, 0.5),
  makeWaterYearPattern(2001, 0.6),
  makeWaterYearPattern(2002, 0.55),
  makeWaterYearPattern(2005, 0.8),
  makeWaterYearPattern(2008, 1.0),
  makeWaterYearPattern(2010, 1.1),
  makeWaterYearPattern(2011, 1.5),
  makeWaterYearPattern(2015, 0.7),
  makeWaterYearPattern(2017, 1.2),
  makeWaterYearPattern(2019, 1.0),
  makeWaterYearPattern(2020, 0.9),
  makeWaterYearPattern(2021, 0.6),
  makeWaterYearPattern(2022, 0.65),
  makeWaterYearPattern(2023, 1.4),
  makeWaterYearPattern(2024, 0.85),
  makeWaterYearPattern(2025, 1.0),
]

/** Expected daily CFS for a given % of compact release. */
function expectedCfs(pct: number): number {
  return (COMPACT_RELEASE_AF * (pct / 100)) / 365 / 1.9835
}

function makeConfig(overrides: Partial<MonteCarloConfig> = {}): MonteCarloConfig {
  return {
    startDate: '2026-01-01',
    startElevation: 3550,
    startContent: 14_100_000,
    yearsToProject: 1,
    iterations: 100,
    policy: { type: 'simple', name: '100% of compact (8.23 MAF)', simplePercent: 100 },
    recentYearWeight: 2.0,
    recentYearCutoff: 20,
    ...overrides,
  }
}

// ============================================================================
// Helper function tests
// ============================================================================

describe('getSurfaceAreaAtElevation', () => {
  it('returns 0 at dead pool', () => {
    expect(getSurfaceAreaAtElevation(3370)).toBe(0)
  })

  it('returns 0 below dead pool', () => {
    expect(getSurfaceAreaAtElevation(3300)).toBe(0)
  })

  it('returns 161,000 at full pool', () => {
    expect(getSurfaceAreaAtElevation(3700)).toBe(161_000)
  })

  it('returns 161,000 above full pool', () => {
    expect(getSurfaceAreaAtElevation(3800)).toBe(161_000)
  })

  it('returns proportional area at midpoint', () => {
    const mid = (3370 + 3700) / 2
    const expected = ((mid - 3370) / (3700 - 3370)) * 161_000
    expect(getSurfaceAreaAtElevation(mid)).toBeCloseTo(expected, 1)
  })
})

describe('getDailyEvaporationAf', () => {
  it('is zero at dead pool regardless of month', () => {
    expect(getDailyEvaporationAf(6, 3370)).toBe(0)
  })

  it('is highest in July (month 6)', () => {
    const july = getDailyEvaporationAf(6, 3600)
    const jan = getDailyEvaporationAf(0, 3600)
    expect(july).toBeGreaterThan(jan)
  })

  it('scales with surface area (higher elevation = more evaporation)', () => {
    const low = getDailyEvaporationAf(6, 3450)
    const high = getDailyEvaporationAf(6, 3650)
    expect(high).toBeGreaterThan(low)
  })

  it('produces reasonable annual total at mid-elevation', () => {
    let annual = 0
    for (let m = 0; m < 12; m++) {
      annual += getDailyEvaporationAf(m, 3550) * 30.4
    }
    expect(annual).toBeGreaterThan(200_000)
    expect(annual).toBeLessThan(1_500_000)
  })
})

describe('contentToElevation', () => {
  it('returns dead pool elevation for zero content', () => {
    expect(contentToElevation(0, STORAGE_CAPACITY)).toBe(3370)
  })

  it('returns dead pool elevation for negative content', () => {
    expect(contentToElevation(-1000, STORAGE_CAPACITY)).toBe(3370)
  })

  it('returns full pool elevation for full capacity', () => {
    expect(contentToElevation(24_322_000, STORAGE_CAPACITY)).toBe(3700)
  })

  it('returns full pool elevation for over-capacity', () => {
    expect(contentToElevation(30_000_000, STORAGE_CAPACITY)).toBe(3700)
  })

  it('interpolates correctly at known midpoint', () => {
    const midContent = (11_560_000 + 14_100_000) / 2
    const result = contentToElevation(midContent, STORAGE_CAPACITY)
    expect(result).toBeCloseTo(3537.5, 0)
  })

  it('returns exact elevation for exact storage match', () => {
    expect(contentToElevation(8_110_000, STORAGE_CAPACITY)).toBe(3490)
  })

  it('returns fallback for empty storage capacity', () => {
    expect(contentToElevation(10_000_000, [])).toBe(3500)
  })
})

describe('applyPolicy', () => {
  it('simple policy: 100% of compact returns full compact CFS', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    expect(applyPolicy(10000, 3550, policy)).toBeCloseTo(expectedCfs(100), 1)
  })

  it('simple policy: 95% of compact returns 95% of compact CFS', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 95 }
    expect(applyPolicy(10000, 3550, policy)).toBeCloseTo(expectedCfs(95), 1)
  })

  it('simple policy: result is independent of inflow', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 90 }
    const withLowInflow = applyPolicy(2000, 3550, policy)
    const withHighInflow = applyPolicy(30000, 3550, policy)
    expect(withLowInflow).toBeCloseTo(withHighInflow, 1)
  })

  it('simple policy: result is independent of elevation', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 85 }
    const low = applyPolicy(10000, 3400, policy)
    const high = applyPolicy(10000, 3650, policy)
    expect(low).toBeCloseTo(high, 1)
  })

  it('simple policy: defaults to 100% compact when simplePercent omitted', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test' }
    expect(applyPolicy(10000, 3550, policy)).toBeCloseTo(expectedCfs(100), 1)
  })

  it('tiered policy: selects correct tier based on elevation', () => {
    const policy: OutflowPolicy = {
      type: 'tiered',
      name: 'test',
      tiers: [
        { aboveElevation: 3600, percent: 100 },
        { aboveElevation: 3525, percent: 90 },
        { aboveElevation: 3490, percent: 80 },
        { aboveElevation: 0, percent: 70 },
      ],
    }

    expect(applyPolicy(10000, 3650, policy)).toBeCloseTo(expectedCfs(100), 1)
    expect(applyPolicy(10000, 3550, policy)).toBeCloseTo(expectedCfs(90), 1)
    expect(applyPolicy(10000, 3500, policy)).toBeCloseTo(expectedCfs(80), 1)
    expect(applyPolicy(10000, 3400, policy)).toBeCloseTo(expectedCfs(70), 1)
  })

  it('tiered policy: exact boundary elevation uses upper tier', () => {
    const policy: OutflowPolicy = {
      type: 'tiered',
      name: 'test',
      tiers: [
        { aboveElevation: 3600, percent: 100 },
        { aboveElevation: 3525, percent: 90 },
      ],
    }
    expect(applyPolicy(10000, 3600, policy)).toBeCloseTo(expectedCfs(100), 1)
  })

  it('tiered policy: with no matching tier falls back to 100% compact', () => {
    const policy: OutflowPolicy = {
      type: 'tiered',
      name: 'test',
      tiers: [{ aboveElevation: 3700, percent: 50 }],
    }
    expect(applyPolicy(10000, 3500, policy)).toBeCloseTo(expectedCfs(100), 1)
  })

  it('tiered policy: is independent of inflow', () => {
    const policy: OutflowPolicy = {
      type: 'tiered',
      name: 'test',
      tiers: [
        { aboveElevation: 3600, percent: 100 },
        { aboveElevation: 0, percent: 80 },
      ],
    }
    const low = applyPolicy(2000, 3550, policy)
    const high = applyPolicy(30000, 3550, policy)
    expect(low).toBeCloseTo(high, 1)
  })

  it('percentOfPolicy: scales a simple base policy', () => {
    const base: OutflowPolicy = { type: 'simple', name: '100%', simplePercent: 100 }
    const policy: OutflowPolicy = { type: 'percentOfPolicy', name: '90% of base', basePolicy: base, percent: 90 }
    expect(applyPolicy(10000, 3550, policy)).toBeCloseTo(expectedCfs(100) * 0.9, 1)
  })

  it('percentOfPolicy: scales a tiered base policy', () => {
    const base: OutflowPolicy = {
      type: 'tiered',
      name: 'tiered',
      tiers: [
        { aboveElevation: 3525, percent: 100 },
        { aboveElevation: 0, percent: 80 },
      ],
    }
    const policy: OutflowPolicy = { type: 'percentOfPolicy', name: '50%', basePolicy: base, percent: 50 }
    expect(applyPolicy(10000, 3550, policy)).toBeCloseTo(expectedCfs(100) * 0.5, 1)
    expect(applyPolicy(10000, 3400, policy)).toBeCloseTo(expectedCfs(80) * 0.5, 1)
  })

  it('percentOfPolicy: defaults to 100% when percent undefined', () => {
    const base: OutflowPolicy = { type: 'simple', name: '80%', simplePercent: 80 }
    const policy: OutflowPolicy = { type: 'percentOfPolicy', name: 'same', basePolicy: base }
    expect(applyPolicy(10000, 3550, policy)).toBeCloseTo(expectedCfs(80), 1)
  })
})

// ============================================================================
// Full simulation tests
// ============================================================================

describe('runMonteCarloSimulation', () => {
  describe('basic structure', () => {
    it('returns correct number of iterations', () => {
      const config = makeConfig({ iterations: 50 })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      expect(result.iterations).toBe(50)
    })

    it('returns daily percentiles array', () => {
      const config = makeConfig({ yearsToProject: 1 })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      expect(result.dailyPercentiles.length).toBeGreaterThan(0)
      expect(result.dailyPercentiles[0]).toHaveProperty('p10')
      expect(result.dailyPercentiles[0]).toHaveProperty('p50')
      expect(result.dailyPercentiles[0]).toHaveProperty('p90')
    })

    it('first percentile day matches start date', () => {
      const config = makeConfig()
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      expect(result.dailyPercentiles[0].date).toBe('2026-01-01')
    })

    it('first day percentiles all equal start elevation', () => {
      const config = makeConfig({ startElevation: 3550, startContent: 14_100_000 })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      const day0 = result.dailyPercentiles[0]
      expect(day0.p10).toBeCloseTo(3550, 0)
      expect(day0.p50).toBeCloseTo(3550, 0)
      expect(day0.p90).toBeCloseTo(3550, 0)
    })

    it('includes config in result', () => {
      const config = makeConfig()
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      expect(result.config.startElevation).toBe(3550)
      expect(result.config.yearsToProject).toBe(1)
    })

    it('reports compute time', () => {
      const config = makeConfig()
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      expect(result.computeTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('percentile ordering invariants', () => {
    it('p10 <= p25 <= p50 <= p75 <= p90 for every day', () => {
      const config = makeConfig({ iterations: 200, yearsToProject: 3 })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)

      for (const day of result.dailyPercentiles) {
        expect(day.p10).toBeLessThanOrEqual(day.p25 + 0.01)
        expect(day.p25).toBeLessThanOrEqual(day.p50 + 0.01)
        expect(day.p50).toBeLessThanOrEqual(day.p75 + 0.01)
        expect(day.p75).toBeLessThanOrEqual(day.p90 + 0.01)
      }
    })

    it('spread widens over time (uncertainty increases)', () => {
      const config = makeConfig({
        iterations: 200,
        yearsToProject: 3,
        startElevation: 3600,
        startContent: 19_230_000,
        policy: { type: 'simple', name: '75%', simplePercent: 75 },
      })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)

      const days = result.dailyPercentiles
      const firstSpread = days[0].p90 - days[0].p10
      const lastSpread = days[days.length - 1].p90 - days[days.length - 1].p10
      expect(lastSpread).toBeGreaterThan(firstSpread)
    })
  })

  describe('summary statistics', () => {
    it('ending elevations maintain p10 <= p50 <= p90', () => {
      const config = makeConfig({ iterations: 200 })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      expect(result.summary.p10EndingElevation).toBeLessThanOrEqual(result.summary.medianEndingElevation + 0.1)
      expect(result.summary.medianEndingElevation).toBeLessThanOrEqual(result.summary.p90EndingElevation + 0.1)
    })

    it('lowest reached is below or equal to starting elevation', () => {
      const config = makeConfig({ iterations: 200 })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      expect(result.summary.lowestElevationReached.p50).toBeLessThanOrEqual(config.startElevation + 1)
    })
  })

  describe('threshold probabilities', () => {
    it('probabilities are between 0 and 100', () => {
      const config = makeConfig({ iterations: 200 })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      const tp = result.thresholdProbabilities

      expect(tp.stayAboveDeadPool).toBeGreaterThanOrEqual(0)
      expect(tp.stayAboveDeadPool).toBeLessThanOrEqual(100)
      expect(tp.stayAboveMinPower).toBeGreaterThanOrEqual(0)
      expect(tp.stayAboveMinPower).toBeLessThanOrEqual(100)
      expect(tp.stayAbove3525).toBeGreaterThanOrEqual(0)
      expect(tp.stayAbove3525).toBeLessThanOrEqual(100)
      expect(tp.reachFullPool).toBeGreaterThanOrEqual(0)
      expect(tp.reachFullPool).toBeLessThanOrEqual(100)
    })

    it('stayAboveDeadPool >= stayAboveMinPower >= stayAbove3525 (monotonicity)', () => {
      const config = makeConfig({ iterations: 500 })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      const tp = result.thresholdProbabilities
      expect(tp.stayAboveDeadPool).toBeGreaterThanOrEqual(tp.stayAboveMinPower - 0.5)
      expect(tp.stayAboveMinPower).toBeGreaterThanOrEqual(tp.stayAbove3525 - 0.5)
    })

    it('at 3550 with 85% compact, dead pool risk is very low for 1 year', () => {
      const config = makeConfig({
        iterations: 500,
        startElevation: 3550,
        startContent: 14_100_000,
        policy: { type: 'simple', name: '85%', simplePercent: 85 },
      })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      expect(result.thresholdProbabilities.stayAboveDeadPool).toBeGreaterThan(95)
    })
  })

  describe('policy effects', () => {
    it('85% compact release results in higher ending elevation than 110%', () => {
      const config85 = makeConfig({
        iterations: 300,
        policy: { type: 'simple', name: '85%', simplePercent: 85 },
      })
      const config110 = makeConfig({
        iterations: 300,
        policy: { type: 'simple', name: '110%', simplePercent: 110 },
      })

      const result85 = runMonteCarloSimulation(config85, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      const result110 = runMonteCarloSimulation(config110, HISTORICAL_PATTERNS, STORAGE_CAPACITY)

      expect(result85.summary.medianEndingElevation)
        .toBeGreaterThan(result110.summary.medianEndingElevation)
    })

    it('with 110% compact, lake should decline over time', () => {
      const config = makeConfig({
        iterations: 300,
        policy: { type: 'simple', name: '110%', simplePercent: 110 },
        yearsToProject: 3,
      })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      expect(result.summary.medianEndingElevation).toBeLessThan(config.startElevation)
    })

    it('inflowScenario last20 is less optimistic than full history', () => {
      const policy: OutflowPolicy = { type: 'simple', name: '100%', simplePercent: 100 }
      const fullConfig = makeConfig({
        iterations: 400,
        policy,
        yearsToProject: 5,
        inflowScenario: 'full',
      })
      const last20Config = makeConfig({
        iterations: 400,
        policy,
        yearsToProject: 5,
        inflowScenario: 'last20',
      })
      const fullResult = runMonteCarloSimulation(fullConfig, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      const last20Result = runMonteCarloSimulation(last20Config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      expect(last20Result.summary.medianEndingElevation).toBeLessThanOrEqual(
        fullResult.summary.medianEndingElevation + 2
      )
    })
  })

  describe('edge cases', () => {
    it('starting at full pool caps content', () => {
      const config = makeConfig({
        iterations: 50,
        startElevation: 3700,
        startContent: 24_322_000,
        policy: { type: 'simple', name: '80%', simplePercent: 80 },
      })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      for (const day of result.dailyPercentiles) {
        expect(day.p90).toBeLessThanOrEqual(3700.1)
      }
    })

    it('starting near dead pool does not go below zero content', () => {
      const config = makeConfig({
        iterations: 50,
        startElevation: 3400,
        startContent: 1_210_000,
        policy: { type: 'simple', name: '150%', simplePercent: 150 },
      })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      for (const day of result.dailyPercentiles) {
        expect(day.p10).toBeGreaterThanOrEqual(3370)
      }
    })

    it('handles single iteration', () => {
      const config = makeConfig({ iterations: 1 })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      expect(result.iterations).toBe(1)
      expect(result.dailyPercentiles.length).toBeGreaterThan(0)
    })

    it('handles single year pattern', () => {
      const singlePattern = [makeWaterYearPattern(2020, 1.0)]
      const config = makeConfig({ iterations: 10 })
      const result = runMonteCarloSimulation(config, singlePattern, STORAGE_CAPACITY)
      const lastDay = result.dailyPercentiles[result.dailyPercentiles.length - 1]
      expect(lastDay.p10).toBeCloseTo(lastDay.p90, 0)
    })
  })

  describe('ramp tracking', () => {
    it('tracks ramp accessibility', () => {
      const ramps = [
        { name: 'Test Ramp High', elevation: 3600 },
        { name: 'Test Ramp Low', elevation: 3400 },
      ]
      const config = makeConfig({ iterations: 100, startElevation: 3550, startContent: 14_100_000 })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY, ramps)

      expect(result.thresholdProbabilities.rampProbabilities).toHaveLength(2)
      const highRamp = result.thresholdProbabilities.rampProbabilities[0]
      const lowRamp = result.thresholdProbabilities.rampProbabilities[1]
      expect(lowRamp.probabilityAccessible).toBeGreaterThanOrEqual(highRamp.probabilityAccessible)
    })
  })

  describe('snowpack-conditioned spring rise', () => {
    const snowpackConfig = (overrides: Partial<MonteCarloConfig> = {}) =>
      makeConfig({
        startDate: '2026-02-01',
        startElevation: 3550,
        startContent: 14_100_000,
        yearsToProject: 2,
        iterations: 100,
        snowpackData: {
          similarWaterYears: [2008, 2010, 2011, 2017, 2019, 2025],
          projectedRunoffInflowAf: 5_000_000,
          currentSnowpackPercent: 95,
        },
        ...overrides,
      })

    it('spring rise spread is tighter with snowpack conditioning than without', () => {
      const withSnowpack = snowpackConfig({ iterations: 200 })
      const withoutSnowpack = makeConfig({
        startDate: '2026-02-01',
        startElevation: 3550,
        startContent: 14_100_000,
        yearsToProject: 2,
        iterations: 200,
      })

      const resultWith = runMonteCarloSimulation(withSnowpack, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      const resultWithout = runMonteCarloSimulation(withoutSnowpack, HISTORICAL_PATTERNS, STORAGE_CAPACITY)

      const springWith = resultWith.dailyPercentiles.find((d) => new Date(d.date).getMonth() === 5)
      const springWithout = resultWithout.dailyPercentiles.find((d) => new Date(d.date).getMonth() === 5)

      if (springWith && springWithout) {
        const spreadWith = springWith.p90 - springWith.p10
        const spreadWithout = springWithout.p90 - springWithout.p10
        expect(spreadWith).toBeLessThan(spreadWithout)
      }
    })

    it('fan-out widens after the first water year', () => {
      const config = snowpackConfig({ iterations: 200, yearsToProject: 2 })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)

      const springDay = result.dailyPercentiles.find((d) => new Date(d.date).getMonth() === 5)
      const secondYearDay = result.dailyPercentiles.find((d) => {
        const date = new Date(d.date)
        return date.getFullYear() === 2027 && date.getMonth() >= 2
      })

      if (springDay && secondYearDay) {
        const springSpread = springDay.p90 - springDay.p10
        const laterSpread = secondYearDay.p90 - secondYearDay.p10
        expect(laterSpread).toBeGreaterThan(springSpread)
      }
    })

    it('snowpack conditioning produces higher spring elevation than unconditioned', () => {
      const conditioned = snowpackConfig({
        iterations: 200,
        yearsToProject: 1,
        policy: { type: 'simple', name: '85%', simplePercent: 85 },
      })
      const unconditioned = makeConfig({
        startDate: '2026-02-01',
        startElevation: 3550,
        startContent: 14_100_000,
        yearsToProject: 1,
        iterations: 200,
        policy: { type: 'simple', name: '85%', simplePercent: 85 },
      })

      const resultCond = runMonteCarloSimulation(conditioned, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      const resultUncond = runMonteCarloSimulation(unconditioned, HISTORICAL_PATTERNS, STORAGE_CAPACITY)

      const juneCond = resultCond.dailyPercentiles.find((d) => new Date(d.date).getMonth() === 5)
      const juneUncond = resultUncond.dailyPercentiles.find((d) => new Date(d.date).getMonth() === 5)

      if (juneCond && juneUncond) {
        expect(juneCond.p50).toBeGreaterThanOrEqual(juneUncond.p50 - 5)
      }
    })
  })

  describe('multi-year projections', () => {
    it('daily percentiles span the correct number of days', () => {
      const config = makeConfig({ iterations: 50, yearsToProject: 3 })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      const lastDay = result.dailyPercentiles[result.dailyPercentiles.length - 1]
      expect(lastDay.dayIndex).toBeGreaterThanOrEqual(1090)
      expect(lastDay.dayIndex).toBeLessThanOrEqual(1095)
    })

    it('samples output to keep payload size manageable for long projections', () => {
      const config5 = makeConfig({ iterations: 20, yearsToProject: 5 })
      const config15 = makeConfig({ iterations: 20, yearsToProject: 15 })

      const result5 = runMonteCarloSimulation(config5, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      const result15 = runMonteCarloSimulation(config15, HISTORICAL_PATTERNS, STORAGE_CAPACITY)

      const pointsPerYear5 = result5.dailyPercentiles.length / 5
      const pointsPerYear15 = result15.dailyPercentiles.length / 15
      expect(pointsPerYear5).toBeGreaterThan(pointsPerYear15)
    })
  })
})

describe('POLICY_PRESETS', () => {
  it('has at least 4 presets', () => {
    expect(POLICY_PRESETS.length).toBeGreaterThanOrEqual(4)
  })

  it('includes simple and tiered types', () => {
    const types = new Set(POLICY_PRESETS.map((p) => p.type))
    expect(types.has('simple')).toBe(true)
    expect(types.has('tiered')).toBe(true)
  })

  it('all simple presets have simplePercent', () => {
    for (const p of POLICY_PRESETS.filter((p) => p.type === 'simple')) {
      expect(p.simplePercent).toBeDefined()
      expect(p.simplePercent).toBeGreaterThan(0)
    }
  })

  it('first preset is current operations', () => {
    expect(POLICY_PRESETS[0].name).toBe('Current operations (2007 guidelines)')
    expect(POLICY_PRESETS[0].type).toBe('tiered')
    expect(POLICY_PRESETS[0].tiers).toBeDefined()
  })

  it('includes current operations preset', () => {
    const names = POLICY_PRESETS.map((p) => p.name)
    expect(names).toContain('Current operations (2007 guidelines)')
  })

  it('all tiered presets have at least 2 tiers', () => {
    for (const p of POLICY_PRESETS.filter((p) => p.type === 'tiered')) {
      expect(p.tiers).toBeDefined()
      expect(p.tiers!.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('tiered presets tiers are sorted by elevation descending', () => {
    for (const p of POLICY_PRESETS.filter((p) => p.type === 'tiered')) {
      const sorted = [...p.tiers!].sort((a, b) => b.aboveElevation - a.aboveElevation)
      expect(p.tiers).toEqual(sorted)
    }
  })

  it('COMPACT_RELEASE_AF is 8.23M AF', () => {
    expect(COMPACT_RELEASE_AF).toBe(8_230_000)
  })
})

describe('buildDailyLookup', () => {
  it('maps dayOfWaterYear (1-indexed) to 0-indexed array positions', () => {
    const inflows = [
      { dayOfWaterYear: 1, inflowCfs: 5000 },
      { dayOfWaterYear: 2, inflowCfs: 5100 },
      { dayOfWaterYear: 183, inflowCfs: 20000 },
    ]
    const lookup = buildDailyLookup(inflows)
    expect(lookup[0]).toBe(5000)
    expect(lookup[1]).toBe(5100)
    expect(lookup[182]).toBe(20000)
  })

  it('fills gaps with nearest neighbor interpolation', () => {
    const inflows = [
      { dayOfWaterYear: 1, inflowCfs: 5000 },
      { dayOfWaterYear: 5, inflowCfs: 6000 },
    ]
    const lookup = buildDailyLookup(inflows)
    expect(lookup[0]).toBe(5000)
    expect(lookup[1]).toBe(5000)
    expect(lookup[2]).toBe(5000)
    expect(lookup[3]).toBe(5000)
    expect(lookup[4]).toBe(6000)
  })

  it('returns 366 elements', () => {
    const inflows = [{ dayOfWaterYear: 1, inflowCfs: 5000 }]
    const lookup = buildDailyLookup(inflows)
    expect(lookup.length).toBe(366)
  })

  it('ensures April (day 182) data is not shifted by missing days', () => {
    const inflows = [
      { dayOfWaterYear: 3, inflowCfs: 5000 },
      { dayOfWaterYear: 183, inflowCfs: 25000 },
      { dayOfWaterYear: 365, inflowCfs: 4000 },
    ]
    const lookup = buildDailyLookup(inflows)
    expect(lookup[182]).toBe(25000)
    expect(lookup[0]).toBe(5000)
    expect(lookup[364]).toBe(4000)
  })
})
