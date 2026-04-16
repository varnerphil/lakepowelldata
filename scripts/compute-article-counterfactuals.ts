/**
 * Compute historical counterfactuals for Article 0 ("The Real Problem Isn't
 * Drought — It's Math").
 *
 * Replays actual inflows from 1996 onward under alternate release policies
 * (actual × 95%, 93%, 90%, 85%) to show where Lake Powell would be today if
 * we had released a bit less water over the last 30 years.
 *
 * Also computes the cumulative evaporation gap — the total AF lost to evap
 * that doesn't appear on anyone's operational ledger.
 *
 * Output:
 *   scripts/article-data/counterfactuals.json
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/compute-article-counterfactuals.ts
 */

import { Pool } from 'pg'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

import { simulateOutflow } from '../frontend/lib/calculations'
import type {
  WaterMeasurement,
  ElevationStorageCapacity,
} from '../frontend/lib/db'

const START_DATE = '1996-01-01'
const SCENARIOS_PCT = [100, 95, 93, 90, 85] // 100 = actuals (sanity check), others = counterfactuals

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

async function getMeasurements(): Promise<WaterMeasurement[]> {
  const result = await pool.query(
    `SELECT date, elevation, change, content, inflow, outflow
     FROM water_measurements
     WHERE date >= $1
     ORDER BY date ASC`,
    [START_DATE]
  )
  return result.rows.map((row: any) => ({
    date: row.date.toISOString().split('T')[0],
    elevation: parseFloat(row.elevation),
    change: row.change ? parseFloat(row.change) : null,
    content: parseInt(row.content),
    inflow: parseInt(row.inflow),
    outflow: parseInt(row.outflow),
  }))
}

async function getStorageCapacity(): Promise<ElevationStorageCapacity[]> {
  const result = await pool.query(
    'SELECT elevation, storage_at_elevation FROM elevation_storage_capacity ORDER BY elevation'
  )
  return result.rows.map((r: any) => ({
    elevation: parseFloat(r.elevation),
    storage_at_elevation: parseInt(r.storage_at_elevation),
  }))
}

async function main() {
  console.log('=== Computing historical counterfactuals ===\n')

  const [measurements, storageCapacity] = await Promise.all([
    getMeasurements(),
    getStorageCapacity(),
  ])

  if (measurements.length === 0) {
    console.error('No measurements found')
    process.exit(1)
  }

  const actualStart = measurements[0]
  const actualEnd = measurements[measurements.length - 1]
  console.log(`Historical window: ${actualStart.date} → ${actualEnd.date}`)
  console.log(`Actual start: ${actualStart.elevation} ft · ${(actualStart.content / 1_000_000).toFixed(2)} MAF`)
  console.log(`Actual today: ${actualEnd.elevation} ft · ${(actualEnd.content / 1_000_000).toFixed(2)} MAF`)
  console.log(`Drop: ${(actualStart.elevation - actualEnd.elevation).toFixed(1)} ft\n`)

  const scenarios: Array<{
    label: string
    outflowPercent: number
    endingElevation: number
    endingContent: number
    endingDate: string
    differenceFromActualFt: number
    totalActualOutflowAF: number
    totalSimulatedOutflowAF: number
    totalEvaporationAF: number
    dailyCurve: Array<{ date: string; elevation: number }>
  }> = []

  for (const pct of SCENARIOS_PCT) {
    console.log(`Running ${pct}% of actual outflow...`)
    const sim = simulateOutflow(START_DATE, pct, measurements, storageCapacity)
    if (!sim) {
      console.error(`  failed`)
      continue
    }
    const last = sim.dailyData[sim.dailyData.length - 1]

    // Sample daily curve weekly for compact JSON
    const curve: Array<{ date: string; elevation: number }> = []
    const STRIDE = 7
    for (let i = 0; i < sim.dailyData.length; i += STRIDE) {
      const d = sim.dailyData[i]
      curve.push({
        date: d.date,
        elevation: Math.round(d.simulatedElevation * 100) / 100,
      })
    }
    if (curve[curve.length - 1]?.date !== last.date) {
      curve.push({
        date: last.date,
        elevation: Math.round(last.simulatedElevation * 100) / 100,
      })
    }

    const diffFt = sim.summary.simulatedEndingElevation - actualEnd.elevation

    scenarios.push({
      label:
        pct === 100 ? 'Actual (replay at 100%, sanity check)' : `If we had released ${100 - pct}% less`,
      outflowPercent: pct,
      endingElevation: Math.round(sim.summary.simulatedEndingElevation * 100) / 100,
      endingContent: Math.round(sim.summary.simulatedEndingContent),
      endingDate: last.date,
      differenceFromActualFt: Math.round(diffFt * 10) / 10,
      totalActualOutflowAF: Math.round(sim.summary.totalActualOutflow),
      totalSimulatedOutflowAF: Math.round(sim.summary.totalSimulatedOutflow),
      totalEvaporationAF: Math.round(sim.summary.totalEvaporation),
      dailyCurve: curve,
    })

    console.log(
      `  → ${last.date}: ${sim.summary.simulatedEndingElevation.toFixed(1)} ft ` +
      `(${diffFt >= 0 ? '+' : ''}${diffFt.toFixed(1)} ft vs actual)`
    )
  }

  // Annual summary: actual inflow vs outflow for the bar chart
  const annualSummary: Array<{
    waterYear: number
    inflowAF: number
    outflowAF: number
  }> = []
  {
    const byYear = new Map<number, { inflow: number; outflow: number }>()
    for (const m of measurements) {
      const d = new Date(m.date)
      const wy = d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear()
      const CFS_TO_AF = 1.9835
      const entry = byYear.get(wy) ?? { inflow: 0, outflow: 0 }
      entry.inflow += (m.inflow || 0) * CFS_TO_AF
      entry.outflow += (m.outflow || 0) * CFS_TO_AF
      byYear.set(wy, entry)
    }
    for (const [wy, { inflow, outflow }] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
      annualSummary.push({
        waterYear: wy,
        inflowAF: Math.round(inflow),
        outflowAF: Math.round(outflow),
      })
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    startDate: START_DATE,
    actualStart: {
      date: actualStart.date,
      elevation: actualStart.elevation,
      content: actualStart.content,
    },
    actualEnd: {
      date: actualEnd.date,
      elevation: actualEnd.elevation,
      content: actualEnd.content,
    },
    scenarios,
    annualInflowVsOutflow: annualSummary,
  }

  const outDir = join(__dirname, 'article-data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'counterfactuals.json')
  writeFileSync(outPath, JSON.stringify(payload, null, 2))
  console.log(`\nWrote ${outPath}`)

  await pool.end()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
