'use client'

import { useState } from 'react'

interface HistoricalDrop {
  water_year: number
  start_date: string
  start_elevation: number
  low_date: string
  low_elevation: number
  drop_amount: number
  days_to_low: number
}

interface HistoricalAnalysisExpandableProps {
  historicalDrops: HistoricalDrop[]
  currentElevation: number
  projectedDrop: number
  projectedLowElevation: number
  projectedLowDate: string
  recentHistoricalData: Array<{ date: string; elevation: number }>
  ramps: Array<{ name: string; min_safe_elevation: number }>
}

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

export default function HistoricalAnalysisExpandable({
  historicalDrops,
  currentElevation,
  projectedDrop,
  projectedLowElevation,
  projectedLowDate,
  recentHistoricalData,
  ramps = []
}: HistoricalAnalysisExpandableProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  if (historicalDrops.length === 0) return null
  
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
              <p className="text-xs text-gray-600 font-light">
                <strong className="text-gray-900">Note:</strong> Historical years are sorted by how close their starting elevation was to the current elevation. 
                The projection uses the average drop from all matching years, weighted toward years with similar starting conditions.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


