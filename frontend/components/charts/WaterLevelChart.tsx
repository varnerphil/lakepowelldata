'use client'

import { useMemo, useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

interface Ramp {
  name: string
  min_safe_elevation: number
}

interface WaterLevelChartProps {
  data: Array<{
    date: string
    elevation: number
  }>
  startDate?: string
  endDate?: string
  ramps?: Ramp[]
}

// Lake Powell reference elevations (feet above sea level)
const RIVER_BOTTOM = 3200  // Approximate river bottom level
const DEADPOOL = 3370      // Minimum pool elevation (deadpool)
const NO_POWER = 3490      // Minimum power pool elevation (no power generation)

export default function WaterLevelChart({ data, startDate, endDate, ramps = [] }: WaterLevelChartProps) {
  // Detect mobile viewport - default to true to avoid hydration mismatch
  const [isMobile, setIsMobile] = useState(true)
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Sort and format data to ensure proper rendering
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []
    
    // Sort by date and ensure dates are in ISO format
    const sorted = [...data]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(item => {
        // Ensure date is in YYYY-MM-DD format
        const dateStr = item.date.includes('T') ? item.date.split('T')[0] : item.date
        const elevation = Number(item.elevation)
        // Filter out invalid elevations (outliers or bad data)
        // Lake Powell elevation is always 3000-4000 ft (never below 3000 or above 4000)
        const validElevation = (!isNaN(elevation) && elevation > 0 && elevation >= 3000 && elevation <= 4000) 
          ? elevation 
          : null
        return {
          date: dateStr,
          elevation: validElevation,
          timestamp: new Date(dateStr).getTime() // Add timestamp for X-axis
        }
      })
      // Don't filter out null elevations - we need them for placeholder points
      // But we'll handle them in the Line component with connectNulls={false}
    
    return sorted
  }, [data])
  
  // Use provided date range for X-axis domain (to show full requested range)
  // But only show actual data points (no placeholders)
  const actualStartDate = startDate || (chartData.length > 0 ? chartData[0].date : '')
  const actualEndDate = endDate || (chartData.length > 0 ? chartData[chartData.length - 1].date : '')

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    )
  }

  // Calculate Y-axis domain based on data range, but start from river bottom
  // Filter out invalid/outlier values (Lake Powell elevation should be 3000-4000 ft)
  // Lake Powell has never been below 3000 ft or above 4000 ft since filling
  const validElevations = chartData
    .map(d => d.elevation)
    .filter((elev): elev is number => elev !== null && !isNaN(elev) && elev > 0 && elev >= 3000 && elev <= 4000) // Strict range: Lake Powell elevation
  
  if (validElevations.length === 0) {
    // Fallback if no valid elevations
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No valid elevation data available
      </div>
    )
  }
  
  const minElevation = Math.min(...validElevations)
  const maxElevation = Math.max(...validElevations)
  
  // Set domain to start from river bottom, with some padding
  const yAxisMin = Math.max(RIVER_BOTTOM, minElevation - 50)
  const yAxisMax = maxElevation + 50

  // Determine date range for better X-axis formatting
  // Use the requested date range, not just the data range
  const dateRange = actualStartDate && actualEndDate
    ? new Date(actualEndDate).getTime() - new Date(actualStartDate).getTime()
    : chartData.length > 0 
      ? new Date(chartData[chartData.length - 1].date).getTime() - new Date(chartData[0].date).getTime()
      : 0
  const daysInRange = dateRange / (1000 * 60 * 60 * 24)
  
  // Convert dates to timestamps for proper X-axis scaling
  // Add placeholder points at start/end dates to show full requested range on X-axis
  const chartDataWithRange = useMemo(() => {
    if (!actualStartDate || !actualEndDate) return chartData
    
    const dataMap = new Map(chartData.map(item => [item.date, item.elevation]))
    const result: Array<{ date: string; elevation: number | null; timestamp: number }> = [...chartData]
    
    // Always add start date placeholder if not present (to show full range)
    if (!dataMap.has(actualStartDate)) {
      if (chartData.length === 0 || actualStartDate < chartData[0].date) {
        result.unshift({ 
          date: actualStartDate, 
          elevation: null,
          timestamp: new Date(actualStartDate).getTime()
        })
      }
    }
    
    // Always add end date placeholder if not present (to show full range)
    if (!dataMap.has(actualEndDate)) {
      if (chartData.length === 0 || actualEndDate > chartData[chartData.length - 1].date) {
        result.push({ 
          date: actualEndDate, 
          elevation: null,
          timestamp: new Date(actualEndDate).getTime()
        })
      }
    }
    
    // Sort to ensure proper order
    return result.sort((a, b) => a.timestamp - b.timestamp)
  }, [chartData, actualStartDate, actualEndDate])
  
  // Calculate X-axis domain using timestamps for proper scaling
  const xAxisDomain = actualStartDate && actualEndDate
    ? [new Date(actualStartDate).getTime(), new Date(actualEndDate).getTime()]
    : chartDataWithRange.length > 0
      ? [new Date(chartDataWithRange[0].date).getTime(), new Date(chartDataWithRange[chartDataWithRange.length - 1].date).getTime()]
      : undefined

  // Calculate water year start dates (October 1st) within the date range
  // Water year starts on October 1st (e.g., WY 2024 = Oct 1, 2023 to Sep 30, 2024)
  const waterYearStarts = useMemo(() => {
    if (!actualStartDate || !actualEndDate || !xAxisDomain) return []
    
    const start = new Date(actualStartDate)
    const end = new Date(actualEndDate)
    const starts: number[] = []
    
    // Start from the year before the start date to catch October 1st if it's just before
    let year = start.getFullYear() - 1
    const endYear = end.getFullYear() + 1 // Go one year past to catch the end
    
    // Find all October 1st dates in the range
    while (year <= endYear) {
      const oct1 = new Date(year, 9, 1) // October is month 9 (0-indexed)
      const oct1Timestamp = oct1.getTime()
      
      // Include if it's within the visible date range
      if (oct1Timestamp >= xAxisDomain[0] && oct1Timestamp <= xAxisDomain[1]) {
        starts.push(oct1Timestamp)
      }
      
      year++
    }
    
    return starts
  }, [actualStartDate, actualEndDate, xAxisDomain])

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 280 : 400}>
      <LineChart 
        data={chartDataWithRange}
        margin={{ 
          top: 5, 
          right: isMobile ? 60 : 150, 
          left: isMobile ? 0 : 30, 
          bottom: isMobile ? 0 : 0 
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="timestamp"
          type="number"
          scale="time"
          domain={xAxisDomain}
          tickFormatter={(value) => {
            if (!value) return ''
            const date = new Date(value)
            if (isNaN(date.getTime())) return value
            // For ranges > 1 year, show month/year. For shorter ranges, show month/day
            if (daysInRange > 365) {
              return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(2)}`
            } else if (daysInRange > 90) {
              return `${date.getMonth() + 1}/${date.getDate()}`
            } else {
              return `${date.getMonth() + 1}/${date.getDate()}`
            }
          }}
          angle={daysInRange > 365 || isMobile ? -45 : 0}
          textAnchor={daysInRange > 365 || isMobile ? 'end' : 'middle'}
          height={daysInRange > 365 || isMobile ? 60 : 30}
          tick={{ fontSize: isMobile ? 10 : 12 }}
        />
        <YAxis 
          domain={[yAxisMin, yAxisMax]}
          label={isMobile ? undefined : { value: 'Elevation (ft)', angle: -90, position: 'insideLeft', offset: -15 }}
          width={isMobile ? 45 : 70}
          tick={{ fontSize: isMobile ? 10 : 12 }}
          tickFormatter={(value) => isMobile ? value.toFixed(0) : value.toFixed(2)}
        />
        <Tooltip 
          labelFormatter={(value, payload) => {
            // value is timestamp, but we can get date from payload
            // Use the date string directly and parse as local date to avoid timezone issues
            if (payload && payload[0] && payload[0].payload && payload[0].payload.date) {
              const dateStr = payload[0].payload.date
              // Parse YYYY-MM-DD as local date (not UTC) by using date parts
              const [year, month, day] = dateStr.split('-').map(Number)
              const localDate = new Date(year, month - 1, day)
              return localDate.toLocaleDateString()
            }
            return new Date(value).toLocaleDateString()
          }}
          formatter={(value: any) => {
            const numValue = typeof value === 'number' ? value : parseFloat(value)
            if (value === null || isNaN(numValue)) return ['No data', 'Elevation']
            return [`${numValue.toFixed(2)} ft`, 'Elevation']
          }}
        />
        <Legend />
        {/* Water year start lines (October 1st) - hide on mobile */}
        {!isMobile && waterYearStarts.map((timestamp) => {
          const date = new Date(timestamp)
          // October 1st marks the start of the next calendar year's water year
          // e.g., Oct 1, 2023 = start of WY 2024
          const waterYear = date.getFullYear() + 1
          return (
            <ReferenceLine
              key={`water-year-${timestamp}`}
              x={timestamp}
              stroke="#9ca3af"
              strokeWidth={1}
              strokeDasharray="2 2"
              label={{
                value: `WY ${waterYear}`,
                position: "top",
                fill: "#6b7280",
                fontSize: 10,
                offset: 5
              }}
            />
          )
        })}
        {/* Reference line for Deadpool */}
        <ReferenceLine 
          y={DEADPOOL} 
          stroke="#ef4444" 
          strokeWidth={2}
          strokeDasharray="5 5"
          label={isMobile ? undefined : { value: "Deadpool (3,370 ft)", position: "right", fill: "#ef4444", fontSize: 12, offset: 20 }}
        />
        {/* Reference line for No Power Generation */}
        <ReferenceLine 
          y={NO_POWER} 
          stroke="#f59e0b" 
          strokeWidth={2}
          strokeDasharray="5 5"
          label={isMobile ? undefined : { value: "No Power Generation (3,490 ft)", position: "right", fill: "#f59e0b", fontSize: 12, offset: 20 }}
        />
        {/* Ramp reference lines */}
        {ramps
          .filter(ramp => {
            // Only show ramps that are within the chart's elevation range
            const rampElev = ramp.min_safe_elevation
            return rampElev >= yAxisMin && rampElev <= yAxisMax
          })
          .map(ramp => {
            // Get current elevation from the most recent valid data point
            const validDataPoints = chartData.filter((d): d is { date: string; elevation: number; timestamp: number } => 
              d.elevation !== null && !isNaN(d.elevation)
            )
            const currentElevation = validDataPoints.length > 0 
              ? validDataPoints[validDataPoints.length - 1].elevation
              : 0
            
            // Determine if ramp is currently usable (same logic as projection chart)
            const isUsable = currentElevation >= ramp.min_safe_elevation
            
            // Color based on current status (using theme colors)
            const strokeColor = isUsable ? '#8b9a6b' : '#c99a7a'
            
            // Create abbreviated names
            let shortName: string
            switch (ramp.name) {
              case 'Bullfrog North Ramp':
                shortName = 'Bullfrog N'
                break
              case 'Stateline Launch':
                shortName = 'Stateline'
                break
              case 'Halls Crossing (use at own risk)':
                shortName = 'Halls'
                break
              case 'Antelope Point Public Ramp':
                shortName = 'Antelope'
                break
              case 'Antelope Point Business Ramp':
                shortName = 'Antelope Exec'
                break
              case 'Bullfrog (Main Launch)':
                shortName = 'Bullfrog'
                break
              case 'Wahweap (Main Launch)':
                shortName = 'Wahweap'
                break
              case 'Bullfrog to Halls Creek Cut-Off':
                shortName = 'Ferry Cutoff'
                break
              case 'Castle Rock Cut-Off':
                shortName = 'The Cut'
                break
              case 'Bullfrog Spur (Boats < 25\')':
                shortName = 'Bullfrog Spur'
                break
              default:
                // Generic shortening for other ramps
                shortName = ramp.name
                  .replace(' Ramp', '')
                  .replace(' (Main Launch)', '')
                  .replace(' Launch', '')
                  .replace(' (use at own risk)', '')
                  .replace(' Cut-Off', '')
            }
            
            return (
              <ReferenceLine
                key={ramp.name}
                y={ramp.min_safe_elevation}
                stroke={strokeColor}
                strokeWidth={2}
                strokeDasharray="5 3"
                strokeOpacity={0.8}
                label={{
                  value: `${shortName} ${ramp.min_safe_elevation.toFixed(0)}ft`,
                  position: "right",
                  fill: strokeColor,
                  fontSize: isMobile ? 8 : 11,
                  fontWeight: 500,
                  offset: isMobile ? 5 : 20
                }}
              />
            )
          })}
        <Line 
          type="monotone" 
          dataKey="elevation" 
          stroke="#3b82f6" 
          strokeWidth={2}
          name="Water Elevation"
          dot={false}
          activeDot={{ r: 6 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

