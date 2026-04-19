'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { DailyPercentile, RampProbability } from '@/lib/monte-carlo'
import type { Phase1Result } from '@/lib/calculations'
import { parseLocalDate, formatDateString } from '@/lib/date-utils'

interface MonteCarloChartProps {
  data: DailyPercentile[]
  phase1Data?: Phase1Result | null
  ramps?: Array<{ name: string; elevation: number }>
  policyTiers?: Array<{ aboveElevation: number; percent: number }>
}

const FULL_POOL = 3700
const DEAD_POOL = 3370
const MIN_POWER = 3490

const RAMP_SHORT_NAMES: Record<string, string> = {
  'Castle Rock Cut-Off': 'The Cut',
  'Castle Rock': 'The Cut',
  'Antelope Point Business Ramp': 'Antelope Pt',
  'Antelope Point Public Ramp': 'Antelope Pub',
  'Bullfrog Main Ramp': 'Bullfrog',
  'Bullfrog Main Launch': 'Bullfrog',
  'Bullfrog North Ramp': 'Bullfrog N',
  'Stateline Launch': 'Stateline',
  'Halls Crossing (use at own risk)': 'Halls Crossing',
}

function shortenRampName(name: string): string {
  return RAMP_SHORT_NAMES[name] ?? name.replace(/ Ramp$/, '').replace(/ \(.*\)$/, '')
}

export default function MonteCarloChart({ data, phase1Data, ramps = [], policyTiers = [] }: MonteCarloChartProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Timestamp of Phase 1/Phase 2 boundary for the vertical marker
  const phase1EndTimestamp = phase1Data
    ? parseLocalDate(phase1Data.endDate).getTime()
    : null

  const chartData = useMemo(() => {
    // Phase 2 (Monte Carlo) data
    const phase2 = data.map((d) => ({
      ...d,
      timestamp: parseLocalDate(d.date).getTime(),
      bandBase: d.p10,
      band10to25: Math.max(0, d.p25 - d.p10),
      band25to75: Math.max(0, d.p75 - d.p25),
      band75to90: Math.max(0, d.p90 - d.p75),
      federalProjection: null as number | null,
    }))

    if (!phase1Data || phase1Data.daily.length === 0) return phase2

    // Phase 1 (deterministic) — sample every 3 days for performance
    const phase1Points = phase1Data.daily
      .filter((_, i) => i % 3 === 0 || i === phase1Data.daily.length - 1)
      .map((d) => {
        const p25 = d.p10 + (d.p50 - d.p10) * 0.4
        const p75 = d.p50 + (d.p90 - d.p50) * 0.4
        return {
          date: d.date,
          p10: d.p10,
          p25,
          p50: d.p50,
          p75,
          p90: d.p90,
          timestamp: parseLocalDate(d.date).getTime(),
          bandBase: d.p10,
          band10to25: Math.max(0, p25 - d.p10),
          band25to75: Math.max(0, p75 - p25),
          band75to90: Math.max(0, d.p90 - p75),
          federalProjection: d.p50,
        }
      })

    return [...phase1Points, ...phase2]
  }, [data, phase1Data])

  const { yMin, yMax } = useMemo(() => {
    if (chartData.length === 0) return { yMin: DEAD_POOL - 20, yMax: FULL_POOL + 20 }
    const allVals = chartData.flatMap((d) => [d.p10, d.p90])
    const min = Math.min(...allVals, DEAD_POOL)
    const max = Math.max(...allVals, FULL_POOL)
    const pad = (max - min) * 0.05 || 20
    return {
      yMin: Math.floor((min - pad) / 10) * 10,
      yMax: Math.ceil((max + pad) / 10) * 10,
    }
  }, [chartData])

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
    if (ticks.length === 0 || ticks[ticks.length - 1] !== endTime) {
      ticks.push(endTime)
    }
    return ticks
  }, [chartData])

  const formatXAxis = (timestamp: number) => {
    if (!timestamp) return ''
    const d = new Date(timestamp)
    if (isNaN(d.getTime())) return ''
    return d.getFullYear().toString()
  }

  const formatTooltipLabel = (value: string | number, payload?: any) => {
    let dateStr: string
    if (typeof value === 'number') {
      if (payload?.[0]?.payload?.date) {
        dateStr = payload[0].payload.date
      } else {
        dateStr = new Date(value).toISOString().split('T')[0]
      }
    } else {
      dateStr = value
    }
    return formatDateString(dateStr, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const rampColors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899']

  const chartMargins = isMobile
    ? { top: 5, right: 60, left: 20, bottom: 0 }
    : { top: 5, right: 100, left: 40, bottom: 20 }

  return (
    <div className="h-[350px] sm:h-[400px] lg:h-[500px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={chartMargins}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" strokeOpacity={0.8} />

          <XAxis
            dataKey="timestamp"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={isMobile ? xAxisTicks.filter((_, i) => i % 2 === 0) : xAxisTicks}
            tickFormatter={formatXAxis}
            tick={{ fontSize: isMobile ? 9 : 11, fill: '#888' }}
            tickLine={{ stroke: '#ccc' }}
            axisLine={{ stroke: '#ccc' }}
            angle={isMobile ? -30 : 0}
            textAnchor={isMobile ? 'end' : 'middle'}
            height={isMobile ? 50 : 40}
          />

          <YAxis
            domain={[yMin, yMax]}
            allowDataOverflow={true}
            tick={{ fontSize: isMobile ? 9 : 11, fill: '#888' }}
            tickLine={{ stroke: '#ccc' }}
            axisLine={{ stroke: '#ccc' }}
            tickFormatter={(v) => v.toFixed(0)}
            label={
              isMobile
                ? undefined
                : {
                    value: 'Elevation (ft)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: -30,
                    style: { textAnchor: 'middle', fill: '#888', fontSize: 12 },
                  }
            }
            width={isMobile ? 35 : 50}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const pt = payload[0]?.payload
              if (!pt) return null
              const rows: [string, string, number][] = [
                ['90th', '#93c5c8', pt.p90],
                ['75th', '#4a90a4', pt.p75],
                ['Median', '#0d7377', pt.p50],
                ['25th', '#4a90a4', pt.p25],
                ['10th', '#93c5c8', pt.p10],
              ]
              return (
                <div style={{
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: isMobile ? '10px' : '12px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  padding: isMobile ? '6px 8px' : '8px 12px',
                }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 500, color: '#374151' }}>
                    {formatTooltipLabel(pt.timestamp, payload)}
                  </p>
                  {rows.map(([label, color, val]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '1px 0' }}>
                      <span style={{
                        display: 'inline-block',
                        width: label === 'Median' ? 14 : 10,
                        height: label === 'Median' ? 3 : 8,
                        borderRadius: 2,
                        backgroundColor: color,
                        opacity: label === 'Median' ? 1 : ['75th', '25th'].includes(label) ? 0.5 : 0.35,
                      }} />
                      <span style={{ color: '#6b7280', minWidth: 44 }}>{label}</span>
                      <span style={{ color: '#111827', fontWeight: label === 'Median' ? 600 : 400 }}>
                        {val.toFixed(1)} ft
                      </span>
                    </div>
                  ))}
                </div>
              )
            }}
          />

          <Legend
            verticalAlign="top"
            height={isMobile ? 50 : 36}
            wrapperStyle={{ fontSize: isMobile ? '9px' : '11px' }}
            content={() => (
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-gray-500 mb-1">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-5 h-[3px] rounded" style={{ backgroundColor: '#0d7377' }} />
                  Median
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-3 rounded-sm border border-gray-200" style={{ backgroundColor: 'rgba(74, 144, 164, 0.3)' }} />
                  25th–75th
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-3 rounded-sm border border-gray-200" style={{ backgroundColor: 'rgba(74, 144, 164, 0.1)' }} />
                  10th–90th
                </span>
              </div>
            )}
          />

          {/* Stacked percentile bands — no white fills so reference lines show through */}
          <Area type="monotone" stackId="bands" dataKey="bandBase" stroke="none" fill="transparent" fillOpacity={0} legendType="none" isAnimationActive={false} />
          <Area type="monotone" stackId="bands" dataKey="band10to25" stroke="none" fill="#4a90a4" fillOpacity={0.12} legendType="none" isAnimationActive={false} />
          <Area type="monotone" stackId="bands" dataKey="band25to75" stroke="none" fill="#4a90a4" fillOpacity={0.25} legendType="none" isAnimationActive={false} />
          <Area type="monotone" stackId="bands" dataKey="band75to90" stroke="none" fill="#4a90a4" fillOpacity={0.12} legendType="none" isAnimationActive={false} />

          {/* Critical reference lines — always visible */}
          <ReferenceLine
            y={MIN_POWER}
            stroke="#f59e0b"
            strokeDasharray="5 5"
            strokeOpacity={0.7}
            label={{
              value: isMobile ? 'Min Power' : 'Min Power Pool',
              position: isMobile ? 'insideTopLeft' : 'right',
              fill: '#f59e0b',
              fontSize: isMobile ? 9 : 11,
            }}
          />
          <ReferenceLine
            y={DEAD_POOL}
            stroke="#ef4444"
            strokeDasharray="5 5"
            strokeOpacity={0.7}
            label={{
              value: 'Dead Pool',
              position: isMobile ? 'insideTopLeft' : 'right',
              fill: '#ef4444',
              fontSize: isMobile ? 9 : 11,
            }}
          />
          <ReferenceLine
            y={FULL_POOL}
            stroke="#3b82f6"
            strokeDasharray="5 5"
            strokeOpacity={0.7}
            label={{
              value: 'Full Pool',
              position: isMobile ? 'insideTopLeft' : 'right',
              fill: '#3b82f6',
              fontSize: isMobile ? 9 : 11,
            }}
          />

          {/* Ramp reference lines */}
          {ramps.map((ramp, i) => {
            if (ramp.elevation < yMin || ramp.elevation > yMax) return null
            const color = rampColors[i % rampColors.length]
            const shortName = shortenRampName(ramp.name)
            return (
              <ReferenceLine
                key={ramp.name}
                y={ramp.elevation}
                stroke={color}
                strokeDasharray="3 3"
                strokeOpacity={0.5}
                label={{
                  value: `${shortName} ${ramp.elevation}ft`,
                  position: 'right',
                  fill: color,
                  fontSize: isMobile ? 8 : 10,
                }}
              />
            )
          })}

          {/* Policy tier boundaries */}
          {policyTiers
            .filter((t) => t.aboveElevation > 0 && t.aboveElevation >= yMin && t.aboveElevation <= yMax)
            .map((tier) => (
              <ReferenceLine
                key={`tier-${tier.aboveElevation}`}
                y={tier.aboveElevation}
                stroke="#6366f1"
                strokeDasharray="2 4"
                strokeOpacity={0.4}
                label={{
                  value: `${tier.percent}%`,
                  position: 'left',
                  fill: '#6366f1',
                  fontSize: isMobile ? 8 : 10,
                  fontWeight: 600,
                  offset: isMobile ? 2 : 6,
                }}
              />
            ))}

          {/* 10th percentile line */}
          <Line
            type="monotone"
            dataKey="p10"
            stroke="#93c5c8"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="p10"
            legendType="none"
            isAnimationActive={false}
          />

          {/* 90th percentile line */}
          <Line
            type="monotone"
            dataKey="p90"
            stroke="#93c5c8"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="p90"
            legendType="none"
            isAnimationActive={false}
          />

          {/* Median line (solid, distinct color) */}
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#0d7377"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: '#0d7377' }}
            name="p50"
            legendType="none"
            isAnimationActive={false}
          />

          {/* Phase 1 federal projection overlay line */}
          {phase1Data && (
            <Line
              type="monotone"
              dataKey="federalProjection"
              stroke="#1d4ed8"
              strokeWidth={2.5}
              dot={false}
              name="Federal Projection"
              isAnimationActive={false}
              connectNulls={false}
            />
          )}

          {/* Sep 30 vertical marker — Phase 1/Phase 2 boundary */}
          {phase1EndTimestamp && (
            <ReferenceLine
              x={phase1EndTimestamp}
              stroke="#6366f1"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              label={{
                value: 'Federal Release Period Ends',
                position: isMobile ? 'insideTopLeft' : 'top',
                fill: '#6366f1',
                fontSize: isMobile ? 9 : 11,
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
