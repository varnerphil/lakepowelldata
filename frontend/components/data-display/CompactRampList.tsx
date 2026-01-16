'use client'

import { useState, useEffect } from 'react'
import { Star, ChevronDown, ChevronUp } from 'lucide-react'

interface Ramp {
  id: number
  name: string
  min_safe_elevation: number
  min_usable_elevation: number
  location: string | null
}

interface CompactRampListProps {
  ramps: Ramp[]
  currentElevation: number
}

type RampStatus = 'Open and Usable' | 'Use at Own Risk' | 'Unusable'

interface RampWithStatus extends Ramp {
  status: RampStatus
  elevation_difference: number
}

function calculateRampStatus(ramp: Ramp, currentElevation: number): RampStatus {
  if (currentElevation >= ramp.min_safe_elevation) {
    return 'Open and Usable'
  } else if (currentElevation >= ramp.min_usable_elevation) {
    return 'Use at Own Risk'
  } else {
    return 'Unusable'
  }
}

export default function CompactRampList({ ramps, currentElevation }: CompactRampListProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [favorites, setFavorites] = useState<number[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Default favorite ramp names
  const defaultFavoriteNames = [
    'Bullfrog North Ramp',
    'Stateline Launch',
    'Antelope Point Business Ramp',
    'Castle Rock Cut-Off' // "The Cut"
  ]

  // Load favorites from localStorage on mount, or set defaults
  useEffect(() => {
    const stored = localStorage.getItem('favoriteRamps')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setFavorites(parsed)
        setIsInitialized(true)
      } catch (e) {
        console.error('Error loading favorites:', e)
        setIsInitialized(true)
      }
    } else {
      // Set default favorites based on names
      const defaultFavoriteIds = ramps
        .filter(ramp => defaultFavoriteNames.includes(ramp.name))
        .map(ramp => ramp.id)
      
      if (defaultFavoriteIds.length > 0) {
        setFavorites(defaultFavoriteIds)
        localStorage.setItem('favoriteRamps', JSON.stringify(defaultFavoriteIds))
      }
      setIsInitialized(true)
    }
  }, [ramps])

  // Deduplicate ramps by ID (in case of duplicates)
  const uniqueRamps = Array.from(
    new Map(ramps.map(ramp => [ramp.id, ramp])).values()
  )

  // Calculate ramp statuses
  const rampsWithStatus: RampWithStatus[] = uniqueRamps.map(ramp => {
    const status = calculateRampStatus(ramp, currentElevation)
    const elevation_difference = currentElevation - ramp.min_safe_elevation
    return {
      ...ramp,
      status,
      elevation_difference
    }
  })

  // Separate into available and unusable groups
  const availableRamps = rampsWithStatus.filter(ramp => ramp.status !== 'Unusable')
  const unusableRamps = rampsWithStatus.filter(ramp => ramp.status === 'Unusable')

  // Sort each group by min_safe_elevation (lowest to highest)
  availableRamps.sort((a, b) => a.min_safe_elevation - b.min_safe_elevation)
  unusableRamps.sort((a, b) => a.min_safe_elevation - b.min_safe_elevation)

  // Combine back: available first, then unusable
  const sortedRampsWithStatus = [...availableRamps, ...unusableRamps]

  // Separate favorites and non-favorites
  const favoriteRamps = sortedRampsWithStatus
    .filter(r => favorites.includes(r.id))
    .sort((a, b) => {
      // Sort favorites by min_safe_elevation (ascending - lowest to highest)
      return a.min_safe_elevation - b.min_safe_elevation
    })
  const otherRamps = sortedRampsWithStatus.filter(r => !favorites.includes(r.id))

  const toggleFavorite = (rampId: number) => {
    const newFavorites = favorites.includes(rampId)
      ? favorites.filter(id => id !== rampId)
      : [...favorites, rampId]
    setFavorites(newFavorites)
    localStorage.setItem('favoriteRamps', JSON.stringify(newFavorites))
  }

  const getStatusColor = (status: RampStatus) => {
    switch (status) {
      case 'Open and Usable':
        return 'text-[#8b9a6b]'
      case 'Use at Own Risk':
        return 'text-[#d4a574]'
      case 'Unusable':
        return 'text-[#c99a7a]'
    }
  }

  const getStatusIcon = (status: RampStatus) => {
    switch (status) {
      case 'Open and Usable':
        return '✓'
      case 'Use at Own Risk':
        return '⚠'
      case 'Unusable':
        return '✗'
    }
  }

  const renderRampItem = (ramp: RampWithStatus, isFavorite: boolean = false) => {
    const styles = getStatusStyles(ramp.status)
    const statusIcon = getStatusIcon(ramp.status)
    const borderColor = ramp.status === 'Open and Usable' ? 'border-[#8b9a6b]' : 
                       ramp.status === 'Use at Own Risk' ? 'border-[#d4a574]' : 
                       'border-[#c99a7a]'
    
    return (
      <div 
        key={ramp.id} 
        className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded transition-colors"
      >
        <div className="flex items-center gap-2 lg:gap-3 flex-1 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleFavorite(ramp.id)
            }}
            className="flex-shrink-0 p-1.5 lg:p-2 hover:bg-gray-100 rounded transition-colors active:scale-95"
            aria-label={favorites.includes(ramp.id) ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star 
              className={`w-6 h-6 lg:w-7 lg:h-7 ${favorites.includes(ramp.id) ? 'text-[#d4a574] fill-[#d4a574]' : 'text-gray-300'}`}
              strokeWidth={1.5}
            />
          </button>
          {/* Circular Icon - matching favorites and ramps page style */}
          <div className={`flex-shrink-0 w-8 h-8 lg:w-10 lg:h-10 rounded-full ${styles.bg} border-2 ${borderColor} flex items-center justify-center`}>
            <span className={`${styles.accent} text-sm lg:text-lg font-light`}>{statusIcon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-light text-gray-900 truncate">{ramp.name}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-sm text-gray-500 font-light">
              <span>{ramp.min_safe_elevation.toFixed(0)}ft</span>
              <span className={ramp.elevation_difference >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}>
                {ramp.elevation_difference >= 0 ? '+' : ''}{ramp.elevation_difference.toFixed(0)}ft
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const getStatusStyles = (status: RampStatus) => {
    switch (status) {
      case 'Open and Usable':
        return {
          bg: 'bg-[#f0f5ed]',
          border: 'border-l-4 border-l-[#8b9a6b] border-y border-r border-gray-200',
          badge: 'bg-[#8b9a6b] text-white',
          text: 'text-[#5a6a4a]',
          accent: 'text-[#8b9a6b]',
          label: 'Open'
        }
      case 'Use at Own Risk':
        return {
          bg: 'bg-[#faf5f0]',
          border: 'border-l-4 border-l-[#d4a574] border-y border-r border-gray-200',
          badge: 'bg-[#d4a574] text-white',
          text: 'text-[#8b6a4a]',
          accent: 'text-[#d4a574]',
          label: 'Caution'
        }
      case 'Unusable':
        return {
          bg: 'bg-[#faf0f0]',
          border: 'border-l-4 border-l-[#c99a7a] border-y border-r border-gray-200',
          badge: 'bg-[#c99a7a] text-white',
          text: 'text-[#8b5a4a]',
          accent: 'text-[#c99a7a]',
          label: 'Closed'
        }
    }
  }

  const renderFavoriteItem = (ramp: RampWithStatus) => {
    // Get short name for "The Cut"
    const displayName = ramp.name === 'Castle Rock Cut-Off' ? 'The Cut' : 
                       ramp.name.replace(' (Main Launch)', '').replace(' Ramp', '').replace(' (use at own risk)', '')
    
    const styles = getStatusStyles(ramp.status)
    const statusIcon = getStatusIcon(ramp.status)
    const borderColor = ramp.status === 'Open and Usable' ? 'border-[#8b9a6b]' : 
                       ramp.status === 'Use at Own Risk' ? 'border-[#d4a574]' : 
                       'border-[#c99a7a]'
    
    return (
      <div
        key={ramp.id}
        className={`flex items-center gap-1 lg:gap-3 px-1.5 lg:px-4 py-0.5 lg:py-3.5 rounded-lg ${styles.bg} ${styles.border} hover:brightness-95 transition-all w-full h-full`}
      >
        {/* Circular Icon - matching ramps page style */}
        <div className={`flex-shrink-0 w-5 h-5 lg:w-10 lg:h-10 rounded-full ${styles.bg} border-2 ${borderColor} flex items-center justify-center`}>
          <span className={`${styles.accent} text-[10px] lg:text-lg font-light`}>{statusIcon}</span>
        </div>
        
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex flex-col lg:flex-row lg:items-center gap-0 lg:gap-2.5 mb-0 lg:mb-1">
            <span className={`text-[10px] lg:text-lg font-medium ${styles.text} break-words lg:truncate flex-1 min-w-0 leading-tight`}>{displayName}</span>
          </div>
          <div className="flex items-center gap-0.5 lg:gap-2 text-[9px] lg:text-base font-light flex-wrap">
            <span className={`${styles.text} whitespace-nowrap`}>{ramp.min_safe_elevation.toFixed(0)}ft min</span>
            <span className={`${styles.text} flex-shrink-0`}>•</span>
            <span className={`${styles.accent} font-medium flex-shrink-0 whitespace-nowrap`}>
              {ramp.elevation_difference >= 0 ? '+' : ''}{ramp.elevation_difference.toFixed(0)}ft
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 pt-6 border-t border-gray-100">
      {/* Favorites Section - 2 columns on mobile, horizontal on desktop */}
      {favoriteRamps.length > 0 && (
        <div className="mb-2 lg:mb-4 pb-2 lg:pb-4 border-b border-gray-100">
          <div className="text-xs lg:text-sm uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Favorites</div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-1 gap-y-0.5 lg:gap-2">
            {favoriteRamps.map(ramp => renderFavoriteItem(ramp))}
          </div>
        </div>
      )}

      {/* Dropdown Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-base lg:text-lg font-light text-gray-700 hover:text-gray-900 transition-colors py-2"
      >
        <span>Boat Ramp Status ({sortedRampsWithStatus.length})</span>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="w-5 h-5" strokeWidth={1.5} />
        )}
      </button>

      {/* Dropdown Content - Show ALL ramps so favorites can be removed */}
      {isExpanded && (
        <div className="mt-2 max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
          <div className="divide-y divide-gray-100">
            {sortedRampsWithStatus.map(ramp => renderRampItem(ramp, favorites.includes(ramp.id)))}
          </div>
        </div>
      )}
    </div>
  )
}

