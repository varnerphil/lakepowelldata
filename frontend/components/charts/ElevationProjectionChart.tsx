'use client'

import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

interface ElevationProjectionChartProps {
  historicalData: Array<{
    date: string
    elevation: number
  }>
  projections: Array<{
    date: string
    projected: number
    low: number
    high: number
  }>
  currentElevation: number
  currentDate: string
  targetDate: string
}

const DEADPOOL = 3370
const NO_POWER = 3490

export default function ElevationProjectionChart({
  historicalData,
  projections,
  currentElevation,
  currentDate,
  targetDate
}: ElevationProjectionChartProps) {
  const chartData = useMemo(() => {
    // Combine historical and projected data
    const historical = historicalData.map(d => ({
      date: d.date,
      elevation: d.elevation,
      projected: null as number | null,
      low: null as number | null,
      high: null as number | null
    }))
    
    const projected = projections.map(p => ({
      date: p.date,
      elevation: null as number | null,
      projected: p.projected,
      low: p.low,
      high: p.high
    }))
    
    // Combine and sort by date
    const combined = [...historical, ...projected].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    
    return combined
  }, [historicalData, projections])
  
  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    )
  }
  
  // Calculate Y-axis domain
  const allElevations = [
    ...historicalData.map(d => d.elevation),
    ...projections.map(p => p.projected),
    ...projections.map(p => p.low),
    ...projections.map(p => p.high)
  ].filter(e => e !== null && !isNaN(e)) as number[]
  
  const minElevation = Math.min(...allElevations)
  const maxElevation = Math.max(...allElevations)
  
  const yAxisMin = Math.max(DEADPOOL - 50, minElevation - 20)
  const yAxisMax = maxElevation + 20
  
  // Calculate date range for X-axis
  const startDate = historicalData.length > 0 
    ? historicalData[0].date 
    : currentDate
  const endDate = targetDate
  
  const dateRange = new Date(endDate).getTime() - new Date(startDate).getTime()
  const daysInRange = dateRange / (1000 * 60 * 60 * 24)
  
  return (
    <ResponsiveContainer width="100%" height={500}>
      <LineChart 
        data={chartData}
        margin={{ top: 5, right: 30, left: 20, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="date"
          tickFormatter={(value) => {
            const date = new Date(value)
            return `${date.getMonth() + 1}/${date.getDate()}`
          }}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis 
          domain={[yAxisMin, yAxisMax]}
          label={{ value: 'Elevation (ft)', angle: -90, position: 'insideLeft' }}
        />
        <Tooltip 
          labelFormatter={(value) => {
            return new Date(value).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              year: 'numeric'
            })
          }}
          formatter={(value: any, name: string) => {
            const numValue = typeof value === 'number' ? value : parseFloat(value)
            if (value === null || isNaN(numValue)) return ['No data', name]
            return [`${numValue.toFixed(1)} ft`, name]
          }}
        />
        <Legend />
        
        {/* Reference lines */}
        <ReferenceLine 
          y={DEADPOOL} 
          stroke="#ef4444" 
          strokeWidth={2}
          strokeDasharray="5 5"
          label={{ value: "Deadpool (3,370 ft)", position: "right", fill: "#ef4444", fontSize: 12 }}
        />
        <ReferenceLine 
          y={NO_POWER} 
          stroke="#f59e0b" 
          strokeWidth={2}
          strokeDasharray="5 5"
          label={{ value: "No Power (3,490 ft)", position: "right", fill: "#f59e0b", fontSize: 12 }}
        />
        
        {/* Current elevation marker */}
        <ReferenceLine 
          x={currentDate}
          stroke="#6b7280"
          strokeWidth={2}
          strokeDasharray="3 3"
          label={{ value: "Today", position: "top", fill: "#6b7280", fontSize: 11 }}
        />
        
        {/* Historical data */}
        <Line 
          type="monotone" 
          dataKey="elevation" 
          stroke="#3b82f6" 
          strokeWidth={2}
          name="Historical Elevation"
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls={false}
          isAnimationActive={false}
        />
        
        {/* Projected elevation */}
        <Line 
          type="monotone" 
          dataKey="projected" 
          stroke="#3b82f6" 
          strokeWidth={2}
          strokeDasharray="5 5"
          name="Projected"
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls={false}
          isAnimationActive={false}
        />
        
        {/* Low estimate */}
        <Line 
          type="monotone" 
          dataKey="low" 
          stroke="#c99a7a" 
          strokeWidth={1.5}
          strokeDasharray="3 3"
          name="Low Estimate"
          dot={false}
          activeDot={{ r: 3 }}
          connectNulls={false}
          isAnimationActive={false}
        />
        
        {/* High estimate */}
        <Line 
          type="monotone" 
          dataKey="high" 
          stroke="#8b9a6b" 
          strokeWidth={1.5}
          strokeDasharray="3 3"
          name="High Estimate"
          dot={false}
          activeDot={{ r: 3 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}




