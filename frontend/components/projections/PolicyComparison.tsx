'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import {
  POLICY_PRESETS,
  COMPACT_RELEASE_AF,
  type OutflowPolicy,
  type MonteCarloResult,
  type InflowScenario,
} from '@/lib/monte-carlo'
import type { WorkerResponse } from '@/workers/monte-carlo.worker'
import { parseLocalDate, formatDateString } from '@/lib/date-utils'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Loader2, Trophy, Medal, Award } from 'lucide-react'

const COMPARE_COLORS = [
  '#0d7377', '#e11d48', '#7c3aed', '#ca8a04',
  '#0284c7', '#16a34a', '#dc2626',
]

function pctToMaf(pct: number): number {
  return (COMPACT_RELEASE_AF * pct) / 100 / 1_000_000
}

interface PolicyComparisonProps {
  inflowScenario: InflowScenario
  startMode: 'today' | 'custom'
  customElevation: number
  favoriteRamps: Array<{ name: string; elevation: number }>
}

interface CompareResult {
  policy: OutflowPolicy
  result: MonteCarloResult
  color: string
}

export default function PolicyComparison({
  inflowScenario,
  startMode,
  customElevation,
  favoriteRamps,
}: PolicyComparisonProps) {
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    POLICY_PRESETS.filter((p) => p.type === 'tiered').forEach((p) => initial.add(p.name))
    return initial
  })
  const [results, setResults] = useState<CompareResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const workersRef = useRef<Worker[]>([])

  useEffect(() => {
    return () => {
      workersRef.current.forEach((w) => w.terminate())
    }
  }, [])

  const togglePolicy = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const runComparison = useCallback(async () => {
    const policies = POLICY_PRESETS.filter((p) => selected.has(p.name))
    if (policies.length < 2) return

    setIsRunning(true)
    setProgress(0)
    setResults([])

    workersRef.current.forEach((w) => w.terminate())
    workersRef.current = []

    try {
      const startParam = startMode === 'custom' ? `elevation:${customElevation}` : 'today'
      const res = await fetch(`/api/projections?start=${encodeURIComponent(startParam)}`)
      if (!res.ok) throw new Error('Failed to fetch data')
      const data = await res.json()

      let completed = 0
      const all = await Promise.all(
        policies.map(
          (policy, idx) =>
            new Promise<CompareResult>((resolve, reject) => {
              const worker = new Worker(
                new URL('../../workers/monte-carlo.worker.ts', import.meta.url)
              )
              workersRef.current.push(worker)

              worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
                if (e.data.type === 'result') {
                  completed++
                  setProgress(Math.round((completed / policies.length) * 100))
                  resolve({
                    policy,
                    result: e.data.result as MonteCarloResult,
                    color: COMPARE_COLORS[idx % COMPARE_COLORS.length],
                  })
                  worker.terminate()
                } else {
                  reject(new Error(e.data.error))
                  worker.terminate()
                }
              }
              worker.onerror = () => {
                reject(new Error('Worker failed'))
                worker.terminate()
              }

              worker.postMessage({
                config: {
                  startDate: data.startDate,
                  startElevation: data.startElevation,
                  startContent: data.startContent,
                  yearsToProject: 10,
                  iterations: 1000,
                  policy,
                  recentYearWeight: 2.0,
                  recentYearCutoff: 20,
                  inflowScenario,
                  currentWaterYearInflowToDate: data.currentWaterYearInflowToDate,
                  snowpackData: data.snowpackData ?? undefined,
                },
                historicalPatterns: data.patterns,
                storageCapacity: data.storageCapacity,
                ramps: favoriteRamps,
              })
            })
        )
      )

      setResults(all)
    } catch (err: any) {
      console.error('Comparison failed:', err)
    } finally {
      setIsRunning(false)
      workersRef.current = []
    }
  }, [selected, startMode, customElevation, inflowScenario, favoriteRamps])

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 hover:bg-gray-50 transition-colors"
      >
        <h3 className="text-lg font-light text-gray-900">Compare Policies</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Run multiple policies side-by-side to see which performs best
        </p>
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-light text-gray-900">Compare Policies</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Select 2+ policies to compare over 10 years
          </p>
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Collapse
        </button>
      </div>

      {/* Policy checkboxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {POLICY_PRESETS.map((p, idx) => (
          <label
            key={p.name}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors cursor-pointer text-sm ${
              selected.has(p.name)
                ? 'border-teal-300 bg-teal-50/50'
                : 'border-gray-100 hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(p.name)}
              onChange={() => togglePolicy(p.name)}
              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: COMPARE_COLORS[idx % COMPARE_COLORS.length] }}
            />
            <span className="text-gray-700 truncate">{p.name}</span>
          </label>
        ))}
      </div>

      <button
        onClick={runComparison}
        disabled={isRunning || selected.size < 2}
        className="w-full py-2.5 bg-gray-900 text-white text-sm font-light rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isRunning ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Running {selected.size} simulations... {progress}%
          </>
        ) : (
          `Compare ${selected.size} Policies`
        )}
      </button>

      {/* Results */}
      {results.length > 0 && (
        <>
          <ComparisonSummary results={results} />

          <details className="group border-t border-gray-100 pt-3">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 transition-colors font-medium select-none">
              Charts &amp; detailed data
            </summary>
            <div className="mt-3 space-y-4">
              <ComparisonChart results={results} />
              <ComparisonTable results={results} />
            </div>
          </details>
        </>
      )}
    </div>
  )
}

function findMedianCrossing(
  dailyPercentiles: Array<{ date: string; p50: number }>,
  threshold: number,
  direction: 'below' | 'above'
): string | null {
  if (dailyPercentiles.length < 2) return null
  for (let i = 1; i < dailyPercentiles.length; i++) {
    const crossed = direction === 'below'
      ? dailyPercentiles[i].p50 < threshold
      : dailyPercentiles[i].p50 > threshold
    if (crossed) {
      const startDate = new Date(dailyPercentiles[0].date)
      const crossDate = new Date(dailyPercentiles[i].date)
      const diffMs = crossDate.getTime() - startDate.getTime()
      const months = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44))
      if (months < 1) return 'weeks'
      if (months < 12) return `~${months}mo`
      const years = months / 12
      return years < 2 ? `~${months}mo` : `~${years.toFixed(1)}yr`
    }
  }
  return null
}

function getDirection(result: MonteCarloResult): 'rising' | 'falling' | 'stable' {
  const dp = result.dailyPercentiles
  if (dp.length < 2) return 'stable'
  const net = dp[dp.length - 1].p50 - dp[0].p50
  return net > 5 ? 'rising' : net < -5 ? 'falling' : 'stable'
}

function ComparisonSummary({ results }: { results: CompareResult[] }) {
  const sorted = [...results].sort(
    (a, b) => b.result.summary.medianEndingElevation - a.result.summary.medianEndingElevation
  )

  const rankIcon = (i: number) => {
    if (i === 0) return <Trophy className="w-4 h-4 text-amber-500" />
    if (i === 1) return <Medal className="w-4 h-4 text-gray-400" />
    if (i === 2) return <Award className="w-4 h-4 text-amber-700" />
    return <span className="w-4 h-4 text-center text-[10px] text-gray-400 font-medium">{i + 1}</span>
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-700">Side-by-side summary</h4>

      {sorted.map((r, i) => {
        const s = r.result.summary
        const tp = r.result.thresholdProbabilities
        const dp = r.result.dailyPercentiles
        const dir = getDirection(r.result)
        const net = dp.length > 1 ? dp[dp.length - 1].p50 - dp[0].p50 : 0

        const powerTimeline = tp.stayAboveMinPower < 90
          ? findMedianCrossing(dp, 3490, 'below') : null
        const healthyTimeline = tp.stayAbove3525 < 90
          ? findMedianCrossing(dp, 3525, 'below') : null
        const deadPoolTimeline = tp.stayAboveDeadPool < 90
          ? findMedianCrossing(dp, 3370, 'below') : null

        const borderColor = i === 0 ? 'border-teal-200 bg-teal-50/30' : 'border-gray-100'

        return (
          <div key={r.policy.name} className={`rounded-xl border ${borderColor} p-4 space-y-3`}>
            {/* Policy header */}
            <div className="flex items-center gap-2">
              {rankIcon(i)}
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: r.color }}
              />
              <h5 className="text-sm font-semibold text-gray-900 flex-1 truncate">
                {r.policy.name}
              </h5>
              {i === 0 && (
                <span className="text-[10px] font-medium text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                  Best outcome
                </span>
              )}
            </div>

            {/* Where the lake ends up */}
            <div className="text-sm text-gray-600 leading-relaxed">
              After 10 years, the lake is most likely around{' '}
              <span className="font-semibold text-gray-900">{s.medianEndingElevation.toFixed(0)} ft</span>
              {' '}(range: {s.p10EndingElevation.toFixed(0)}–{s.p90EndingElevation.toFixed(0)} ft).{' '}
              {dir === 'rising' ? (
                <span className="text-emerald-700 font-medium">Trending up {Math.abs(net).toFixed(0)} ft.</span>
              ) : dir === 'falling' ? (
                <span className="text-red-700 font-medium">Trending down {Math.abs(net).toFixed(0)} ft.</span>
              ) : (
                <span className="text-gray-500 font-medium">Roughly stable.</span>
              )}
            </div>

            {/* Key thresholds - compact grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <ThresholdPill
                label="Power pool"
                probability={tp.stayAboveMinPower}
                timeline={powerTimeline}
              />
              <ThresholdPill
                label="Healthy (3,525 ft)"
                probability={tp.stayAbove3525}
                timeline={healthyTimeline}
              />
              <ThresholdPill
                label="Above dead pool"
                probability={tp.stayAboveDeadPool}
                timeline={deadPoolTimeline}
              />
              <ThresholdPill
                label="Recovery (3,660 ft)"
                probability={tp.reachRecoveryTarget}
                inverted
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ThresholdPill({
  label,
  probability,
  timeline,
  inverted = false,
}: {
  label: string
  probability: number
  timeline?: string | null
  inverted?: boolean
}) {
  const p = probability
  const good = inverted ? p > 50 : p >= 70

  const verdict = p === 100 ? 'Yes' : p === 0 ? 'No'
    : p >= 90 ? 'Very likely' : p >= 70 ? 'Likely'
    : p >= 40 ? 'Uncertain' : p > 0 ? 'Unlikely' : 'No'

  const colorClass = good
    ? p >= 90 ? 'text-emerald-700 bg-emerald-50' : 'text-teal-700 bg-teal-50'
    : p >= 40 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'

  return (
    <div className={`rounded-lg px-2.5 py-2 ${colorClass}`}>
      <p className="text-[10px] font-medium opacity-70 leading-tight">{label}</p>
      <p className="text-sm font-semibold leading-tight mt-0.5">{verdict}</p>
      {p > 0 && p < 100 && (
        <p className="text-[10px] opacity-60">{p}%</p>
      )}
      {timeline && (
        <p className="text-[10px] font-medium opacity-80 mt-0.5">Drops {timeline}</p>
      )}
    </div>
  )
}

function ComparisonChart({ results }: { results: CompareResult[] }) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const chartData = useMemo(() => {
    if (results.length === 0) return []

    const baseData = results[0].result.dailyPercentiles
    return baseData.map((d, i) => {
      const row: any = {
        timestamp: parseLocalDate(d.date).getTime(),
        date: d.date,
      }
      results.forEach((r) => {
        const pt = r.result.dailyPercentiles[i]
        if (pt) row[r.policy.name] = pt.p50
      })
      return row
    })
  }, [results])

  const { yMin, yMax } = useMemo(() => {
    if (results.length === 0) return { yMin: 3400, yMax: 3700 }
    const allVals = results.flatMap((r) =>
      r.result.dailyPercentiles.flatMap((d) => [d.p10, d.p90])
    )
    const min = Math.min(...allVals)
    const max = Math.max(...allVals)
    const pad = (max - min) * 0.1 || 20
    return {
      yMin: Math.floor((min - pad) / 10) * 10,
      yMax: Math.ceil((max + pad) / 10) * 10,
    }
  }, [results])

  const xAxisTicks = useMemo(() => {
    if (chartData.length === 0) return []
    const startTime = chartData[0].timestamp
    const endTime = chartData[chartData.length - 1].timestamp
    const ticks: number[] = []
    const d = new Date(startTime)
    let currentDate = new Date(d.getFullYear(), 0, 1)
    while (currentDate.getTime() <= endTime) {
      const ts = currentDate.getTime()
      if (ts >= startTime && ts <= endTime) ticks.push(ts)
      currentDate.setFullYear(currentDate.getFullYear() + 1)
    }
    if (ticks.length === 0 || ticks[ticks.length - 1] !== endTime) ticks.push(endTime)
    return ticks
  }, [chartData])

  return (
    <div>
      <h4 className="text-sm font-light text-gray-600 mb-2">Median Elevation Projections</h4>
      <div className="h-[350px] sm:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={isMobile ? { top: 5, right: 10, left: 20, bottom: 0 } : { top: 5, right: 30, left: 40, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" strokeOpacity={0.8} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              ticks={isMobile ? xAxisTicks.filter((_, i) => i % 2 === 0) : xAxisTicks}
              tickFormatter={(ts) => new Date(ts).getFullYear().toString()}
              tick={{ fontSize: isMobile ? 9 : 11, fill: '#888' }}
              tickLine={{ stroke: '#ccc' }}
              axisLine={{ stroke: '#ccc' }}
              height={isMobile ? 50 : 40}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: isMobile ? 9 : 11, fill: '#888' }}
              tickLine={{ stroke: '#ccc' }}
              axisLine={{ stroke: '#ccc' }}
              tickFormatter={(v) => v.toFixed(0)}
              label={isMobile ? undefined : { value: 'Elevation (ft)', angle: -90, position: 'insideLeft', offset: -30, style: { textAnchor: 'middle', fill: '#888', fontSize: 12 } }}
              width={isMobile ? 35 : 50}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
              labelFormatter={(ts: number) => {
                const d = chartData.find((c) => c.timestamp === ts)
                return d ? formatDateString(d.date, { month: 'short', day: 'numeric', year: 'numeric' }) : ''
              }}
              formatter={(value: number, name: string) => [`${value.toFixed(1)} ft`, name]}
            />
            <Legend
              verticalAlign="top"
              height={isMobile ? 60 : 36}
              wrapperStyle={{ fontSize: isMobile ? '9px' : '11px' }}
            />

            {yMin <= 3490 && (
              <ReferenceLine y={3490} stroke="#f59e0b" strokeDasharray="5 5" strokeOpacity={0.7}
                label={isMobile ? undefined : { value: 'Min Power', position: 'right', fill: '#f59e0b', fontSize: 10 }}
              />
            )}
            {yMin <= 3370 && (
              <ReferenceLine y={3370} stroke="#ef4444" strokeDasharray="5 5" strokeOpacity={0.7}
                label={isMobile ? undefined : { value: 'Dead Pool', position: 'right', fill: '#ef4444', fontSize: 10 }}
              />
            )}

            {results.map((r) => (
              <Line
                key={r.policy.name}
                type="monotone"
                dataKey={r.policy.name}
                stroke={r.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ComparisonTable({ results }: { results: CompareResult[] }) {
  const sorted = [...results].sort(
    (a, b) => b.result.summary.medianEndingElevation - a.result.summary.medianEndingElevation
  )

  return (
    <div>
      <h4 className="text-sm font-light text-gray-600 mb-2">Comparison Summary (10 years)</h4>
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-2 font-medium text-gray-500">Policy</th>
              <th className="text-right py-2 px-2 font-medium text-gray-500">Median End</th>
              <th className="text-right py-2 px-2 font-medium text-gray-500">10th–90th</th>
              <th className="text-right py-2 px-2 font-medium text-gray-500 hidden sm:table-cell">Above 3,490</th>
              <th className="text-right py-2 px-2 font-medium text-gray-500 hidden sm:table-cell">Above 3,525</th>
              <th className="text-right py-2 px-2 font-medium text-gray-500">Above Dead Pool</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const s = r.result.summary
              const tp = r.result.thresholdProbabilities
              return (
                <tr key={r.policy.name} className={i === 0 ? 'bg-teal-50/50' : ''}>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: r.color }}
                      />
                      <span className="text-gray-800 truncate max-w-[150px]">{r.policy.name}</span>
                      {i === 0 && <span className="text-[9px] text-teal-600 font-medium ml-1">BEST</span>}
                    </div>
                  </td>
                  <td className="text-right py-2 px-2 font-medium text-gray-900">
                    {s.medianEndingElevation.toFixed(1)} ft
                  </td>
                  <td className="text-right py-2 px-2 text-gray-500">
                    {s.p10EndingElevation.toFixed(0)}–{s.p90EndingElevation.toFixed(0)}
                  </td>
                  <td className="text-right py-2 px-2 text-gray-500 hidden sm:table-cell">
                    {tp.stayAboveMinPower}%
                  </td>
                  <td className="text-right py-2 px-2 text-gray-500 hidden sm:table-cell">
                    {tp.stayAbove3525}%
                  </td>
                  <td className="text-right py-2 px-2 text-gray-500">
                    {tp.stayAboveDeadPool}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
