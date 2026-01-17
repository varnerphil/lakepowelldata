'use client'

import { useState, useEffect, useMemo } from 'react'
import { HistoricalChart, SnowpackProjection } from '@/components/data-display'
import HistoricalDropsChart from '@/components/charts/HistoricalDropsChart'
import HistoricalAnalysisExpandable from '@/components/data-display/HistoricalAnalysisExpandable'
import type { WaterMeasurement, Ramp } from '@/lib/db'
import type { HistoricalDropToLow } from '@/lib/db'
import type { SeasonalStatus } from '@/lib/seasonal-utils'
import type { SnowpackProjection as SnowpackProjectionType } from '@/lib/calculations'

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
  
  // Weekly change for current trend line
  weeklyChange: number | null
  
  // All ramps for reference
  allRamps: Ramp[]
  
  // Favorite ramp IDs from CurrentStatus (passed down)
  favoriteRampIds: number[]
  
  // Seasonal status for conditional rendering
  seasonalStatus: SeasonalStatus | null
  
  // Snowpack projection data
  snowpackProjection: SnowpackProjectionType | null
  currentSnowpackPercent: number
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
  weeklyChange,
  allRamps,
  favoriteRampIds,
  seasonalStatus,
  snowpackProjection,
  currentSnowpackPercent
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

  // Determine what to show based on seasonal status
  const showDropProjection = seasonalStatus?.showDropProjection ?? true
  const showRunoffProjection = seasonalStatus?.showRunoffProjection ?? false
  const showRunoffSummary = seasonalStatus?.showRunoffSummary ?? false
  const currentGainFromLow = seasonalStatus?.currentGainFromLow ?? null

  // Calculate when favorite ramps will become unavailable
  const rampAccessTimeline = useMemo(() => {
    if (favoriteRamps.length === 0) return []
    
    // Calculate current trend projections if we have weekly change
    const currentTrendProjections: Array<{ date: string; elevation: number }> = []
    if (weeklyChange !== null && weeklyChange < 0) {
      const dailyChange = weeklyChange / 7
      let elevation = currentElevation
      const startDate = new Date(today)
      
      for (let i = 0; i <= 120; i++) { // Project up to 120 days
        const date = new Date(startDate)
        date.setDate(date.getDate() + i)
        currentTrendProjections.push({
          date: date.toISOString().split('T')[0],
          elevation: elevation
        })
        elevation += dailyChange
      }
    }
    
    return favoriteRamps
      .map(ramp => {
        const minSafe = ramp.min_safe_elevation || ramp.min_usable_elevation
        const isCurrentlyOpen = currentElevation >= minSafe
        
        // Skip ramps that are already closed
        if (!isCurrentlyOpen) {
          return null
        }
        
        // Find when historical avg projection crosses this ramp's threshold
        // Since the ramp is currently open, find when the projection first goes below the threshold
        let historicalAvgDate: string | null = null
        let historicalAvgElevation: number | null = null
        
        // Loop through daily projections to find when it crosses below the threshold
        for (const proj of dailyProjections) {
          if (proj.projected < minSafe) {
            historicalAvgDate = proj.date
            historicalAvgElevation = proj.projected
            break // Found the first day it goes below
          }
        }
        
        // Find when current trend crosses this ramp's threshold
        let currentTrendDate: string | null = null
        let currentTrendElevation: number | null = null
        if (currentTrendProjections.length > 0) {
          for (const proj of currentTrendProjections) {
            if (proj.elevation < minSafe) {
              currentTrendDate = proj.date
              currentTrendElevation = proj.elevation
              break
            }
          }
        }
        
        return {
          ramp,
          minSafe,
          isCurrentlyOpen,
          historicalAvgDate,
          historicalAvgElevation,
          currentTrendDate,
          currentTrendElevation
        }
      })
      .filter(Boolean) // Remove null entries (closed ramps)
      .sort((a, b) => {
        // Sort by earliest close date, then by threshold (highest first)
        const aDate = a!.historicalAvgDate || a!.currentTrendDate
        const bDate = b!.historicalAvgDate || b!.currentTrendDate
        if (aDate && bDate) {
          return aDate.localeCompare(bDate)
        }
        if (aDate) return -1
        if (bDate) return 1
        return b!.minSafe - a!.minSafe // Higher threshold first
      }) as Array<{
        ramp: Ramp
        minSafe: number
        isCurrentlyOpen: boolean
        historicalAvgDate: string | null
        historicalAvgElevation: number | null
        currentTrendDate: string | null
        currentTrendElevation: number | null
      }>
  }, [favoriteRamps, dailyProjections, weeklyChange, currentElevation, today])
  
  return (
    <>
      {/* 2. Historical Chart */}
      <div className="mt-8 lg:mt-12">
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

      {/* 3. Elevation Projection - only show when appropriate */}
      {showDropProjection && (
        <div className="mt-8 lg:mt-12">
          <div className="card p-4 lg:p-8">
            <h2 className="text-xl lg:text-2xl font-light mb-2 lg:mb-6 text-gray-900">
              {seasonalStatus?.dropProjectionLabel || 'Elevation Projection'}
            </h2>
            
            {/* Projection Chart */}
            <div className="mb-4 lg:mb-6">
              <p className="text-xs lg:text-sm text-gray-500 mb-0 lg:mb-6 font-light">
                Projected elevation from {new Date(today).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} to {new Date(typicalLowDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. 
                <span className="text-blue-600"> Historical Avg</span> shows the typical drop based on similar years.
                {weeklyChange !== null && (
                  <> <span className="text-[#d4a574]">Current Trend</span> shows what happens if the current weekly rate continues.</>
                )}
              </p>
              <HistoricalDropsChart
                historicalDrops={historicalDrops}
                currentElevation={currentElevation}
                currentDate={today}
                projectedDrop={projectedDrop}
                projectedLowDate={typicalLowDate}
                dailyProjections={dailyProjections}
                ramps={favoriteRamps}
                weeklyChange={weeklyChange}
              />
            </div>
            
            {/* Projected Drop Summary */}
            <div className="p-3 lg:p-6 bg-gray-50 rounded-lg">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-4 gap-3">
                <div>
                  <h3 className="text-lg lg:text-xl font-light text-gray-900">
                    {seasonalStatus?.dropProjectionLabel || 'Projected Drop to Annual Low'}
                  </h3>
                  <p className="text-xs lg:text-sm text-gray-500 font-light mt-1 lg:mt-2">
                    Based on {historicalDrops.length} similar historical years starting near this elevation on {new Date(today).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                  </p>
                </div>
                {projectedDrop > 0 && (
                  <div className="text-left lg:text-right">
                    <div className="text-2xl lg:text-3xl font-light text-[#c99a7a]">
                      {projectedDrop.toFixed(1)} <span className="text-base lg:text-lg text-gray-500">ft</span>
                    </div>
                    <div className="text-xs lg:text-sm text-gray-500 font-light">
                      to ~{projectedLowElevation.toFixed(1)} ft by{' '}
                      {new Date(typicalLowDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                    </div>
                  </div>
                )}
              </div>
              {projectedDrop > 0 && historicalDrops.length > 0 && (
                <div className="mt-2 text-xs text-gray-500 font-light mb-4">
                  Range: {dropToLowLow.toFixed(1)} to {dropToLowHigh.toFixed(1)} ft
                </div>
              )}
              
              {/* Ramp Access Timeline - show if there are favorite ramps */}
              {rampAccessTimeline.length > 0 && (
                <div className="mt-4 mb-4 p-3 sm:p-4 bg-white rounded-lg border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <span className="text-base">🚤</span>
                    Favorite Ramp Access Timeline
                  </h4>
                  <div className="space-y-2">
                    {rampAccessTimeline.map(({ ramp, minSafe, isCurrentlyOpen, historicalAvgDate, currentTrendDate }) => (
                      <div key={ramp.id} className="py-2 px-2 hover:bg-gray-50 rounded transition-colors border-b border-gray-50 last:border-b-0">
                        {/* First row: Status dot, ramp name, and elevation */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`flex-shrink-0 w-2 h-2 rounded-full ${isCurrentlyOpen ? 'bg-[#8b9a6b]' : 'bg-[#c99a7a]'}`} />
                          <span className="font-light text-gray-900 text-sm truncate">
                            {ramp.name}
                          </span>
                          <span className="text-xs text-gray-500 flex-shrink-0">{minSafe.toFixed(0)} ft</span>
                        </div>
                        {/* Second row: Status badge and close dates */}
                        <div className="flex items-center gap-3 pl-4">
                          {isCurrentlyOpen ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-light bg-[#8b9a6b]/10 text-[#8b9a6b]">
                              Open
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-light bg-[#c99a7a]/10 text-[#c99a7a]">
                              Closed
                            </span>
                          )}
                          <div className="flex items-center gap-2 text-xs">
                            {weeklyChange !== null && weeklyChange < 0 && currentTrendDate && (
                              <span className="text-[#d4a574] font-light">
                                Trend: {new Date(currentTrendDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                            {historicalAvgDate && (
                              <span className="text-blue-600 font-light">
                                {weeklyChange !== null && weeklyChange < 0 && currentTrendDate ? '• ' : ''}
                                Avg: {new Date(historicalAvgDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                            {!currentTrendDate && !historicalAvgDate && (
                              <span className="text-gray-400 font-light">—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-3 font-light">
                    Estimated dates when each ramp may become unavailable based on projection trends.
                  </p>
                </div>
              )}
              
              {/* Expandable Historical Analysis */}
              {projectedDrop > 0 && historicalDrops.length > 0 && (
                <HistoricalAnalysisExpandable
                  historicalDrops={historicalDrops}
                  currentElevation={currentElevation}
                  projectedDrop={projectedDrop}
                  projectedLowElevation={projectedLowElevation}
                  projectedLowDate={typicalLowDate}
                  recentHistoricalData={recentHistoricalData}
                  ramps={favoriteRamps}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Snowpack-Based Runoff Projection - only show during runoff season */}
      {showRunoffProjection && snowpackProjection && (
        <div className="mt-8 lg:mt-12">
          <div className="card p-4 sm:p-6 lg:p-8">
            <h2 className="text-xl sm:text-2xl font-light mb-4 sm:mb-6 text-gray-900">
              {seasonalStatus?.runoffProjectionLabel || 'Spring Runoff Projection'}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6 font-light">
              Projection based on historical years with similar peak snowpack percentage. 
              Shows expected elevation gain during the runoff season (April-August).
            </p>
            
            {/* Show current progress if we're actively tracking */}
            {currentGainFromLow !== null && seasonalStatus?.phase === 'runoff-rising' && (
              <div className="mb-6 p-4 bg-[#4a90a4]/10 rounded-lg border border-[#4a90a4]/20">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <h4 className="text-sm uppercase tracking-wider text-gray-500 mb-1 font-light">Current Progress</h4>
                    <p className="text-xs text-gray-400 font-light">
                      Since pre-runoff low on {seasonalStatus.preRunoffLowDate 
                        ? new Date(seasonalStatus.preRunoffLowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="text-left lg:text-right">
                    <div className="text-2xl lg:text-3xl font-light text-[#4a90a4]">
                      +{currentGainFromLow.toFixed(1)} <span className="text-base lg:text-lg text-gray-500">ft so far</span>
                    </div>
                    <div className="text-xs lg:text-sm text-gray-500 font-light">
                      {snowpackProjection.projectedRunoffGain > 0 && (
                        <>of projected +{snowpackProjection.projectedRunoffGain.toFixed(1)} ft</>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Progress bar */}
                {snowpackProjection.projectedRunoffGain > 0 && (
                  <div className="mt-4">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#4a90a4] rounded-full transition-all"
                        style={{ 
                          width: `${Math.min(100, (currentGainFromLow / snowpackProjection.projectedRunoffGain) * 100)}%` 
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>{seasonalStatus.preRunoffLow?.toFixed(0)} ft (low)</span>
                      <span>{(seasonalStatus.preRunoffLow! + snowpackProjection.projectedRunoffGain).toFixed(0)} ft (projected peak)</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <SnowpackProjection 
              projection={snowpackProjection}
              currentElevation={currentElevation}
            />
          </div>
        </div>
      )}

      {/* 5. Runoff Season Summary - show after peak when we can compare actual vs projected */}
      {showRunoffSummary && currentGainFromLow !== null && snowpackProjection && (
        <div className="mt-8 lg:mt-12">
          <div className="card p-4 lg:p-8">
            <h2 className="text-xl lg:text-2xl font-light mb-4 lg:mb-6 text-gray-900">
              Runoff Season Summary
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Actual Gain</div>
                <div className="text-2xl lg:text-3xl font-light text-[#4a90a4]">
                  +{currentGainFromLow.toFixed(1)} ft
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Peak: {seasonalStatus?.peakSoFar?.toFixed(0)} ft
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Projected Gain</div>
                <div className="text-2xl lg:text-3xl font-light text-gray-600">
                  +{snowpackProjection.projectedRunoffGain.toFixed(1)} ft
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Based on {currentSnowpackPercent.toFixed(0)}% snowpack
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Difference</div>
                <div className={`text-2xl lg:text-3xl font-light ${
                  currentGainFromLow > snowpackProjection.projectedRunoffGain 
                    ? 'text-[#8b9a6b]' 
                    : 'text-[#c99a7a]'
                }`}>
                  {currentGainFromLow > snowpackProjection.projectedRunoffGain ? '+' : ''}
                  {(currentGainFromLow - snowpackProjection.projectedRunoffGain).toFixed(1)} ft
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {currentGainFromLow > snowpackProjection.projectedRunoffGain 
                    ? 'Better than expected' 
                    : 'Below projection'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

