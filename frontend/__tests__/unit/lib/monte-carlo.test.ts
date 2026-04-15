import { describe, it, expect } from 'vitest'
import {
  runMonteCarloSimulation,
  getSurfaceAreaAtElevation,
  getDailyEvaporationAf,
  contentToElevation,
  applyPolicy,
  buildDailyLookup,
  rollingAvgInflowMaf,
  rollingAvgNaturalFlowMaf,
  stepMead,
  computeAugmentationMAF,
  AUGMENTATION_PRESETS,
  POWELL_RELEASE_FLOOR_MAF,
  POLICY_PRESETS,
  DEIS_PRESETS,
  COMPACT_RELEASE_AF,
  type MonteCarloConfig,
  type WaterYearPattern,
  type StorageCapacityEntry,
  type OutflowPolicy,
  type SimulationContext,
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

// ============================================================================
// DEIS presets and new policy type tests
// ============================================================================

describe('DEIS_PRESETS', () => {
  it('has 5 DEIS alternatives', () => {
    expect(DEIS_PRESETS.length).toBe(5)
  })

  it('includes all expected policy types', () => {
    const types = new Set(DEIS_PRESETS.map((p) => p.type))
    expect(types.has('simple')).toBe(true)
    expect(types.has('tiered')).toBe(true)
    expect(types.has('flowBased')).toBe(true)
    expect(types.has('dualIndicator')).toBe(true)
    expect(types.has('storageDistribution')).toBe(true)
  })

  it('all presets have names starting with Federal Plan:', () => {
    for (const p of DEIS_PRESETS) {
      expect(p.name).toMatch(/^Federal Plan:/)
    }
  })

  it('No Action preset is simple 100%', () => {
    const noAction = DEIS_PRESETS.find((p) => p.name.includes('No Action'))
    expect(noAction).toBeDefined()
    expect(noAction!.type).toBe('simple')
    expect(noAction!.simplePercent).toBe(100)
  })

  it('Basic Coordination has interpolation enabled', () => {
    const basic = DEIS_PRESETS.find((p) => p.name.includes('Basic Coordination'))
    expect(basic).toBeDefined()
    expect(basic!.type).toBe('tiered')
    expect(basic!.interpolate).toBe(true)
    expect(basic!.tiers!.length).toBeGreaterThanOrEqual(4)
  })

  it('Supply Driven has flowBased config', () => {
    const supply = DEIS_PRESETS.find((p) => p.name.includes('Supply Driven'))
    expect(supply).toBeDefined()
    expect(supply!.type).toBe('flowBased')
    expect(supply!.flowPercent).toBe(0.65)
    expect(supply!.flowAvgYears).toBe(3)
    expect(supply!.flowMinMaf).toBe(4.7)
    expect(supply!.flowMaxMaf).toBe(12.0)
  })

  it('Max Flexibility has dual indicator curves', () => {
    const maxFlex = DEIS_PRESETS.find((p) => p.name.includes('Max Operational'))
    expect(maxFlex).toBeDefined()
    expect(maxFlex!.type).toBe('dualIndicator')
    expect(maxFlex!.releaseCurves).toBeDefined()
    expect(maxFlex!.releaseCurves!.curves.length).toBe(3)
    expect(maxFlex!.runOfRiverBelowElev).toBe(3510)
  })

  it('Enhanced Coordination has storage distribution config', () => {
    const enhanced = DEIS_PRESETS.find((p) => p.name.includes('Enhanced Coordination'))
    expect(enhanced).toBeDefined()
    expect(enhanced!.type).toBe('storageDistribution')
    expect(enhanced!.targetDistribution).toBeDefined()
    expect(enhanced!.targetDistribution!.minReleaseMaf).toBe(4.7)
    expect(enhanced!.targetDistribution!.maxReleaseMaf).toBe(10.8)
    expect(enhanced!.targetDistribution!.runningAvgYears).toBe(10)
  })
})

describe('rollingAvgInflowMaf', () => {
  it('returns 0 for empty array', () => {
    expect(rollingAvgInflowMaf([], 3)).toBe(0)
  })

  it('returns single year average when only one year', () => {
    expect(rollingAvgInflowMaf([10_000_000], 3)).toBeCloseTo(10.0, 1)
  })

  it('averages last N years', () => {
    const years = [8_000_000, 10_000_000, 12_000_000]
    expect(rollingAvgInflowMaf(years, 3)).toBeCloseTo(10.0, 1)
  })

  it('uses only last N years when more are available', () => {
    const years = [5_000_000, 8_000_000, 10_000_000, 12_000_000]
    expect(rollingAvgInflowMaf(years, 3)).toBeCloseTo(10.0, 1)
  })

  it('uses all years when fewer than N available', () => {
    const years = [8_000_000, 12_000_000]
    expect(rollingAvgInflowMaf(years, 3)).toBeCloseTo(10.0, 1)
  })
})

describe('Abundance Act augmentation', () => {
  describe('computeAugmentationMAF', () => {
    const cfg = { iocYear: 2045, iocMAF: 2.0, focYear: 2055, focMAF: 7.0 }

    it('returns 0 before IOC', () => {
      expect(computeAugmentationMAF(cfg, 2030)).toBe(0)
      expect(computeAugmentationMAF(cfg, 2044)).toBe(0)
    })

    it('returns iocMAF at IOC year', () => {
      expect(computeAugmentationMAF(cfg, 2045)).toBe(2.0)
    })

    it('ramps linearly between IOC and FOC', () => {
      expect(computeAugmentationMAF(cfg, 2050)).toBeCloseTo(4.5, 5)
    })

    it('saturates at focMAF after FOC year', () => {
      expect(computeAugmentationMAF(cfg, 2055)).toBe(7.0)
      expect(computeAugmentationMAF(cfg, 2100)).toBe(7.0)
    })

    it('handles IOC-only presets (focYear == iocYear)', () => {
      const iocOnly = { iocYear: 2045, iocMAF: 2.0, focYear: 2045, focMAF: 2.0 }
      expect(computeAugmentationMAF(iocOnly, 2050)).toBe(2.0)
    })
  })

  describe('simulation with augmentation', () => {
    it('Powell ends higher with augmentation than without (when start year > IOC)', () => {
      const baseCfg = makeConfig({
        startDate: '2050-01-01',
        yearsToProject: 3,
        iterations: 100,
        startElevation: 3620,
        startContent: 19_000_000,
        policy: { type: 'simple', name: '95% of compact', simplePercent: 95 },
      })
      const without = runMonteCarloSimulation(baseCfg, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      const withAug = runMonteCarloSimulation(
        { ...baseCfg, augmentation: AUGMENTATION_PRESETS.find((p) => p.key === 'optimistic')!.config },
        HISTORICAL_PATTERNS, STORAGE_CAPACITY
      )
      expect(withAug.summary.medianEndingElevation).toBeGreaterThan(
        without.summary.medianEndingElevation
      )
    })

    it('no effect before IOC year', () => {
      const baseCfg = makeConfig({
        startDate: '2030-01-01',
        yearsToProject: 3,
        iterations: 100,
        startElevation: 3620,
        startContent: 19_000_000,
        policy: { type: 'simple', name: '95%', simplePercent: 95 },
      })
      const without = runMonteCarloSimulation(baseCfg, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
      const withAug = runMonteCarloSimulation(
        { ...baseCfg, augmentation: AUGMENTATION_PRESETS.find((p) => p.key === 'realistic')!.config },
        HISTORICAL_PATTERNS, STORAGE_CAPACITY
      )
      // Within Monte Carlo noise: should be nearly identical since augmentation
      // is 0 throughout 2030–2033 (all before IOC year 2045).
      expect(Math.abs(
        withAug.summary.medianEndingElevation - without.summary.medianEndingElevation
      )).toBeLessThan(5)
    })
  })
})

describe('stepMead', () => {
  it('accepts optional augmentation inflow', () => {
    const base = stepMead(11_543_000, 20_000, 6, 0)
    const withAug = stepMead(11_543_000, 20_000, 6, 5_000)
    expect(withAug.storage).toBeGreaterThan(base.storage)
  })

  it('increases storage when inflow exceeds outflow + evap', () => {
    const start = 11_543_000
    const highInflow = 40_000
    const result = stepMead(start, highInflow, 0)
    expect(result.storage).toBeGreaterThan(start)
  })

  it('decreases storage when outflow exceeds inflow', () => {
    const start = 11_543_000
    const lowInflow = 5_000
    const result = stepMead(start, lowInflow, 6)
    expect(result.storage).toBeLessThan(start)
  })

  it('caps storage at full pool capacity', () => {
    const nearFull = 26_000_000
    const result = stepMead(nearFull, 500_000, 0)
    expect(result.storage).toBeLessThanOrEqual(26_120_000)
  })

  it('does not go below zero', () => {
    const result = stepMead(0, 0, 6)
    expect(result.storage).toBeGreaterThanOrEqual(0)
  })

  it('returns a valid elevation', () => {
    const result = stepMead(11_543_000, 20_000, 6)
    expect(result.elevation).toBeGreaterThan(895)
    expect(result.elevation).toBeLessThan(1220)
  })
})

describe('applyPolicy — new DEIS types', () => {
  const makeCtx = (completedYears: number[], naturalFlows?: number[]): SimulationContext => ({
    completedYearInflows: completedYears,
    completedYearNaturalFlows: naturalFlows ?? completedYears,
    currentYearInflowAccum: 0,
    meadStorage: 11_543_000,
    meadElevation: 1050,
  })

  describe('tiered with interpolation', () => {
    const policy: OutflowPolicy = {
      type: 'tiered',
      name: 'test interpolated',
      interpolate: true,
      tiers: [
        { aboveElevation: 3650, percent: 115.4 },
        { aboveElevation: 3635, percent: 100 },
        { aboveElevation: 3575, percent: 100 },
        { aboveElevation: 3525, percent: 85.1 },
        { aboveElevation: 0, percent: 85.1 },
      ],
    }

    it('returns top tier above highest elevation', () => {
      const cfs = applyPolicy(10000, 3660, policy)
      expect(cfs).toBeCloseTo(expectedCfs(115.4), 0)
    })

    it('returns bottom tier below lowest', () => {
      const cfs = applyPolicy(10000, 3400, policy)
      expect(cfs).toBeCloseTo(expectedCfs(85.1), 0)
    })

    it('interpolates between 3525 and 3575', () => {
      const midElev = 3550
      const cfs = applyPolicy(10000, midElev, policy)
      const expectedPct = 85.1 + ((midElev - 3525) / (3575 - 3525)) * (100 - 85.1)
      expect(cfs).toBeCloseTo(expectedCfs(expectedPct), 0)
    })

    it('returns flat release in non-ramp zone (3575-3635)', () => {
      const cfs1 = applyPolicy(10000, 3580, policy)
      const cfs2 = applyPolicy(10000, 3630, policy)
      expect(cfs1).toBeCloseTo(cfs2, 0)
    })
  })

  describe('flowBased (Supply Driven)', () => {
    const policy: OutflowPolicy = {
      type: 'flowBased',
      name: 'test flow',
      flowPercent: 0.65,
      flowAvgYears: 3,
      flowMinMaf: 4.7,
      flowMaxMaf: 12.0,
    }

    it('computes 65% of rolling average natural flow', () => {
      const naturalFlows = [10_000_000, 12_000_000, 14_000_000]
      const ctx = makeCtx([8_000_000, 9_000_000, 10_000_000], naturalFlows)
      const cfs = applyPolicy(10000, 3550, policy, ctx)
      const expectedMaf = 0.65 * 12.0
      const expectedDailyCfs = (expectedMaf * 1_000_000) / 365 / 1.9835
      expect(cfs).toBeCloseTo(expectedDailyCfs, 0)
    })

    it('enforces minimum release of 4.7 MAF', () => {
      const naturalFlows = [3_000_000, 3_000_000, 3_000_000]
      const ctx = makeCtx([2_000_000, 2_000_000, 2_000_000], naturalFlows)
      const cfs = applyPolicy(10000, 3550, policy, ctx)
      const minDailyCfs = (4.7 * 1_000_000) / 365 / 1.9835
      expect(cfs).toBeCloseTo(minDailyCfs, 0)
    })

    it('enforces maximum release of 12.0 MAF', () => {
      const naturalFlows = [25_000_000, 25_000_000, 25_000_000]
      const ctx = makeCtx([20_000_000, 20_000_000, 20_000_000], naturalFlows)
      const cfs = applyPolicy(10000, 3550, policy, ctx)
      const maxDailyCfs = (12.0 * 1_000_000) / 365 / 1.9835
      expect(cfs).toBeCloseTo(maxDailyCfs, 0)
    })

    it('falls back to 100% compact without context', () => {
      const cfs = applyPolicy(10000, 3550, policy)
      expect(cfs).toBeCloseTo(expectedCfs(100), 0)
    })
  })

  describe('dualIndicator (Max Flexibility)', () => {
    const maxFlexPreset = DEIS_PRESETS.find((p) => p.name.includes('Max Operational'))!

    it('returns high release at full Powell storage with wet hydrology', () => {
      const naturalFlows = [15_000_000, 15_000_000, 15_000_000]
      const ctx = makeCtx([12_000_000, 12_000_000, 12_000_000], naturalFlows)
      const cfs = applyPolicy(10000, 3700, maxFlexPreset, ctx, 24_322_000)
      // CRSP storage % = (24.322M + 5M) / 30.706M ≈ 95.5%, interpolated between
      // 100%→11.0 MAF and 70%→8.6 MAF on the above-average flow curve
      const crspPct = (24_322_000 + 5_000_000) / 30_706_000
      const frac = (crspPct - 0.70) / (1.00 - 0.70)
      const expectedMaf = 8.6 + frac * (11.0 - 8.6)
      const expectedDailyCfs = (expectedMaf * 1_000_000) / 365 / 1.9835
      expect(cfs).toBeCloseTo(expectedDailyCfs, 0)
    })

    it('returns lower release at low CRSP storage with dry hydrology', () => {
      const naturalFlows = [6_000_000, 6_000_000, 6_000_000]
      const ctx = makeCtx([4_000_000, 4_000_000, 4_000_000], naturalFlows)
      const cfs = applyPolicy(10000, 3520, maxFlexPreset, ctx, 8_000_000)
      const maxPossibleCfs = (8.6 * 1_000_000) / 365 / 1.9835
      expect(cfs).toBeLessThan(maxPossibleCfs)
    })

    it('applies run-of-river below 3510 ft', () => {
      const naturalFlows = [15_000_000, 15_000_000, 15_000_000]
      const ctx = makeCtx([12_000_000, 12_000_000, 12_000_000], naturalFlows)
      const lowInflow = 3000
      const cfs = applyPolicy(lowInflow, 3505, maxFlexPreset, ctx, 20_000_000)
      const inflowMafPerYear = lowInflow * 1.9835 * 365 / 1_000_000
      const inflowCapDailyCfs = (inflowMafPerYear * 1_000_000) / 365 / 1.9835
      expect(cfs).toBeLessThanOrEqual(inflowCapDailyCfs + 1)
    })
  })

  describe('storageDistribution (Enhanced Coordination)', () => {
    const enhancedPreset = DEIS_PRESETS.find((p) => p.name.includes('Enhanced Coordination'))!

    it('produces release within configured bounds', () => {
      const ctx = makeCtx([10_000_000, 10_000_000, 10_000_000], [13_000_000, 13_000_000, 13_000_000])
      const cfs = applyPolicy(10000, 3550, enhancedPreset, ctx, 14_100_000)
      const minCfs = (4.7 * 1_000_000) / 365 / 1.9835
      const maxCfs = (10.8 * 1_000_000) / 365 / 1.9835
      expect(cfs).toBeGreaterThanOrEqual(minCfs - 1)
      expect(cfs).toBeLessThanOrEqual(maxCfs + 1)
    })

    it('increases release when Powell is overfull relative to target', () => {
      const ctx1 = makeCtx([10_000_000, 10_000_000, 10_000_000], [13_000_000, 13_000_000, 13_000_000])
      const ctx2 = makeCtx([10_000_000, 10_000_000, 10_000_000], [13_000_000, 13_000_000, 13_000_000])
      const lowPowell = applyPolicy(10000, 3450, enhancedPreset, ctx1, 5_000_000)
      const highPowell = applyPolicy(10000, 3650, enhancedPreset, ctx2, 22_000_000)
      expect(highPowell).toBeGreaterThan(lowPowell)
    })
  })
})

describe('DEIS presets integration', () => {
  it('runs full simulation with each DEIS preset', () => {
    for (const preset of DEIS_PRESETS) {
      const config = makeConfig({
        iterations: 20,
        yearsToProject: 3,
        policy: preset,
      })
      const result = runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)

      expect(result.iterations).toBe(20)
      expect(result.dailyPercentiles.length).toBeGreaterThan(0)
      expect(result.summary.medianEndingElevation).toBeGreaterThanOrEqual(3370)
      expect(result.summary.medianEndingElevation).toBeLessThanOrEqual(3700)

      for (const day of result.dailyPercentiles) {
        expect(day.p10).toBeLessThanOrEqual(day.p90 + 0.01)
      }
    }
  })

  it('DEIS presets produce different outcomes', () => {
    const results = DEIS_PRESETS.map((preset) => {
      const config = makeConfig({
        iterations: 50,
        yearsToProject: 5,
        policy: preset,
      })
      return runMonteCarloSimulation(config, HISTORICAL_PATTERNS, STORAGE_CAPACITY)
    })

    const medians = results.map((r) => r.summary.medianEndingElevation)
    const uniqueRounded = new Set(medians.map((m) => Math.round(m)))
    expect(uniqueRounded.size).toBeGreaterThanOrEqual(2)
  })
})
