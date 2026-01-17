import { getWaterMeasurementsByRange, getElevationStorageCapacity, getAllRamps } from '@/lib/db'
import { unstable_cache } from 'next/cache'
import OutflowSimulator from '@/components/simulator/OutflowSimulator'

// Cache historical measurements for 1 hour (large dataset, rarely changes)
const getCachedHistoricalMeasurements = unstable_cache(
  async () => {
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = '1985-01-01'
    return getWaterMeasurementsByRange(startDate, endDate)
  },
  ['simulator-historical-measurements'],
  { revalidate: 3600, tags: ['water-measurements'] }
)

// Cache storage capacity for 24 hours
const getCachedStorageCapacity = unstable_cache(
  async () => getElevationStorageCapacity(),
  ['simulator-storage-capacity'],
  { revalidate: 86400, tags: ['elevation-storage'] }
)

// Cache ramps for 1 hour
const getCachedRamps = unstable_cache(
  async () => getAllRamps(),
  ['simulator-ramps'],
  { revalidate: 3600, tags: ['ramps'] }
)

export default async function SimulatorPage() {
  // Fetch all data in parallel with caching
  const [measurements, storageCapacity, ramps] = await Promise.all([
    getCachedHistoricalMeasurements(),
    getCachedStorageCapacity(),
    getCachedRamps()
  ])
  
  // Get the date range for the date picker
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = '1985-01-01'
  const minDate = measurements.length > 0 
    ? measurements[measurements.length - 1].date 
    : startDate
  const maxDate = measurements.length > 0 
    ? measurements[0].date 
    : endDate

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-12 lg:py-16">
      {/* Header */}
      <div className="mb-8 sm:mb-12 text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-2 sm:mb-4">
          Outflow Simulator
        </h1>
        <p className="text-sm sm:text-lg text-gray-500 font-light max-w-2xl mx-auto">
          Explore &quot;what-if&quot; scenarios by adjusting historical outflow percentages
        </p>
      </div>

      {/* Simulator Component */}
      <OutflowSimulator 
        measurements={measurements}
        storageCapacity={storageCapacity}
        minDate={minDate}
        maxDate={maxDate}
        ramps={ramps}
      />
    </div>
  )
}

