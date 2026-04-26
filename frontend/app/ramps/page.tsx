import { getAllRamps, getLatestWaterMeasurement, calculateRampStatus, type RampStatus } from '@/lib/db'
import { formatDateString } from '@/lib/date-utils'
import { unstable_cache } from 'next/cache'
import RampStatusCard from '@/components/ramp-status/RampStatusCard'
import ShareButton from '@/components/ui/ShareButton'

/**
 * Split a list of ramp-status rows into a "boat ramps" subgroup and a
 * "cut-offs" subgroup, each with its own sub-heading. Headings are only
 * rendered when both kinds are present in the list — if everything is one
 * kind, we just show the cards without an extra layer of headers.
 */
function KindGroupedGrid({
  ramps,
  ramplikeHeading,
  cutoffHeading,
}: {
  ramps: RampStatus[]
  ramplikeHeading: string
  cutoffHeading: string
}) {
  const boatRamps = ramps.filter(r => r.kind !== 'cut_off')
  const cutoffs = ramps.filter(r => r.kind === 'cut_off')
  const showSubheadings = boatRamps.length > 0 && cutoffs.length > 0

  return (
    <div className="space-y-6 sm:space-y-8">
      {boatRamps.length > 0 && (
        <div>
          {showSubheadings && (
            <h3 className="text-base sm:text-lg font-light text-gray-700 mb-3 sm:mb-4">
              {ramplikeHeading}
            </h3>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {boatRamps.map(ramp => (
              <RampStatusCard key={ramp.id} ramp={ramp} />
            ))}
          </div>
        </div>
      )}
      {cutoffs.length > 0 && (
        <div>
          {showSubheadings && (
            <h3 className="text-base sm:text-lg font-light text-gray-700 mb-3 sm:mb-4">
              {cutoffHeading}
            </h3>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {cutoffs.map(ramp => (
              <RampStatusCard key={ramp.id} ramp={ramp} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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
            Lake access by elevation
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
          Lake access by elevation
        </h1>
        <p className="text-sm sm:text-lg text-gray-500 font-light max-w-2xl mx-auto">
          Boat ramps and key lake cut-offs &mdash; and where today&rsquo;s water level leaves each one.
        </p>
        <div className="mt-3">
          <ShareButton label="Share" />
        </div>
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

      {/* Available now — split by kind so users immediately see "ramps you
          can launch from" vs. "cut-offs your boat can still cross". */}
      {availableRamps.length > 0 && (
        <div className="mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-light text-gray-900 mb-4 sm:mb-6">
            Available now
          </h2>
          <KindGroupedGrid
            ramps={availableRamps}
            ramplikeHeading="Boat ramps you can launch from"
            cutoffHeading="Cut-offs your boat can cross"
          />
        </div>
      )}

      {/* Out of reach (lake too low) — same split. */}
      {unusableRamps.length > 0 && (
        <div>
          <h2 className="text-2xl sm:text-3xl font-light text-gray-900 mb-4 sm:mb-6">
            Out of reach at this level
          </h2>
          <KindGroupedGrid
            ramps={unusableRamps}
            ramplikeHeading="Boat ramps stranded above the water"
            cutoffHeading="Cut-offs the lake won't reach"
          />
        </div>
      )}
    </div>
  )
}



