import { getLatestWaterMeasurement, getWaterMeasurementsByRange, getElevationStorageCapacity } from '@/lib/db'
import { unstable_cache } from 'next/cache'

// Cache latest measurement for 5 minutes
const getCachedLatestMeasurement = unstable_cache(
  async () => getLatestWaterMeasurement(),
  ['storage-latest-measurement'],
  { revalidate: 300, tags: ['water-measurements'] }
)

// Cache all measurements for storage calculations (1 hour)
const getCachedMeasurements = unstable_cache(
  async () => {
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = '1963-01-01' // Start of Lake Powell data
    return getWaterMeasurementsByRange(startDate, endDate)
  },
  ['storage-all-measurements'],
  { revalidate: 3600, tags: ['water-measurements'] }
)

// Cache storage capacity (24 hours)
const getCachedStorageCapacity = unstable_cache(
  async () => getElevationStorageCapacity(),
  ['storage-capacity'],
  { revalidate: 86400, tags: ['elevation-storage'] }
)

interface StorageBand {
  percentStart: number  // Starting percentage (0, 25, 50, 75)
  percentEnd: number    // Ending percentage (25, 50, 75, 100)
  elevationStart: number // Elevation at start of band
  elevationEnd: number  // Elevation at end of band
  capacity: number      // Storage capacity of this band in acre-feet
  storageAtBottom: number  // Total storage at bottom of band
  storageAtTop: number     // Total storage at top of band
  percentFull: number      // How full this band is (0-100)
  currentStorage: number   // Current storage in this band
}

interface ElevationBand {
  elevationStart: number  // Elevation at start of band (ft)
  elevationEnd: number   // Elevation at end of band (ft)
  capacity: number        // Storage capacity of this band in acre-feet
  storageAtBottom: number // Total storage at bottom of band
  storageAtTop: number    // Total storage at top of band
  percentFull: number     // How full this band is (0-100)
  currentStorage: number   // Current storage in this band
}

function calculateStorageBands(
  allData: Array<{ elevation: number; content: number }>,
  currentElevation: number,
  currentStorage: number,
  fullPoolCapacity: number,
  fullPoolElevation: number
): StorageBand[] {
  // Group by elevation (rounded to nearest foot) to find max storage at each elevation
  const elevationStorage: Record<number, number> = {}
  for (const record of allData) {
    const elev = Math.round(record.elevation)
    const content = record.content
    // Keep the maximum storage seen at each elevation
    if (!elevationStorage[elev] || content > elevationStorage[elev]) {
      elevationStorage[elev] = content
    }
  }

  // Create bands based on 25% increments of storage capacity
  const bands: StorageBand[] = []
  const sortedElevs = Object.keys(elevationStorage).map(Number).sort((a, b) => a - b)
  
  // Helper function to find elevation for a given storage amount
  // Uses interpolation from data points, with dead pool (3370 ft, 0) and full pool (3700 ft, fullPoolCapacity) as anchors
  const findElevationForStorage = (targetStorage: number): number => {
    const deadPoolElev = 3370
    
    // Boundary checks
    if (targetStorage >= fullPoolCapacity) {
      return fullPoolElevation
    }
    if (targetStorage <= 0) {
      return deadPoolElev
    }
    
    // Try to use data for interpolation if available
    if (sortedElevs.length >= 2) {
      const maxDataStorage = Math.max(...Object.values(elevationStorage))
      const minDataStorage = Math.min(...Object.values(elevationStorage))
      
      if (targetStorage >= minDataStorage && targetStorage <= maxDataStorage) {
        // Interpolate from data
        for (let i = 0; i < sortedElevs.length - 1; i++) {
          const e1 = sortedElevs[i]
          const e2 = sortedElevs[i + 1]
          const s1 = elevationStorage[e1]
          const s2 = elevationStorage[e2]
          
          if (targetStorage >= s1 && targetStorage <= s2) {
            const ratio = (targetStorage - s1) / (s2 - s1)
            return e1 + (e2 - e1) * ratio
          }
        }
      } else if (targetStorage > maxDataStorage) {
        // Extrapolate from highest data point to full pool
        const maxElev = Math.max(...sortedElevs)
        const maxStorage = elevationStorage[maxElev]
        if (maxStorage < fullPoolCapacity) {
          const ratio = (targetStorage - maxStorage) / (fullPoolCapacity - maxStorage)
          return maxElev + (fullPoolElevation - maxElev) * ratio
        }
      } else if (targetStorage < minDataStorage) {
        // Extrapolate from lowest data point to dead pool
        const minElev = Math.min(...sortedElevs)
        const minStorage = elevationStorage[minElev]
        if (minStorage > 0) {
          const ratio = (targetStorage - 0) / (minStorage - 0)
          return deadPoolElev + (minElev - deadPoolElev) * ratio
        }
      }
    }
    
    // Fallback: use cubic interpolation (reservoirs are roughly V-shaped)
    // Storage = k * (elevation - deadPool)^3
    const elevRange = fullPoolElevation - deadPoolElev
    const k = fullPoolCapacity / (elevRange ** 3)
    
    if (k > 0) {
      const elevation = deadPoolElev + Math.pow(targetStorage / k, 1/3)
      return elevation
    }
    
    // Final fallback: linear interpolation
    const ratio = targetStorage / fullPoolCapacity
    return deadPoolElev + (fullPoolElevation - deadPoolElev) * ratio
  }

  // Create 4 bands: 0-25%, 25-50%, 50-75%, 75-100%
  // Always create all 4 bands regardless of data availability
  for (let i = 0; i < 4; i++) {
    const percentStart = i * 25
    const percentEnd = (i + 1) * 25
    
    const storageStart = (fullPoolCapacity * percentStart) / 100
    const storageEnd = (fullPoolCapacity * percentEnd) / 100
    
    // Find elevations corresponding to these storage amounts
    // Always use the helper function which has fallbacks
    const elevStart = percentStart === 0 
      ? 3370  // Dead pool
      : findElevationForStorage(storageStart)
    const elevEnd = percentEnd === 100
      ? fullPoolElevation
      : findElevationForStorage(storageEnd)
    
    // Ensure valid elevations (should always be true with our fallbacks)
    const finalElevStart = Math.max(3370, Math.min(elevStart, fullPoolElevation))
    const finalElevEnd = Math.max(finalElevStart + 1, Math.min(elevEnd, fullPoolElevation))
    
    const capacity = storageEnd - storageStart
    
    // Calculate how full this band is
    let percentFull = 0
    let currentStorageInBand = 0
    
    if (currentStorage >= storageEnd) {
      // Band is completely full
      percentFull = 100
      currentStorageInBand = capacity
    } else if (currentStorage > storageStart) {
      // Band is partially filled
      currentStorageInBand = currentStorage - storageStart
      percentFull = (currentStorageInBand / capacity) * 100
    }
    // else: band is empty
    
    bands.push({
      percentStart,
      percentEnd,
      elevationStart: finalElevStart,
      elevationEnd: finalElevEnd,
      capacity,
      storageAtBottom: storageStart,
      storageAtTop: storageEnd,
      percentFull,
      currentStorage: currentStorageInBand
    })
  }

  return bands.reverse() // Reverse so highest percentage is at top
}

function calculateElevationBands(
  allData: Array<{ elevation: number; content: number }>,
  currentElevation: number,
  currentStorage: number,
  fullPoolCapacity: number,
  fullPoolElevation: number
): ElevationBand[] {
  // Store allData for use in findElevationForStorage
  const dataRecords = allData
  const deadPoolElev = 3370
  const bandSize = 50  // 50-foot increments
  
  // Round down to nearest 50 for min, round up for max
  const minBand = Math.floor(deadPoolElev / bandSize) * bandSize  // 3350 ft
  const maxBand = Math.ceil(fullPoolElevation / bandSize) * bandSize  // 3700 ft
  
  // Group by elevation to find max storage at each elevation
  // Use maximum storage seen at each elevation (closest to full pool conditions)
  const elevationStorage: Record<number, number> = {}
  for (const record of allData) {
    const elev = Math.round(record.elevation)
    const content = record.content
    if (!elevationStorage[elev] || content > elevationStorage[elev]) {
      elevationStorage[elev] = content
    }
  }
  
  const sortedElevs = Object.keys(elevationStorage).map(Number).sort((a, b) => a - b)
  const minDataElev = Math.min(...sortedElevs)
  const minDataStorage = elevationStorage[minDataElev]
  
  // Use full pool elevation as the max, not the max data elevation
  // Our data may not reach full pool, but we know full pool capacity at 3700 ft
  const maxDataElev = Math.min(Math.max(...sortedElevs), fullPoolElevation - 1)
  const maxDataStorage = elevationStorage[maxDataElev] || elevationStorage[Math.max(...sortedElevs)]
  
  // Helper to find storage at a given elevation using actual data
  const findStorageAtElevation = (targetElev: number): number => {
    if (targetElev <= deadPoolElev) return 0
    if (targetElev >= fullPoolElevation) return fullPoolCapacity
    
    // If within our data range (but not at full pool), interpolate from actual data points
    if (targetElev >= minDataElev && targetElev <= maxDataElev) {
      // Find the two data points to interpolate between
      for (let i = 0; i < sortedElevs.length - 1; i++) {
        const e1 = sortedElevs[i]
        const e2 = sortedElevs[i + 1]
        const s1 = elevationStorage[e1]
        const s2 = elevationStorage[e2]
        
        if (targetElev >= e1 && targetElev <= e2) {
          // Linear interpolation between data points
          const ratio = (targetElev - e1) / (e2 - e1)
          return s1 + (s2 - s1) * ratio
        }
      }
      // If we're at the last data point, use it
      if (targetElev >= sortedElevs[sortedElevs.length - 1]) {
        return elevationStorage[sortedElevs[sortedElevs.length - 1]]
      }
    }
    
    // For elevations below our data (3370 to minDataElev)
    // Extrapolate backwards using cubic relationship
    if (targetElev < minDataElev) {
      const elevDiffData = minDataElev - deadPoolElev
      const elevDiffTarget = targetElev - deadPoolElev
      
      // Use cubic relationship: storage = a * (elev - dead_pool)^3
      const n = 3
      const a = minDataStorage / Math.pow(elevDiffData, n)
      const storage = a * Math.pow(elevDiffTarget, n)
      return Math.max(0, storage)
    }
    
    // For elevations above our max data but below full pool
    // Interpolate between the highest data point and full pool at 3700 ft
    // Use a point just below full pool elevation for interpolation
    const highestDataElev = Math.max(...sortedElevs.filter(e => e < fullPoolElevation))
    const highestDataStorage = elevationStorage[highestDataElev]
    
    if (targetElev > highestDataElev && targetElev < fullPoolElevation) {
      const elevDiffData = fullPoolElevation - highestDataElev
      const elevDiffTarget = targetElev - highestDataElev
      const storageDiff = fullPoolCapacity - highestDataStorage
      
      // Use cubic interpolation: storage increases faster at higher elevations
      const ratio = elevDiffTarget / elevDiffData
      const storage = highestDataStorage + storageDiff * Math.pow(ratio, 3)
      return storage
    }
    
    // Fallback: should never reach here, but just in case
    const ratio = (targetElev - deadPoolElev) / (fullPoolElevation - deadPoolElev)
    return fullPoolCapacity * Math.pow(ratio, 3)  // Cubic relationship
  }
  
  // Helper to find elevation for a given storage amount by searching actual data records
  // Finds the record with content closest to the target storage
  const findElevationForStorage = (targetStorage: number): number => {
    if (targetStorage <= 0) return deadPoolElev
    if (targetStorage >= fullPoolCapacity) return fullPoolElevation
    
    // Search through all data records to find the one with content closest to target
    let closestRecord: { elevation: number; content: number } | null = null
    let closestDiff = Infinity
    
    for (const record of dataRecords) {
      const diff = Math.abs(record.content - targetStorage)
      if (diff < closestDiff) {
        closestDiff = diff
        closestRecord = { elevation: record.elevation, content: record.content }
      }
    }
    
    if (closestRecord) {
      return closestRecord.elevation
    }
    
    // Fallback: if no data found, use interpolation
    const ratio = Math.pow(targetStorage / fullPoolCapacity, 1/3)
    return deadPoolElev + (fullPoolElevation - deadPoolElev) * ratio
  }
  
  const bands: ElevationBand[] = []
  
  // Define band capacities (in millions of acre-ft)
  const bandCapacities = [4.51, 5.5, 6.5, 7.81]  // Total = 24.32M
  
  // Calculate cumulative storage at each band boundary
  let cumulativeStorage = 0  // Start at dead pool (0)
  let currentBandStart = deadPoolElev
  let currentStorageAtBottom = 0
  
  for (let i = 0; i < bandCapacities.length; i++) {
    const bandCapacity = bandCapacities[i] * 1000000  // Convert to acre-ft
    const currentStorageAtTop = cumulativeStorage + bandCapacity
    cumulativeStorage = currentStorageAtTop
    
    // Find elevation for the top of this band
    let currentBandEnd: number
    if (i === 0) {
      // First band: find elevation where content = 4.51M (or closest)
      currentBandEnd = findElevationForStorage(currentStorageAtTop)
    } else if (i === bandCapacities.length - 1) {
      // Last band: ends at full pool (3700 ft)
      currentBandEnd = fullPoolElevation
    } else {
      // Middle bands: find elevation for the target storage (10.01M or 16.51M)
      currentBandEnd = findElevationForStorage(currentStorageAtTop)
    }
    
    // Calculate how full this band is
    let percentFull = 0
    let currentStorageInBand = 0
    
    if (currentElevation >= currentBandEnd) {
      // Band is completely full
      percentFull = 100
      currentStorageInBand = bandCapacity
    } else if (currentElevation > currentBandStart) {
      // Band is partially filled
      const elevInBand = currentElevation - currentBandStart
      const elevRange = currentBandEnd - currentBandStart
      percentFull = (elevInBand / elevRange) * 100
      
      // Calculate storage in this band
      const storageAtCurrent = findStorageAtElevation(currentElevation)
      currentStorageInBand = storageAtCurrent - currentStorageAtBottom
    }
    // else: band is empty
    
    // Ensure band end is at least 1 ft higher than band start for display
    // This handles cases where calculated elevations are very close (near full pool)
    let finalBandEnd = currentBandEnd
    if (finalBandEnd <= currentBandStart + 0.5) {
      // If the calculated end is too close to start, ensure minimum 1 ft increment
      // Distribute remaining elevation space proportionally
      const remainingBands = bandCapacities.length - i - 1
      if (remainingBands > 0) {
        const remainingElevation = fullPoolElevation - currentBandStart
        const minElevationPerBand = Math.max(1, Math.floor(remainingElevation / (remainingBands + 1)))
        finalBandEnd = currentBandStart + minElevationPerBand
      } else {
        finalBandEnd = currentBandStart + 1  // Last band before full pool
      }
    }
    
    // Round elevations for display, ensuring proper ordering
    const roundedStart = Math.round(currentBandStart)
    let roundedEnd = Math.round(finalBandEnd)
    // Ensure rounded end is at least 1 ft higher than rounded start
    if (roundedEnd <= roundedStart) {
      roundedEnd = roundedStart + 1
    }
    
    bands.push({
      elevationStart: roundedStart,
      elevationEnd: roundedEnd,
      capacity: bandCapacity,
      storageAtBottom: currentStorageAtBottom,
      storageAtTop: currentStorageAtTop,
      percentFull,
      currentStorage: currentStorageInBand
    })
    
    // Next band starts where this one ends
    currentBandStart = currentBandEnd
    currentStorageAtBottom = currentStorageAtTop
  }
  
  return bands.reverse() // Reverse so highest elevation is at top
}

export default async function StoragePage() {
  const current = await getLatestWaterMeasurement()
  if (!current) {
    return (
      <div className="container mx-auto px-6 lg:px-8 py-12 lg:py-16">
        <div className="text-center">
          <h1 className="text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-4">
            Storage Capacity
          </h1>
          <p className="text-lg text-gray-500 font-light">No current water elevation data available.</p>
        </div>
      </div>
    )
  }

  // Full pool specifications
  const FULL_POOL_CAPACITY = 24322000  // 24,322,000 acre-feet
  const FULL_POOL_ELEVATION = 3700     // 3,700 feet
  const DEAD_POOL_ELEVATION = 3370     // Dead pool elevation

  // Get all historical data to calculate capacity bands
  const allData = await getWaterMeasurementsByRange('1969-01-01', '2026-01-09')
  const capacityBands = calculateStorageBands(
    allData.map(m => ({ elevation: m.elevation, content: m.content })),
    current.elevation,
    current.content,
    FULL_POOL_CAPACITY,
    FULL_POOL_ELEVATION
  )
  
  const elevationBands = calculateElevationBands(
    allData.map(m => ({ elevation: m.elevation, content: m.content })),
    current.elevation,
    current.content,
    FULL_POOL_CAPACITY,
    FULL_POOL_ELEVATION
  )
  
  // Get pre-calculated elevation storage capacity data
  const elevationStorageData = await getElevationStorageCapacity()

  const percentFull = (current.content / FULL_POOL_CAPACITY) * 100
  const elevationBelow = FULL_POOL_ELEVATION - current.elevation

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-16">
      <div className="mb-8 sm:mb-12 text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-2 sm:mb-4">
          Storage Capacity
        </h1>
        <p className="text-sm sm:text-lg text-gray-500 font-light max-w-2xl mx-auto">
          Visualize Lake Powell&apos;s storage capacity by elevation bands
        </p>
      </div>

      {/* Current Status */}
      <div className="mb-8 sm:mb-12 card p-4 sm:p-6 lg:p-8 text-center">
        <div className="text-xs sm:text-sm uppercase tracking-wider text-gray-500 mb-2 font-light">Current Status</div>
        <div className="text-3xl sm:text-4xl lg:text-5xl font-light text-gray-900 mb-2 sm:mb-4">
          {current.elevation.toFixed(2)} <span className="text-xl sm:text-2xl text-gray-500">ft</span>
        </div>
        <div className="text-base sm:text-lg text-gray-600 font-light mb-2">
          {(current.content / 1000000).toFixed(2)}M acre-ft
        </div>
        <div className="text-xs sm:text-sm text-gray-500 font-light">
          {percentFull.toFixed(1)}% of full pool ({FULL_POOL_ELEVATION} ft)
        </div>
        <div className="text-xs sm:text-sm text-gray-500 font-light mt-1">
          {elevationBelow.toFixed(2)} ft below full pool
        </div>
      </div>

      {/* 15ft Elevation Bands Visualization */}
      <div className="mb-8 sm:mb-12">
        <div className="card p-4 sm:p-6 lg:p-8">
          <h2 className="text-xl sm:text-2xl font-light mb-4 sm:mb-6 text-gray-900">Lake Storage w/15ft Increments</h2>
          {(() => {
            // Group data into 15ft bands, capped at 3705 (full pool)
            const bandSize = 15
            const maxElevCap = 3705  // Cap at full pool elevation
            const bands15ft: Array<{
              elevStart: number
              elevEnd: number
              elevRange: number  // Actual elevation range (for proportional height)
              capacity: number
              storageAtBottom: number
              storageAtTop: number
            }> = []
            
            // Start from dead pool (3370) up to capped elevation
            const minElev = Math.min(...elevationStorageData.map(d => d.elevation))
            const startElev = Math.floor(minElev / bandSize) * bandSize
            
            for (let elev = startElev; elev < maxElevCap; elev += bandSize) {
              const bandStart = elev
              // Cap the band end at maxElevCap
              const bandEnd = Math.min(elev + bandSize, maxElevCap)
              const elevRange = bandEnd - bandStart
              
              // Get storage values at band boundaries
              const dataAtStart = elevationStorageData.find(d => d.elevation === bandStart)
              const dataAtEnd = elevationStorageData.find(d => d.elevation === bandEnd) || 
                               elevationStorageData.find(d => d.elevation === bandEnd - 1)
              
              // Calculate capacity for this band (sum of storage_per_foot for elevations in this band)
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
            // Start from the bottom and ensure each band is at least as wide as the one below
            for (let i = 1; i < bands15ft.length; i++) {
              if (bands15ft[i].capacity < bands15ft[i - 1].capacity) {
                bands15ft[i].capacity = bands15ft[i - 1].capacity
              }
            }
            
            // Find max capacity for width scaling
            const maxCapacity = Math.max(...bands15ft.map(b => b.capacity))
            const baseHeight = 24 // Base height for a full 15ft band (pixels)
            
            // Reverse so highest elevation is at top
            const reversedBands = [...bands15ft].reverse()
            
            return (
              <div className="flex flex-col items-center">
                {reversedBands.map((band, idx) => {
                  const widthPercent = (band.capacity / maxCapacity) * 100
                  const isCurrentBand = current.elevation >= band.elevStart && current.elevation < band.elevEnd
                  const isFull = current.elevation >= band.elevEnd
                  const isEmpty = current.elevation <= band.elevStart
                  // Proportional height based on elevation range
                  const bandHeight = (band.elevRange / bandSize) * baseHeight
                  
                  return (
                    <div key={band.elevStart} className="flex items-center w-full gap-4">
                      {/* Elevation Label */}
                      <div className="w-32 text-right text-xs text-gray-500 font-light">
                        {band.elevStart}-{band.elevEnd} ft
                      </div>
                      
                      {/* Band visualization */}
                      <div className="flex-1 flex justify-center">
                        <div 
                          className="transition-all"
                          style={{ 
                            width: `${widthPercent}%`,
                            height: `${bandHeight}px`,
                            backgroundColor: isEmpty 
                              ? '#d4a574'  // Warm beige for empty
                              : isFull 
                                ? '#6b8a9a'  // Muted slate blue for water
                                : '#8b9a6b',  // Olive green for current level
                            borderLeft: '1px solid rgba(0,0,0,0.1)',
                            borderRight: '1px solid rgba(0,0,0,0.1)',
                            borderTop: idx === 0 ? '1px solid rgba(0,0,0,0.1)' : 'none',
                            borderBottom: idx === reversedBands.length - 1 ? '1px solid rgba(0,0,0,0.1)' : 'none',
                          }}
                        />
                      </div>
                      
                      {/* Capacity Label */}
                      <div className="w-28 text-left text-xs text-gray-500 font-light">
                        {(band.capacity / 1000000).toFixed(2)}M af
                      </div>
                    </div>
                  )
                })}
                
                {/* Legend */}
                <div className="mt-6 pt-4 border-t border-gray-100 w-full">
                  <div className="flex items-center justify-center gap-6 text-xs font-light">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-[#6b8a9a]"></div>
                      <span className="text-gray-600">Water</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-[#8b9a6b]"></div>
                      <span className="text-gray-600">Current Level</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-[#d4a574]"></div>
                      <span className="text-gray-600">Empty</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* 1ft Elevation Bands Visualization */}
      <div className="mb-12">
        <div className="card p-6 lg:p-8">
          <h2 className="text-2xl font-light mb-6 text-gray-900">Lake Storage w/1ft Increments</h2>
          {(() => {
            // Filter to only elevations with valid storage_per_foot
            const validData = elevationStorageData
              .filter(d => d.storage_per_foot && d.storage_per_foot > 0)
              .sort((a, b) => a.elevation - b.elevation) // Ensure sorted by elevation ascending
            
            // Enforce monotonically increasing storage_per_foot
            // For a V-shaped lake, higher elevations should always hold more water per foot
            const smoothedData: typeof validData = []
            for (let i = 0; i < validData.length; i++) {
              const d = validData[i]
              if (i === 0) {
                smoothedData.push({ ...d })
              } else {
                // Each elevation should have at least as much storage_per_foot as the one below
                const previousSmoothed = smoothedData[i - 1].storage_per_foot || 0
                const currentValue = d.storage_per_foot || 0
                smoothedData.push({
                  ...d,
                  storage_per_foot: Math.max(currentValue, previousSmoothed)
                })
              }
            }
            
            // Find max for width scaling
            const maxStoragePerFoot = Math.max(...smoothedData.map(d => d.storage_per_foot || 0))
            const bandHeight = 2 // Fixed height for each 1ft band (pixels)
            
            // Reverse so highest elevation is at top
            const reversedData = [...smoothedData].reverse()
            
            return (
              <div className="flex flex-col items-center">
                <div className="flex items-start w-full gap-4">
                  {/* Elevation scale on left */}
                  <div className="w-20 flex flex-col justify-between text-right text-xs text-gray-500 font-light" 
                       style={{ height: `${validData.length * bandHeight}px` }}>
                    <span>{reversedData[0]?.elevation} ft</span>
                    <span>{reversedData[Math.floor(reversedData.length / 2)]?.elevation} ft</span>
                    <span>{reversedData[reversedData.length - 1]?.elevation} ft</span>
                  </div>
                  
                  {/* Bands visualization */}
                  <div className="flex-1 flex flex-col items-center">
                    {reversedData.map((data) => {
                      const widthPercent = ((data.storage_per_foot || 0) / maxStoragePerFoot) * 100
                      const isFull = current.elevation >= data.elevation + 1
                      const isCurrentBand = current.elevation >= data.elevation && current.elevation < data.elevation + 1
                      const isEmpty = current.elevation <= data.elevation
                      
                      return (
                        <div 
                          key={data.elevation}
                          className="transition-all"
                          style={{ 
                            width: `${widthPercent}%`,
                            height: `${bandHeight}px`,
                            backgroundColor: isEmpty 
                              ? '#d4a574'  // Warm beige for empty
                              : isFull 
                                ? '#6b8a9a'  // Muted slate blue for water
                                : '#8b9a6b',  // Olive green for current level
                          }}
                        />
                      )
                    })}
                  </div>
                  
                  {/* Capacity scale on right */}
                  <div className="w-24 flex flex-col justify-between text-left text-xs text-gray-500 font-light"
                       style={{ height: `${validData.length * bandHeight}px` }}>
                    <span>{(maxStoragePerFoot / 1000).toFixed(0)}K af/ft</span>
                    <span>{(maxStoragePerFoot / 2000).toFixed(0)}K af/ft</span>
                    <span>0</span>
                  </div>
                </div>
                
                {/* Current level indicator */}
                <div className="mt-4 text-sm text-gray-600 font-light">
                  Current: {current.elevation.toFixed(1)} ft ({(current.content / 1000000).toFixed(2)}M af)
                </div>
                
                {/* Legend */}
                <div className="mt-4 pt-4 border-t border-gray-100 w-full">
                  <div className="flex items-center justify-center gap-6 text-xs font-light">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-[#6b8a9a]"></div>
                      <span className="text-gray-600">Water</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-[#8b9a6b]"></div>
                      <span className="text-gray-600">Current Level</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-[#d4a574]"></div>
                      <span className="text-gray-600">Empty</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

    </div>
  )
}

