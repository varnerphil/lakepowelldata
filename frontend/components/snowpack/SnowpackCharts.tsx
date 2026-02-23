'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'

interface BasinData {
  name: string
  snowWaterEquivalentIndex: number | null
  totalPrecipitationIndex: number | null
  siteCount: number
}

interface SnowpackChartsProps {
  basins: BasinData[]
}

export default function SnowpackCharts({ basins }: SnowpackChartsProps) {
  const chartData = basins
    .filter(b => b.snowWaterEquivalentIndex !== null)
    .map(basin => ({
      name: basin.name.replace(' RIVER BASIN', '').replace(' BASIN', '').substring(0, 20),
      sweIndex: basin.snowWaterEquivalentIndex,
      precipIndex: basin.totalPrecipitationIndex,
      sites: basin.siteCount
    }))
    .sort((a, b) => (b.sweIndex || 0) - (a.sweIndex || 0))

  const getColor = (value: number | null) => {
    if (value === null) return '#cbd5e1'
    if (value >= 120) return '#8b9a6b' // Green - above normal
    if (value >= 100) return '#d4a574' // Beige - normal
    if (value >= 80) return '#e5a77d'  // Light orange - below normal
    return '#c99a7a' // Red - well below normal
  }

  const [isMobile, setIsMobile] = useState(true)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* SWE Index Chart */}
      <div className="card p-4 sm:p-6 lg:p-8">
        <h3 className="text-lg sm:text-xl font-light mb-4 sm:mb-6 text-gray-900">Snow Water Equivalent Index by Basin</h3>
        <ResponsiveContainer width="100%" height={isMobile ? 280 : 400}>
          <BarChart data={chartData} margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 40 } : { top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="name" 
              angle={-45}
              textAnchor="end"
              height={isMobile ? 80 : 100}
              tick={{ fontSize: isMobile ? 9 : 12 }}
            />
            <YAxis 
              label={isMobile ? undefined : { value: '% of Median', angle: -90, position: 'insideLeft' }}
              domain={[0, 200]}
              tick={{ fontSize: isMobile ? 10 : 12 }}
              width={isMobile ? 35 : 60}
            />
            <Tooltip 
              formatter={(value: number) => [`${value}%`, 'SWE Index']}
            />
            <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '12px' }} />
            <Bar dataKey="sweIndex" name="SWE Index (%)">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getColor(entry.sweIndex)} />
              ))}
            </Bar>
            <Bar dataKey="precipIndex" name="Precipitation Index (%)" fill="#94a3b8" opacity={0.7} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Site Count Chart */}
      <div className="card p-4 sm:p-6 lg:p-8">
        <h3 className="text-lg sm:text-xl font-light mb-4 sm:mb-6 text-gray-900">SNOTEL Sites per Basin</h3>
        <ResponsiveContainer width="100%" height={isMobile ? 280 : 400}>
          <BarChart data={chartData} margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 40 } : { top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="name" 
              angle={-45}
              textAnchor="end"
              height={isMobile ? 80 : 100}
              tick={{ fontSize: isMobile ? 9 : 12 }}
            />
            <YAxis
              label={isMobile ? undefined : { value: 'Number of Sites', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: isMobile ? 10 : 12 }}
              width={isMobile ? 30 : 60}
            />
            <Tooltip />
            <Bar dataKey="sites" name="Sites" fill="#8b9a6b" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}




