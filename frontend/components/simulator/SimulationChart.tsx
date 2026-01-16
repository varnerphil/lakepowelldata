'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import type { SimulationDayResult } from '@/lib/calculations'
import type { Ramp } from '@/lib/db'

interface SimulationChartProps {
  data: SimulationDayResult[]
  ramps?: Ramp[]
}

export default function SimulationChart({ data, ramps = [] }: SimulationChartProps) {
  // Sample data for large datasets to improve performance
  const chartData = useMemo(() => {
    const processData = (items: typeof data) => {
      return items.map(d => ({
        date: d.date,
        timestamp: new Date(d.date).getTime(),
        actual: d.actualElevation,
        simulated: d.simulatedElevation
      }))
    }
    
    if (data.length <= 1000) {
      return processData(data)
    }
    
    // Sample every Nth point for large datasets
    const sampleRate = Math.ceil(data.length / 1000)
    return processData(
      data.filter((_, i) => i % sampleRate === 0 || i === data.length - 1)
    )
  }, [data])
  
  // Calculate Y-axis domain
  const { yMin, yMax } = useMemo(() => {
    const allValues = chartData.flatMap(d => [d.actual, d.simulated])
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    const padding = (max - min) * 0.1
    return {
      yMin: Math.floor((min - padding) / 10) * 10,
      yMax: Math.ceil((max + padding) / 10) * 10
    }
  }, [chartData])
  
  // Format date for X-axis (receives timestamp)
  const formatXAxis = (timestamp: number) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return ''
    
    const month = date.getMonth() + 1
    const day = date.getDate()
    const year = date.getFullYear()
    
    // Show year at start of each year
    if (day === 1 && month === 1) {
      return `${year}`
    }
    // Show month/day for 1st of each month
    else if (day === 1) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    // Show day only for mid-month (15th)
    else if (day === 15) {
      return day.toString()
    }
    // For other dates, return empty to let Recharts space them
    return ''
  }
  
  // Format date for tooltip
  const formatTooltipDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Key elevations
  const FULL_POOL = 3700
  const DEADPOOL = 3490
  const MIN_POWER = 3525
  
  // Colors for ramp reference lines
  const rampColors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899']
  
  // Shorten ramp names for display
  const shortenRampName = (name: string, elevation: number): string => {
    let short = name
      // Remove common suffixes
      .replace(/\s+(Ramp|Launch|Cut-Off|Cutoff)$/i, '')
      // Abbreviate common words
      .replace(/\bPoint\b/gi, 'Pt')
      .replace(/\bNorth\b/gi, 'N')
      .replace(/\bSouth\b/gi, 'S')
      .replace(/\bEast\b/gi, 'E')
      .replace(/\bWest\b/gi, 'W')
      .replace(/\bBusiness\b/gi, 'Bus')
      .replace(/\bAuxiliary\b/gi, 'Aux')
      .replace(/\bCrossing\b/gi, 'Xing')
    
    // If still long, truncate and add elevation
    if (short.length > 20) {
      short = short.substring(0, 17) + '...'
    }
    
    // Add elevation in compact format
    return `${short} ${elevation}ft`
  }

  return (
    <div className="h-[300px] sm:h-[400px] lg:h-[500px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 100, left: 60, bottom: 80 }}
        >
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="#e0e0e0" 
            strokeOpacity={0.8}
          />
          
          <XAxis 
            dataKey="timestamp"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatXAxis}
            tick={{ fontSize: 11, fill: '#888' }}
            tickLine={{ stroke: '#ccc' }}
            axisLine={{ stroke: '#ccc' }}
            angle={-45}
            textAnchor="end"
            height={60}
            minTickGap={30}
          />
          
          <YAxis 
            domain={[yMin, yMax]}
            tick={{ fontSize: 11, fill: '#888' }}
            tickLine={{ stroke: '#ccc' }}
            axisLine={{ stroke: '#ccc' }}
            tickFormatter={(value) => value.toFixed(0)}
            label={{ 
              value: 'Elevation (ft)', 
              angle: -90, 
              position: 'insideLeft',
              offset: -45,
              style: { textAnchor: 'middle', fill: '#888', fontSize: 12 }
            }}
            width={55}
          />
          
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '12px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
            labelFormatter={formatTooltipDate}
            formatter={(value: number, name: string) => [
              `${value.toFixed(2)} ft`,
              name === 'actual' ? 'Actual' : 'Simulated'
            ]}
          />
          
          <Legend 
            verticalAlign="top" 
            height={36}
            formatter={(value) => (
              <span style={{ color: '#666', fontSize: '12px', fontWeight: 300 }}>
                {value === 'actual' ? 'Actual Elevation' : 'Simulated Elevation'}
              </span>
            )}
          />
          
          {/* Reference lines for key elevations */}
          {yMin <= MIN_POWER && (
            <ReferenceLine 
              y={MIN_POWER} 
              stroke="#f59e0b" 
              strokeDasharray="5 5"
              strokeOpacity={0.7}
              label={{ 
                value: 'Min Power', 
                position: 'right', 
                fill: '#f59e0b', 
                fontSize: 11 
              }}
            />
          )}
          
          {yMin <= DEADPOOL && (
            <ReferenceLine 
              y={DEADPOOL} 
              stroke="#ef4444" 
              strokeDasharray="5 5"
              strokeOpacity={0.7}
              label={{ 
                value: 'Dead Pool', 
                position: 'right', 
                fill: '#ef4444', 
                fontSize: 11 
              }}
            />
          )}
          
          {/* Full Pool reference line */}
          {yMax >= FULL_POOL && (
            <ReferenceLine 
              y={FULL_POOL} 
              stroke="#3b82f6" 
              strokeDasharray="5 5"
              strokeOpacity={0.7}
              label={{ 
                value: 'Full Pool', 
                position: 'right', 
                fill: '#3b82f6', 
                fontSize: 11 
              }}
            />
          )}
          
          {/* Favorite ramp reference lines */}
          {ramps.map((ramp, index) => {
            const elevation = ramp.min_safe_elevation || ramp.min_usable_elevation
            if (elevation < yMin || elevation > yMax) return null
            const color = rampColors[index % rampColors.length]
            return (
              <ReferenceLine 
                key={ramp.id}
                y={elevation} 
                stroke={color}
                strokeDasharray="3 3"
                strokeOpacity={0.6}
                label={{ 
                  value: shortenRampName(ramp.name, elevation), 
                  position: 'right', 
                  fill: color, 
                  fontSize: 10 
                }}
              />
            )
          })}
          
          {/* Actual elevation line */}
          <Line 
            type="monotone"
            dataKey="actual"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6' }}
          />
          
          {/* Simulated elevation line */}
          <Line 
            type="monotone"
            dataKey="simulated"
            stroke="#d4a574"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#d4a574' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

