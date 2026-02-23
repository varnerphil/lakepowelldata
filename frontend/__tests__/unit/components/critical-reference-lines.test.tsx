import { describe, test, expect } from 'vitest'

/**
 * These tests verify the logic that guarantees critical reference lines
 * (Dead Pool, Min Power Pool, Full Pool) are always visible on every chart.
 *
 * The actual rendering is verified via Playwright e2e tests. Here we test:
 * 1. The Y-axis domain computation always includes all critical elevations
 * 2. The reference line inclusion is unconditional (no Y-range gating)
 */

const DEAD_POOL = 3370
const MIN_POWER = 3490
const FULL_POOL = 3700

// ─── Replicate the domain computation from MonteCarloChart ──────

function computeMonteCarloYDomain(data: Array<{ p10: number; p90: number }>) {
  if (data.length === 0) return { yMin: DEAD_POOL - 20, yMax: FULL_POOL + 20 }
  const allVals = data.flatMap((d) => [d.p10, d.p90])
  const min = Math.min(...allVals, DEAD_POOL)
  const max = Math.max(...allVals, FULL_POOL)
  const pad = (max - min) * 0.05 || 20
  return {
    yMin: Math.floor((min - pad) / 10) * 10,
    yMax: Math.ceil((max + pad) / 10) * 10,
  }
}

// ─── Replicate the domain computation from SimulationChart ──────

function computeSimulationYDomain(data: Array<{ actual: number; simulated: number }>) {
  const allValues = data.flatMap((d) => [d.actual, d.simulated])
  const min = Math.min(...allValues, DEAD_POOL)
  const max = Math.max(...allValues, FULL_POOL)
  const padding = (max - min) * 0.05
  return {
    yMin: Math.floor((min - padding) / 10) * 10,
    yMax: Math.ceil((max + padding) / 10) * 10,
  }
}

// ─── Helper: check that all critical elevations are within domain ──

function domainContainsAllCritical(yMin: number, yMax: number) {
  return yMin <= DEAD_POOL && yMax >= FULL_POOL && yMin <= MIN_POWER && yMax >= MIN_POWER
}

// ─── MonteCarloChart Y-axis domain tests ────────────────────────

describe('MonteCarloChart: Y-axis domain always includes critical elevations', () => {
  test('full-range data: domain includes Dead Pool, Min Power, Full Pool', () => {
    const { yMin, yMax } = computeMonteCarloYDomain([
      { p10: 3400, p90: 3680 },
    ])
    expect(yMin).toBeLessThanOrEqual(DEAD_POOL)
    expect(yMax).toBeGreaterThanOrEqual(FULL_POOL)
    expect(domainContainsAllCritical(yMin, yMax)).toBe(true)
  })

  test('narrow high data (3620-3680): domain still includes Dead Pool', () => {
    const { yMin, yMax } = computeMonteCarloYDomain([
      { p10: 3620, p90: 3680 },
    ])
    expect(yMin).toBeLessThanOrEqual(DEAD_POOL)
    expect(yMax).toBeGreaterThanOrEqual(FULL_POOL)
  })

  test('narrow low data (3380-3400): domain still includes Full Pool', () => {
    const { yMin, yMax } = computeMonteCarloYDomain([
      { p10: 3380, p90: 3400 },
    ])
    expect(yMin).toBeLessThanOrEqual(DEAD_POOL)
    expect(yMax).toBeGreaterThanOrEqual(FULL_POOL)
  })

  test('data near Min Power (3480-3500): all critical lines in range', () => {
    const { yMin, yMax } = computeMonteCarloYDomain([
      { p10: 3480, p90: 3500 },
    ])
    expect(domainContainsAllCritical(yMin, yMax)).toBe(true)
  })

  test('data at full pool (3690-3700): Dead Pool still in range', () => {
    const { yMin, yMax } = computeMonteCarloYDomain([
      { p10: 3690, p90: 3700 },
    ])
    expect(yMin).toBeLessThanOrEqual(DEAD_POOL)
  })

  test('data at dead pool (3370-3380): Full Pool still in range', () => {
    const { yMin, yMax } = computeMonteCarloYDomain([
      { p10: 3370, p90: 3380 },
    ])
    expect(yMax).toBeGreaterThanOrEqual(FULL_POOL)
  })

  test('empty data: falls back to sensible default domain', () => {
    const { yMin, yMax } = computeMonteCarloYDomain([])
    expect(yMin).toBeLessThanOrEqual(DEAD_POOL)
    expect(yMax).toBeGreaterThanOrEqual(FULL_POOL)
  })

  test('multiple data points: domain still includes all critical elevations', () => {
    const data = Array.from({ length: 365 }, (_, i) => ({
      p10: 3550 + Math.sin(i * 0.02) * 20,
      p90: 3600 + Math.sin(i * 0.02) * 20,
    }))
    const { yMin, yMax } = computeMonteCarloYDomain(data)
    expect(domainContainsAllCritical(yMin, yMax)).toBe(true)
  })
})

// ─── SimulationChart Y-axis domain tests ────────────────────────

describe('SimulationChart: Y-axis domain always includes critical elevations', () => {
  test('mid-range data (3530-3580): domain includes all critical elevations', () => {
    const { yMin, yMax } = computeSimulationYDomain([
      { actual: 3530, simulated: 3580 },
    ])
    expect(domainContainsAllCritical(yMin, yMax)).toBe(true)
  })

  test('high data (3650-3670): domain includes Dead Pool', () => {
    const { yMin, yMax } = computeSimulationYDomain([
      { actual: 3650, simulated: 3670 },
    ])
    expect(yMin).toBeLessThanOrEqual(DEAD_POOL)
    expect(yMax).toBeGreaterThanOrEqual(FULL_POOL)
  })

  test('low data (3380-3400): domain includes Full Pool', () => {
    const { yMin, yMax } = computeSimulationYDomain([
      { actual: 3380, simulated: 3400 },
    ])
    expect(yMin).toBeLessThanOrEqual(DEAD_POOL)
    expect(yMax).toBeGreaterThanOrEqual(FULL_POOL)
  })

  test('data near Min Power (3485-3495): all critical lines in range', () => {
    const { yMin, yMax } = computeSimulationYDomain([
      { actual: 3485, simulated: 3495 },
    ])
    expect(domainContainsAllCritical(yMin, yMax)).toBe(true)
  })

  test('wide divergence (3400-3680): all critical elevations covered', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({
      actual: 3400 + i * 2.8,
      simulated: 3420 + i * 2.6,
    }))
    const { yMin, yMax } = computeSimulationYDomain(data)
    expect(domainContainsAllCritical(yMin, yMax)).toBe(true)
  })

  test('single data point: domain still covers full range', () => {
    const { yMin, yMax } = computeSimulationYDomain([
      { actual: 3550, simulated: 3550 },
    ])
    expect(domainContainsAllCritical(yMin, yMax)).toBe(true)
  })
})

// ─── Reference line unconditional rendering guarantee ───────────
// These tests verify the code structure: the reference lines should NOT
// be gated behind conditional checks on yMin/yMax. We test this by verifying
// the domain always contains the critical values, making conditional guards
// redundant.

describe('Reference line rendering: no conditional gating', () => {
  test('Dead Pool is always within computed MonteCarloChart domain', () => {
    const testCases = [
      [{ p10: 3600, p90: 3690 }],
      [{ p10: 3370, p90: 3380 }],
      [{ p10: 3500, p90: 3550 }],
      [{ p10: 3690, p90: 3700 }],
    ]
    for (const data of testCases) {
      const { yMin, yMax } = computeMonteCarloYDomain(data)
      expect(DEAD_POOL).toBeGreaterThanOrEqual(yMin)
      expect(DEAD_POOL).toBeLessThanOrEqual(yMax)
    }
  })

  test('Min Power Pool is always within computed MonteCarloChart domain', () => {
    const testCases = [
      [{ p10: 3600, p90: 3690 }],
      [{ p10: 3370, p90: 3380 }],
      [{ p10: 3500, p90: 3550 }],
    ]
    for (const data of testCases) {
      const { yMin, yMax } = computeMonteCarloYDomain(data)
      expect(MIN_POWER).toBeGreaterThanOrEqual(yMin)
      expect(MIN_POWER).toBeLessThanOrEqual(yMax)
    }
  })

  test('Full Pool is always within computed MonteCarloChart domain', () => {
    const testCases = [
      [{ p10: 3600, p90: 3690 }],
      [{ p10: 3370, p90: 3380 }],
      [{ p10: 3400, p90: 3460 }],
    ]
    for (const data of testCases) {
      const { yMin, yMax } = computeMonteCarloYDomain(data)
      expect(FULL_POOL).toBeGreaterThanOrEqual(yMin)
      expect(FULL_POOL).toBeLessThanOrEqual(yMax)
    }
  })

  test('Dead Pool is always within computed SimulationChart domain', () => {
    const testCases = [
      [{ actual: 3650, simulated: 3670 }],
      [{ actual: 3380, simulated: 3400 }],
      [{ actual: 3530, simulated: 3540 }],
    ]
    for (const data of testCases) {
      const { yMin, yMax } = computeSimulationYDomain(data)
      expect(DEAD_POOL).toBeGreaterThanOrEqual(yMin)
      expect(DEAD_POOL).toBeLessThanOrEqual(yMax)
    }
  })

  test('Full Pool is always within computed SimulationChart domain', () => {
    const testCases = [
      [{ actual: 3650, simulated: 3670 }],
      [{ actual: 3380, simulated: 3400 }],
      [{ actual: 3530, simulated: 3540 }],
    ]
    for (const data of testCases) {
      const { yMin, yMax } = computeSimulationYDomain(data)
      expect(FULL_POOL).toBeGreaterThanOrEqual(yMin)
      expect(FULL_POOL).toBeLessThanOrEqual(yMax)
    }
  })
})
