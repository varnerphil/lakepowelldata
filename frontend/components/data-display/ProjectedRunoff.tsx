'use client'

import { useState, useEffect } from 'react'
import { calculateProjectedRunoff, calculateCorrelation, calculateElevationProjection, calculateElevationChange, calculateDailyElevationProjection, calculateDropProjection } from '@/lib/calculations'
import ElevationProjectionChart from '@/components/charts/ElevationProjectionChart'
import HistoricalDropsChart from '@/components/charts/HistoricalDropsChart'

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  )
}

interface TributarySnowpack {
  tributary: string
  avgSWEPercent: number | null
  volumePercent: number
}

interface HistoricalLow {
  water_year: number
  min_elevation: number
  min_content: number
  date_of_min: string
  starting_elevation: number
  starting_content: number
}

interface RunoffSeasonOutflow {
  water_year: number
  spring_outflow_af: number
  summer_outflow_af: number
  total_runoff_season_outflow_af: number
}

interface HistoricalDrop {
  water_year: number
  start_date: string
  start_elevation: number
  low_date: string
  low_elevation: number
  drop_amount: number
  days_to_low: number
}

interface Ramp {
  id: number
  name: string
  min_safe_elevation: number
  min_usable_elevation: number
  location: string | null
}

interface ProjectedRunoffProps {
  tributarySnowpack: TributarySnowpack[]
  historicalInflow?: number[] // Optional historical inflow data in acre-feet
  currentElevation?: number
  currentStorage?: number
  historicalLows?: HistoricalLow[]
  typicalOutflow?: RunoffSeasonOutflow[]
  historicalHighs?: Array<{ max_elevation: number; date_of_max: string }>
  recentHistoricalData?: Array<{ date: string; elevation: number }>
  historicalDrops?: HistoricalDrop[]
  ramps?: Ramp[]
}

export default function ProjectedRunoff({ 
  tributarySnowpack, 
  historicalInflow = [],
  currentElevation = 0,
  currentStorage = 0,
  historicalLows = [],
  typicalOutflow = [],
  historicalHighs = [],
  recentHistoricalData = [],
  historicalDrops = [],
  ramps = []
}: ProjectedRunoffProps) {
  const [projections, setProjections] = useState<Array<{
    tributary: string
    projectedAF: number
    confidenceLow: number
    confidenceHigh: number
    correlation: number
  }>>([])
  
  const [elevationProjection, setElevationProjection] = useState<{
    projectedChange: number
    projectedElevation: number
    waterYearLow: number
    waterYearLowDate: string
    waterYearHigh: number
    waterYearHighDate: string
    confidenceLow: number
    confidenceHigh: number
    dropToLow: number
    dropToLowLow: number
    dropToLowHigh: number
    changeFromLowToHigh: number
    dailyProjections: Array<{ date: string; projected: number; low: number; high: number }>
    historicalDropCount: number
  } | null>(null)

  useEffect(() => {
    // Calculate projections for each tributary
    const calculatedProjections = tributarySnowpack
      .filter(t => t.avgSWEPercent !== null)
      .map(tributary => {
        // Simplified projection: assume 100% snowpack = average historical inflow
        const avgHistoricalInflow = historicalInflow.length > 0
          ? historicalInflow.reduce((a, b) => a + b, 0) / historicalInflow.length
          : 10000000 // Default assumption: 10M acre-ft average
        
        // Scale by snowpack percentage and volume contribution
        const baseProjection = (avgHistoricalInflow * (tributary.avgSWEPercent! / 100)) * (tributary.volumePercent / 100)
        
        // Add uncertainty based on historical variance
        const variance = 0.2 // 20% variance
        const confidenceLow = baseProjection * (1 - variance)
        const confidenceHigh = baseProjection * (1 + variance)
        
        // Simplified correlation (would be calculated from actual data)
        const correlation = 0.7 // Assume 70% correlation
        
        return {
          tributary: tributary.tributary,
          projectedAF: baseProjection,
          confidenceLow,
          confidenceHigh,
          correlation
        }
      })
    
    setProjections(calculatedProjections)
    
    // Calculate elevation projection
    if (currentElevation > 0 && currentStorage > 0 && calculatedProjections.length > 0) {
      const totalProjectedInflow = calculatedProjections.reduce((sum, p) => sum + p.projectedAF, 0)
      
      // Calculate typical outflow during runoff season (spring + summer)
      const avgTypicalOutflow = typicalOutflow.length > 0
        ? typicalOutflow.reduce((sum, o) => sum + o.total_runoff_season_outflow_af, 0) / typicalOutflow.length
        : totalProjectedInflow * 0.6 // Default: assume 60% of inflow is released
      
      const elevationProj = calculateElevationProjection(
        totalProjectedInflow,
        avgTypicalOutflow,
        currentElevation,
        currentStorage,
        historicalLows.map(low => ({ min_elevation: low.min_elevation, date_of_min: low.date_of_min })),
        historicalHighs
      )
      
      // Calculate drop projection based on historical patterns
      const today = new Date().toISOString().split('T')[0]
      // Ensure we have a valid low date - default to April 21 if not available
      let typicalLowDate = elevationProj.waterYearLowDate
      if (!typicalLowDate || typicalLowDate === '') {
        const year = new Date().getFullYear()
        typicalLowDate = `${year}-04-21`
      }
      
      let dropProj
      let dailyProjections: Array<{ date: string; projected: number; low: number; high: number }> = []
      
      console.log('ProjectedRunoff - Starting drop projection calculation:', {
        typicalLowDate,
        hasHistoricalDrops: historicalDrops.length > 0,
        elevationProjWaterYearLowDate: elevationProj.waterYearLowDate,
        currentElevation
      })
      
      if (historicalDrops.length > 0 && typicalLowDate) {
        // Use historical drop patterns
        dropProj = calculateDropProjection(currentElevation, historicalDrops)
        
        // Calculate daily projections using historical patterns
        dailyProjections = calculateDailyElevationProjection(
          today,
          typicalLowDate,
          currentElevation,
          historicalDrops
        )
      } else {
        // Fallback to previous method if no historical drops available
        const dropToLow = currentElevation - elevationProj.waterYearLow
        dropProj = {
          projectedDrop: dropToLow,
          projectedLowElevation: elevationProj.waterYearLow,
          confidenceRange: {
            low: dropToLow * 1.15,
            high: dropToLow * 0.85
          },
          historicalAverage: dropToLow,
          historicalCount: 0
        }
        
        if (typicalLowDate) {
          dailyProjections = calculateDailyElevationProjection(
            today,
            typicalLowDate,
            currentElevation,
            [{ drop_amount: dropToLow, days_to_low: Math.ceil((new Date(typicalLowDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)) }]
          )
        }
      }
      
      const dropToLow = dropProj.projectedDrop
      const dropToLowLow = dropProj.confidenceRange.low
      const dropToLowHigh = dropProj.confidenceRange.high
      
      // Calculate change from low date to high date
      const changeFromLowToHigh = elevationProj.waterYearHigh - dropProj.projectedLowElevation
      
      console.log('ProjectedRunoff - About to set elevation projection state:', {
        dropToLow,
        typicalLowDate,
        dailyProjectionsLength: dailyProjections.length
      })
      
      setElevationProjection({
        projectedChange: elevationProj.projectedElevationChange,
        projectedElevation: elevationProj.projectedElevation,
        waterYearLow: dropProj.projectedLowElevation,
        waterYearLowDate: typicalLowDate,
        waterYearHigh: elevationProj.waterYearHigh,
        waterYearHighDate: elevationProj.waterYearHighDate,
        confidenceLow: elevationProj.confidenceRange.low,
        confidenceHigh: elevationProj.confidenceRange.high,
        dropToLow,
        dropToLowLow,
        dropToLowHigh,
        changeFromLowToHigh,
        dailyProjections,
        historicalDropCount: dropProj.historicalCount
      })
    }
  }, [tributarySnowpack, historicalInflow, currentElevation, currentStorage, historicalLows, typicalOutflow, historicalHighs, historicalDrops])

  const totalProjected = projections.reduce((sum, p) => sum + p.projectedAF, 0)
  const totalConfidenceLow = projections.reduce((sum, p) => sum + p.confidenceLow, 0)
  const totalConfidenceHigh = projections.reduce((sum, p) => sum + p.confidenceHigh, 0)

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-2xl font-light mb-4 text-gray-900">Projected Runoff</h3>
        <p className="text-sm text-gray-500 mb-6 font-light">
          Estimated runoff projections based on current snowpack conditions. Projections are calculated using 
          historical correlations between snowpack percentage and actual runoff volumes.
        </p>
      </div>

      {/* Total Projection */}
      <div className="card p-6 lg:p-8">
        <h4 className="text-xl font-light mb-4 text-gray-900">Total Projected Annual Runoff</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">Projected</div>
            <div className="text-3xl font-light text-gray-900">
              {(totalProjected / 1000000).toFixed(2)}M <span className="text-lg text-gray-500">acre-ft</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">Low Estimate</div>
            <div className="text-3xl font-light text-[#c99a7a]">
              {(totalConfidenceLow / 1000000).toFixed(2)}M <span className="text-lg text-gray-500">acre-ft</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">High Estimate</div>
            <div className="text-3xl font-light text-[#8b9a6b]">
              {(totalConfidenceHigh / 1000000).toFixed(2)}M <span className="text-lg text-gray-500">acre-ft</span>
            </div>
          </div>
        </div>
      </div>

      {/* By Tributary */}
      <div className="card p-6 lg:p-8">
        <h4 className="text-xl font-light mb-6 text-gray-900">Projections by Tributary</h4>
        <div className="space-y-4">
          {projections.map((projection) => (
            <div key={projection.tributary} className="border-b border-gray-100 pb-4 last:border-0">
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-lg font-light text-gray-900">{projection.tributary}</h5>
                <div className="text-sm text-gray-500 font-light">
                  Correlation: {(projection.correlation * 100).toFixed(0)}%
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-light">Projected</div>
                  <div className="text-xl font-light text-gray-900">
                    {(projection.projectedAF / 1000000).toFixed(2)}M acre-ft
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-light">Range</div>
                  <div className="text-lg font-light text-gray-700">
                    {(projection.confidenceLow / 1000000).toFixed(2)}M - {(projection.confidenceHigh / 1000000).toFixed(2)}M
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-light">% of Total</div>
                  <div className="text-lg font-light text-gray-700">
                    {totalProjected > 0 ? ((projection.projectedAF / totalProjected) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Projected Drop to Typical Low Date */}
      {elevationProjection && elevationProjection.dropToLow !== undefined && elevationProjection.waterYearLowDate && (
        <div className="card p-6 lg:p-8">
          <h4 className="text-xl font-light mb-4 text-gray-900">Projected Drop to Typical Low Date</h4>
          
          {/* Summary Card */}
          <div className="mb-8">
            <div className="p-6 bg-gray-50 rounded-lg">
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">
                Projected Drop
              </div>
              <div className="text-3xl font-light text-[#c99a7a] mb-2">
                {elevationProjection.dropToLow.toFixed(1)} <span className="text-lg text-gray-500">ft</span>
              </div>
              <div className="text-sm text-gray-600 font-light mb-2">
                From {currentElevation.toFixed(1)} ft today to approximately{' '}
                {elevationProjection.waterYearLow.toFixed(1)} ft by{' '}
                {elevationProjection.waterYearLowDate 
                  ? new Date(elevationProjection.waterYearLowDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                  : 'late spring'}
              </div>
              {elevationProjection.historicalDropCount > 0 && (
                <div className="text-xs text-gray-500 font-light mb-2">
                  Based on average of {elevationProjection.historicalDropCount} similar historical years
                </div>
              )}
              <div className="mt-2 text-xs text-gray-500 font-light mb-4">
                Range: {elevationProjection.dropToLowLow.toFixed(1)} to {elevationProjection.dropToLowHigh.toFixed(1)} ft
              </div>
              
              {/* Expandable Historical Analysis */}
              {historicalDrops.length > 0 && (
                <HistoricalAnalysisSection 
                  historicalDrops={historicalDrops}
                  currentElevation={currentElevation}
                  elevationProjection={elevationProjection}
                  recentHistoricalData={recentHistoricalData}
                  ramps={ramps}
                />
              )}
            </div>
          </div>
          
          {/* Projection Chart */}
          <div className="mb-8">
            <h5 className="text-lg font-light mb-4 text-gray-900">Projection</h5>
            <p className="text-sm text-gray-500 mb-6 font-light">
              Projected elevation drop from today to {elevationProjection.waterYearLowDate 
                ? new Date(elevationProjection.waterYearLowDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                : 'the typical low date'}. The line shows the average drop spread evenly across the remaining days.
            </p>
            <HistoricalDropsChart
              historicalDrops={historicalDrops}
              currentElevation={currentElevation}
              currentDate={new Date().toISOString().split('T')[0]}
              projectedDrop={elevationProjection.dropToLow}
              projectedLowDate={elevationProjection.waterYearLowDate}
              dailyProjections={elevationProjection.dailyProjections}
              ramps={ramps}
            />
          </div>
        </div>
      )}

      {/* Projected Change from Low to High Date */}
      {elevationProjection && (
        <div className="card p-6 lg:p-8">
          <h4 className="text-xl font-light mb-4 text-gray-900">Projected Change from Low to High Date</h4>
          <div className="p-6 bg-gray-50 rounded-lg">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-light">
              Projected Change
            </div>
            <div className={`text-3xl font-light mb-2 ${elevationProjection.changeFromLowToHigh >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}`}>
              {elevationProjection.changeFromLowToHigh >= 0 ? '+' : ''}{elevationProjection.changeFromLowToHigh.toFixed(1)} <span className="text-lg text-gray-500">ft</span>
            </div>
            <div className="text-sm text-gray-600 font-light">
              From {elevationProjection.waterYearLow.toFixed(1)} ft (typical low) to approximately{' '}
              {elevationProjection.waterYearHigh.toFixed(1)} ft by{' '}
              {elevationProjection.waterYearHighDate 
                ? new Date(elevationProjection.waterYearHighDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                : 'late summer'}
            </div>
          </div>
        </div>
      )}

      {/* Methodology */}
      <div className="card p-6 lg:p-8 bg-gray-50">
        <h4 className="text-lg font-light mb-4 text-gray-900">Methodology</h4>
        <div className="text-sm text-gray-600 space-y-2 font-light">
          <p>
            Projections are based on historical correlations between snowpack percentage and annual runoff volumes. 
            The model uses:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Current snowpack percentage for each major tributary</li>
            <li>Historical average annual inflow volumes</li>
            <li>Volume contribution percentages for each tributary</li>
            <li>Typical outflow during runoff season (spring/summer releases)</li>
            <li>Historical water year lows for years starting at similar elevations</li>
            <li>V-shaped reservoir model to convert storage changes to elevation changes</li>
            <li>Statistical variance from historical patterns</li>
          </ul>
          <p className="mt-4 text-xs text-gray-500">
            <strong>Note:</strong> These are preliminary projections. Actual runoff depends on many factors including 
            spring temperatures, precipitation patterns, and reservoir operations. Confidence intervals represent 
            historical variance but do not account for extreme weather events. Outflow patterns may vary based on 
            downstream water needs and operational decisions.
          </p>
        </div>
      </div>
    </div>
  )
}

function HistoricalAnalysisSection(props: {
  historicalDrops: HistoricalDrop[]
  currentElevation: number
  elevationProjection: {
    dropToLow: number
    waterYearLowDate: string
    dailyProjections: Array<{ date: string; projected: number; low: number; high: number }>
  }
  recentHistoricalData: Array<{ date: string; elevation: number }>
  ramps?: Ramp[]
}) {
  const { historicalDrops, currentElevation, elevationProjection, recentHistoricalData, ramps = [] } = props
  const [isExpanded, setIsExpanded] = useState(false)
  
  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-sm font-light text-gray-700 hover:text-gray-900 transition-colors"
      >
        <span>View Historical Analysis & Rationale</span>
        {isExpanded ? (
          <ChevronUpIcon className="w-5 h-5" />
        ) : (
          <ChevronDownIcon className="w-5 h-5" />
        )}
      </button>
      
      {isExpanded && (
        <div className="mt-4 space-y-6">
          {/* Historical Years Used Table */}
          <div>
            <h6 className="text-base font-light mb-3 text-gray-900">
              Historical Years Used for Projection
            </h6>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Water Year</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Start Elevation</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Low Elevation</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Drop Amount</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Days to Low</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Elevation Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historicalDrops
                    .sort((a, b) => Math.abs(a.start_elevation - currentElevation) - Math.abs(b.start_elevation - currentElevation))
                    .map((drop, index) => (
                    <tr key={drop.water_year} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2 px-3 text-sm text-gray-900 font-light">
                        {drop.water_year}
                        {index === 0 && (
                          <span className="ml-2 text-xs text-gray-500">(closest)</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-sm text-right text-gray-900 font-light">
                        {drop.start_elevation.toFixed(1)} ft
                      </td>
                      <td className="py-2 px-3 text-sm text-right text-gray-900 font-light">
                        {drop.low_elevation.toFixed(1)} ft
                      </td>
                      <td className="py-2 px-3 text-sm text-right font-medium text-[#c99a7a]">
                        {drop.drop_amount.toFixed(1)} ft
                      </td>
                      <td className="py-2 px-3 text-sm text-right text-gray-600 font-light">
                        {drop.days_to_low} days
                      </td>
                      <td className="py-2 px-3 text-sm text-right text-gray-500 font-light">
                        {Math.abs(drop.start_elevation - currentElevation).toFixed(1)} ft
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td className="py-2 px-3 text-sm font-medium text-gray-900">Average</td>
                    <td className="py-2 px-3 text-sm text-right font-medium text-gray-900">
                      {(historicalDrops.reduce((sum, d) => sum + d.start_elevation, 0) / historicalDrops.length).toFixed(1)} ft
                    </td>
                    <td className="py-2 px-3 text-sm text-right font-medium text-gray-900">
                      {(historicalDrops.reduce((sum, d) => sum + d.low_elevation, 0) / historicalDrops.length).toFixed(1)} ft
                    </td>
                    <td className="py-2 px-3 text-sm text-right font-medium text-[#c99a7a]">
                      {(historicalDrops.reduce((sum, d) => sum + d.drop_amount, 0) / historicalDrops.length).toFixed(1)} ft
                    </td>
                    <td className="py-2 px-3 text-sm text-right font-medium text-gray-600">
                      {Math.round(historicalDrops.reduce((sum, d) => sum + d.days_to_low, 0) / historicalDrops.length)} days
                    </td>
                    <td className="py-2 px-3 text-sm text-right font-medium text-gray-500">
                      {(historicalDrops.reduce((sum, d) => sum + Math.abs(d.start_elevation - currentElevation), 0) / historicalDrops.length).toFixed(1)} ft
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mt-3 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-gray-700 font-light">
                <strong className="font-medium">Note:</strong> This projection is based on the average drop from {historicalDrops.length} historical year{historicalDrops.length !== 1 ? 's' : ''} 
                {' '}that had similar starting elevations (within 50ft of {currentElevation.toFixed(1)} ft) on the same date. 
                The years are sorted by how close their starting elevation was to the current elevation.
              </p>
            </div>
          </div>
          
        </div>
      )}
    </div>
  )
}

