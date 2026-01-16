'use client'

import { useState } from 'react'
import type { WaterYearAnalysis } from '@/lib/db'
import type { SnowpackProjection as SnowpackProjectionType } from '@/lib/calculations'

interface SnowpackProjectionProps {
  projection: SnowpackProjectionType
  currentElevation: number
}

export default function SnowpackProjection({ projection, currentElevation }: SnowpackProjectionProps) {
  const [showSimilarYears, setShowSimilarYears] = useState(false)
  
  if (projection.yearsUsed === 0) {
    return (
      <div className="card p-4 sm:p-6">
        <h3 className="text-lg font-light text-gray-900 mb-4">Snowpack-Based Projection</h3>
        <p className="text-sm text-gray-500 font-light">
          No historical data available for snowpack projection.
        </p>
      </div>
    )
  }
  
  const gainColor = projection.projectedRunoffGain >= 30 ? 'text-[#4a90a4]' :
                    projection.projectedRunoffGain >= 10 ? 'text-[#8b9a6b]' :
                    projection.projectedRunoffGain > 0 ? 'text-[#d4a574]' :
                    'text-[#c99a7a]'
  
  const snowpackColor = projection.currentSnowpackPercent >= 130 ? 'text-[#4a90a4]' :
                        projection.currentSnowpackPercent >= 100 ? 'text-[#8b9a6b]' :
                        projection.currentSnowpackPercent >= 80 ? 'text-[#d4a574]' :
                        'text-[#c99a7a]'

  return (
    <div className="card p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-light text-gray-900">Snowpack-Based Projection</h3>
          <p className="text-xs text-gray-500 font-light mt-1">
            Based on {projection.yearsUsed} historical years with similar snowpack
          </p>
        </div>
        <div className={`text-2xl font-light ${snowpackColor}`}>
          {projection.currentSnowpackPercent.toFixed(0)}%
          <span className="text-xs text-gray-500 block text-right">of median</span>
        </div>
      </div>
      
      {/* Main projection metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Low Estimate</div>
          <div className="text-xl sm:text-2xl font-light text-[#c99a7a]">
            +{projection.minGain.toFixed(1)} ft
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {(currentElevation + projection.minGain).toFixed(0)} ft peak
          </div>
        </div>
        
        <div className="bg-[#4a90a4]/10 rounded-lg p-3 text-center border border-[#4a90a4]/20">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Projected</div>
          <div className={`text-2xl sm:text-3xl font-light ${gainColor}`}>
            +{projection.projectedRunoffGain.toFixed(1)} ft
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {projection.projectedPeakElevation.toFixed(0)} ft peak
          </div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">High Estimate</div>
          <div className="text-xl sm:text-2xl font-light text-[#4a90a4]">
            +{projection.maxGain.toFixed(1)} ft
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {(currentElevation + projection.maxGain).toFixed(0)} ft peak
          </div>
        </div>
      </div>
      
      {/* Additional metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Typical Peak Date</div>
          <div className="text-xl sm:text-2xl font-light text-gray-900">
            {projection.projectedPeakDate}
          </div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Expected Inflow</div>
          <div className="text-xl sm:text-2xl font-light text-gray-900">
            {(projection.projectedRunoffInflow / 1000000).toFixed(1)}M
            <span className="text-xs text-gray-500 ml-1">AF</span>
          </div>
        </div>
      </div>
      
      {/* Range visualization */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Range from similar years</span>
          <span>{projection.minGain.toFixed(1)} to {projection.maxGain.toFixed(1)} ft</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full relative overflow-hidden">
          {/* Background gradient showing range */}
          <div 
            className="absolute h-full bg-gradient-to-r from-[#c99a7a] via-[#8b9a6b] to-[#4a90a4] opacity-30"
            style={{ 
              left: '0%', 
              right: '0%' 
            }}
          ></div>
          {/* Min marker */}
          <div 
            className="absolute h-full w-0.5 bg-gray-400"
            style={{ 
              left: `${Math.max(0, ((projection.minGain - projection.minGain) / (projection.maxGain - projection.minGain + 0.01)) * 100)}%` 
            }}
          ></div>
          {/* Max marker */}
          <div 
            className="absolute h-full w-0.5 bg-gray-400"
            style={{ 
              left: `${Math.min(100, ((projection.maxGain - projection.minGain) / (projection.maxGain - projection.minGain + 0.01)) * 100)}%` 
            }}
          ></div>
          {/* Projected value marker */}
          <div 
            className="absolute h-full w-2 bg-[#4a90a4] rounded"
            style={{ 
              left: `${Math.max(0, Math.min(100, ((projection.projectedRunoffGain - projection.minGain) / (projection.maxGain - projection.minGain + 0.01)) * 100))}%`,
              transform: 'translateX(-50%)'
            }}
          ></div>
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>Worst case: {(currentElevation + projection.minGain).toFixed(0)} ft</span>
          <span>Best case: {(currentElevation + projection.maxGain).toFixed(0)} ft</span>
        </div>
      </div>
      
      {/* Similar years expandable section */}
      <button
        onClick={() => setShowSimilarYears(!showSimilarYears)}
        className="w-full flex items-center justify-between text-sm text-gray-600 hover:text-gray-900 transition-colors py-2"
      >
        <span className="font-light">Similar historical years</span>
        <span className="text-xs">
          {showSimilarYears ? '▲ Hide' : '▼ Show'}
        </span>
      </button>
      
      {showSimilarYears && (
        <div className="mt-2 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {projection.similarYears.map(year => (
              <div 
                key={year.water_year}
                className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-gray-50"
              >
                <span className="text-gray-700 font-light">{year.water_year}</span>
                <span className="text-gray-500 font-light">{year.snowpack_percent.toFixed(0)}%</span>
                <span className={`font-light ${
                  year.runoff_gain >= 30 ? 'text-[#4a90a4]' :
                  year.runoff_gain >= 10 ? 'text-[#8b9a6b]' :
                  year.runoff_gain > 0 ? 'text-[#d4a574]' :
                  'text-[#c99a7a]'
                }`}>
                  +{year.runoff_gain.toFixed(1)} ft
                </span>
                <span className="text-gray-400 text-xs">
                  {year.peak_date ? new Date(year.peak_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

