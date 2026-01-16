import type { WaterYearSummary, WaterYearAnalysis } from '@/lib/db'

interface WaterYearTableProps {
  summaries: WaterYearSummary[]
  analysis?: WaterYearAnalysis[]  // Optional enhanced data with snowpack correlation
}

export default function WaterYearTable({ summaries, analysis }: WaterYearTableProps) {
  // Create a map for quick lookup of analysis data by water year
  const analysisMap = new Map(analysis?.map(a => [a.water_year, a]) || [])
  
  return (
    <div>
      <h2 className="text-2xl font-light mb-4 text-gray-900">Water Year Summaries</h2>
      {analysis && analysis.length > 0 && (
        <p className="text-sm text-gray-500 mb-6 font-light">
          Showing seasonal cycle analysis with snowpack correlation for years 1986+
        </p>
      )}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-light">Water Year</th>
                {analysis && analysis.length > 0 && (
                  <>
                    <th className="px-4 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Snowpack %</th>
                    <th className="px-4 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Runoff Gain</th>
                    <th className="px-4 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light hidden sm:table-cell">Low Date</th>
                    <th className="px-4 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light hidden sm:table-cell">Peak Date</th>
                  </>
                )}
                <th className="px-4 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Total Inflow</th>
                <th className="px-4 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Total Outflow</th>
                <th className="px-4 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Net Flow</th>
                <th className="px-4 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light hidden md:table-cell">Avg Elevation (ft)</th>
                <th className="px-4 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light hidden lg:table-cell">Min Elevation (ft)</th>
                <th className="px-4 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light hidden lg:table-cell">Max Elevation (ft)</th>
                <th className="px-4 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light hidden xl:table-cell">Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summaries.map((summary) => {
                const yearAnalysis = analysisMap.get(summary.water_year)
                const snowpackPct = yearAnalysis?.peak_swe_percent_of_median
                const runoffGain = yearAnalysis?.runoff_gain_ft
                const peakDate = yearAnalysis?.peak_date
                const lowDate = yearAnalysis?.pre_runoff_low_date
                const hadRise = yearAnalysis?.had_runoff_rise
                
                return (
                  <tr key={summary.water_year} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 text-sm text-gray-900 font-light">
                      {summary.water_year}
                    </td>
                    {analysis && analysis.length > 0 && (
                      <>
                        <td className="px-4 py-4 text-sm text-right font-light">
                          {snowpackPct ? (
                            <span className={
                              snowpackPct >= 130 ? 'text-[#4a90a4]' :  // Blue for high
                              snowpackPct >= 100 ? 'text-[#8b9a6b]' :  // Green for above median
                              snowpackPct >= 80 ? 'text-[#d4a574]' :   // Orange for below
                              'text-[#c99a7a]'                          // Red-brown for low
                            }>
                              {snowpackPct.toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-right font-light">
                          {runoffGain !== null && runoffGain !== undefined ? (
                            <span className={
                              !hadRise ? 'text-[#c99a7a]' :
                              runoffGain >= 30 ? 'text-[#4a90a4]' :
                              runoffGain >= 10 ? 'text-[#8b9a6b]' :
                              'text-[#d4a574]'
                            }>
                              {runoffGain >= 0 ? '+' : ''}{runoffGain.toFixed(1)} ft
                              {!hadRise && <span className="text-xs ml-1">(no rise)</span>}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-right text-gray-600 font-light hidden sm:table-cell">
                          {lowDate ? (
                            new Date(lowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-right text-gray-600 font-light hidden sm:table-cell">
                          {peakDate ? (
                            new Date(peakDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-4 text-sm text-right text-gray-900 font-light">
                      <div>{(summary.total_inflow_af / 1000000).toFixed(2)}M acre-ft</div>
                      <div className="text-xs text-gray-500 hidden sm:block">({summary.total_inflow_cfs.toLocaleString()} cfs-days)</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-right text-gray-900 font-light">
                      <div>{(summary.total_outflow_af / 1000000).toFixed(2)}M acre-ft</div>
                      <div className="text-xs text-gray-500 hidden sm:block">({summary.total_outflow_cfs.toLocaleString()} cfs-days)</div>
                    </td>
                    <td className={`px-4 py-4 text-sm text-right font-light ${
                      summary.net_flow_af >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'
                    }`}>
                      <div>{summary.net_flow_af >= 0 ? '+' : ''}{(summary.net_flow_af / 1000000).toFixed(2)}M acre-ft</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-right text-gray-900 font-light hidden md:table-cell">
                      {summary.avg_elevation.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-sm text-right text-gray-900 font-light hidden lg:table-cell">
                      {summary.min_elevation.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-sm text-right text-gray-900 font-light hidden lg:table-cell">
                      {summary.max_elevation.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-sm text-right text-gray-500 font-light hidden xl:table-cell">
                      {summary.days}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Legend for snowpack colors */}
      {analysis && analysis.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-[#4a90a4]"></span>
            <span>130%+ snowpack</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-[#8b9a6b]"></span>
            <span>100-130% snowpack</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-[#d4a574]"></span>
            <span>80-100% snowpack</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-[#c99a7a]"></span>
            <span>&lt;80% snowpack</span>
          </span>
        </div>
      )}
    </div>
  )
}
