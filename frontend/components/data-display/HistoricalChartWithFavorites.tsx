'use client'

import { useState, useEffect, useMemo } from 'react'
import { HistoricalChart } from '@/components/data-display'
import type { WaterMeasurement, Ramp } from '@/lib/db'

interface HistoricalChartWithFavoritesProps {
  data: WaterMeasurement[]
  startDate: string
  endDate: string
  currentRange?: string
  showControls?: boolean
  formAction?: string
  allRamps: Ramp[]
}

export default function HistoricalChartWithFavorites({
  data,
  startDate,
  endDate,
  currentRange = '1year',
  showControls = true,
  formAction = '/history',
  allRamps
}: HistoricalChartWithFavoritesProps) {
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
    <HistoricalChart
      data={data}
      startDate={startDate}
      endDate={endDate}
      currentRange={currentRange}
      showControls={showControls}
      formAction={formAction}
      ramps={favoriteRamps}
    />
  )
}

