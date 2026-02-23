import { describe, it, expect } from 'vitest'
import type { SharedSimConfig } from '@/components/projections/MonteCarloSimulator'
import { POLICY_PRESETS, type OutflowPolicy, type InflowScenario } from '@/lib/monte-carlo'

describe('SharedSimConfig', () => {
  it('contains all required fields for a simple policy', () => {
    const config: SharedSimConfig = {
      policy: POLICY_PRESETS[0],
      yearsToProject: 10,
      inflowScenario: 'last30',
      startMode: 'today',
    }
    expect(config.policy).toBeDefined()
    expect(config.yearsToProject).toBe(10)
    expect(config.inflowScenario).toBe('last30')
    expect(config.startMode).toBe('today')
    expect(config.customElevation).toBeUndefined()
  })

  it('includes customElevation when startMode is custom', () => {
    const config: SharedSimConfig = {
      policy: POLICY_PRESETS[0],
      yearsToProject: 5,
      inflowScenario: 'last20',
      startMode: 'custom',
      customElevation: 3550,
    }
    expect(config.startMode).toBe('custom')
    expect(config.customElevation).toBe(3550)
  })

  it('serializes and deserializes through JSON correctly', () => {
    const tieredPolicy = POLICY_PRESETS.find((p) => p.type === 'tiered')!
    const config: SharedSimConfig = {
      policy: tieredPolicy,
      yearsToProject: 15,
      inflowScenario: 'full',
      startMode: 'custom',
      customElevation: 3600,
    }

    const serialized = JSON.stringify(config)
    const deserialized: SharedSimConfig = JSON.parse(serialized)

    expect(deserialized.policy.type).toBe('tiered')
    expect(deserialized.policy.name).toBe(tieredPolicy.name)
    expect(deserialized.policy.tiers).toEqual(tieredPolicy.tiers)
    expect(deserialized.yearsToProject).toBe(15)
    expect(deserialized.inflowScenario).toBe('full')
    expect(deserialized.startMode).toBe('custom')
    expect(deserialized.customElevation).toBe(3600)
  })

  it('serializes a simple percent policy correctly', () => {
    const simplePolicy: OutflowPolicy = {
      type: 'simple',
      name: '90% of compact',
      simplePercent: 90,
    }
    const config: SharedSimConfig = {
      policy: simplePolicy,
      yearsToProject: 10,
      inflowScenario: 'last10',
      startMode: 'today',
    }

    const roundTripped: SharedSimConfig = JSON.parse(JSON.stringify(config))
    expect(roundTripped.policy.type).toBe('simple')
    expect(roundTripped.policy.simplePercent).toBe(90)
  })

  it('serializes a percentOfPolicy policy correctly', () => {
    const basePolicy = POLICY_PRESETS.find((p) => p.type === 'tiered')!
    const derivedPolicy: OutflowPolicy = {
      type: 'percentOfPolicy',
      name: '90% of Current Ops',
      basePolicy,
      percent: 90,
    }
    const config: SharedSimConfig = {
      policy: derivedPolicy,
      yearsToProject: 20,
      inflowScenario: 'last30',
      startMode: 'today',
    }

    const roundTripped: SharedSimConfig = JSON.parse(JSON.stringify(config))
    expect(roundTripped.policy.type).toBe('percentOfPolicy')
    expect(roundTripped.policy.percent).toBe(90)
    expect(roundTripped.policy.basePolicy?.type).toBe('tiered')
  })

  it('supports all InflowScenario values', () => {
    const scenarios: InflowScenario[] = ['full', 'last30', 'last20', 'last10']
    for (const scenario of scenarios) {
      const config: SharedSimConfig = {
        policy: POLICY_PRESETS[0],
        yearsToProject: 10,
        inflowScenario: scenario,
        startMode: 'today',
      }
      const parsed = JSON.parse(JSON.stringify(config))
      expect(parsed.inflowScenario).toBe(scenario)
    }
  })

  it('preserves custom user-created policy tiers', () => {
    const customPolicy: OutflowPolicy = {
      type: 'tiered',
      name: 'My Custom Policy',
      tiers: [
        { aboveElevation: 3575, percent: 100 },
        { aboveElevation: 3525, percent: 85 },
        { aboveElevation: 3490, percent: 70 },
        { aboveElevation: 3370, percent: 50 },
      ],
    }
    const config: SharedSimConfig = {
      policy: customPolicy,
      yearsToProject: 10,
      inflowScenario: 'last30',
      startMode: 'today',
    }

    const parsed: SharedSimConfig = JSON.parse(JSON.stringify(config))
    expect(parsed.policy.tiers).toHaveLength(4)
    expect(parsed.policy.tiers![0].aboveElevation).toBe(3575)
    expect(parsed.policy.tiers![0].percent).toBe(100)
    expect(parsed.policy.tiers![3].aboveElevation).toBe(3370)
    expect(parsed.policy.tiers![3].percent).toBe(50)
  })
})

describe('Share API request/response shape', () => {
  it('POST body matches expected shape', () => {
    const requestBody = {
      config: {
        policy: POLICY_PRESETS[0],
        yearsToProject: 10,
        inflowScenario: 'last30' as InflowScenario,
        startMode: 'today' as const,
      },
    }
    expect(requestBody.config).toBeDefined()
    expect(typeof requestBody.config.yearsToProject).toBe('number')
    expect(typeof requestBody.config.inflowScenario).toBe('string')
    expect(typeof requestBody.config.startMode).toBe('string')
  })

  it('validates required fields', () => {
    const requiredFields = ['yearsToProject', 'inflowScenario', 'startMode']
    const config = {
      policy: POLICY_PRESETS[0],
      yearsToProject: 10,
      inflowScenario: 'last30',
      startMode: 'today',
    }
    for (const field of requiredFields) {
      expect(field in config).toBe(true)
    }
  })
})
