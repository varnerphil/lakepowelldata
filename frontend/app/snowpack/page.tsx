import Link from 'next/link'
import SnowpackCharts from '@/components/snowpack/SnowpackCharts'
import SnowpackMap from '@/components/snowpack/SnowpackMap'
import TributarySnowpack from '@/components/snowpack/TributarySnowpack'
import BasinPlotsChart from '@/components/snowpack/BasinPlotsChart'

// Revalidate every hour for updated snowpack data
export const revalidate = 3600

interface SNOTELSite {
  name: string
  elevation: number
  basin: string
  snowWaterEquivalent: {
    current: number | null
    median: number | null
    percentOfMedian: number | null
  }
  totalPrecipitation: {
    current: number | null
    median: number | null
    percentOfMedian: number | null
  }
}

interface BasinData {
  name: string
  snowWaterEquivalentIndex: number | null
  totalPrecipitationIndex: number | null
}

interface SNOTELData {
  date: string
  sites: SNOTELSite[]
  basins: BasinData[]
}

async function getSNOTELData(): Promise<SNOTELData | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/snowpack`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error('Error fetching SNOTEL data:', error)
    return null
  }
}

interface BasinPlotsData {
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

async function getBasinPlotsData(): Promise<BasinPlotsData | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/basin-plots`, {
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error('Error fetching basin plots data:', error)
    return null
  }
}

export default async function SnowpackPage() {
  const data = await getSNOTELData()
  const basinPlotsData = await getBasinPlotsData()

  if (!data) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-16">
        <div className="text-center">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-2 sm:mb-4">
            Snowpack Data
          </h1>
          <p className="text-sm sm:text-lg text-gray-500 font-light">Unable to load SNOTEL data at this time.</p>
        </div>
      </div>
    )
  }

  // Include all sites from the text file - they may have percentOfMedian even if current is null
  // Filter to sites that have at least some data (current, median, or percentOfMedian)
  const sitesWithData = data.sites.filter(s => 
    s.snowWaterEquivalent.current !== null || 
    s.totalPrecipitation.current !== null ||
    s.snowWaterEquivalent.percentOfMedian !== null ||
    s.totalPrecipitation.percentOfMedian !== null ||
    s.snowWaterEquivalent.median !== null ||
    s.totalPrecipitation.median !== null
  )

  // Group ALL sites by basin (including those that might be filtered out above)
  // This ensures basin site counts are accurate - shows all sites from text file
  const allSitesByBasin = data.sites.reduce((acc, site) => {
    if (!acc[site.basin]) {
      acc[site.basin] = []
    }
    acc[site.basin].push(site)
    return acc
  }, {} as Record<string, SNOTELSite[]>)
  
  // Also group sites with data for calculations
  const sitesByBasin = sitesWithData.reduce((acc, site) => {
    if (!acc[site.basin]) {
      acc[site.basin] = []
    }
    acc[site.basin].push(site)
    return acc
  }, {} as Record<string, SNOTELSite[]>)

  // Calculate basin averages from sites when basin index is missing
  const basinsWithCalculatedIndex = data.basins.map(basin => {
    // If basin already has an index, use it
    if (basin.snowWaterEquivalentIndex !== null) {
      return basin
    }
    
    // Otherwise, calculate from sites
    const basinSites = sitesByBasin[basin.name] || []
    const sitesWithSWE = basinSites.filter(s => s.snowWaterEquivalent.percentOfMedian !== null)
    
    if (sitesWithSWE.length > 0) {
      const avgSWE = sitesWithSWE.reduce((sum, s) => sum + (s.snowWaterEquivalent.percentOfMedian || 0), 0) / sitesWithSWE.length
      return {
        ...basin,
        snowWaterEquivalentIndex: Math.round(avgSWE)
      }
    }
    
    return basin
  })

  // Calculate statistics
  const avgSWEPercent = sitesWithData
    .filter(s => s.snowWaterEquivalent.percentOfMedian !== null)
    .reduce((sum, s) => sum + (s.snowWaterEquivalent.percentOfMedian || 0), 0) / 
    sitesWithData.filter(s => s.snowWaterEquivalent.percentOfMedian !== null).length

  const sitesAboveMedian = sitesWithData.filter(s => 
    s.snowWaterEquivalent.percentOfMedian !== null && s.snowWaterEquivalent.percentOfMedian > 100
  ).length

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-16">
      {/* Header */}
      <div className="mb-8 sm:mb-12 text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-2 sm:mb-4">
          Colorado Snowpack
        </h1>
        <p className="text-sm sm:text-lg text-gray-500 font-light mb-2">
          SNOTEL Data as of {data.date}
        </p>
        <p className="text-xs sm:text-sm text-gray-400 font-light">
          Based on Mountain Data from NRCS SNOTEL Sites
        </p>
        
        {/* Collapsible Explanation Section */}
        <details className="mt-6 inline-block">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 font-light underline decoration-dotted underline-offset-4">
            Understanding Snowpack Data
          </summary>
          <div className="mt-4 card p-6 lg:p-8 text-left max-w-3xl mx-auto">
            <div className="space-y-4 text-gray-600 font-light">
              <p>
                <strong className="text-gray-900">Snow Water Equivalent (SWE)</strong> measures the amount of water contained in the snowpack. 
                It's expressed in inches and represents how much water would be released if all the snow melted at once.
              </p>
              <p>
                <strong className="text-gray-900">% of Median</strong> compares current SWE values to the historical median (1991-2020) for the same date. 
                Values above 100% indicate above-average snowpack, while values below 100% indicate below-average conditions.
              </p>
              <p>
                <strong className="text-gray-900">SNOTEL Sites</strong> are automated weather stations operated by the Natural Resources Conservation Service (NRCS) 
                that measure snowpack, precipitation, and temperature in mountain watersheds. These measurements help predict water supply for downstream reservoirs like Lake Powell.
              </p>
            </div>
          </div>
        </details>
      </div>

      {/* Historical Snow Water Equivalent Trends */}
      {basinPlotsData && (
        <div className="mb-12">
          <div className="card p-6 lg:p-8">
            <h2 className="text-2xl font-light mb-4 text-gray-900">Historical Snow Water Equivalent Trends</h2>
            <p className="text-sm text-gray-500 mb-6 font-light">
              This chart shows historical snow water equivalent trends for the Upper Colorado River Region from 1986 to present. 
              The shaded bands represent percentile ranges (10th, 30th, 70th, 90th) based on period of record data. 
              The current year is highlighted in black, while historical years are shown in lighter colors. 
              Statistical reference lines show the minimum, median, and maximum values for each date.
            </p>
            <BasinPlotsChart
              years={basinPlotsData.years}
              percentiles={basinPlotsData.percentiles}
              statistics={basinPlotsData.statistics}
              currentYear={basinPlotsData.currentYear}
              currentStats={basinPlotsData.currentStats}
            />
            <p className="text-xs text-gray-400 mt-4 font-light">
              Statistical shading percentiles are calculated from period of record (POR) data, excluding the current water year. 
              Percentile categories range from: minimum to 10th percentile, 10th-30th, 30th-70th, 70th-90th, and 90th-maximum.
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="card p-6 text-center">
          <div className="text-sm uppercase tracking-wider text-gray-500 mb-2 font-light">Total Sites</div>
          <div className="text-4xl font-light text-gray-900">{sitesWithData.length}</div>
          <p className="text-xs text-gray-400 mt-2 font-light">SNOTEL monitoring stations reporting data</p>
        </div>
        <div className="card p-6 text-center">
          <div className="text-sm uppercase tracking-wider text-gray-500 mb-2 font-light">Avg % of Median</div>
          <div className="text-4xl font-light text-gray-900">
            {isNaN(avgSWEPercent) ? 'N/A' : `${Math.round(avgSWEPercent)}%`}
          </div>
          <p className="text-xs text-gray-400 mt-2 font-light">Average across all reporting sites</p>
        </div>
        <div className="card p-6 text-center">
          <div className="text-sm uppercase tracking-wider text-gray-500 mb-2 font-light">Sites Above Median</div>
          <div className="text-4xl font-light text-gray-900">{sitesAboveMedian}</div>
          <p className="text-xs text-gray-400 mt-2 font-light">Sites with &gt;100% of median SWE</p>
        </div>
      </div>

      {/* Tributary Snowpack Section */}
      <div className="mb-12">
        <TributarySnowpack sites={sitesWithData} basins={basinsWithCalculatedIndex} />
      </div>

      {/* Charts Section */}
      <div className="mb-12">
        <div className="card p-6 lg:p-8">
          <h2 className="text-2xl font-light mb-4 text-gray-900">Basin Comparison Charts</h2>
          <p className="text-sm text-gray-500 mb-6 font-light">
            Compare snowpack conditions across different river basins in the Colorado River watershed
          </p>
          <SnowpackCharts 
            basins={basinsWithCalculatedIndex.map(basin => ({
              ...basin,
              siteCount: (allSitesByBasin[basin.name] || []).length
            }))}
          />
        </div>
      </div>

      {/* Basin Summary */}
      <div className="mb-12">
        <div className="card p-6 lg:p-8">
          <h2 className="text-2xl font-light mb-4 text-gray-900">Basin Summary</h2>
          <p className="text-sm text-gray-500 mb-6 font-light">
            Detailed breakdown of snowpack conditions by river basin. The Basin Index represents the average 
            snowpack percentage across all SNOTEL sites within each basin.
          </p>
          <div className="overflow-hidden -mx-6 -my-6">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-light">Basin</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">SWE Index (%)</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Precipitation Index (%)</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Sites</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {basinsWithCalculatedIndex.map((basin) => {
                  // Use allSitesByBasin to get accurate site counts (all sites from text file)
                  const allBasinSites = allSitesByBasin[basin.name] || []
                  return (
                    <tr key={basin.name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-900 font-light">{basin.name}</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                        {basin.snowWaterEquivalentIndex !== null ? (
                          <span className={basin.snowWaterEquivalentIndex >= 100 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}>
                            {basin.snowWaterEquivalentIndex}%
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                        {basin.totalPrecipitationIndex !== null ? (
                          <span className={basin.totalPrecipitationIndex >= 100 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}>
                            {basin.totalPrecipitationIndex}%
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                        {allBasinSites.length}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      </div>

      {/* Top Sites by SWE */}
      <div className="mb-12">
        <div className="card p-6 lg:p-8">
          <h2 className="text-2xl font-light mb-4 text-gray-900">Top Sites by Snow Water Equivalent</h2>
          <p className="text-sm text-gray-500 mb-6 font-light">
            SNOTEL sites with the highest current snow water equivalent measurements. The bars show current SWE 
            compared to the historical median, with the percentage indicating how the current year compares to average.
          </p>
          <div className="space-y-4">
            {sitesWithData
              .filter(s => s.snowWaterEquivalent.current !== null)
              .sort((a, b) => (b.snowWaterEquivalent.current || 0) - (a.snowWaterEquivalent.current || 0))
              .slice(0, 10)
              .map((site, index) => {
                const percent = Number(site.snowWaterEquivalent.percentOfMedian) || 0
                const current = Number(site.snowWaterEquivalent.current) || 0
                const median = Number(site.snowWaterEquivalent.median) || 0
                
                return (
                  <div key={`${site.basin}-${site.name}-${site.elevation}-${index}`} className="flex items-center gap-6">
                    <div className="w-64">
                      <div className="text-sm font-light text-gray-900">{site.name}</div>
                      <div className="text-xs text-gray-500 font-light mt-1">
                        {site.basin} • {site.elevation} ft
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
                        <div
                          className="absolute left-0 top-0 bottom-0 rounded-lg transition-all"
                          style={{
                            width: `${Math.min(100, (current / (median || current)) * 100)}%`,
                            backgroundColor: percent >= 100 ? '#8b9a6b' : '#d4a574',
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-light text-gray-900">
                          {current.toFixed(1)}" / {median.toFixed(1)}" ({percent.toFixed(0)}%)
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* All Sites Table */}
      <div className="mb-12">
        <h2 className="text-2xl font-light mb-4 text-gray-900">All SNOTEL Sites</h2>
        <p className="text-sm text-gray-500 mb-6 font-light">
          Complete list of all SNOTEL monitoring sites with current snowpack and precipitation data. 
          SWE values are in inches. Percentages compare current values to the 1991-2020 median for the same date.
        </p>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-light">Site Name</th>
                  <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-light">Basin</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Elevation (ft)</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">SWE Current</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">SWE Median</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">SWE %</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Precip Current</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Precip %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sitesWithData.map((site, index) => {
                  const swePercent = site.snowWaterEquivalent.percentOfMedian
                  const precipPercent = site.totalPrecipitation.percentOfMedian
                  
                  return (
                    <tr key={`${site.basin}-${site.name}-${site.elevation}-${index}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-900 font-light">{site.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-light">{site.basin}</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">{site.elevation}</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                        {site.snowWaterEquivalent.current !== null ? `${Number(site.snowWaterEquivalent.current).toFixed(1)}"` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                        {site.snowWaterEquivalent.median !== null ? `${Number(site.snowWaterEquivalent.median).toFixed(1)}"` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-light">
                        {swePercent !== null ? (
                          <span className={Number(swePercent) >= 100 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}>
                            {Number(swePercent).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                        {site.totalPrecipitation.current !== null ? `${Number(site.totalPrecipitation.current).toFixed(1)}"` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-light">
                        {precipPercent !== null ? (
                          <span className={Number(precipPercent) >= 100 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}>
                            {Number(precipPercent).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

