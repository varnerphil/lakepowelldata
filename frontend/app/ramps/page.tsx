import { getAllRamps, getLatestWaterMeasurement, calculateRampStatus } from '@/lib/db'
import RampStatusCard from '@/components/ramp-status/RampStatusCard'

export default async function RampsPage() {
  const ramps = await getAllRamps()
  const currentMeasurement = await getLatestWaterMeasurement()

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

  // Sort by status: Open first, then Use at Own Risk, then Unusable
  const statusOrder = { 'Open and Usable': 0, 'Use at Own Risk': 1, 'Unusable': 2 }
  rampStatuses.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])

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
          As of: {new Date(currentMeasurement.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {rampStatuses.map((ramp) => (
          <RampStatusCard key={ramp.id} ramp={ramp} />
        ))}
      </div>
    </div>
  )
}



