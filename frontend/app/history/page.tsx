import { getWaterMeasurementsByRange, getEarliestWaterMeasurement, getLatestWaterMeasurement, getWaterYearSummaries, getAllRamps } from '@/lib/db'
import { HistoricalChart, WaterYearTable } from '@/components/data-display'
import { unstable_cache } from 'next/cache'

// Force dynamic rendering to prevent caching
export const dynamic = 'force-dynamic'

// Cache water measurements by range for 1 hour
const getCachedWaterMeasurements = unstable_cache(
  async (startDate: string, endDate: string) => {
    return getWaterMeasurementsByRange(startDate, endDate)
  },
  ['water-measurements-history'],
  {
    revalidate: 3600, // 1 hour
    tags: ['water-measurements']
  }
)

// Cache water year summaries for 1 hour
const getCachedWaterYearSummaries = unstable_cache(
  async () => {
    return getWaterYearSummaries()
  },
  ['water-year-summaries'],
  {
    revalidate: 3600, // 1 hour
    tags: ['water-year-summaries']
  }
)

// Cache all ramps for 24 hours (rarely changes)
const getCachedAllRamps = unstable_cache(
  async () => {
    return getAllRamps()
  },
  ['all-ramps-history'],
  {
    revalidate: 86400, // 24 hours
    tags: ['ramps']
  }
)

// Historical data start date (when Lake Powell was filled)
const HISTORICAL_START_DATE = '1980-06-22'

// Calculate date ranges
function getDateRange(range: string): { start: string; end: string } {
  // Use UTC dates to avoid timezone issues
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const endDate = end.toISOString().split('T')[0]
  
  // For "alltime", use historical start date
  if (range === 'alltime') {
    return { start: HISTORICAL_START_DATE, end: endDate }
  }
  
  let start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  
  switch (range) {
    case '20years':
      start.setUTCFullYear(start.getUTCFullYear() - 20)
      break
    case '15years':
      start.setUTCFullYear(start.getUTCFullYear() - 15)
      break
    case '10years':
      start.setUTCFullYear(start.getUTCFullYear() - 10)
      break
    case '5years':
      start.setUTCFullYear(start.getUTCFullYear() - 5)
      break
    case '3years':
      start.setUTCFullYear(start.getUTCFullYear() - 3)
      break
    case '2years':
      start.setUTCFullYear(start.getUTCFullYear() - 2)
      break
    case '1year':
      start.setUTCFullYear(start.getUTCFullYear() - 1)
      break
    case '6months':
      start.setUTCMonth(start.getUTCMonth() - 6)
      break
    case '3months':
      start.setUTCMonth(start.getUTCMonth() - 3)
      break
    case '1month':
      start.setUTCMonth(start.getUTCMonth() - 1)
      break
    default:
      start.setUTCFullYear(start.getUTCFullYear() - 1) // Default to 1 year
  }
  
  const startDate = start.toISOString().split('T')[0]
  return { start: startDate, end: endDate }
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; range?: string }>
}) {
  // Await searchParams as it's now a Promise in Next.js 15+
  const params = await searchParams
  
  // Use range parameter if provided, otherwise calculate from start/end or default to 1 year
  let startDate: string
  let endDate: string
  
  if (params.range) {
    const range = getDateRange(params.range)
    startDate = range.start
    endDate = range.end
  } else if (params.start && params.end) {
    startDate = params.start
    endDate = params.end
  } else {
    // Default to 1 year
    const range = getDateRange('1year')
    startDate = range.start
    endDate = range.end
  }

  const measurements = await getCachedWaterMeasurements(startDate, endDate)
  const waterYearSummaries = await getCachedWaterYearSummaries()
  const allRamps = await getCachedAllRamps()
  
  // Filter for specific ramps to display on the chart
  const selectedRamps = allRamps.filter(ramp => 
    ramp.name === 'Halls Crossing (use at own risk)' ||
    ramp.name === 'Antelope Point Public Ramp' ||
    ramp.name === 'Antelope Point Business Ramp' ||
    ramp.name === 'Bullfrog (Main Launch)' ||
    ramp.name === 'Wahweap (Main Launch)' ||
    ramp.name === 'Bullfrog to Halls Creek Cut-Off' ||
    ramp.name === 'Stateline Launch' ||
    ramp.name === 'Bullfrog North Ramp' ||
    ramp.name === 'Castle Rock Cut-Off'
  )

  const currentRange = params.range || '1year'

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-16">
      <div className="mb-8 sm:mb-12 text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-2 sm:mb-4">
          Historical Data
        </h1>
        <p className="text-sm sm:text-lg text-gray-500 font-light max-w-2xl mx-auto">
          Explore water level trends and historical measurements
        </p>
      </div>

      {/* Chart */}
      <div className="mb-8">
        <HistoricalChart 
          data={measurements}
          startDate={startDate}
          endDate={endDate}
          currentRange={currentRange}
          ramps={selectedRamps}
        />
      </div>

      {/* Water Year Summaries */}
      <div className="mb-12">
        <WaterYearTable summaries={waterYearSummaries} />
      </div>

      {/* Data Table */}
      <div>
        <h2 className="text-2xl font-light mb-8 text-gray-900">Data Table</h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-light">Date</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Elevation (ft)</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Change (ft)</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Content (acre-ft)</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Inflow (cfs)</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Outflow (cfs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {measurements.map((measurement) => (
                  <tr key={measurement.date} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-900 font-light">
                      {new Date(measurement.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                      {measurement.elevation.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                      {measurement.change !== null ? (measurement.change >= 0 ? '+' : '') + measurement.change.toFixed(2) : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                      {measurement.content.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                      {measurement.inflow.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                      {measurement.outflow.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

