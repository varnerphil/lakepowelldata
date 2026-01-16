'use client'

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* SWE Index Chart */}
      <div className="card p-6 lg:p-8">
        <h3 className="text-xl font-light mb-6 text-gray-900">Snow Water Equivalent Index by Basin</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="name" 
              angle={-45}
              textAnchor="end"
              height={100}
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              label={{ value: '% of Median', angle: -90, position: 'insideLeft' }}
              domain={[0, 200]}
            />
            <Tooltip 
              formatter={(value: number) => [`${value}%`, 'SWE Index']}
            />
            <Legend />
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
      <div className="card p-6 lg:p-8">
        <h3 className="text-xl font-light mb-6 text-gray-900">SNOTEL Sites per Basin</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="name" 
              angle={-45}
              textAnchor="end"
              height={100}
              tick={{ fontSize: 12 }}
            />
            <YAxis label={{ value: 'Number of Sites', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Bar dataKey="sites" name="Sites" fill="#8b9a6b" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}




