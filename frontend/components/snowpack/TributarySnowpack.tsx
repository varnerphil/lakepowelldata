'use client'

interface SNOTELSite {
  name: string
  elevation: number
  basin: string
  snowWaterEquivalent: {
    current: number | null
    median: number | null
    percentOfMedian: number | null
  }
}

interface BasinData {
  name: string
  snowWaterEquivalentIndex: number | null
}

interface TributarySnowpackProps {
  sites: SNOTELSite[]
  basins: BasinData[]
}

// Map SNOTEL basins to major tributaries that feed into Lake Powell
// Volume contribution percentages are based on typical annual flow contributions to Lake Powell
const tributaryMapping: Record<string, { basins: string[], description?: string, volumePercent: number }> = {
  'Colorado River': {
    basins: [
      'UPPER COLORADO RIVER HEADWATERS',
      'ROARING FORK RIVER BASIN',
      'GUNNISON RIVER BASIN', // Gunnison flows into Colorado
    ],
    volumePercent: 65, // Includes Green River which flows into Colorado before Lake Powell
  },
  'San Juan River': {
    basins: [
      'SAN JUAN RIVER HEADWATERS',
    ],
    volumePercent: 20,
  },
  'South Eastern Utah': {
    basins: [
      'SOUTH EASTERN UTAH',
      'UPPER GREEN RIVER BASIN',
      'YAMPA/WHITE RIVER BASINS', // Yampa and White flow into Green
      'DIRTY DEVIL RIVER BASIN',
      'ESCALANTE RIVER BASINS',
      'DUCHESNE RIVER BASIN',
      'PRICE-SAN RAFAEL',
    ],
    description: 'Includes Green River, Dirty Devil, Escalante, Duchesne, and Price-San Rafael rivers',
    volumePercent: 15, // Smaller direct tributaries and some Green River contribution
  },
}

export default function TributarySnowpack({ sites, basins }: TributarySnowpackProps) {
  // Calculate snowpack percentage for each tributary
  const tributaryStats = Object.entries(tributaryMapping).map(([tributary, config]) => {
    const basinNames = config.basins
    
    // Find all sites in these basins
    const tributarySites = sites.filter(site => 
      basinNames.some(basinName => 
        site.basin.includes(basinName) || basinName.includes(site.basin)
      )
    )
    
    // Calculate average SWE percent
    const sitesWithData = tributarySites.filter(s => s.snowWaterEquivalent.percentOfMedian !== null)
    const avgSWEPercent = sitesWithData.length > 0
      ? sitesWithData.reduce((sum, s) => sum + (s.snowWaterEquivalent.percentOfMedian || 0), 0) / sitesWithData.length
      : null
    
    // Also check basin index if available - use the first matching basin with an index
    const basinIndex = basins.find(b => 
      basinNames.some(bn => 
        (b.name.includes(bn) || bn.includes(b.name)) && 
        b.snowWaterEquivalentIndex !== null
      )
    )
    
    // Use basin index if we don't have enough site data, otherwise use calculated average
    const finalPercent = sitesWithData.length >= 3 
      ? avgSWEPercent 
      : (avgSWEPercent || basinIndex?.snowWaterEquivalentIndex || null)
    
    return {
      tributary,
      avgSWEPercent: finalPercent,
      siteCount: tributarySites.length,
      sitesWithData: sitesWithData.length,
      description: config.description,
      volumePercent: config.volumePercent,
    }
  })

  const getColor = (percent: number | null) => {
    if (percent === null) return '#cbd5e1'
    if (percent >= 120) return '#8b9a6b' // Green
    if (percent >= 100) return '#d4a574' // Beige
    if (percent >= 80) return '#e5a77d'  // Light orange
    return '#c99a7a' // Red
  }

  const getStatus = (percent: number | null) => {
    if (percent === null) return 'No Data'
    if (percent >= 120) return 'Above Normal'
    if (percent >= 100) return 'Normal'
    if (percent >= 80) return 'Below Normal'
    return 'Well Below Normal'
  }

  return (
    <div className="card p-4 sm:p-6 lg:p-8">
      <h3 className="text-lg sm:text-xl font-light mb-2 text-gray-900">Snowpack by Major Tributary</h3>
      <p className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6 font-light">
        Average snowpack percentage for each major tributary that feeds into Lake Powell
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {tributaryStats.map(({ tributary, avgSWEPercent, siteCount, sitesWithData, description, volumePercent }) => (
          <div
            key={tributary}
            className="border border-gray-200 rounded-lg p-4 sm:p-6 hover:border-gray-300 transition-colors"
            style={{
              borderLeftWidth: '4px',
              borderLeftColor: getColor(avgSWEPercent),
            }}
          >
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h4 className="text-base sm:text-xl font-light text-gray-900">{tributary}</h4>
              <div
                className="w-3 h-3 sm:w-4 sm:h-4 rounded-full"
                style={{ backgroundColor: getColor(avgSWEPercent) }}
              />
            </div>
            <div className="text-3xl sm:text-4xl font-light text-gray-900 mb-1 sm:mb-2">
              {avgSWEPercent !== null ? `${Math.round(avgSWEPercent)}%` : 'N/A'}
            </div>
            <div className="text-xs sm:text-sm text-gray-500 font-light mb-2">
              {getStatus(avgSWEPercent)} • {sitesWithData} of {siteCount} sites
            </div>
            
            {/* Volume Contribution */}
            <div className="mt-3 sm:mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-500 font-light">Volume</span>
                <span className="text-base sm:text-lg font-light text-gray-900">{volumePercent}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 sm:h-2">
                <div
                  className="h-1.5 sm:h-2 rounded-full transition-all"
                  style={{
                    width: `${volumePercent}%`,
                    backgroundColor: getColor(avgSWEPercent),
                    opacity: 0.6,
                  }}
                />
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 font-light mt-1 hidden sm:block">
                Typical annual flow contribution to Lake Powell
              </p>
            </div>
            
            {description && (
              <div className="text-[10px] sm:text-xs text-gray-400 font-light italic mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-100 hidden sm:block">
                {description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

