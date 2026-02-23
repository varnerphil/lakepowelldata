import { getWaterMeasurementsByRange, getElevationStorageCapacity, getAllRamps, getLatestWaterMeasurement } from '@/lib/db'
import { unstable_cache } from 'next/cache'
import SimulatorTabs from '@/components/simulator/SimulatorTabs'

const getCachedHistoricalMeasurements = unstable_cache(
  async () => {
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = '1985-01-01'
    return getWaterMeasurementsByRange(startDate, endDate)
  },
  ['simulator-historical-measurements'],
  { revalidate: 3600, tags: ['water-measurements'] }
)

const getCachedStorageCapacity = unstable_cache(
  async () => getElevationStorageCapacity(),
  ['simulator-storage-capacity'],
  { revalidate: 86400, tags: ['elevation-storage'] }
)

const getCachedRamps = unstable_cache(
  async () => getAllRamps(),
  ['simulator-ramps'],
  { revalidate: 3600, tags: ['ramps'] }
)

const getCachedLatest = unstable_cache(
  async () => getLatestWaterMeasurement(),
  ['projections-latest-measurement'],
  { revalidate: 3600, tags: ['water-measurements'] }
)

export default async function SimulatorPage() {
  const [measurements, storageCapacity, ramps, latest] = await Promise.all([
    getCachedHistoricalMeasurements(),
    getCachedStorageCapacity(),
    getCachedRamps(),
    getCachedLatest(),
  ])

  const endDate = new Date().toISOString().split('T')[0]
  const startDate = '1985-01-01'
  const minDate = measurements.length > 0
    ? measurements[measurements.length - 1].date
    : startDate
  const maxDate = measurements.length > 0
    ? measurements[0].date
    : endDate

  const currentElevation = latest?.elevation ?? 3525
  const currentDate = latest?.date ?? endDate

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-12 lg:py-16">
      <SimulatorTabs
        measurements={measurements}
        storageCapacity={storageCapacity}
        minDate={minDate}
        maxDate={maxDate}
        ramps={ramps}
        currentElevation={currentElevation}
        currentDate={currentDate}
      />
    </div>
  )
}
