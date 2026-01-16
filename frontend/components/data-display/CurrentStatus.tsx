import { WaterMeasurement, Ramp } from '@/lib/db'
import CompactRampList from './CompactRampList'

interface CurrentStatusProps {
  current: WaterMeasurement
  recent: WaterMeasurement[]
  ramps?: Ramp[]
}

export default function CurrentStatus({ current, recent, ramps }: CurrentStatusProps) {
  // Calculate daily change
  const previous = recent.length > 1 ? recent[recent.length - 2] : null
  const dailyChange = previous ? current.elevation - previous.elevation : 0

  // Calculate weekly change (7 days ago)
  // Find the measurement closest to 7 days ago (within 2 days tolerance)
  const sevenDaysAgo = new Date(current.date)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoTime = sevenDaysAgo.getTime()
  
  let measurement7DaysAgo: WaterMeasurement | null = null
  let minDiff = Infinity
  
  for (const measurement of recent) {
    const measurementDate = new Date(measurement.date).getTime()
    const diff = Math.abs(measurementDate - sevenDaysAgoTime)
    // Accept measurements within 2 days of 7 days ago
    if (diff < minDiff && diff <= 2 * 24 * 60 * 60 * 1000) {
      minDiff = diff
      measurement7DaysAgo = measurement
    }
  }
  
  const weeklyChange = measurement7DaysAgo ? current.elevation - measurement7DaysAgo.elevation : null

  return (
    <div className="card p-4 lg:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 lg:mb-8 gap-2">
        <h2 className="text-xl lg:text-2xl font-light text-gray-900">Current Water Level</h2>
        <span className="text-xs lg:text-sm text-gray-500 font-light">
          Last updated: {new Date(current.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 lg:gap-4">
        <div className="text-center lg:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Elevation</div>
          <div className="text-2xl lg:text-4xl font-light text-gray-900 whitespace-nowrap">
            {current.elevation.toFixed(2)} <span className="text-base lg:text-xl text-gray-500">ft</span>
          </div>
        </div>
        <div className="text-center lg:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Daily Change</div>
          <div className={`text-2xl lg:text-4xl font-light whitespace-nowrap ${dailyChange >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}`}>
            {dailyChange >= 0 ? '+' : ''}{dailyChange.toFixed(2)} <span className="text-base lg:text-xl text-gray-500">ft</span>
          </div>
        </div>
        <div className="text-center lg:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Weekly Change</div>
          <div className={`text-2xl lg:text-4xl font-light whitespace-nowrap ${weeklyChange !== null ? (weeklyChange >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]') : 'text-gray-500'}`}>
            {weeklyChange !== null ? (
              <>
                {weeklyChange >= 0 ? '+' : ''}{weeklyChange.toFixed(2)} <span className="text-base lg:text-xl text-gray-500">ft</span>
              </>
            ) : (
              <span className="text-base lg:text-xl">—</span>
            )}
          </div>
        </div>
        <div className="text-center lg:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Content</div>
          <div className="text-2xl lg:text-4xl font-light text-gray-900">
            {(current.content / 1000000).toFixed(2)}<span className="text-base lg:text-xl text-gray-500">M af</span>
          </div>
        </div>
        <div className="text-center lg:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Inflow</div>
          <div className="text-2xl lg:text-4xl font-light text-gray-900">
            {current.inflow.toLocaleString()} <span className="text-base lg:text-xl text-gray-500">cfs</span>
          </div>
        </div>
        <div className="text-center lg:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Outflow</div>
          <div className="text-2xl lg:text-4xl font-light text-gray-900">
            {current.outflow.toLocaleString()} <span className="text-base lg:text-xl text-gray-500">cfs</span>
          </div>
        </div>
      </div>
      {ramps && ramps.length > 0 && (
        <CompactRampList ramps={ramps} currentElevation={current.elevation} />
      )}
    </div>
  )
}



