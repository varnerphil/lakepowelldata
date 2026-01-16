import { getWaterMeasurementsByRange, getElevationStorageCapacity, getAllRamps } from '@/lib/db'

import OutflowSimulator from '@/components/simulator/OutflowSimulator'

export const dynamic = 'force-dynamic'

export default async function SimulatorPage() {
  // Fetch all water measurements - we need the full historical dataset
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = '1985-01-01' // Start from when we have reliable data
  
  const measurements = await getWaterMeasurementsByRange(startDate, endDate)
  const storageCapacity = await getElevationStorageCapacity()
  const ramps = await getAllRamps()
  
  // Get the date range for the date picker
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

