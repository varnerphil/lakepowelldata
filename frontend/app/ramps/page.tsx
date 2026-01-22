import { getAllRamps, getLatestWaterMeasurement, calculateRampStatus } from '@/lib/db'
import { formatDateString } from '@/lib/date-utils'
import { unstable_cache } from 'next/cache'
import RampStatusCard from '@/components/ramp-status/RampStatusCard'

// Cache ramps for 1 hour
const getCachedRamps = unstable_cache(
  async () => getAllRamps(),
  ['all-ramps'],
  { revalidate: 3600, tags: ['ramps'] }
)

// Cache latest measurement for 5 minutes
const getCachedLatestMeasurement = unstable_cache(
  async () => getLatestWaterMeasurement(),
  ['latest-measurement'],
  { revalidate: 300, tags: ['water-measurements'] }
)

export default async function RampsPage() {
  const [ramps, currentMeasurement] = await Promise.all([
    getCachedRamps(),
    getCachedLatestMeasurement()
  ])

  if (!currentMeasurement) {
    return (
      <div className="container mx-auto px-6 lg:px-8 py-12 lg:py-16">
        <div className="text-center">
          <h1 className="text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-4">
            Boat Ramp Status
          </h1>
          <p className="text-lg text-gray-500 font-light">No current water elevation data available.</p>
        </div>
      </div>
    )
  }

  const rampStatuses = ramps.map(ramp => {
    const status = calculateRampStatus(ramp, currentMeasurement.elevation)
    const elevationDifference = currentMeasurement.elevation - ramp.min_safe_elevation
    
    return {
      ...ramp,
      status,
      current_elevation: currentMeasurement.elevation,
      elevation_difference: elevationDifference
    }
  })

  // Separate into available and unusable groups
  const availableRamps = rampStatuses.filter(ramp => ramp.status !== 'Unusable')
  const unusableRamps = rampStatuses.filter(ramp => ramp.status === 'Unusable')

  // Sort each group by min_safe_elevation (lowest to highest)
  availableRamps.sort((a, b) => a.min_safe_elevation - b.min_safe_elevation)
  unusableRamps.sort((a, b) => a.min_safe_elevation - b.min_safe_elevation)

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-16">
      <div className="mb-8 sm:mb-12 text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-2 sm:mb-4">
          Boat Ramp Status
        </h1>
        <p className="text-sm sm:text-lg text-gray-500 font-light max-w-2xl mx-auto">
          Check the accessibility of boat ramps based on current water levels
        </p>
      </div>
      
      <div className="mb-8 sm:mb-12 card p-4 sm:p-6 lg:p-8 text-center">
        <div className="text-xs sm:text-sm uppercase tracking-wider text-gray-500 mb-2 font-light">Current Water Elevation</div>
        <div className="text-3xl sm:text-4xl lg:text-5xl font-light text-gray-900 mb-2 sm:mb-4">
          {currentMeasurement.elevation.toFixed(2)} <span className="text-xl sm:text-2xl text-gray-500">ft</span>
        </div>
        <div className="text-xs sm:text-sm text-gray-500 font-light">
          As of: {formatDateString(currentMeasurement.date, { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Available Ramps Section */}
      {availableRamps.length > 0 && (
        <div className="mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-light text-gray-900 mb-4 sm:mb-6">
            Available Ramps
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {availableRamps.map((ramp) => (
              <RampStatusCard key={ramp.id} ramp={ramp} />
            ))}
          </div>
        </div>
      )}

      {/* Unusable Ramps Section */}
      {unusableRamps.length > 0 && (
        <div>
          <h2 className="text-2xl sm:text-3xl font-light text-gray-900 mb-4 sm:mb-6">
            Unusable Ramps
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {unusableRamps.map((ramp) => (
              <RampStatusCard key={ramp.id} ramp={ramp} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}



