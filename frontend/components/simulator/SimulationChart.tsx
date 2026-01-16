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

interface SimulationChartProps {
  data: SimulationDayResult[]
}

export default function SimulationChart({ data }: SimulationChartProps) {
  // Sample data for large datasets to improve performance
  const chartData = useMemo(() => {
    if (data.length <= 1000) {
      return data.map(d => ({
        date: d.date,
        actual: d.actualElevation,
        simulated: d.simulatedElevation
      }))
    }
    
    // Sample every Nth point for large datasets
    const sampleRate = Math.ceil(data.length / 1000)
    return data
      .filter((_, i) => i % sampleRate === 0 || i === data.length - 1)
      .map(d => ({
        date: d.date,
        actual: d.actualElevation,
        simulated: d.simulatedElevation
      }))
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
  
  // Format date for X-axis
  const formatXAxis = (dateStr: string) => {
    const date = new Date(dateStr)
    const year = date.getFullYear()
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    // Show year at start of each year
    if (date.getMonth() === 0) {
      return `${year}`
    }
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
  const DEADPOOL = 3490
  const MIN_POWER = 3525

  return (
    <div className="h-[300px] sm:h-[400px] lg:h-[500px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 20, left: 60, bottom: 20 }}
        >
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="#e0e0e0" 
            strokeOpacity={0.8}
          />
          
          <XAxis 
            dataKey="date"
            tickFormatter={formatXAxis}
            tick={{ fontSize: 11, fill: '#888' }}
            tickLine={{ stroke: '#ccc' }}
            axisLine={{ stroke: '#ccc' }}
            interval="preserveStartEnd"
            minTickGap={50}
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
                fontSize: 10 
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
                fontSize: 10 
              }}
            />
          )}
          
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

