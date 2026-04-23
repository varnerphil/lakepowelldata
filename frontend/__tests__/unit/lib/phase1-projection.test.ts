import { describe, it, expect } from 'vitest'
import { computePhase1Projection } from '@/lib/calculations'
import type { StorageCapacityEntry } from '@/lib/monte-carlo'
import { CURRENT_ANNOUNCEMENT } from '@/lib/federal-announcement'

// Realistic Lake Powell storage capacity curve (matches monte-carlo.test.ts fixture).
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

/** Pick the last daily p50 point whose date falls in the requested year/month. */
function endOfMonthP50(
  daily: Array<{ date: string; p50: number }>,
  year: number,
  monthIdx: number
): number | null {
  const prefix = `${year}-${String(monthIdx + 1).padStart(2, '0')}-`
  const inMonth = daily.filter(d => d.date.startsWith(prefix))
  if (inMonth.length === 0) return null
  return inMonth[inMonth.length - 1].p50
}

describe('Phase 1 projection — seasonal release + floor defender', () => {
  const baseParams = {
    startDate: '2026-04-20',
    startElevation: 3526.05,
    startContent: 5_605_545,
    projectedRunoffInflowAf: 4_500_000,
    announcement: CURRENT_ANNOUNCEMENT,
    storageCapacity: STORAGE_CAPACITY,
  }

  it('holds the 3,500 ft protective floor through April 2027 when runoff supports it', () => {
    // With a normal-ish spring runoff (4.5 MAF), the defender plus seasonal
    // releases should hold the p50 curve at or above the protective floor
    // through the end of the plan window.
    const result = computePhase1Projection(baseParams)
    expect(result.ending.p50Elevation).toBeGreaterThanOrEqual(
      CURRENT_ANNOUNCEMENT.protectiveElevationFt!
    )
  })

  it('reports a non-zero floor-defender shave when the plan-as-announced is insufficient', () => {
    const result = computePhase1Projection(baseParams)
    // The flat 7.48 MAF/yr announced rate for WY2027 is more than inflows
    // can sustain above the 3,500 ft floor, so the defender has to shave
    // some release to hold it.
    expect(result.intervention.floorDefenderShaveAf).toBeGreaterThan(0)
    // Baseline (no-intervention) never runs the defender.
    expect(result.baseline.floorDefenderShaveAf).toBe(0)
  })

  it('leaves the defender idle when runoff is abundant enough to hold the floor on its own', () => {
    // A very wet WY2026 should never threaten the floor — defender shouldn't fire.
    const wet = computePhase1Projection({ ...baseParams, projectedRunoffInflowAf: 10_000_000 })
    expect(wet.ending.p50Elevation).toBeGreaterThan(CURRENT_ANNOUNCEMENT.protectiveElevationFt!)
    expect(wet.intervention.floorDefenderShaveAf).toBe(0)
  })

  it('produces a seasonal monthly shape in the baseline (no-intervention) run', () => {
    // Baseline uses the seasonal shape year-round, no defender, no FG.
    // Peak-release months should drain faster than low-release winter months.
    // (The intervention scenario can't be tested this way because Phase 1a
    // uses the flat reduced rate, not the seasonal shape, and the floor
    // defender may clamp late-winter releases.)
    const result = computePhase1Projection(baseParams)
    const b = result.baseline.daily

    const sepEnd = endOfMonthP50(b, 2026, 8)!
    const octEnd = endOfMonthP50(b, 2026, 9)!
    const decEnd = endOfMonthP50(b, 2026, 11)!
    const janEnd = endOfMonthP50(b, 2027, 0)!
    const febEnd = endOfMonthP50(b, 2027, 1)!

    const octDrop = Math.max(0, sepEnd - octEnd)
    const janDrop = Math.max(0, decEnd - janEnd)
    const febDrop = Math.max(0, janEnd - febEnd)

    // Oct release fraction (0.080) > Jan (0.065) > Feb (0.060), so drops
    // should follow the same ordering (before evap / base-flow differences).
    expect(octDrop).toBeGreaterThan(janDrop)
    expect(janDrop).toBeGreaterThan(febDrop)
  })

  it('exposes the intervention and baseline scenarios with consistent fields', () => {
    const result = computePhase1Projection(baseParams)
    expect(result.intervention.daily.length).toBe(result.baseline.daily.length)
    expect(result.intervention.floorDefenderShaveAf).toBeGreaterThanOrEqual(0)
    expect(result.baseline.floorDefenderShaveAf).toBe(0)
    // baseline (no FG, flat-ish seasonal release, no defender) should end
    // lower than intervention.
    expect(result.intervention.ending.p50Elevation).toBeGreaterThan(
      result.baseline.ending.p50Elevation
    )
  })
})
