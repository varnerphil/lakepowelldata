'use client'

import { useState, useEffect, useMemo } from 'react'
import { HistoricalChart } from '@/components/data-display'
import HistoricalDropsChart from '@/components/charts/HistoricalDropsChart'
import HistoricalAnalysisExpandable from '@/components/data-display/HistoricalAnalysisExpandable'
import type { WaterMeasurement, Ramp } from '@/lib/db'
import type { HistoricalDropToLow } from '@/lib/db'

interface HomeChartsWithFavoritesProps {
  // Historical Chart props
  measurements: WaterMeasurement[]
  startDate: string
  endDate: string
  currentRange: string
  
  // Projection Chart props
  currentElevation: number
  today: string
  typicalLowDate: string
  projectedDrop: number
  projectedLowElevation: number
  dropToLowLow: number
  dropToLowHigh: number
  historicalDrops: HistoricalDropToLow[]
  dailyProjections: Array<{ date: string; projected: number; low: number; high: number }>
  recentHistoricalData: Array<{ date: string; elevation: number }>
  
  // All ramps for reference
  allRamps: Ramp[]
  
  // Favorite ramp IDs from CurrentStatus (passed down)
  favoriteRampIds: number[]
}

export default function HomeChartsWithFavorites({
  measurements,
  startDate,
  endDate,
  currentRange,
  currentElevation,
  today,
  typicalLowDate,
  projectedDrop,
  projectedLowElevation,
  dropToLowLow,
  dropToLowHigh,
  historicalDrops,
  dailyProjections,
  recentHistoricalData,
  allRamps,
  favoriteRampIds
}: HomeChartsWithFavoritesProps) {
  const [favorites, setFavorites] = useState<number[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Default favorite ramp names (same as CompactRampList)
  const defaultFavoriteNames = [
    'Bullfrog North Ramp',
    'Stateline Launch',
    'Antelope Point Business Ramp',
    'Castle Rock Cut-Off'
  ]

  // Load favorites from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('favoriteRamps')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setFavorites(parsed)
      } catch (e) {
        console.error('Error loading favorites:', e)
      }
    } else {
      // Set default favorites based on names
      const defaultFavoriteIds = allRamps
        .filter(ramp => defaultFavoriteNames.includes(ramp.name))
        .map(ramp => ramp.id)
      
      if (defaultFavoriteIds.length > 0) {
        setFavorites(defaultFavoriteIds)
        localStorage.setItem('favoriteRamps', JSON.stringify(defaultFavoriteIds))
      }
    }
    setIsInitialized(true)
  }, [allRamps])

  // Listen for changes to favorites from other components
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'favoriteRamps' && e.newValue) {
        try {
          setFavorites(JSON.parse(e.newValue))
        } catch (e) {
          console.error('Error parsing favorites from storage event:', e)
        }
      }
    }

    // Also poll for changes (for same-tab updates)
    const checkFavorites = () => {
      const stored = localStorage.getItem('favoriteRamps')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (JSON.stringify(parsed) !== JSON.stringify(favorites)) {
            setFavorites(parsed)
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    const interval = setInterval(checkFavorites, 1000) // Check every second

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
    }
  }, [favorites])

  // Filter ramps to only show favorites
  const favoriteRamps = useMemo(() => {
    if (!isInitialized) return []
    if (favorites.length === 0) return []
    return allRamps.filter(ramp => favorites.includes(ramp.id))
  }, [allRamps, favorites, isInitialized])

  return (
    <>
      {/* 2. Historical Chart */}
      <div className="mt-8 sm:mt-12">
        <HistoricalChart 
          data={measurements}
          startDate={startDate}
          endDate={endDate}
          currentRange={currentRange}
          showControls={true}
          formAction="/"
          ramps={favoriteRamps}
        />
      </div>

      {/* 3. Elevation Projection */}
      <div className="mt-8 sm:mt-12">
        <div className="card p-4 sm:p-6 lg:p-8">
          <h2 className="text-xl sm:text-2xl font-light mb-4 sm:mb-6 text-gray-900">Elevation Projection</h2>
          
          {/* Projection Chart */}
          <div className="mb-4 sm:mb-6">
            <p className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6 font-light">
              Projected elevation drop from {new Date(today).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} to {new Date(typicalLowDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. 
              The line shows the average drop spread evenly across the remaining days.
            </p>
            <HistoricalDropsChart
              historicalDrops={historicalDrops}
              currentElevation={currentElevation}
              currentDate={today}
              projectedDrop={projectedDrop}
              projectedLowDate={typicalLowDate}
              dailyProjections={dailyProjections}
              ramps={favoriteRamps}
            />
          </div>
          
          {/* Projected Drop Summary */}
          <div className="p-3 sm:p-6 bg-gray-50 rounded-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
              <div>
                <h3 className="text-lg sm:text-xl font-light text-gray-900">Projected Drop to Annual Low</h3>
                <p className="text-xs sm:text-sm text-gray-500 font-light mt-1 sm:mt-2">
                  Based on {historicalDrops.length} similar historical years starting near this elevation on {new Date(today).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                </p>
              </div>
              {projectedDrop > 0 && (
                <div className="text-left sm:text-right">
                  <div className="text-2xl sm:text-3xl font-light text-[#c99a7a]">
                    {projectedDrop.toFixed(1)} <span className="text-base sm:text-lg text-gray-500">ft</span>
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500 font-light">
                    to ~{projectedLowElevation.toFixed(1)} ft by{' '}
                    {new Date(typicalLowDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                  </div>
                </div>
              )}
            </div>
            {projectedDrop > 0 && historicalDrops.length > 0 && (
              <>
                <div className="mt-2 text-xs text-gray-500 font-light mb-4">
                  Range: {dropToLowLow.toFixed(1)} to {dropToLowHigh.toFixed(1)} ft
                </div>
                
                {/* Expandable Historical Analysis */}
                <HistoricalAnalysisExpandable
                  historicalDrops={historicalDrops}
                  currentElevation={currentElevation}
                  projectedDrop={projectedDrop}
                  projectedLowElevation={projectedLowElevation}
                  projectedLowDate={typicalLowDate}
                  recentHistoricalData={recentHistoricalData}
                  ramps={favoriteRamps}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

