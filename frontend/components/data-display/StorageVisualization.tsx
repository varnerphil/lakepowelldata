'use client'

import { useState } from 'react'
import { ElevationStorageCapacity } from '@/lib/db'

interface StorageVisualizationProps {
  elevationStorageData: ElevationStorageCapacity[]
  currentElevation: number
}

export default function StorageVisualization({ 
  elevationStorageData, 
  currentElevation 
}: StorageVisualizationProps) {
  const [viewMode, setViewMode] = useState<'15ft' | '1ft'>('15ft')
  
  // Group data into 15ft bands, capped at 3705 (full pool)
  const bandSize = 15
  const maxElevCap = 3705  // Cap at full pool elevation
  const bands15ft: Array<{
    elevStart: number
    elevEnd: number
    elevRange: number
    capacity: number
    storageAtBottom: number
    storageAtTop: number
  }> = []
  
  // Start from dead pool (3370) up to capped elevation
  const minElev = Math.min(...elevationStorageData.map(d => d.elevation))
  const startElev = Math.floor(minElev / bandSize) * bandSize
  
  for (let elev = startElev; elev < maxElevCap; elev += bandSize) {
    const bandStart = elev
    const bandEnd = Math.min(elev + bandSize, maxElevCap)
    const elevRange = bandEnd - bandStart
    
    const dataAtStart = elevationStorageData.find(d => d.elevation === bandStart)
    const dataAtEnd = elevationStorageData.find(d => d.elevation === bandEnd) || 
                     elevationStorageData.find(d => d.elevation === bandEnd - 1)
    
    const bandData = elevationStorageData.filter(d => 
      d.elevation >= bandStart && d.elevation < bandEnd
    )
    const capacity = bandData.reduce((sum, d) => sum + (d.storage_per_foot || 0), 0)
    
    if (capacity > 0) {
      bands15ft.push({
        elevStart: bandStart,
        elevEnd: bandEnd,
        elevRange,
        capacity,
        storageAtBottom: dataAtStart?.storage_at_elevation || 0,
        storageAtTop: dataAtEnd?.storage_at_elevation || 0
      })
    }
  }
  
  // Enforce monotonically increasing capacity (higher elevations should hold more water)
  for (let i = 1; i < bands15ft.length; i++) {
    if (bands15ft[i].capacity < bands15ft[i - 1].capacity) {
      bands15ft[i].capacity = bands15ft[i - 1].capacity
    }
  }
  
  const maxCapacity15ft = Math.max(...bands15ft.map(b => b.capacity))
  const baseHeight15ft = 24
  const reversedBands15ft = [...bands15ft].reverse()
  
  // Prepare 1ft data with smoothing
  const validData1ft = elevationStorageData
    .filter(d => d.storage_per_foot && d.storage_per_foot > 0)
    .sort((a, b) => a.elevation - b.elevation)
  
  const smoothedData1ft: typeof validData1ft = []
  for (let i = 0; i < validData1ft.length; i++) {
    const d = validData1ft[i]
    if (i === 0) {
      smoothedData1ft.push({ ...d })
    } else {
      const previousSmoothed = smoothedData1ft[i - 1].storage_per_foot || 0
      const currentValue = d.storage_per_foot || 0
      smoothedData1ft.push({
        ...d,
        storage_per_foot: Math.max(currentValue, previousSmoothed)
      })
    }
  }
  
  const maxStoragePerFoot = Math.max(...smoothedData1ft.map(d => d.storage_per_foot || 0))
  const bandHeight1ft = 2
  const reversedData1ft = [...smoothedData1ft].reverse()
  
  return (
    <div className="card p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <h3 className="text-lg sm:text-xl font-light text-gray-900">Lake Powell Storage Profile</h3>
        
        {/* Toggle Buttons */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('1ft')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-light rounded-md transition-colors ${
              viewMode === '1ft'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            1ft Bands
          </button>
          <button
            onClick={() => setViewMode('15ft')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-light rounded-md transition-colors ${
              viewMode === '15ft'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            15ft Bands
          </button>
        </div>
      </div>
      
      <p className="text-xs sm:text-sm text-gray-500 font-light mb-4 sm:mb-6">
        {viewMode === '15ft' 
          ? 'Each band shows 15 feet of elevation. Width indicates storage capacity—the lake is V-shaped, so higher elevations hold significantly more water per foot.'
          : 'Each band shows 1 foot of elevation. This detailed view shows the exact storage capacity per foot across all elevations.'}
      </p>
      
      {viewMode === '15ft' ? (
        /* 15ft View */
        <div className="flex flex-col items-center">
          {reversedBands15ft.map((band, idx) => {
            const widthPercent = (band.capacity / maxCapacity15ft) * 100
            const isCurrentBand = currentElevation >= band.elevStart && currentElevation < band.elevEnd
            const isFull = currentElevation >= band.elevEnd
            const isEmpty = currentElevation <= band.elevStart
            const bandHeight = (band.elevRange / bandSize) * baseHeight15ft
            
            return (
              <div key={band.elevStart} className="flex items-center w-full gap-1 sm:gap-4">
                <div className="w-16 sm:w-24 lg:w-32 text-right text-[10px] sm:text-xs text-gray-500 font-light">
                  <span className="hidden sm:inline">{band.elevStart}-{band.elevEnd} ft</span>
                  <span className="sm:hidden">{band.elevEnd}</span>
                </div>
                
                <div className="flex-1 flex justify-center">
                  <div 
                    className="transition-all"
                    style={{ 
                      width: `${widthPercent}%`,
                      height: `${bandHeight}px`,
                      backgroundColor: isEmpty 
                        ? '#d4a574'
                        : isFull 
                          ? '#6b8a9a'
                          : '#8b9a6b',
                      borderLeft: '1px solid rgba(0,0,0,0.1)',
                      borderRight: '1px solid rgba(0,0,0,0.1)',
                      borderTop: idx === 0 ? '1px solid rgba(0,0,0,0.1)' : 'none',
                      borderBottom: idx === reversedBands15ft.length - 1 ? '1px solid rgba(0,0,0,0.1)' : 'none',
                    }}
                  />
                </div>
                
                <div className="w-16 sm:w-20 lg:w-28 text-left text-[10px] sm:text-xs text-gray-500 font-light">
                  {(band.capacity / 1000000).toFixed(2)}M
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* 1ft View */
        <div className="flex flex-col items-center">
          <div className="flex items-start w-full gap-2 sm:gap-4">
            {/* Elevation scale on left */}
            <div className="w-14 sm:w-20 flex flex-col justify-between text-right text-[10px] sm:text-xs text-gray-500 font-light" 
                 style={{ height: `${smoothedData1ft.length * bandHeight1ft}px` }}>
              <span>{reversedData1ft[0]?.elevation} ft</span>
              <span>{reversedData1ft[Math.floor(reversedData1ft.length / 2)]?.elevation} ft</span>
              <span>{reversedData1ft[reversedData1ft.length - 1]?.elevation} ft</span>
            </div>
            
            {/* Bands visualization */}
            <div className="flex-1 flex flex-col items-center">
              {reversedData1ft.map((data) => {
                const widthPercent = ((data.storage_per_foot || 0) / maxStoragePerFoot) * 100
                const isFull = currentElevation >= data.elevation + 1
                const isCurrentBand = currentElevation >= data.elevation && currentElevation < data.elevation + 1
                const isEmpty = currentElevation <= data.elevation
                
                return (
                  <div 
                    key={data.elevation}
                    className="transition-all"
                    style={{ 
                      width: `${widthPercent}%`,
                      height: `${bandHeight1ft}px`,
                      backgroundColor: isEmpty 
                        ? '#d4a574'
                        : isFull 
                          ? '#6b8a9a'
                          : '#8b9a6b',
                    }}
                  />
                )
              })}
            </div>
            
            {/* Capacity scale on right */}
            <div className="w-16 sm:w-24 flex flex-col justify-between text-left text-[10px] sm:text-xs text-gray-500 font-light"
                 style={{ height: `${smoothedData1ft.length * bandHeight1ft}px` }}>
              <span>{(maxStoragePerFoot / 1000).toFixed(0)}K af/ft</span>
              <span>{(maxStoragePerFoot / 2000).toFixed(0)}K af/ft</span>
              <span>0</span>
            </div>
          </div>
          
          {/* Current level indicator */}
          <div className="mt-4 text-xs sm:text-sm text-gray-600 font-light">
            Current: {currentElevation.toFixed(1)} ft
          </div>
        </div>
      )}
      
      {/* Legend */}
      <div className="mt-4 sm:mt-6 pt-4 border-t border-gray-100 w-full">
        <div className="flex items-center justify-center gap-3 sm:gap-6 text-[10px] sm:text-xs font-light">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#6b8a9a]"></div>
            <span className="text-gray-600">Water</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#8b9a6b]"></div>
            <span className="text-gray-600">Current</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#d4a574]"></div>
            <span className="text-gray-600">Empty</span>
          </div>
        </div>
      </div>
    </div>
  )
}
