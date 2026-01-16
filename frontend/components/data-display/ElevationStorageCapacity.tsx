'use client'

import type { ElevationStorageCapacity } from '@/lib/db'

interface Props {
  data: ElevationStorageCapacity[]
}

export default function ElevationStorageCapacity({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="card p-6 lg:p-8">
        <h3 className="text-xl font-light mb-4 text-gray-900">Storage Capacity by Elevation</h3>
        <p className="text-gray-500 font-light">No elevation storage data available.</p>
      </div>
    )
  }

  // Filter to only show rows with valid storage_per_foot
  const validData = data.filter(d => d.storage_per_foot !== null && d.storage_per_foot > 0)
  
  // Calculate summary stats
  const lowestElev = data[0]
  const highestElev = data[data.length - 1]
  const totalStorageRange = highestElev.storage_at_elevation - lowestElev.storage_at_elevation
  const elevationRange = highestElev.elevation - lowestElev.elevation
  const avgStoragePerFoot = Math.round(totalStorageRange / elevationRange)

  return (
    <div className="card p-6 lg:p-8">
      <h3 className="text-xl font-light mb-4 text-gray-900">Storage Capacity by Elevation</h3>
      <p className="text-sm text-gray-500 mb-6 font-light">
        This table shows how many acre-feet of water are stored at each foot of elevation, 
        calculated from historical measurements. The lake is V-shaped, so higher elevations 
        store more water per foot.
      </p>
      
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Elevation Range</div>
          <div className="text-lg font-light text-gray-900">{lowestElev.elevation} - {highestElev.elevation} ft</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Storage Range</div>
          <div className="text-lg font-light text-gray-900">
            {(lowestElev.storage_at_elevation / 1_000_000).toFixed(1)}M - {(highestElev.storage_at_elevation / 1_000_000).toFixed(1)}M af
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Average Per Foot</div>
          <div className="text-lg font-light text-gray-900">{(avgStoragePerFoot / 1000).toFixed(1)}K af/ft</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Data Points</div>
          <div className="text-lg font-light text-gray-900">{data.length} elevations</div>
        </div>
      </div>

      {validData.length > 0 ? (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="min-w-full">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-gray-500 font-light">
                  Elevation (ft)
                </th>
                <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-gray-500 font-light">
                  Storage at Elevation
                </th>
                <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-gray-500 font-light">
                  AF Per Foot
                </th>
                <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-gray-500 font-light">
                  % Per Foot
                </th>
                <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-gray-500 font-light">
                  % of Full Pool
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {validData.map((item) => {
                // Color based on percent of full
                const pctColor = item.percent_of_full >= 75 
                  ? 'text-[#8b9a6b]' 
                  : item.percent_of_full >= 50 
                    ? 'text-[#a4b07a]'
                    : item.percent_of_full >= 25 
                      ? 'text-[#d4a574]' 
                      : 'text-[#c99a7a]'
                
                return (
                  <tr key={item.elevation} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 text-sm text-gray-900 font-light">
                      {item.elevation_range}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900 font-light">
                      {(item.storage_at_elevation / 1_000_000).toFixed(2)}M af
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900 font-light">
                      {item.storage_per_foot ? `${(item.storage_per_foot / 1000).toFixed(1)}K` : 'N/A'}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-500 font-light">
                      {item.percent_per_foot ? `${item.percent_per_foot.toFixed(1)}%` : 'N/A'}
                    </td>
                    <td className={`px-4 py-2 text-sm text-right font-light ${pctColor}`}>
                      {item.percent_of_full.toFixed(1)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 text-center text-gray-500 font-light">
          No valid elevation storage data available.
        </div>
      )}
      
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-gray-700 font-light">
          <strong className="font-medium">Note:</strong> Lake Powell has a V-shaped basin. 
          At lower elevations (~3400 ft), each foot holds about 20-30K acre-feet. 
          At higher elevations (~3700 ft), each foot holds 150-180K acre-feet.
          Full pool is 24,322,000 af at 3700 ft.
        </p>
      </div>
    </div>
  )
}
