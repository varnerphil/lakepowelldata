'use client'

import { useMemo, useState, useEffect } from 'react'
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
import { formatDateString, parseLocalDate } from '@/lib/date-utils'
import type { Ramp } from '@/lib/db'

interface SimulationChartProps {
  data: SimulationDayResult[]
  ramps?: Ramp[]
}

export default function SimulationChart({ data, ramps = [] }: SimulationChartProps) {
  // Detect mobile screen size
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640) // sm breakpoint
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  // Sample data for large datasets to improve performance
  // Split simulated line into segments: green when above actual, orange when below
  const chartData = useMemo(() => {
    const processData = (items: typeof data) => {
      return items.map(d => {
        const simulated = d.simulatedElevation
        const actual = d.actualElevation
        return {
          date: d.date,
          timestamp: parseLocalDate(d.date).getTime(),
          actual: actual,
          simulated: simulated,
          // Split simulated into above (green) and below (orange) segments
          simulatedAbove: simulated >= actual ? simulated : null,
          simulatedBelow: simulated < actual ? simulated : null
        }
      })
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
  
  // Calculate X-axis ticks for date labels
  const xAxisTicks = useMemo(() => {
    if (chartData.length === 0) return []
    const startTime = chartData[0].timestamp
    const endTime = chartData[chartData.length - 1].timestamp
    const ticks: number[] = []
    
    // Generate ticks every year on Jan 1
    const startDate = new Date(startTime)
    const endDate = new Date(endTime)
    let currentDate = new Date(startDate.getFullYear(), 0, 1) // Jan 1 of start year
    
    while (currentDate <= endDate) {
      const timestamp = currentDate.getTime()
      if (timestamp >= startTime && timestamp <= endTime) {
        ticks.push(timestamp)
      }
      currentDate.setFullYear(currentDate.getFullYear() + 1) // Add 1 year
    }
    
    // Also add the end date if not already included
    if (ticks.length === 0 || ticks[ticks.length - 1] !== endTime) {
      ticks.push(endTime)
    }
    
    return ticks
  }, [chartData])
  
  // Format date for X-axis (receives timestamp)
  const formatXAxis = (timestamp: number) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return ''
    
    const month = date.getMonth() + 1
    const day = date.getDate()
    const year = date.getFullYear()
    
    // Show year for Jan 1, otherwise show month/day/year
    if (day === 1 && month === 1) {
      return year.toString()
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }
  
  // Format date for tooltip
  // Recharts passes timestamp (number) or date string, and payload with the data point
  const formatTooltipDate = (value: string | number, payload?: any) => {
    let dateStr: string
    
    // If value is a number (timestamp), convert it to date string
    if (typeof value === 'number') {
      // Try to get date from payload first
      if (payload && payload[0] && payload[0].payload && payload[0].payload.date) {
        dateStr = payload[0].payload.date
      } else {
        // Fallback: convert timestamp to date string
        const date = new Date(value)
        dateStr = date.toISOString().split('T')[0]
      }
    } else {
      dateStr = value
    }
    
    return formatDateString(dateStr, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Key elevations
  const FULL_POOL = 3700
  const DEADPOOL = 3370  // Dead Pool - below this, no water can be released
  const MIN_POWER = 3490  // Minimum Power Pool - below this, no hydroelectric generation
  
  // Colors for ramp reference lines
  const rampColors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899']
  
  // Shorten ramp names for display with custom mappings
  const shortenRampName = (name: string, elevation: number): string => {
    // Normalize name: remove parentheses, extra spaces, etc.
    const normalized = name.replace(/[()]/g, '').trim()
    const normalizedLower = normalized.toLowerCase()
    
    // Custom mappings for specific ramps
    const nameMappings: Record<string, string> = {
      'Antelope Point Public Ramp': 'Antelope M',
      'Antelope Point Business Ramp': 'Antelope E',
      'Castle Rock Cut-Off': 'The Cut',
      'Castle Rock': 'The Cut',
      'Bullfrog Main Ramp': 'Bullfrog M',
      'Bullfrog Main Launch': 'Bullfrog M',
      'Bullfrog North Ramp': 'Bullfrog N',
      'Halls Crossing Ramp': 'Halls',
      'Halls Crossing': 'Halls',
      'Wahweap Main Ramp': 'Wahweap M',
      'Wahweap': 'Wahweap M',
      'Stateline Launch': 'Stateline',
      'Stateline': 'Stateline'
    }
    
    // Check for exact match first (original and normalized)
    if (nameMappings[name]) {
      return `${nameMappings[name]} ${elevation}ft`
    }
    if (nameMappings[normalized]) {
      return `${nameMappings[normalized]} ${elevation}ft`
    }
    
    // Check for partial matches (case insensitive, with normalized name)
    for (const [key, value] of Object.entries(nameMappings)) {
      const keyLower = key.toLowerCase()
      if (normalizedLower.includes(keyLower) || keyLower.includes(normalizedLower)) {
        return `${value} ${elevation}ft`
      }
    }
    
    // Special case: Bullfrog + Main (any variation)
    if (normalizedLower.includes('bullfrog') && normalizedLower.includes('main') && !normalizedLower.includes('north')) {
      return `Bullfrog M ${elevation}ft`
    }
    
    // Fallback: use original logic for unmapped names
    let short = name
      .replace(/\s+(Ramp|Launch|Cut-Off|Cutoff)$/i, '')
      .replace(/\bPoint\b/gi, 'Pt')
      .replace(/\bNorth\b/gi, 'N')
      .replace(/\bSouth\b/gi, 'S')
      .replace(/\bEast\b/gi, 'E')
      .replace(/\bWest\b/gi, 'W')
      .replace(/\bBusiness\b/gi, 'Bus')
      .replace(/\bAuxiliary\b/gi, 'Aux')
      .replace(/\bCrossing\b/gi, 'Xing')
    
    if (short.length > 20) {
      short = short.substring(0, 17) + '...'
    }
    
    return `${short} ${elevation}ft`
  }

  // Responsive margins
  const chartMargins = useMemo(() => {
    if (isMobile) {
      return { top: 5, right: 60, left: 20, bottom: 0 } // Increased right margin for ramp labels
    }
    return { top: 5, right: 100, left: 40, bottom: 20 }
  }, [isMobile])

  return (
    <div className="h-[350px] sm:h-[350px] lg:h-[450px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={chartMargins}
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
            ticks={isMobile ? xAxisTicks.filter((_, i) => i % 2 === 0) : xAxisTicks} // Show fewer ticks on mobile
            tickFormatter={formatXAxis}
            tick={{ fontSize: isMobile ? 9 : 11, fill: '#888' }}
            tickLine={{ stroke: '#ccc' }}
            axisLine={{ stroke: '#ccc' }}
            angle={isMobile ? -30 : -45}
            textAnchor="end"
            height={isMobile ? 50 : 60}
          />
          
          <YAxis 
            domain={[yMin, yMax]}
            tick={{ fontSize: isMobile ? 9 : 11, fill: '#888' }}
            tickLine={{ stroke: '#ccc' }}
            axisLine={{ stroke: '#ccc' }}
            tickFormatter={(value) => value.toFixed(0)}
            label={isMobile ? undefined : { 
              value: 'Elevation (ft)', 
              angle: -90, 
              position: 'insideLeft',
              offset: -30,
              style: { textAnchor: 'middle', fill: '#888', fontSize: 12 }
            }}
            width={isMobile ? 30 : 50}
          />
          
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: isMobile ? '10px' : '12px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              padding: isMobile ? '6px' : '8px'
            }}
            labelFormatter={formatTooltipDate}
            formatter={(value: number, name: string) => {
              if (name === 'actual') return [`${value.toFixed(2)} ft`, 'Actual']
              if (name === 'simulatedAbove') return [`${value.toFixed(2)} ft`, 'Simulated (Improving)']
              if (name === 'simulatedBelow') return [`${value.toFixed(2)} ft`, 'Simulated (Worse)']
              return [`${value.toFixed(2)} ft`, name]
            }}
          />
          
          <Legend 
            verticalAlign="top" 
            height={isMobile ? 60 : 36}
            wrapperStyle={{ fontSize: isMobile ? '10px' : '12px' }}
            formatter={(value) => {
              if (value === 'actual') return 'Actual'
              if (value === 'Simulated (Improving)') return isMobile ? 'Sim (↑)' : 'Simulated (Improving)'
              if (value === 'Simulated (Worse)') return isMobile ? 'Sim (↓)' : 'Simulated (Worse)'
              return value
            }}
            iconType="line"
          />
          
          {/* Reference lines for key elevations */}
          {yMin <= MIN_POWER && (
            <ReferenceLine 
              y={MIN_POWER} 
              stroke="#f59e0b" 
              strokeDasharray="5 5"
              strokeOpacity={0.7}
              label={isMobile ? undefined : { 
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
              label={isMobile ? undefined : { 
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
              label={isMobile ? undefined : { 
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
                  fontSize: isMobile ? 8 : 10,
                  offset: isMobile ? 5 : 0
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
          
          {/* Simulated elevation line - green when above actual */}
          <Line 
            type="monotone"
            dataKey="simulatedAbove"
            stroke="#8b9a6b"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#8b9a6b' }}
            connectNulls={false}
            name="Simulated (Improving)"
          />
          
          {/* Simulated elevation line - orange when below actual */}
          <Line 
            type="monotone"
            dataKey="simulatedBelow"
            stroke="#d4a574"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#d4a574' }}
            connectNulls={false}
            name="Simulated (Worse)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

