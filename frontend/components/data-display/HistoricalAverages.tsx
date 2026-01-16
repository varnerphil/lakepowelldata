'use client'

interface Averages {
  allTime: {
    elevation: number
    content: number
    inflow: number
    outflow: number
  } | null
  sinceFilled: {
    elevation: number
    content: number
    inflow: number
    outflow: number
  } | null
  sinceWY2000: {
    elevation: number
    content: number
    inflow: number
    outflow: number
  } | null
}

interface HistoricalAveragesProps {
  averages: Averages
  currentElevation: number
}

export default function HistoricalAverages({ averages, currentElevation }: HistoricalAveragesProps) {
  const formatDifference = (current: number, average: number) => {
    const diff = current - average
    return diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)
  }

  return (
    <div className="mb-12">
      <div className="grid md:grid-cols-3 gap-6">
        {averages.allTime && (
          <div className="card p-6">
            <h3 className="font-light text-lg mb-4 text-gray-900">All-Time Average</h3>
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Elevation</div>
                <div className="text-xl font-light text-gray-900">{averages.allTime.elevation.toFixed(2)} <span className="text-sm text-gray-500">ft</span></div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Current vs Average</div>
                <div className={`text-xl font-light ${parseFloat(formatDifference(currentElevation, averages.allTime.elevation)) >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}`}>
                  {formatDifference(currentElevation, averages.allTime.elevation)} <span className="text-sm text-gray-500">ft</span>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Content</div>
                <div className="text-xl font-light text-gray-900">
                  {(averages.allTime.content / 1000000).toFixed(2)}<span className="text-sm text-gray-500">M acre-ft</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {averages.sinceFilled && (
          <div className="card p-6">
            <h3 className="font-light text-lg mb-4 text-gray-900">Since Filled</h3>
            <div className="text-xs text-gray-500 mb-4 font-light">June 22, 1980</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Elevation</div>
                <div className="text-xl font-light text-gray-900">{averages.sinceFilled.elevation.toFixed(2)} <span className="text-sm text-gray-500">ft</span></div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Current vs Average</div>
                <div className={`text-xl font-light ${parseFloat(formatDifference(currentElevation, averages.sinceFilled.elevation)) >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}`}>
                  {formatDifference(currentElevation, averages.sinceFilled.elevation)} <span className="text-sm text-gray-500">ft</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {averages.sinceWY2000 && (
          <div className="card p-6">
            <h3 className="font-light text-lg mb-4 text-gray-900">Since Water Year 2000</h3>
            <div className="text-xs text-gray-500 mb-4 font-light">Oct 1, 1999</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Elevation</div>
                <div className="text-xl font-light text-gray-900">{averages.sinceWY2000.elevation.toFixed(2)} <span className="text-sm text-gray-500">ft</span></div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Current vs Average</div>
                <div className={`text-xl font-light ${parseFloat(formatDifference(currentElevation, averages.sinceWY2000.elevation)) >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}`}>
                  {formatDifference(currentElevation, averages.sinceWY2000.elevation)} <span className="text-sm text-gray-500">ft</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}



