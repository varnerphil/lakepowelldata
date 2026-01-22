import { getStatisticalSummary, getCurrentData, getHistoricalData } from '@/lib/data-queries'
import { CurrentStatus, HistoricalChart, WaterYearTable, RecentMeasurements, HistoricalAverages, ElevationStorageCapacity, SnowpackProjection } from '@/components/data-display'
import { getHistoricalWaterYearLows, getRunoffSeasonOutflow, getHistoricalWaterYearHighs, getWaterMeasurementsByRange, getHistoricalDropsToLow, getAllRamps, getElevationStorageCapacity, getWaterYearAnalysis, getSimilarSnowpackYears } from '@/lib/db'
import { projectFromSnowpack } from '@/lib/calculations'
import { formatDateString } from '@/lib/date-utils'
import StatsTabs from '@/components/stats/StatsTabs'
import BasinPlotsChart from '@/components/snowpack/BasinPlotsChart'

// Revalidate every hour
export const revalidate = 3600

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; range?: string; start?: string; end?: string }>
}) {
  const params = await searchParams
  const activeTab = params.tab || 'current'
  
  // Fetch all data needed for the stats page
  const currentData = await getCurrentData()
  const historicalData = await getHistoricalData((params.range as any) || '1year', params.start, params.end)
  const statsSummary = await getStatisticalSummary()
  
  // Get snowpack data for projected runoff
  let snowpackData = null
  try {
      const snowpackResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/snowpack`, {
        next: { revalidate: 3600 } // Cache for 1 hour
      })
    if (snowpackResponse.ok) {
      snowpackData = await snowpackResponse.json()
    }
  } catch (error) {
    console.error('Error fetching snowpack data:', error)
  }

  // Get basin plots data for historical SWE trends
  let basinPlotsData = null
  try {
      const basinPlotsResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/basin-plots`, {
        next: { revalidate: 3600 } // Cache for 1 hour
      })
    if (basinPlotsResponse.ok) {
      basinPlotsData = await basinPlotsResponse.json()
    }
  } catch (error) {
    console.error('Error fetching basin plots data:', error)
  }

  // Calculate historical inflow for runoff projections
  const historicalInflow = statsSummary.waterYearSummaries
    .slice(0, 10) // Last 10 years
    .map(wy => wy.total_inflow_af)
  
  // Get historical water year lows for elevation projection
  const historicalLows = currentData?.current 
    ? await getHistoricalWaterYearLows(currentData.current.elevation, 50)
    : []
  
  // Get typical outflow during runoff season
  const typicalOutflow = await getRunoffSeasonOutflow()
  
  // Get historical water year highs for typical high date
  const historicalHighs = await getHistoricalWaterYearHighs()
  
  // Get elevation storage capacity data
  const elevationStorageCapacity = await getElevationStorageCapacity()
  
  // Get water year analysis with snowpack correlation
  const waterYearAnalysis = await getWaterYearAnalysis()
  
  // Get current snowpack percentage for projection
  let currentSnowpackPercent = 100  // Default to 100% if not available
  if (basinPlotsData && basinPlotsData.currentStats && basinPlotsData.currentStats.percentOfMedian) {
    currentSnowpackPercent = basinPlotsData.currentStats.percentOfMedian
  }
  
  // Get similar historical years for snowpack projection
  const similarSnowpackYears = await getSimilarSnowpackYears(currentSnowpackPercent, 20, 10)
  
  // Get last 30 days of historical data for chart
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentHistoricalData = currentData?.current
    ? (await getWaterMeasurementsByRange(
        thirtyDaysAgo.toISOString().split('T')[0],
        new Date().toISOString().split('T')[0]
      )).map(d => ({ date: d.date, elevation: d.elevation }))
    : []
  
  // Get historical drops to typical low date for more accurate projection
  const today = new Date().toISOString().split('T')[0]
  const typicalLowDate = historicalLows.length > 0 && historicalLows[Math.floor(historicalLows.length / 2)].date_of_min
    ? historicalLows[Math.floor(historicalLows.length / 2)].date_of_min
    : new Date(new Date().getFullYear(), 3, 21).toISOString().split('T')[0] // Default to April 21
  
  // Get all historical drops (no limit) so we can show all available data
  const historicalDrops = currentData?.current
    ? await getHistoricalDropsToLow(
        today,
        currentData.current.elevation,
        typicalLowDate,
        50, // 50ft elevation tolerance
        undefined // No limit - get all matches
      )
    : []
  
  // Get ramp data for reference lines on chart
  const allRamps = await getAllRamps()
  
  // Filter for specific ramps: Bullfrog North Ramp and Stateline Launch
  // (Stateline Launch is likely what "Wahweap Stateline Ramp" refers to)
  const selectedRamps = allRamps.filter(ramp => 
    ramp.name === 'Bullfrog North Ramp' ||
    ramp.name === 'Stateline Launch'
  )
  
  const ramps = allRamps  // Keep all ramps for other components


  if (!currentData) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-16">
        <div className="text-center">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-2 sm:mb-4">
            Statistical Resources
          </h1>
          <p className="text-sm sm:text-lg text-gray-500 font-light">No data available at this time.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-16">
      {/* Header */}
      <div className="mb-8 sm:mb-12 text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-2 sm:mb-4">
          Statistical Resources
        </h1>
        <p className="text-sm sm:text-lg text-gray-500 font-light max-w-2xl mx-auto">
          Comprehensive data library and statistical analysis for Lake Powell water data
        </p>
      </div>

      {/* Tabs */}
      <StatsTabs activeTab={activeTab}>
        {/* Current Data Tab */}
        <div id="current" className={activeTab === 'current' ? 'block' : 'hidden'}>
          <div className="space-y-12">
            <div>
              <h2 className="text-2xl font-light mb-6 text-gray-900">Current Conditions</h2>
              <CurrentStatus current={currentData.current} recent={currentData.recent} />
            </div>
            
            <div>
              <RecentMeasurements measurements={currentData.recent} limit={20} />
            </div>

            <div>
              <HistoricalAverages averages={currentData.averages} currentElevation={currentData.current.elevation} />
            </div>
          </div>
        </div>

        {/* Historical Data Tab */}
        <div id="historical" className={activeTab === 'historical' ? 'block' : 'hidden'}>
          <div className="space-y-12">
            <div>
              <h2 className="text-2xl font-light mb-6 text-gray-900">Historical Trends</h2>
              <HistoricalChart 
                data={historicalData.measurements}
                startDate={historicalData.startDate}
                endDate={historicalData.endDate}
                currentRange={historicalData.range}
                formAction="/stats"
                ramps={selectedRamps}
              />
            </div>

            {/* Monthly Averages */}
            <div>
              <h2 className="text-2xl font-light mb-6 text-gray-900">Monthly Averages</h2>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-light">Year</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-light">Month</th>
                        <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Avg Elevation (ft)</th>
                        <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Avg Inflow (cfs)</th>
                        <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Total Inflow (acre-ft)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {statsSummary.monthlyAverages.slice(-24).reverse().map((month, idx) => (
                        <tr key={`${month.year}-${month.month}-${idx}`} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-sm text-gray-900 font-light">{month.year}</td>
                          <td className="px-6 py-4 text-sm text-gray-900 font-light">
                            {new Date(month.year, month.month - 1).toLocaleDateString('en-US', { month: 'long' })}
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                            {month.avg_elevation.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                            {month.avg_inflow.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                            {(month.total_inflow_af / 1000000).toFixed(2)}M
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Seasonal Trends */}
            <div>
              <h2 className="text-2xl font-light mb-6 text-gray-900">Seasonal Trends</h2>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-light">Season</th>
                        <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Avg Elevation (ft)</th>
                        <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Avg Inflow (cfs)</th>
                        <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Total Inflow (acre-ft)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {statsSummary.seasonalTrends.map((season) => (
                        <tr key={season.season} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-sm text-gray-900 font-light capitalize">{season.season}</td>
                          <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                            {season.avg_elevation.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                            {season.avg_inflow.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                            {(season.total_inflow_af / 1000000).toFixed(2)}M
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Statistical Analysis Tab */}
        <div id="analysis" className={activeTab === 'analysis' ? 'block' : 'hidden'}>
          <div className="space-y-12">
            <div>
              <h2 className="text-2xl font-light mb-6 text-gray-900">Elevation Distribution</h2>
              <div className="card p-6 lg:p-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">Minimum</div>
                    <div className="text-2xl font-light text-gray-900">{statsSummary.elevationDistribution.min.toFixed(2)} ft</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">10th Percentile</div>
                    <div className="text-2xl font-light text-gray-900">{statsSummary.elevationDistribution.p10.toFixed(2)} ft</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">Median (50th)</div>
                    <div className="text-2xl font-light text-gray-900">{statsSummary.elevationDistribution.p50.toFixed(2)} ft</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">90th Percentile</div>
                    <div className="text-2xl font-light text-gray-900">{statsSummary.elevationDistribution.p90.toFixed(2)} ft</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">25th Percentile</div>
                    <div className="text-2xl font-light text-gray-900">{statsSummary.elevationDistribution.p25.toFixed(2)} ft</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">75th Percentile</div>
                    <div className="text-2xl font-light text-gray-900">{statsSummary.elevationDistribution.p75.toFixed(2)} ft</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">Average</div>
                    <div className="text-2xl font-light text-gray-900">{statsSummary.elevationDistribution.avg.toFixed(2)} ft</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">Maximum</div>
                    <div className="text-2xl font-light text-gray-900">{statsSummary.elevationDistribution.max.toFixed(2)} ft</div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-light mb-6 text-gray-900">Flow Statistics</h2>
              <div className="card p-6 lg:p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-light mb-4 text-gray-900">Inflow</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500 font-light">Average</span>
                        <span className="text-sm font-light text-gray-900">{statsSummary.recentFlowStats.avg_inflow.toLocaleString()} cfs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500 font-light">Maximum</span>
                        <span className="text-sm font-light text-gray-900">{statsSummary.recentFlowStats.max_inflow.toLocaleString()} cfs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500 font-light">Minimum</span>
                        <span className="text-sm font-light text-gray-900">{statsSummary.recentFlowStats.min_inflow.toLocaleString()} cfs</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-gray-100">
                        <span className="text-sm text-gray-500 font-light">Total</span>
                        <span className="text-sm font-light text-gray-900">{(statsSummary.recentFlowStats.total_inflow_af / 1000000).toFixed(2)}M acre-ft</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-light mb-4 text-gray-900">Outflow</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500 font-light">Average</span>
                        <span className="text-sm font-light text-gray-900">{statsSummary.recentFlowStats.avg_outflow.toLocaleString()} cfs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500 font-light">Maximum</span>
                        <span className="text-sm font-light text-gray-900">{statsSummary.recentFlowStats.max_outflow.toLocaleString()} cfs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500 font-light">Minimum</span>
                        <span className="text-sm font-light text-gray-900">{statsSummary.recentFlowStats.min_outflow.toLocaleString()} cfs</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-gray-100">
                        <span className="text-sm text-gray-500 font-light">Total</span>
                        <span className="text-sm font-light text-gray-900">{(statsSummary.recentFlowStats.total_outflow_af / 1000000).toFixed(2)}M acre-ft</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 font-light">Net Flow</span>
                    <span className={`text-lg font-light ${statsSummary.recentFlowStats.net_flow_af >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}`}>
                      {statsSummary.recentFlowStats.net_flow_af >= 0 ? '+' : ''}
                      {(statsSummary.recentFlowStats.net_flow_af / 1000000).toFixed(2)}M acre-ft
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Projected Runoff Tab */}
        <div id="runoff" className={activeTab === 'runoff' ? 'block' : 'hidden'}>
          <div className="space-y-12">
            {/* Historical Snow Water Equivalent Trends */}
            {basinPlotsData && (
              <div>
                <h2 className="text-2xl font-light mb-4 text-gray-900">Historical Snow Water Equivalent Trends</h2>
                <p className="text-sm text-gray-500 mb-6 font-light">
                  This chart shows historical snow water equivalent trends for the Upper Colorado River Region from 1986 to present. 
                  The shaded bands represent percentile ranges (10th, 30th, 70th, 90th) based on period of record data. 
                  The current year is highlighted in black, while historical years are shown in lighter colors. 
                  Statistical reference lines show the minimum, median, and maximum values for each date.
                </p>
                <div className="card p-6 lg:p-8">
                  <BasinPlotsChart
                    years={basinPlotsData.years}
                    percentiles={basinPlotsData.percentiles}
                    statistics={basinPlotsData.statistics}
                    currentYear={basinPlotsData.currentYear}
                    currentStats={basinPlotsData.currentStats}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-4 font-light">
                  Statistical shading percentiles are calculated from period of record (POR) data, excluding the current water year. 
                  Percentile categories range from: minimum to 10th percentile, 10th-30th, 30th-70th, 70th-90th, and 90th-maximum.
                </p>
              </div>
            )}
            
            {/* Snowpack-Based Projection */}
            {currentData && similarSnowpackYears.length > 0 && (
              <div>
                <h2 className="text-2xl font-light mb-4 text-gray-900">Snowpack Runoff Projection</h2>
                <p className="text-sm text-gray-500 mb-6 font-light">
                  Projection based on historical years with similar peak snowpack percentage. 
                  This shows expected elevation gain during the runoff season (April-August) based on correlation analysis.
                </p>
                <SnowpackProjection 
                  projection={projectFromSnowpack(
                    currentSnowpackPercent,
                    currentData.current.elevation,
                    similarSnowpackYears,
                    elevationStorageCapacity
                  )}
                  currentElevation={currentData.current.elevation}
                />
              </div>
            )}
            
          </div>
        </div>

        {/* Storage Analysis Tab */}
        <div id="storage" className={activeTab === 'storage' ? 'block' : 'hidden'}>
          <div className="space-y-12">
            {/* Elevation Storage Capacity */}
            <ElevationStorageCapacity data={elevationStorageCapacity} />
            
            {/* Historical Storage Analysis */}
            <div>
              <h2 className="text-2xl font-light mb-6 text-gray-900">Historical Storage Capacity Analysis</h2>
              <div className="card overflow-hidden">
                {statsSummary.storageAnalysis && statsSummary.storageAnalysis.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-light">Date</th>
                          <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Elevation (ft)</th>
                          <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Content (acre-ft)</th>
                          <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">% of Capacity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {statsSummary.storageAnalysis.slice(-365).reverse().map((storage) => (
                          <tr key={storage.date} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900 font-light">
                              {formatDateString(storage.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                              {storage.elevation.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                              {(storage.content / 1000000).toFixed(2)}M
                            </td>
                            <td className="px-6 py-4 text-sm text-right font-light">
                              <span className={storage.percent_of_capacity >= 50 ? 'text-[#8b9a6b]' : storage.percent_of_capacity >= 25 ? 'text-[#d4a574]' : 'text-[#c99a7a]'}>
                                {storage.percent_of_capacity.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-center text-gray-500 font-light">
                    No storage analysis data available
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </StatsTabs>
    </div>
  )
}

