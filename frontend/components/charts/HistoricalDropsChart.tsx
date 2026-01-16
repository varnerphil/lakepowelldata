'use client'

import { useMemo, useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

interface HistoricalDrop {
  water_year: number
  start_date: string
  start_elevation: number
  low_date: string
  low_elevation: number
  drop_amount: number
  days_to_low: number
}

interface Ramp {
  id: number
  name: string
  min_safe_elevation: number
  min_usable_elevation: number
  location: string | null
}

interface HistoricalDropsChartProps {
  historicalDrops: HistoricalDrop[]
  currentElevation: number
  currentDate: string
  projectedDrop?: number
  projectedLowDate?: string
  dailyProjections?: Array<{ date: string; projected: number; low: number; high: number }>
  ramps?: Ramp[]
  weeklyChange?: number | null  // Weekly change in feet (negative = dropping)
}

export default function HistoricalDropsChart({
  historicalDrops,
  currentElevation,
  currentDate,
  projectedDrop,
  projectedLowDate,
  dailyProjections = [],
  ramps = [],
  weeklyChange = null
}: HistoricalDropsChartProps) {
  // Detect mobile viewport - default to true to avoid hydration mismatch
  const [isMobile, setIsMobile] = useState(true)
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const chartData = useMemo(() => {
    // Simple calculation: spread the projected drop across days from today to target date
    // Validate inputs - be strict about what we need
    if (projectedDrop === undefined || projectedDrop === null || isNaN(projectedDrop)) {
      console.log('HistoricalDropsChart - Missing or invalid projectedDrop:', projectedDrop)
      return []
    }
    
    if (!projectedLowDate || projectedLowDate === '') {
      console.log('HistoricalDropsChart - Missing projectedLowDate:', projectedLowDate)
      return []
    }
    
    if (!currentElevation || isNaN(currentElevation)) {
      console.log('HistoricalDropsChart - Missing or invalid currentElevation:', currentElevation)
      return []
    }
    
    if (!currentDate || currentDate === '') {
      console.log('HistoricalDropsChart - Missing currentDate:', currentDate)
      return []
    }
    
    const drop = projectedDrop
    const lowDate = projectedLowDate
    const elev = currentElevation
    const today = currentDate
    
    console.log('HistoricalDropsChart - Using values:', {
      drop,
      lowDate,
      elev,
      today
    })
    
    const startDate = new Date(today)
    let endDate = new Date(lowDate)
    
    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.log('HistoricalDropsChart - Invalid date objects')
      return []
    }
    
    // Always use current year for the target date (April 21)
    // The historical date might be from a past year, but we want this year's April 21
    const currentYear = startDate.getFullYear()
    const month = endDate.getMonth() // April = 3
    const day = endDate.getDate() // 21 or 22
    endDate = new Date(currentYear, month, day)
    
    console.log('HistoricalDropsChart - Using target date for current year:', {
      originalLowDate: lowDate,
      adjustedEndDate: endDate.toISOString(),
      currentYear
    })
    
    // Calculate total days (inclusive of both start and end)
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    
    console.log('HistoricalDropsChart - Days calculation:', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days
    })
    
    if (days <= 0) {
      console.log('HistoricalDropsChart - Invalid days:', days)
      return []
    }
    
    const data: Array<{
      days: number
      date: string
      timestamp: number
      projected: number
      currentTrend: number | null
    }> = []
    
    // Calculate daily rate from weekly change (if available)
    // weeklyChange is the change over 7 days, so daily rate = weeklyChange / 7
    const dailyChangeRate = weeklyChange !== null ? weeklyChange / 7 : null
    
    // Spread the drop evenly across all days
    for (let day = 0; day <= days; day++) {
      const currentDateObj = new Date(startDate)
      currentDateObj.setDate(currentDateObj.getDate() + day)
      const dateStr = currentDateObj.toISOString().split('T')[0]
      const timestamp = currentDateObj.getTime()
      
      // Linear interpolation: spread the drop evenly
      const progress = day / days
      const elevation = elev - (drop * progress)
      
      // Current trend: project based on weekly change rate
      // This shows what would happen if the current weekly trend continues
      const trendElevation = dailyChangeRate !== null ? elev + (dailyChangeRate * day) : null
      
      if (isNaN(elevation)) {
        console.log('HistoricalDropsChart - Invalid elevation calculated')
        continue
      }
      
      data.push({
        days: day,
        date: dateStr,
        timestamp: timestamp,
        projected: elevation,
        currentTrend: trendElevation
      })
    }
    
    console.log('HistoricalDropsChart - Generated', data.length, 'data points')
    
    return data
  }, [currentDate, currentElevation, projectedDrop, projectedLowDate, weeklyChange])
  
  // Debug: log what we have
  console.log('HistoricalDropsChart render check:', {
    chartDataLength: chartData.length,
    projectedDrop,
    projectedLowDate,
    currentElevation,
    currentDate,
    hasData: chartData.length > 0
  })
  
  if (chartData.length === 0) {
    // Show what's missing
    const missing = []
    if (!projectedDrop && projectedDrop !== 0) missing.push('projectedDrop')
    if (!projectedLowDate) missing.push('projectedLowDate')
    if (!currentElevation) missing.push('currentElevation')
    
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500 space-y-2">
        <div>No projection data available</div>
        {missing.length > 0 && (
          <div className="text-xs text-gray-400">
            Missing: {missing.join(', ')}
          </div>
        )}
      </div>
    )
  }
  
  // Calculate Y-axis domain from projection data (including current trend if available)
  const projectedElevations = chartData.map(d => d.projected).filter(v => !isNaN(v))
  const trendElevations = chartData
    .map(d => d.currentTrend)
    .filter((v): v is number => v !== null && !isNaN(v))
  
  const allElevations = [...projectedElevations, ...trendElevations]
  
  if (allElevations.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No valid projection data
      </div>
    )
  }
  
  const minElevation = Math.min(...allElevations)
  const maxElevation = Math.max(...allElevations)
  
  const yAxisMin = Math.max(3370 - 20, minElevation - 10)
  const yAxisMax = maxElevation + 10
  
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 280 : 500}>
      <LineChart 
        data={chartData}
        margin={{ 
          top: 5, 
          right: isMobile ? 10 : 120, 
          left: isMobile ? 0 : 60, 
          bottom: isMobile ? 40 : 60 
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="timestamp"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          label={isMobile ? undefined : { value: 'Date', position: 'insideBottom', offset: -5 }}
          tickFormatter={(value) => {
            if (!value) return ''
            const date = new Date(value)
            if (isNaN(date.getTime())) return value
            // Show month name and date (e.g., "Jan 15")
            if (isMobile) {
              return date.toLocaleDateString('en-US', { month: 'short' })
            }
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          }}
          angle={-45}
          textAnchor="end"
          height={isMobile ? 50 : 80}
          tick={{ fontSize: isMobile ? 10 : 12 }}
        />
        <YAxis 
          domain={[yAxisMin, yAxisMax]}
          label={isMobile ? undefined : { value: 'Elevation (ft)', angle: -90, position: 'insideLeft', offset: -5 }}
          tickFormatter={(value) => value.toFixed(0)}
          width={isMobile ? 40 : 60}
          tick={{ fontSize: isMobile ? 10 : 12 }}
        />
        <Tooltip 
          labelFormatter={(value, payload) => {
            if (payload && payload[0] && payload[0].payload) {
              const date = new Date(payload[0].payload.timestamp)
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            }
            if (value) {
              const date = new Date(value)
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            }
            return ''
          }}
          formatter={(value: any, name: string) => {
            const numValue = typeof value === 'number' ? value : parseFloat(value)
            if (value === null || isNaN(numValue)) return ['No data', name]
            return [`${numValue.toFixed(1)} ft`, name]
          }}
        />
        {!isMobile && <Legend />}
        
        {/* Reference lines */}
        <ReferenceLine 
          y={3370} 
          stroke="#ef4444" 
          strokeWidth={1.5}
          strokeDasharray="5 5"
          label={isMobile ? undefined : { value: "Deadpool (3,370 ft)", position: "right", fill: "#ef4444", fontSize: 11, offset: 10 }}
        />
        
        {/* Current elevation marker */}
        {chartData.length > 0 && (
          <ReferenceLine 
            x={chartData[0].timestamp}
            stroke="#6b7280"
            strokeWidth={2}
            strokeDasharray="3 3"
            label={isMobile ? undefined : { value: "Today", position: "top", fill: "#6b7280", fontSize: 11 }}
          />
        )}
        
        {/* Ramp reference lines - hide entirely on mobile to reduce clutter */}
        {!isMobile && ramps
          .filter(ramp => {
            // Show all favorite ramps - don't filter by elevation range
            // This ensures all favorites are visible even if outside projected range
            return true
          })
          .sort((a, b) => a.min_safe_elevation - b.min_safe_elevation)
          .map((ramp) => {
            // Determine if ramp is currently usable
            const isUsable = currentElevation >= ramp.min_safe_elevation
            const willBecomeUnusable = chartData.length > 0 && 
              Math.min(...chartData.map(d => d.projected)) < ramp.min_safe_elevation
            
            // Color based on current status
            const strokeColor = isUsable ? '#10b981' : '#c99a7a'
            
            // Find when the projection crosses this elevation
            let crossDate: string | null = null
            if (willBecomeUnusable && chartData.length > 0) {
              for (let i = 0; i < chartData.length - 1; i++) {
                const current = chartData[i].projected
                const next = chartData[i + 1].projected
                if (current >= ramp.min_safe_elevation && next < ramp.min_safe_elevation) {
                  const date = new Date(chartData[i].timestamp)
                  crossDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  break
                }
              }
            }
            
            // Shorten ramp name for display
            const shortName = ramp.name
              .replace(' (Boats < 25\')', '')
              .replace(' (use at own risk)', '')
              .replace(' (Main Launch)', '')
              .replace(' Public Ramp', '')
              .replace(' Business Ramp', '')
              .replace(' Auxiliary Ramp', '')
              .replace(' North Ramp', '')
              .replace(' Launch', '')
              .split(' ')[0] // Just use first word
            
            // Build compact label - just name and elevation
            const labelText = `${shortName} ${ramp.min_safe_elevation.toFixed(0)}ft`
            
            return (
              <ReferenceLine
                key={ramp.id}
                y={ramp.min_safe_elevation}
                stroke={strokeColor}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                label={{
                  value: labelText,
                  position: "right",
                  fill: strokeColor,
                  fontSize: 10,
                  offset: 5
                }}
              />
            )
          })}
        
        {/* Projected line based on historical average (current year) */}
        <Line
          type="monotone"
          dataKey="projected"
          stroke="#3b82f6"
          strokeWidth={3}
          strokeDasharray="8 4"
          name="Historical Avg"
          dot={false}
          activeDot={{ r: 6 }}
          connectNulls={false}
          isAnimationActive={false}
        />
        
        {/* Current trend line based on weekly change rate */}
        {weeklyChange !== null && (
          <Line
            type="monotone"
            dataKey="currentTrend"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="4 2"
            name="Current Trend"
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}

