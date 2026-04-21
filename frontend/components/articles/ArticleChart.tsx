'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  AreaChart,
  ComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'

interface SeriesSpec {
  dataKey: string
  type?: 'line' | 'bar' | 'area'
  color: string
  name?: string
}

interface ReferenceLineSpec {
  y: number
  label: string
  color: string
  strokeDasharray?: string
}

export interface ChartSpec {
  chartType: 'line' | 'bar' | 'area' | 'composed'
  title: string
  data: Record<string, any>[]
  series: SeriesSpec[]
  xKey: string
  xType?: 'date' | 'number' | 'category'
  yLabel?: string
  referenceLines?: ReferenceLineSpec[]
  caption?: string
}

function formatDate(value: string | number): string {
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}/)) {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
  return String(value)
}

function formatTooltipDate(value: string | number): string {
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}/)) {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }
  return String(value)
}

export default function ArticleChart({ spec }: { spec: ChartSpec }) {
  const [isMobile, setIsMobile] = useState(true)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const ChartComponent = useMemo(() => {
    switch (spec.chartType) {
      case 'bar': return BarChart
      case 'area': return AreaChart
      case 'composed': return ComposedChart
      default: return LineChart
    }
  }, [spec.chartType])

  const yDomain = useMemo(() => {
    const allValues = spec.data.flatMap(d =>
      spec.series.map(s => d[s.dataKey]).filter((v): v is number => typeof v === 'number')
    )
    const refValues = (spec.referenceLines || []).map(r => r.y)
    const all = [...allValues, ...refValues]
    if (all.length === 0) return ['auto', 'auto'] as [string, string]
    const min = Math.min(...all)
    const max = Math.max(...all)
    const pad = (max - min) * 0.05
    return [Math.floor(min - pad), Math.ceil(max + pad)] as [number, number]
  }, [spec.data, spec.series, spec.referenceLines])

  if (!spec.data || spec.data.length === 0) {
    return null
  }

  const hasRefLines = (spec.referenceLines?.length ?? 0) > 0
  const margin = isMobile
    ? { top: 10, right: hasRefLines ? 80 : 10, left: 0, bottom: 0 }
    : { top: 10, right: hasRefLines ? 120 : 30, left: 20, bottom: 10 }

  const isDateAxis = spec.xType === 'date' || (!spec.xType && spec.data[0]?.[spec.xKey]?.match?.(/^\d{4}-\d{2}/))

  return (
    <figure className="my-8">
      {spec.title && (
        <figcaption className="text-sm font-medium text-gray-700 mb-3 text-center">
          {spec.title}
        </figcaption>
      )}
      <div className={isMobile ? 'h-[280px]' : 'h-[400px]'}>
        <ResponsiveContainer width="100%" height="100%">
          <ChartComponent data={spec.data} margin={margin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" strokeOpacity={0.8} />
            <XAxis
              dataKey={spec.xKey}
              tickFormatter={isDateAxis ? formatDate : undefined}
              tick={{ fontSize: isMobile ? 9 : 11, fill: '#6b7280' }}
              angle={isMobile ? -45 : 0}
              textAnchor={isMobile ? 'end' : 'middle'}
              height={isMobile ? 60 : 40}
            />
            <YAxis
              domain={yDomain}
              tick={{ fontSize: isMobile ? 9 : 11, fill: '#6b7280' }}
              width={isMobile ? 40 : 60}
              label={spec.yLabel && !isMobile ? {
                value: spec.yLabel,
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 11, fill: '#9ca3af' },
              } : undefined}
            />
            <Tooltip
              labelFormatter={isDateAxis ? formatTooltipDate : undefined}
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: isMobile ? '10px' : '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                padding: isMobile ? '6px' : '8px',
              }}
            />
            {spec.series.length > 1 && (
              <Legend
                verticalAlign="top"
                height={36}
                wrapperStyle={{ fontSize: isMobile ? '10px' : '12px' }}
              />
            )}

            {spec.series.map((s) => {
              const seriesType = s.type || (spec.chartType === 'bar' ? 'bar' : spec.chartType === 'area' ? 'area' : 'line')

              if (seriesType === 'bar') {
                return (
                  <Bar
                    key={s.dataKey}
                    dataKey={s.dataKey}
                    fill={s.color}
                    name={s.name || s.dataKey}
                    radius={[2, 2, 0, 0]}
                  />
                )
              }
              if (seriesType === 'area') {
                return (
                  <Area
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    stroke={s.color}
                    fill={s.color}
                    fillOpacity={0.15}
                    strokeWidth={2}
                    name={s.name || s.dataKey}
                    dot={false}
                  />
                )
              }
              return (
                <Line
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  name={s.name || s.dataKey}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              )
            })}

            {(spec.referenceLines || []).map((ref, i) => (
              <ReferenceLine
                key={i}
                y={ref.y}
                stroke={ref.color}
                strokeWidth={1.5}
                strokeDasharray={ref.strokeDasharray || '5 5'}
                label={{
                  value: ref.label,
                  // Always anchor to the right side of the chart — the margin
                  // already reserves space for labels (80px mobile / 120px
                  // desktop when reference lines are present). insideTopLeft
                  // on mobile was stacking labels over the plotted data.
                  position: 'right',
                  fill: ref.color,
                  fontSize: isMobile ? 9 : 11,
                }}
              />
            ))}
          </ChartComponent>
        </ResponsiveContainer>
      </div>
      {spec.caption && (
        <p className="text-xs text-gray-400 mt-2 text-center italic font-light">
          {spec.caption}
        </p>
      )}
    </figure>
  )
}
