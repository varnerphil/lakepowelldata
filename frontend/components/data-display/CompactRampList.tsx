'use client'

import { useState, useEffect } from 'react'

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

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg 
      className={`w-5 h-5 ${filled ? 'text-yellow-500 fill-current' : 'text-gray-300'}`} 
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  )
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

  // Sort by status: Open first, then Use at Own Risk, then Unusable
  const statusOrder: Record<RampStatus, number> = { 
    'Open and Usable': 0, 
    'Use at Own Risk': 1, 
    'Unusable': 2 
  }
  rampsWithStatus.sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status]
    if (statusDiff !== 0) return statusDiff
    // If same status, sort by elevation difference (closer to usable first)
    return Math.abs(a.elevation_difference) - Math.abs(b.elevation_difference)
  })

  // Separate favorites and non-favorites (ensure no overlap)
  const favoriteRamps = rampsWithStatus
    .filter(r => favorites.includes(r.id))
    .sort((a, b) => {
      // Sort favorites by their order in defaultFavoriteNames, then by status
      const aIndex = defaultFavoriteNames.indexOf(a.name)
      const bIndex = defaultFavoriteNames.indexOf(b.name)
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1
      return statusOrder[a.status] - statusOrder[b.status]
    })
  const otherRamps = rampsWithStatus.filter(r => !favorites.includes(r.id))

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

  const renderRampItem = (ramp: RampWithStatus, isFavorite: boolean = false) => (
    <div 
      key={ramp.id} 
      className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded transition-colors"
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(ramp.id)
          }}
          className="flex-shrink-0 p-1 hover:bg-gray-100 rounded transition-colors"
          aria-label={favorites.includes(ramp.id) ? 'Remove from favorites' : 'Add to favorites'}
        >
          <StarIcon filled={favorites.includes(ramp.id)} />
        </button>
        <span className={`text-sm font-light ${getStatusColor(ramp.status)} flex-shrink-0`}>
          {getStatusIcon(ramp.status)}
        </span>
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
    
    return (
      <div
        key={ramp.id}
        className={`flex items-center gap-3 px-4 py-3.5 rounded-lg ${styles.bg} ${styles.border} hover:brightness-95 transition-all`}
      >
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className={`text-lg font-medium ${styles.text} truncate`}>{displayName}</span>
            <span className={`text-sm font-medium px-2.5 py-1 rounded ${styles.badge}`}>
              {styles.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-base font-light mt-1">
            <span className={styles.text}>{ramp.min_safe_elevation.toFixed(0)}ft min</span>
            <span className={styles.text}>•</span>
            <span className={`${styles.accent} font-medium`}>
              {ramp.elevation_difference >= 0 ? '+' : ''}{ramp.elevation_difference.toFixed(0)}ft
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 pt-6 border-t border-gray-100">
      {/* Favorites Section - Horizontal Layout */}
      {favoriteRamps.length > 0 && (
        <div className="mb-4 pb-4 border-b border-gray-100">
          <div className="text-sm uppercase tracking-wider text-gray-500 mb-2 font-light">Favorites</div>
          <div className="flex flex-wrap gap-2">
            {favoriteRamps.map(ramp => renderFavoriteItem(ramp))}
          </div>
        </div>
      )}

      {/* Dropdown Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-base sm:text-lg font-light text-gray-700 hover:text-gray-900 transition-colors py-2"
      >
        <span>Boat Ramp Status ({rampsWithStatus.length})</span>
        {isExpanded ? (
          <ChevronUpIcon className="w-5 h-5" />
        ) : (
          <ChevronDownIcon className="w-5 h-5" />
        )}
      </button>

      {/* Dropdown Content - Show ALL ramps so favorites can be removed */}
      {isExpanded && (
        <div className="mt-2 max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
          <div className="divide-y divide-gray-100">
            {rampsWithStatus.map(ramp => renderRampItem(ramp, favorites.includes(ramp.id)))}
          </div>
        </div>
      )}
    </div>
  )
}

