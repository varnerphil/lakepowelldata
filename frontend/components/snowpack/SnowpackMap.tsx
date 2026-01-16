'use client'

interface SNOTELSite {
  name: string
  elevation: number
  basin: string
  snowWaterEquivalent: {
    current: number | null
    percentOfMedian: number | null
  }
}

interface SnowpackMapProps {
  sites: SNOTELSite[]
}

// Simplified geographic regions for Colorado SNOTEL sites
// This is a conceptual map - actual coordinates would require geocoding
const basinRegions: Record<string, { x: number; y: number; color: string }> = {
  'UPPER GREEN RIVER BASIN': { x: 20, y: 30, color: '#8b9a6b' },
  'DUCHESNE RIVER BASIN': { x: 30, y: 40, color: '#d4a574' },
  'YAMPA/WHITE RIVER BASINS': { x: 50, y: 50, color: '#c99a7a' },
  'PRICE-SAN RAFAEL': { x: 25, y: 60, color: '#e5a77d' },
  'ESCALANTE RIVER BASINS': { x: 15, y: 70, color: '#94a3b8' },
  'DIRTY DEVIL RIVER BASIN': { x: 20, y: 75, color: '#a8b8c8' },
  'UPPER COLORADO RIVER HEADWATERS': { x: 60, y: 30, color: '#8b9a6b' },
  'ROARING FORK RIVER BASIN': { x: 55, y: 45, color: '#d4a574' },
  'GUNNISON RIVER BASIN': { x: 50, y: 55, color: '#c99a7a' },
  'SOUTH EASTERN UTAH': { x: 40, y: 70, color: '#e5a77d' },
}

export default function SnowpackMap({ sites }: SnowpackMapProps) {
  // Group sites by basin and calculate average SWE percent
  const basinStats = sites.reduce((acc, site) => {
    if (!acc[site.basin]) {
      acc[site.basin] = {
        sites: [],
        avgSWEPercent: 0,
        totalSWEPercent: 0,
        count: 0
      }
    }
    acc[site.basin].sites.push(site)
    if (site.snowWaterEquivalent.percentOfMedian !== null) {
      acc[site.basin].totalSWEPercent += site.snowWaterEquivalent.percentOfMedian
      acc[site.basin].count++
    }
    return acc
  }, {} as Record<string, { sites: SNOTELSite[]; avgSWEPercent: number; totalSWEPercent: number; count: number }>)

  // Calculate averages
  Object.keys(basinStats).forEach(basin => {
    const stats = basinStats[basin]
    stats.avgSWEPercent = stats.count > 0 ? stats.totalSWEPercent / stats.count : 0
  })

  const getColor = (percent: number) => {
    if (percent >= 120) return '#8b9a6b' // Green
    if (percent >= 100) return '#d4a574' // Beige
    if (percent >= 80) return '#e5a77d'  // Light orange
    return '#c99a7a' // Red
  }

  return (
    <div className="card p-6 lg:p-8">
      <h3 className="text-xl font-light mb-6 text-gray-900">Basin Overview Map</h3>
      <div className="relative bg-gray-50 rounded-lg p-8" style={{ minHeight: '500px' }}>
        {/* Simplified map representation */}
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Basin regions */}
          {Object.entries(basinStats).map(([basin, stats]) => {
            const region = basinRegions[basin]
            if (!region) return null
            
            const color = getColor(stats.avgSWEPercent)
            const size = Math.max(3, Math.min(8, stats.sites.length / 5))
            
            return (
              <g key={basin}>
                <circle
                  cx={region.x}
                  cy={region.y}
                  r={size}
                  fill={color}
                  opacity={0.7}
                  stroke="#fff"
                  strokeWidth={0.5}
                />
                <text
                  x={region.x}
                  y={region.y + size + 2}
                  fontSize="2"
                  textAnchor="middle"
                  fill="#374151"
                  className="font-light"
                >
                  {basin.replace(' RIVER BASIN', '').replace(' BASIN', '').substring(0, 15)}
                </text>
                <text
                  x={region.x}
                  y={region.y + size + 4}
                  fontSize="1.5"
                  textAnchor="middle"
                  fill="#6b7280"
                  className="font-light"
                >
                  {stats.sites.length} sites
                </text>
              </g>
            )
          })}
        </svg>
        
        {/* Legend */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-center gap-6 text-xs font-light flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#8b9a6b]"></div>
              <span className="text-gray-600">≥120% (Above Normal)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#d4a574]"></div>
              <span className="text-gray-600">100-119% (Normal)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#e5a77d]"></div>
              <span className="text-gray-600">80-99% (Below Normal)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#c99a7a]"></div>
              <span className="text-gray-600">&lt;80% (Well Below Normal)</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-4 font-light">
            Circle size represents number of sites. Color represents average % of median SWE.
          </p>
        </div>
      </div>
    </div>
  )
}




