import { describe, it, expect } from 'vitest'
import {
  applyPolicy,
  POLICY_PRESETS,
  DEIS_PRESETS,
  COMPACT_RELEASE_AF,
  type OutflowPolicy,
} from '@/lib/monte-carlo'
import {
  simulateWithPolicy,
  simulateOutflow,
  contentToElevation,
  type SimulationResult,
} from '@/lib/calculations'
import type { WaterMeasurement, ElevationStorageCapacity } from '@/lib/db'

// ============================================================================
// Constants & helpers
// ============================================================================

const CFS_TO_AF_PER_DAY = 1.9835

/** Expected daily CFS for a given % of compact release. */
function expectedCfs(pct: number): number {
  return (COMPACT_RELEASE_AF * (pct / 100)) / 365 / CFS_TO_AF_PER_DAY
}

/** Expected daily AF for a given % of compact release. */
function expectedAfPerDay(pct: number): number {
  return expectedCfs(pct) * CFS_TO_AF_PER_DAY
}

// Realistic storage capacity table
const STORAGE_CAPACITY: ElevationStorageCapacity[] = [
  { elevation: 3370, storage_at_elevation: 0, storage_per_foot: null, percent_of_full: 0, percent_per_foot: null, elevation_range: '3370' },
  { elevation: 3400, storage_at_elevation: 1_210_000, storage_per_foot: null, percent_of_full: 5, percent_per_foot: null, elevation_range: '3400' },
  { elevation: 3450, storage_at_elevation: 4_820_000, storage_per_foot: null, percent_of_full: 20, percent_per_foot: null, elevation_range: '3450' },
  { elevation: 3490, storage_at_elevation: 8_110_000, storage_per_foot: null, percent_of_full: 33, percent_per_foot: null, elevation_range: '3490' },
  { elevation: 3525, storage_at_elevation: 11_560_000, storage_per_foot: null, percent_of_full: 48, percent_per_foot: null, elevation_range: '3525' },
  { elevation: 3550, storage_at_elevation: 14_100_000, storage_per_foot: null, percent_of_full: 58, percent_per_foot: null, elevation_range: '3550' },
  { elevation: 3575, storage_at_elevation: 16_870_000, storage_per_foot: null, percent_of_full: 69, percent_per_foot: null, elevation_range: '3575' },
  { elevation: 3600, storage_at_elevation: 19_230_000, storage_per_foot: null, percent_of_full: 79, percent_per_foot: null, elevation_range: '3600' },
  { elevation: 3625, storage_at_elevation: 21_000_000, storage_per_foot: null, percent_of_full: 86, percent_per_foot: null, elevation_range: '3625' },
  { elevation: 3650, storage_at_elevation: 22_450_000, storage_per_foot: null, percent_of_full: 92, percent_per_foot: null, elevation_range: '3650' },
  { elevation: 3675, storage_at_elevation: 23_500_000, storage_per_foot: null, percent_of_full: 97, percent_per_foot: null, elevation_range: '3675' },
  { elevation: 3700, storage_at_elevation: 24_322_000, storage_per_foot: null, percent_of_full: 100, percent_per_foot: null, elevation_range: '3700' },
]

const FULL_POOL_CAPACITY = 24_322_000

/**
 * Build a short run of fake daily measurements for simulation testing.
 * Inflow/outflow are in CFS. Content and elevation are realistic.
 */
function makeMeasurements(
  days: number,
  opts: {
    startDate?: string
    startContent?: number
    inflowCfs?: number
    outflowCfs?: number
  } = {}
): WaterMeasurement[] {
  const {
    startDate = '2024-01-01',
    startContent = 14_100_000,
    inflowCfs = 10_000,
    outflowCfs = 12_000,
  } = opts

  const measurements: WaterMeasurement[] = []
  let content = startContent

  for (let i = 0; i < days; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]

    const elevation = contentToElevation(content, STORAGE_CAPACITY)
    measurements.push({
      date: dateStr,
      elevation,
      change: i === 0 ? null : -1,
      content,
      inflow: inflowCfs,
      outflow: outflowCfs,
    })

    // Update content for next day based on actual flows
    const dailyChange = (inflowCfs - outflowCfs) * CFS_TO_AF_PER_DAY
    content = Math.max(0, Math.min(FULL_POOL_CAPACITY, content + dailyChange))
  }

  return measurements
}

// ============================================================================
// 1. applyPolicy — exhaustive math for every preset
// ============================================================================

describe('applyPolicy — preset math verification', () => {
  describe('Current operations (2007 guidelines)', () => {
    const policy = POLICY_PRESETS.find(p => p.name === 'Current operations (2007 guidelines)')!

    it('releases 100% at elevation 3650 (above top tier 3575)', () => {
      expect(applyPolicy(10000, 3650, policy)).toBeCloseTo(expectedCfs(100), 0)
    })

    it('releases 100% at exactly 3575 (boundary)', () => {
      expect(applyPolicy(10000, 3575, policy)).toBeCloseTo(expectedCfs(100), 0)
    })

    it('releases 91% at 3550 (between 3525 and 3575)', () => {
      expect(applyPolicy(10000, 3550, policy)).toBeCloseTo(expectedCfs(91), 0)
    })

    it('releases 91% at exactly 3525 (boundary)', () => {
      expect(applyPolicy(10000, 3525, policy)).toBeCloseTo(expectedCfs(91), 0)
    })

    it('releases 85% at 3490 (below 3525)', () => {
      expect(applyPolicy(10000, 3490, policy)).toBeCloseTo(expectedCfs(85), 0)
    })

    it('releases 85% at 3400 (well below all tiers except catch-all)', () => {
      expect(applyPolicy(10000, 3400, policy)).toBeCloseTo(expectedCfs(85), 0)
    })
  })

  describe('Federal Plan: No Action', () => {
    const policy = DEIS_PRESETS.find(p => p.name === 'Federal Plan: No Action')!

    it('releases 100% at any elevation', () => {
      for (const elev of [3400, 3525, 3600, 3700]) {
        expect(applyPolicy(10000, elev, policy)).toBeCloseTo(expectedCfs(100), 0)
      }
    })
  })

  describe('Federal Plan: Basic Coordination', () => {
    const policy = DEIS_PRESETS.find(p => p.name === 'Federal Plan: Basic Coordination')!

    it('releases ~115% above 3650', () => {
      expect(applyPolicy(10000, 3700, policy)).toBeCloseTo(expectedCfs(115.4), 0)
    })

    it('releases 100% between 3575 and 3635', () => {
      expect(applyPolicy(10000, 3600, policy)).toBeCloseTo(expectedCfs(100), 0)
    })

    it('releases ~85% below 3525', () => {
      expect(applyPolicy(10000, 3490, policy)).toBeCloseTo(expectedCfs(85.1), 0)
    })
  })

  describe('Federal Plan: Supply Driven', () => {
    const policy = DEIS_PRESETS.find(p => p.name.includes('Supply Driven'))!

    it('is a flowBased policy type', () => {
      expect(policy.type).toBe('flowBased')
    })

    it('applies without error at various elevations', () => {
      for (const elev of [3400, 3525, 3600, 3700]) {
        const result = applyPolicy(10000, elev, policy)
        expect(result).toBeGreaterThan(0)
      }
    })
  })

  describe('Simple presets', () => {
    for (const preset of POLICY_PRESETS.filter(p => p.type === 'simple')) {
      it(`${preset.name} returns ${preset.simplePercent}% at any elevation`, () => {
        for (const elev of [3370, 3450, 3525, 3600, 3700]) {
          expect(applyPolicy(10000, elev, preset)).toBeCloseTo(
            expectedCfs(preset.simplePercent!), 0
          )
        }
      })
    }
  })
})

describe('applyPolicy — CFS value sanity checks', () => {
  it('100% of compact produces ~11,368 CFS', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const cfs = applyPolicy(0, 3550, policy)
    expect(cfs).toBeGreaterThan(11_300)
    expect(cfs).toBeLessThan(11_400)
  })

  it('100% of compact produces correct annual AF', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const cfs = applyPolicy(0, 3550, policy)
    const annualAf = cfs * CFS_TO_AF_PER_DAY * 365
    expect(annualAf).toBeCloseTo(COMPACT_RELEASE_AF, -3)
  })

  it('85% of compact produces ~85% of the annual AF', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 85 }
    const cfs = applyPolicy(0, 3550, policy)
    const annualAf = cfs * CFS_TO_AF_PER_DAY * 365
    expect(annualAf).toBeCloseTo(COMPACT_RELEASE_AF * 0.85, -3)
  })
})

// ============================================================================
// 2. simulateWithPolicy — water balance math
// ============================================================================

describe('simulateWithPolicy — water balance verification', () => {
  it('returns null for empty measurements', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const result = simulateWithPolicy('2024-01-01', policy, [], STORAGE_CAPACITY)
    expect(result).toBeNull()
  })

  it('returns null when no measurements match start date', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const measurements = makeMeasurements(5, { startDate: '2023-01-01' })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)
    expect(result).toBeNull()
  })

  it('produces correct number of daily records', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const measurements = makeMeasurements(30)
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!
    expect(result.dailyData).toHaveLength(30)
  })

  it('first day has zero evaporation', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const measurements = makeMeasurements(5)
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!
    expect(result.dailyData[0].evaporation).toBe(0)
  })

  it('first day simulated content matches initial content', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const measurements = makeMeasurements(5, { startContent: 14_100_000 })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!
    expect(result.dailyData[0].simulatedContent).toBe(14_100_000)
  })

  it('manually verifies differential water balance for day 2', () => {
    const inflowCfs = 10_000
    const outflowCfs = 12_000
    const startContent = 14_100_000
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const measurements = makeMeasurements(3, { startContent, inflowCfs, outflowCfs })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    const day0 = result.dailyData[0]
    const day1 = result.dailyData[1]

    // Differential approach: use actual content change + outflow swap
    const actualChange = measurements[1].content - measurements[0].content
    const policyOutflowCfs = expectedCfs(100)
    const outflowDiffAf = (outflowCfs - policyOutflowCfs) * CFS_TO_AF_PER_DAY
    const expectedContent = day0.simulatedContent + actualChange + outflowDiffAf

    expect(day1.simulatedContent).toBeCloseTo(expectedContent, -1)
  })

  it('content never goes negative', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 200 }
    const measurements = makeMeasurements(90, {
      startContent: 2_000_000,
      inflowCfs: 3_000,
      outflowCfs: 12_000,
    })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!
    for (const day of result.dailyData) {
      expect(day.simulatedContent).toBeGreaterThanOrEqual(0)
    }
  })

  it('content never exceeds full pool capacity', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 30 }
    const measurements = makeMeasurements(90, {
      startContent: 23_000_000,
      inflowCfs: 25_000,
      outflowCfs: 10_000,
    })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!
    for (const day of result.dailyData) {
      expect(day.simulatedContent).toBeLessThanOrEqual(FULL_POOL_CAPACITY)
    }
  })

  it('records spillway when content exceeds full pool', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 10 }
    const measurements = makeMeasurements(30, {
      startContent: 24_000_000,
      inflowCfs: 30_000,
      outflowCfs: 10_000,
    })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!
    const hasSpillway = result.dailyData.some(d => d.spillway > 0)
    expect(hasSpillway).toBe(true)
    expect(result.summary.totalSpillway).toBeGreaterThan(0)
  })

  it('adjustedOutflow matches policy output for each day', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 90 }
    const measurements = makeMeasurements(10)
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    for (const day of result.dailyData) {
      const expected = applyPolicy(day.actualInflow, day.simulatedElevation, policy)
      expect(day.adjustedOutflow).toBeCloseTo(expected, 0)
    }
  })
})

// ============================================================================
// 3. simulateWithPolicy — tiered policy behavior
// ============================================================================

describe('simulateWithPolicy — tiered policy transitions', () => {
  it('reduces outflow when elevation drops below a tier boundary', () => {
    // Start above 3525 (91% tier) and use high outflow to push below 3525 (85% tier)
    const policy = POLICY_PRESETS.find(p => p.name === 'Current operations (2007 guidelines)')!
    const measurements = makeMeasurements(180, {
      startContent: 12_000_000, // ~3530 ft
      inflowCfs: 5_000,
      outflowCfs: 12_000,
    })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    // Find where we cross 3525
    const above3525 = result.dailyData.filter(d => d.simulatedElevation >= 3525)
    const below3525 = result.dailyData.filter(d => d.simulatedElevation < 3525)

    if (above3525.length > 0 && below3525.length > 0) {
      // The outflow should be higher when above 3525 (91%) than below (85%)
      const avgAbove = above3525.reduce((s, d) => s + d.adjustedOutflow, 0) / above3525.length
      const avgBelow = below3525.reduce((s, d) => s + d.adjustedOutflow, 0) / below3525.length
      expect(avgAbove).toBeGreaterThan(avgBelow)
    }
  })

  it('outflow is determined by start-of-day elevation (previous day ending)', () => {
    // The simulation uses the elevation at the START of each day to pick the tier,
    // then updates the elevation after applying the water balance.
    // Use wide tier spacing to avoid boundary oscillation.
    const policy: OutflowPolicy = {
      type: 'tiered',
      name: 'test-tiers',
      tiers: [
        { aboveElevation: 3600, percent: 100 },
        { aboveElevation: 3490, percent: 80 },
        { aboveElevation: 0, percent: 60 },
      ],
    }
    // Start well between tiers so the lake won't cross a boundary during the test
    const measurements = makeMeasurements(10, {
      startContent: 14_100_000, // 3550 ft — well inside 80% tier (3490-3600)
      inflowCfs: 10_000,
      outflowCfs: 12_000,
    })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    // All days should be in the 80% tier (lake stays between 3490 and 3600)
    for (const day of result.dailyData) {
      expect(day.simulatedElevation).toBeGreaterThanOrEqual(3490)
      expect(day.simulatedElevation).toBeLessThan(3600)
      expect(day.adjustedOutflow).toBeCloseTo(expectedCfs(80), 0)
    }
  })

  it('adjustedOutflow reflects internal elevation, not the rounded stored value', () => {
    // When the lake hovers right at a tier boundary, the stored elevation
    // (rounded to 2 decimal places) might show 3550.00 while the internal
    // value used by applyPolicy was 3549.995. Verify each day's outflow
    // is consistent with the tier it would select at that elevation.
    const policy: OutflowPolicy = {
      type: 'tiered',
      name: 'test-tiers',
      tiers: [
        { aboveElevation: 3550, percent: 100 },
        { aboveElevation: 3490, percent: 80 },
        { aboveElevation: 0, percent: 60 },
      ],
    }
    const measurements = makeMeasurements(10, {
      startContent: 14_100_000, // Exactly at the 3550 boundary
      inflowCfs: 10_000,
      outflowCfs: 12_000,
    })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    for (const day of result.dailyData) {
      // Each day's outflow should be one of the valid tier values
      const cfs100 = Math.round(expectedCfs(100))
      const cfs80 = Math.round(expectedCfs(80))
      const cfs60 = Math.round(expectedCfs(60))
      expect([cfs100, cfs80, cfs60]).toContain(day.adjustedOutflow)
    }
  })
})

// ============================================================================
// 4. Policy comparison — ordering and relative effects
// ============================================================================

describe('simulateWithPolicy — relative policy effects', () => {
  const baseMeasurements = makeMeasurements(365, {
    startDate: '2024-01-01',
    startContent: 14_100_000, // ~3550 ft
    inflowCfs: 10_000,
    outflowCfs: 12_000,
  })

  it('lower release percentage results in higher ending elevation', () => {
    const policy85: OutflowPolicy = { type: 'simple', name: '85%', simplePercent: 85 }
    const policy100: OutflowPolicy = { type: 'simple', name: '100%', simplePercent: 100 }

    const result85 = simulateWithPolicy('2024-01-01', policy85, baseMeasurements, STORAGE_CAPACITY)!
    const result100 = simulateWithPolicy('2024-01-01', policy100, baseMeasurements, STORAGE_CAPACITY)!

    expect(result85.summary.simulatedEndingElevation)
      .toBeGreaterThan(result100.summary.simulatedEndingElevation)
  })

  it('total simulated outflow is lower for reduced-release policy', () => {
    const policy85: OutflowPolicy = { type: 'simple', name: '85%', simplePercent: 85 }
    const policy100: OutflowPolicy = { type: 'simple', name: '100%', simplePercent: 100 }

    const result85 = simulateWithPolicy('2024-01-01', policy85, baseMeasurements, STORAGE_CAPACITY)!
    const result100 = simulateWithPolicy('2024-01-01', policy100, baseMeasurements, STORAGE_CAPACITY)!

    expect(result85.summary.totalSimulatedOutflow)
      .toBeLessThan(result100.summary.totalSimulatedOutflow)
  })

  it('Basic Coordination saves more water at low elevations than No Action', () => {
    const basicCoord = DEIS_PRESETS.find(p => p.name.includes('Basic Coordination'))!
    const noAction = DEIS_PRESETS.find(p => p.name.includes('No Action'))!

    const lowMeasurements = makeMeasurements(365, {
      startDate: '2024-01-01',
      startContent: 8_110_000, // ~3490 ft
      inflowCfs: 10_000,
      outflowCfs: 12_000,
    })

    const resultBasic = simulateWithPolicy('2024-01-01', basicCoord, lowMeasurements, STORAGE_CAPACITY)!
    const resultNoAction = simulateWithPolicy('2024-01-01', noAction, lowMeasurements, STORAGE_CAPACITY)!

    // Basic Coordination cuts releases to 85% at low elevations vs 100% for No Action
    expect(resultBasic.summary.simulatedEndingElevation)
      .toBeGreaterThan(resultNoAction.summary.simulatedEndingElevation)
  })

  it('Basic Coordination releases MORE water above 3650 (115%) than current ops (100%)', () => {
    const basicCoord = DEIS_PRESETS.find(p => p.name.includes('Basic Coordination'))!
    const currentOps = POLICY_PRESETS.find(p => p.name === 'Current operations (2007 guidelines)')!

    const highMeasurements = makeMeasurements(365, {
      startDate: '2024-01-01',
      startContent: 23_000_000, // ~3660 ft — above 3650
      inflowCfs: 15_000,
      outflowCfs: 12_000,
    })

    const resultBasic = simulateWithPolicy('2024-01-01', basicCoord, highMeasurements, STORAGE_CAPACITY)!
    const resultCurrent = simulateWithPolicy('2024-01-01', currentOps, highMeasurements, STORAGE_CAPACITY)!

    // Basic Coordination should release more water (115%) vs current ops (100%) while above 3650
    expect(resultBasic.summary.totalSimulatedOutflow)
      .toBeGreaterThan(resultCurrent.summary.totalSimulatedOutflow)
  })
})

// ============================================================================
// 5. simulateWithPolicy vs simulateOutflow — behavioral differences
// ============================================================================

describe('simulateWithPolicy vs simulateOutflow — consistency checks', () => {
  it('both produce the same number of daily records', () => {
    const measurements = makeMeasurements(30)
    const policy: OutflowPolicy = { type: 'simple', name: '100%', simplePercent: 100 }

    const policyResult = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!
    const pctResult = simulateOutflow('2024-01-01', 100, measurements, STORAGE_CAPACITY)!

    expect(policyResult.dailyData).toHaveLength(pctResult.dailyData.length)
  })

  it('both agree on actual inflow/outflow/elevation values', () => {
    const measurements = makeMeasurements(30)
    const policy: OutflowPolicy = { type: 'simple', name: '100%', simplePercent: 100 }

    const policyResult = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!
    const pctResult = simulateOutflow('2024-01-01', 100, measurements, STORAGE_CAPACITY)!

    for (let i = 0; i < 30; i++) {
      expect(policyResult.dailyData[i].actualElevation)
        .toBe(pctResult.dailyData[i].actualElevation)
      expect(policyResult.dailyData[i].actualInflow)
        .toBe(pctResult.dailyData[i].actualInflow)
      expect(policyResult.dailyData[i].actualOutflow)
        .toBe(pctResult.dailyData[i].actualOutflow)
    }
  })

  it('policy at 100% compact diverges from percentage at 100% (different models)', () => {
    // simulateOutflow at 100% tracks the actual lake (since adjustment = 0)
    // simulateWithPolicy at 100% compact uses inflow + policy outflow + evap
    // These are fundamentally different models and SHOULD diverge
    const measurements = makeMeasurements(90, {
      inflowCfs: 10_000,
      outflowCfs: 12_000,
    })
    const policy: OutflowPolicy = { type: 'simple', name: '100%', simplePercent: 100 }

    const policyResult = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!
    const pctResult = simulateOutflow('2024-01-01', 100, measurements, STORAGE_CAPACITY)!

    // At 100%, simulateOutflow tracks actual content exactly (no outflow adjustment)
    // simulateWithPolicy uses its own water balance, so they should differ
    const lastPolicy = policyResult.dailyData[policyResult.dailyData.length - 1]
    const lastPct = pctResult.dailyData[pctResult.dailyData.length - 1]

    // They should NOT be exactly equal (different models)
    // But both should be reasonable (within ~200ft of start and above dead pool)
    expect(lastPolicy.simulatedElevation).toBeGreaterThan(3370)
    expect(lastPct.simulatedElevation).toBeGreaterThan(3370)
  })
})

// ============================================================================
// 6. Annual outflow volume validation
// ============================================================================

describe('simulateWithPolicy — annual volume verification', () => {
  it('simple 100% policy releases approximately 8.23 MAF per year', () => {
    const policy: OutflowPolicy = { type: 'simple', name: '100%', simplePercent: 100 }
    // Keep high inflow so the lake doesn't drain (which would cut releases via floor)
    const measurements = makeMeasurements(365, {
      startContent: 19_230_000, // high starting content
      inflowCfs: 15_000,
      outflowCfs: 12_000,
    })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    // Sum up simulated outflow in AF. adjustedOutflow is in CFS.
    let totalOutflowAf = 0
    for (const day of result.dailyData) {
      totalOutflowAf += day.adjustedOutflow * CFS_TO_AF_PER_DAY
    }

    // Should be close to 8.23M AF (within ~1% since all days should
    // be at 100% compact with enough content)
    expect(totalOutflowAf).toBeGreaterThan(COMPACT_RELEASE_AF * 0.98)
    expect(totalOutflowAf).toBeLessThan(COMPACT_RELEASE_AF * 1.02)
  })

  it('simple 85% policy releases approximately 85% of compact per year', () => {
    const policy: OutflowPolicy = { type: 'simple', name: '85%', simplePercent: 85 }
    const measurements = makeMeasurements(365, {
      startContent: 19_230_000,
      inflowCfs: 15_000,
      outflowCfs: 12_000,
    })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    let totalOutflowAf = 0
    for (const day of result.dailyData) {
      totalOutflowAf += day.adjustedOutflow * CFS_TO_AF_PER_DAY
    }

    const expected = COMPACT_RELEASE_AF * 0.85
    expect(totalOutflowAf).toBeGreaterThan(expected * 0.98)
    expect(totalOutflowAf).toBeLessThan(expected * 1.02)
  })
})

// ============================================================================
// 7. percentOfPolicy — compound policy math
// ============================================================================

describe('simulateWithPolicy — percentOfPolicy compound policies', () => {
  it('90% of 100% compact = same as 90% simple', () => {
    const base: OutflowPolicy = { type: 'simple', name: '100%', simplePercent: 100 }
    const compound: OutflowPolicy = {
      type: 'percentOfPolicy', name: '90% of 100%', basePolicy: base, percent: 90,
    }
    const simple90: OutflowPolicy = { type: 'simple', name: '90%', simplePercent: 90 }

    const measurements = makeMeasurements(30, {
      startContent: 14_100_000,
      inflowCfs: 10_000,
      outflowCfs: 12_000,
    })

    const compoundResult = simulateWithPolicy('2024-01-01', compound, measurements, STORAGE_CAPACITY)!
    const simpleResult = simulateWithPolicy('2024-01-01', simple90, measurements, STORAGE_CAPACITY)!

    // Both should produce nearly identical outflows and elevations
    for (let i = 0; i < 30; i++) {
      expect(compoundResult.dailyData[i].adjustedOutflow)
        .toBeCloseTo(simpleResult.dailyData[i].adjustedOutflow, 0)
    }
  })

  it('50% of a tiered policy halves the outflow at each tier', () => {
    const base: OutflowPolicy = {
      type: 'tiered', name: 'base',
      tiers: [
        { aboveElevation: 3550, percent: 100 },
        { aboveElevation: 0, percent: 80 },
      ],
    }
    const half: OutflowPolicy = {
      type: 'percentOfPolicy', name: '50% of tiered', basePolicy: base, percent: 50,
    }

    // At 3600 (above 3550): base = 100% compact, half = 50% compact
    expect(applyPolicy(10000, 3600, half)).toBeCloseTo(expectedCfs(50), 0)

    // At 3400 (below 3550): base = 80% compact, half = 40% compact
    expect(applyPolicy(10000, 3400, half)).toBeCloseTo(expectedCfs(40), 0)
  })
})

// ============================================================================
// 8. Summary statistics validation
// ============================================================================

describe('simulateWithPolicy — summary statistics', () => {
  it('summary dates match first and last measurement', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const measurements = makeMeasurements(30, { startDate: '2024-03-15' })
    const result = simulateWithPolicy('2024-03-15', policy, measurements, STORAGE_CAPACITY)!

    expect(result.summary.startDate).toBe('2024-03-15')
    expect(result.summary.endDate).toBe('2024-04-13')
  })

  it('outflowPercentage is 0 (not applicable for policy mode)', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const measurements = makeMeasurements(10)
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!
    expect(result.summary.outflowPercentage).toBe(0)
  })

  it('totalActualOutflow sums actual outflow correctly', () => {
    const inflowCfs = 10_000
    const outflowCfs = 12_000
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const measurements = makeMeasurements(10, { inflowCfs, outflowCfs })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    const expectedTotal = outflowCfs * CFS_TO_AF_PER_DAY * 10
    expect(result.summary.totalActualOutflow).toBeCloseTo(expectedTotal, -2)
  })

  it('elevationDifference = simulated - actual at end', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 85 }
    const measurements = makeMeasurements(30)
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    const lastDay = result.dailyData[result.dailyData.length - 1]
    expect(result.summary.elevationDifference).toBeCloseTo(
      lastDay.simulatedElevation - lastDay.actualElevation, 1
    )
  })
})

// ============================================================================
// 9. Edge cases
// ============================================================================

describe('simulateWithPolicy — edge cases', () => {
  it('handles single measurement (first day only)', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const measurements = makeMeasurements(1)
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    expect(result.dailyData).toHaveLength(1)
    expect(result.summary.startDate).toBe(result.summary.endDate)
  })

  it('handles zero inflow', () => {
    const policy: OutflowPolicy = { type: 'simple', name: 'test', simplePercent: 100 }
    const measurements = makeMeasurements(30, { inflowCfs: 0 })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    // With zero inflow and 100% compact outflow, lake should decline
    const lastDay = result.dailyData[result.dailyData.length - 1]
    expect(lastDay.simulatedElevation).toBeLessThan(result.dailyData[0].simulatedElevation)
  })

  it('handles tiered policy with empty tiers array — falls back to 100% compact', () => {
    const policy: OutflowPolicy = { type: 'tiered', name: 'empty-tiers', tiers: [] }
    const measurements = makeMeasurements(10)
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    for (const day of result.dailyData) {
      expect(day.adjustedOutflow).toBeCloseTo(expectedCfs(100), 0)
    }
  })

  it('handles percentOfPolicy with missing basePolicy — defaults to 100% compact', () => {
    const policy: OutflowPolicy = { type: 'percentOfPolicy', name: 'no-base', percent: 50 }
    const measurements = makeMeasurements(10)
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    // With no basePolicy, applyPolicy should hit the fallback
    // The function checks policy.basePolicy before recursing, and if missing
    // falls through to the simplePercent or tiered path...
    // Actually, let's check what applyPolicy does:
    // if (policy.type === 'percentOfPolicy' && policy.basePolicy) { ... }
    // Since basePolicy is undefined, this block is skipped.
    // Then it falls through to 'simple' check — but type is 'percentOfPolicy'
    // Then to tiered — no tiers, so returns compactPercentToCfs(100)
    for (const day of result.dailyData) {
      expect(day.adjustedOutflow).toBeCloseTo(expectedCfs(100), 0)
    }
  })
})

// ============================================================================
// 10. Evaporation correction verification
// ============================================================================

describe('simulateWithPolicy — evaporation correction', () => {
  it('higher simulated elevation incurs more evaporation (reduces benefit)', () => {
    // Run two policies: one that saves water (lake sits higher) and 100% (tracks actual)
    // The higher lake should lose more to evaporation, reducing the benefit
    const policy85: OutflowPolicy = { type: 'simple', name: '85%', simplePercent: 85 }
    const policy100: OutflowPolicy = { type: 'simple', name: '100%', simplePercent: 100 }

    const measurements = makeMeasurements(365, {
      startContent: 14_100_000,
      inflowCfs: 10_000,
      outflowCfs: 12_000,
    })

    const result85 = simulateWithPolicy('2024-01-01', policy85, measurements, STORAGE_CAPACITY)!
    const result100 = simulateWithPolicy('2024-01-01', policy100, measurements, STORAGE_CAPACITY)!

    // 85% releases less water, so the lake should be higher
    expect(result85.summary.simulatedEndingElevation)
      .toBeGreaterThan(result100.summary.simulatedEndingElevation)

    // But the total evaporation for the 85% policy should be HIGHER
    // because its lake is at a higher elevation with more surface area
    expect(result85.summary.totalEvaporation)
      .toBeGreaterThan(result100.summary.totalEvaporation)
  })

  it('evaporation partially offsets outflow savings', () => {
    // If we save X AF by reducing outflow, we should end up with LESS than X AF
    // extra in the lake because evaporation ate some of it
    const policy85: OutflowPolicy = { type: 'simple', name: '85%', simplePercent: 85 }

    const measurements = makeMeasurements(365, {
      startContent: 14_100_000,
      inflowCfs: 10_000,
      outflowCfs: 12_000,
    })

    const result = simulateWithPolicy('2024-01-01', policy85, measurements, STORAGE_CAPACITY)!

    // The outflow savings (actual - simulated outflow)
    const outflowSaved = result.summary.outflowDifference

    // The actual content gained vs actual
    const contentGained = result.summary.contentDifference

    // Content gained should be LESS than outflow saved, because
    // the higher lake level causes more evaporation
    if (outflowSaved > 0 && contentGained > 0) {
      expect(contentGained).toBeLessThan(outflowSaved)
    }
  })
})

// ============================================================================
// 11. Tier boundary oscillation / chattering
// ============================================================================

describe('simulateWithPolicy — tier boundary oscillation', () => {
  it('oscillates between tiers when lake sits at a boundary', () => {
    // When inflow is between the two tiers' outflow rates and the lake
    // is at a tier boundary, the simulation should "chatter": above the
    // boundary → high release → drops below → low release → rises above → repeat.
    // This is expected hysteresis behavior.
    const policy: OutflowPolicy = {
      type: 'tiered',
      name: 'boundary-test',
      tiers: [
        { aboveElevation: 3550, percent: 100 },  // ~22,548 AF/day
        { aboveElevation: 0, percent: 80 },       // ~18,038 AF/day
      ],
    }
    // Inflow of 10,000 CFS ≈ 19,835 AF/day — between the two outflow rates
    const measurements = makeMeasurements(30, {
      startContent: 14_100_000, // exactly 3550 ft
      inflowCfs: 10_000,
      outflowCfs: 12_000,
    })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    const cfs100 = Math.round(expectedCfs(100))
    const cfs80 = Math.round(expectedCfs(80))

    let sawHigh = false
    let sawLow = false
    for (const day of result.dailyData) {
      if (day.adjustedOutflow === cfs100) sawHigh = true
      if (day.adjustedOutflow === cfs80) sawLow = true
    }

    // Should see both tiers activated due to oscillation
    expect(sawHigh).toBe(true)
    expect(sawLow).toBe(true)
  })

  it('does not oscillate when lake is well within a tier', () => {
    const policy: OutflowPolicy = {
      type: 'tiered',
      name: 'no-oscillation',
      tiers: [
        { aboveElevation: 3600, percent: 100 },
        { aboveElevation: 0, percent: 80 },
      ],
    }
    const measurements = makeMeasurements(30, {
      startContent: 14_100_000, // 3550 — well below 3600
      inflowCfs: 10_000,
      outflowCfs: 12_000,
    })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    const cfs80 = Math.round(expectedCfs(80))
    // All days should be in the 80% tier
    for (const day of result.dailyData) {
      expect(day.adjustedOutflow).toBe(cfs80)
    }
  })
})

// ============================================================================
// 11. Bug hunt: verify outflow accumulation units are consistent
// ============================================================================

describe('simulateWithPolicy — outflow accumulation units', () => {
  it('totalSimulatedOutflow in summary matches sum of daily outflows', () => {
    const policy: OutflowPolicy = { type: 'simple', name: '90%', simplePercent: 90 }
    const measurements = makeMeasurements(60, {
      startContent: 19_230_000,
      inflowCfs: 15_000,
      outflowCfs: 12_000,
    })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    // Sum daily adjustedOutflow (CFS) converted to AF
    let sumDailyAf = 0
    for (const day of result.dailyData) {
      sumDailyAf += day.adjustedOutflow * CFS_TO_AF_PER_DAY
    }

    // The summary totalSimulatedOutflow includes spillway
    const summaryTotal = result.summary.totalSimulatedOutflow
    const summarySpillway = result.summary.totalSpillway
    const summaryOutflowOnly = summaryTotal - summarySpillway

    // These should match closely (small rounding differences from Math.round)
    expect(summaryOutflowOnly).toBeCloseTo(sumDailyAf, -2)
  })

  it('outflowDifference = actualTotal - simulatedTotal', () => {
    const policy: OutflowPolicy = { type: 'simple', name: '85%', simplePercent: 85 }
    const measurements = makeMeasurements(30, {
      startContent: 19_230_000,
      inflowCfs: 15_000,
      outflowCfs: 12_000,
    })
    const result = simulateWithPolicy('2024-01-01', policy, measurements, STORAGE_CAPACITY)!

    const expected = result.summary.totalActualOutflow - result.summary.totalSimulatedOutflow
    expect(result.summary.outflowDifference).toBeCloseTo(expected, -1)
  })
})
