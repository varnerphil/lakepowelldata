'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'

interface BasinPlotsChartProps {
  years: Array<{
    year: number
    data: Array<{ date: string; swe: number | null }>
  }>
  percentiles: Array<{
    date: string
    p10: number | null
    p30: number | null
    p70: number | null
    p90: number | null
  }>
  statistics: Array<{
    date: string
    min: number | null
    median_91_20: number | null
    median_por: number | null
    max: number | null
    median_peak_swe: number | null
  }>
  currentYear: number
  currentStats: {
    percentOfMedian: number | null
    percentOfMedianPeak: number | null
    daysUntilMedianPeak: number | null
    percentile: number | null
  }
}

// Color scheme for years (similar to reference)
const YEAR_COLORS: Record<number, string> = {
  2017: '#90cdf4', // Light blue
  2018: '#f9a8d4', // Pink
  2019: '#fbbf24', // Orange
  2020: '#ef4444', // Red
  2021: '#a78bfa', // Purple
  2022: '#34d399', // Green
  2023: '#60a5fa', // Blue
  2024: '#f472b6', // Pink
  2025: '#fb923c', // Orange
  2026: '#000000', // Black (current year)
}

// Get color for a year, defaulting to gray for older years
function getYearColor(year: number, isCurrentYear: boolean): string {
  if (isCurrentYear) return '#000000' // Black for current year
  return YEAR_COLORS[year] || '#d1d5db' // Gray for years not in color map
}

export default function BasinPlotsChart({
  years,
  percentiles,
  statistics,
  currentYear,
  currentStats
}: BasinPlotsChartProps) {
  // Detect mobile viewport - default to true to avoid hydration mismatch
  const [isMobile, setIsMobile] = useState(true)
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Helper function to get water year start date (Oct 1) for a given year
  const getWaterYearStart = (year: number): Date => {
    // Water year YYYY starts on Oct 1 of year YYYY-1
    return new Date(year - 1, 9, 1) // Month 9 = October (0-indexed)
  }
  
  // Prepare chart data - combine all data points by date, normalized to water year
  const chartData = useMemo(() => {
    // Get all unique dates
    const allDates = new Set<string>()
    years.forEach(year => {
      year.data.forEach(point => {
        if (point.date) allDates.add(point.date)
      })
    })
    
    const sortedDates = Array.from(allDates).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    )
    
    // Create data points for each date, normalized to water year day offset
    return sortedDates.map(date => {
      const dateObj = new Date(date)
      // Determine which water year this date belongs to
      // Water year YYYY runs from Oct 1, YYYY-1 to Sep 30, YYYY
      const waterYear = dateObj.getMonth() >= 9 
        ? dateObj.getFullYear() + 1 
        : dateObj.getFullYear()
      
      // Calculate days since Oct 1 of THIS water year
      // This normalizes all dates so Oct 1 = day 0 for all years
      const wyStart = getWaterYearStart(waterYear)
      const dayOffset = Math.floor((dateObj.getTime() - wyStart.getTime()) / (1000 * 60 * 60 * 24))
      
      const point: any = {
        date,
        timestamp: dateObj.getTime(),
        waterYearDay: dayOffset, // Days since Oct 1 of the water year (0 = Oct 1)
        waterYear: waterYear
      }
      
      // Add SWE values for each year
      years.forEach(year => {
        const yearData = year.data.find(d => d.date === date)
        point[`year_${year.year}`] = yearData?.swe ?? null
      })
      
      // Add percentile bands (match by full date - percentiles are keyed by water_year_date)
      const percentileData = percentiles.find(p => {
        // p.date is water_year_date (full date), but we need to match by MM-DD since
        // percentiles are the same for all years on the same calendar date
        const pDate = new Date(p.date)
        return pDate.getMonth() === dateObj.getMonth() && pDate.getDate() === dateObj.getDate()
      })
      if (percentileData) {
        point.percentile_10 = percentileData.p10
        point.percentile_30 = percentileData.p30
        point.percentile_70 = percentileData.p70
        point.percentile_90 = percentileData.p90
      }
      
      // Add statistical lines (match by month/day since they're the same across years)
      const statData = statistics.find(s => {
        const sDate = new Date(s.date)
        return sDate.getMonth() === dateObj.getMonth() && sDate.getDate() === dateObj.getDate()
      })
      if (statData) {
        point.min = statData.min
        point.median_91_20 = statData.median_91_20
        point.median_por = statData.median_por
        point.max = statData.max
        point.median_peak_swe = statData.median_peak_swe
      }
      
      return point
    })
  }, [years, percentiles, statistics])
  
  // Filter years to show (2017-2026, or all if fewer)
  const yearsToShow = useMemo(() => {
    return years
      .filter(y => y.year >= 2017 && y.year <= 2026)
      .sort((a, b) => a.year - b.year)
  }, [years])
  
  // Calculate Y-axis domain
  const yAxisDomain = useMemo(() => {
    const allValues: number[] = []
    chartData.forEach(point => {
      Object.keys(point).forEach(key => {
        if (key.startsWith('year_') || key === 'min' || key === 'max' || 
            key === 'median_por' || key === 'median_91_20' || key === 'percentile_90') {
          const value = point[key]
          if (value !== null && !isNaN(value)) {
            allValues.push(value)
          }
        }
      })
    })
    
    if (allValues.length === 0) return [0, 25]
    
    const min = Math.max(0, Math.min(...allValues) - 1)
    const max = Math.max(...allValues) + 2
    
    return [min, max]
  }, [chartData])
  
  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    )
  }
  
  return (
    <div className="relative">
      {/* Current Statistics Callout - positioned to not overlap chart */}
      {currentStats.percentOfMedian !== null && (
        <div className={`bg-white p-2 sm:p-4 rounded-lg shadow-lg border border-gray-200 z-10 text-xs sm:text-sm ${
          isMobile 
            ? 'relative mb-4' 
            : 'absolute top-4 right-4 max-w-[200px]'
        }`}>
          <div className="font-semibold mb-1 sm:mb-2">Current as of {new Date().toLocaleDateString()}</div>
          <div className={`${isMobile ? 'flex flex-wrap gap-x-4 gap-y-1' : 'space-y-1'}`}>
            {currentStats.percentOfMedian !== null && (
              <div>% of Median - {currentStats.percentOfMedian.toFixed(0)}%</div>
            )}
            {currentStats.percentile !== null && (
              <div>Percentile - {currentStats.percentile.toFixed(0)}</div>
            )}
            {!isMobile && currentStats.percentOfMedianPeak !== null && (
              <div>% Median Peak - {currentStats.percentOfMedianPeak.toFixed(0)}%</div>
            )}
            {!isMobile && currentStats.daysUntilMedianPeak !== null && (
              <div>Days Until Median Peak - {currentStats.daysUntilMedianPeak}</div>
            )}
          </div>
        </div>
      )}
      
      <ResponsiveContainer width="100%" height={isMobile ? 300 : 500}>
        <ComposedChart data={chartData} margin={{ 
          top: 10, 
          right: isMobile ? 10 : 30, 
          left: isMobile ? 0 : 20, 
          bottom: isMobile ? 40 : 60 
        }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          
          {/* X-Axis - normalized to water year (starts Oct 1) */}
          <XAxis
            dataKey="waterYearDay"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(dayOffset) => {
              // Convert day offset to a date in a reference water year
              // Use any water year as reference since we're just showing month/day
              const referenceWaterYear = 2026
              const wyStart = new Date(referenceWaterYear - 1, 9, 1) // Oct 1, 2025
              const date = new Date(wyStart)
              date.setDate(date.getDate() + dayOffset)
              
              const month = date.getMonth() + 1
              const day = date.getDate()
              
              // Show major dates: Oct 1, Nov 1, Jan 1, Mar 1, May 1, Jul 1, Sep 1
              // On mobile, show fewer ticks
              if (isMobile) {
                if ((month === 10 && day === 1) || (month === 1 && day === 1) || 
                    (month === 4 && day === 1) || (month === 7 && day === 1)) {
                  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                  return monthNames[month - 1]
                }
              } else {
                if ((month === 10 && day === 1) || (month === 11 && day === 1) || 
                    (month === 1 && day === 1) || (month === 3 && day === 1) || 
                    (month === 5 && day === 1) || (month === 7 && day === 1) || 
                    (month === 9 && day === 1)) {
                  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                  return `${monthNames[month - 1]} ${day}`
                }
              }
              return ''
            }}
            angle={-45}
            textAnchor="end"
            height={isMobile ? 50 : 80}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            label={isMobile ? undefined : { value: 'Date (Water Year)', position: 'insideBottom', offset: -10 }}
          />
          
          {/* Y-Axis */}
          <YAxis
            domain={yAxisDomain}
            width={isMobile ? 35 : 60}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            tickFormatter={(value) => isMobile ? value.toFixed(0) : value}
            label={isMobile ? undefined : { value: 'Snow Water Equivalent (in.)', angle: -90, position: 'insideLeft' }}
          />
          
          {/* Percentile Shading Bands */}
          <Area
            type="monotone"
            dataKey="percentile_90"
            stroke="none"
            fill="#dbeafe"
            fillOpacity={0.3}
            name="90th Percentile"
          />
          <Area
            type="monotone"
            dataKey="percentile_70"
            stroke="none"
            fill="#e5e7eb"
            fillOpacity={0.2}
            name="70th Percentile"
          />
          <Area
            type="monotone"
            dataKey="percentile_30"
            stroke="none"
            fill="#fee2e2"
            fillOpacity={0.2}
            name="30th Percentile"
          />
          <Area
            type="monotone"
            dataKey="percentile_10"
            stroke="none"
            fill="#fce7f3"
            fillOpacity={0.2}
            name="10th Percentile"
          />
          
          {/* Statistical Reference Lines */}
          {statistics.length > 0 && (
            <>
              <ReferenceLine
                y={statistics[0]?.max ?? 0}
                stroke="#1e40af"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                label={{ value: "Max", position: "right", fill: "#1e40af", fontSize: 10 }}
              />
              <ReferenceLine
                y={statistics[0]?.median_por ?? 0}
                stroke="#10b981"
                strokeWidth={1.5}
                label={{ value: "Median (POR)", position: "right", fill: "#10b981", fontSize: 10 }}
              />
              <ReferenceLine
                y={statistics[0]?.median_91_20 ?? 0}
                stroke="#10b981"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                label={{ value: "Median ('91-'20)", position: "right", fill: "#10b981", fontSize: 10 }}
              />
              <ReferenceLine
                y={statistics[0]?.min ?? 0}
                stroke="#92400e"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                label={{ value: "Min", position: "right", fill: "#92400e", fontSize: 10 }}
              />
            </>
          )}
          
          {/* Year Lines */}
          {yearsToShow.map(year => {
            const isCurrentYear = year.year === currentYear
            const color = getYearColor(year.year, isCurrentYear)
            const strokeWidth = isCurrentYear ? 3 : 1.5
            
            return (
              <Line
                key={year.year}
                type="monotone"
                dataKey={`year_${year.year}`}
                stroke={color}
                strokeWidth={strokeWidth}
                dot={false}
                connectNulls={false}
                name={`${year.year} (${year.data.filter(d => d.swe !== null).length} sites)`}
              />
            )
          })}
          
          <Tooltip
            labelFormatter={(dayOffset) => {
              // Convert day offset back to a date for display
              const referenceWaterYear = 2026
              const wyStart = new Date(referenceWaterYear - 1, 9, 1) // Oct 1, 2025
              const date = new Date(wyStart)
              date.setDate(date.getDate() + dayOffset)
              return date.toLocaleDateString()
            }}
            formatter={(value: any, name: string) => {
              const numValue = typeof value === 'number' ? value : parseFloat(value)
              if (value === null || isNaN(numValue)) return ['No data', name]
              if (name.startsWith('year_')) {
                const year = name.replace('year_', '')
                return [`${numValue.toFixed(2)} in.`, `${year}`]
              }
              return [`${numValue.toFixed(2)} in.`, name]
            }}
          />
          
          {!isMobile && (
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

