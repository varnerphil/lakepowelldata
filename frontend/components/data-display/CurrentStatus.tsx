import { WaterMeasurement, Ramp } from '@/lib/db'
import { parseLocalDate, formatDateString } from '@/lib/date-utils'
import CompactRampList from './CompactRampList'

interface CurrentStatusProps {
  current: WaterMeasurement
  recent: WaterMeasurement[]
  ramps?: Ramp[]
}

/** Format a decimal-foot delta as "+1ft 7in" / "-7in" / "0". */
function formatFeetInches(deltaFt: number): string {
  if (deltaFt === 0) return '0'
  const abs = Math.abs(deltaFt)
  let wholeFt = Math.floor(abs)
  let inches = Math.round((abs - wholeFt) * 12)
  if (inches === 12) {
    wholeFt += 1
    inches = 0
  }
  const sign = deltaFt > 0 ? '+' : '−'
  if (wholeFt === 0 && inches === 0) return '0'
  if (wholeFt === 0) return `${sign}${inches}in`
  if (inches === 0) return `${sign}${wholeFt}ft`
  return `${sign}${wholeFt}ft ${inches}in`
}

export default function CurrentStatus({ current, recent, ramps }: CurrentStatusProps) {
  // Calculate daily change
  const previous = recent.length > 1 ? recent[recent.length - 2] : null
  const dailyChange = previous ? current.elevation - previous.elevation : 0

  // Calculate weekly change (7 days ago)
  // Find the measurement closest to 7 days ago (within 2 days tolerance)
  const sevenDaysAgo = parseLocalDate(current.date)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoTime = sevenDaysAgo.getTime()
  
  let measurement7DaysAgo: WaterMeasurement | null = null
  let minDiff = Infinity
  
  for (const measurement of recent) {
    const measurementDate = parseLocalDate(measurement.date).getTime()
    const diff = Math.abs(measurementDate - sevenDaysAgoTime)
    // Accept measurements within 2 days of 7 days ago
    if (diff < minDiff && diff <= 2 * 24 * 60 * 60 * 1000) {
      minDiff = diff
      measurement7DaysAgo = measurement
    }
  }
  
  const weeklyChange = measurement7DaysAgo ? current.elevation - measurement7DaysAgo.elevation : null

  // Daily deltas for the last 7 days (walk back from current through recent)
  const dailyDrops: Array<{ date: string; elevation: number; change: number }> = []
  for (let i = recent.length - 1; i > 0 && dailyDrops.length < 7; i--) {
    dailyDrops.push({
      date: recent[i].date,
      elevation: recent[i].elevation,
      change: recent[i].elevation - recent[i - 1].elevation,
    })
  }

  return (
    <div className="card p-4 lg:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 lg:mb-8 gap-2">
        <h2 className="text-xl lg:text-2xl font-light text-gray-900">Current Water Level</h2>
        <span className="text-xs lg:text-sm text-gray-500 font-light">
          Last updated: {formatDateString(current.date, { year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="text-center lg:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Elevation</div>
          <div className="text-xl sm:text-2xl lg:text-4xl font-light text-gray-900">
            {current.elevation.toFixed(2)} <span className="text-sm sm:text-base lg:text-xl text-gray-500">ft</span>
          </div>
        </div>
        <div className="text-center lg:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Daily Change</div>
          <div className={`text-xl sm:text-2xl lg:text-3xl font-light ${dailyChange >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}`}>
            {formatFeetInches(dailyChange)}
          </div>
        </div>
        <div className="text-center lg:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Weekly Change</div>
          <div className={`text-xl sm:text-2xl lg:text-3xl font-light ${weeklyChange !== null ? (weeklyChange >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]') : 'text-gray-500'}`}>
            {weeklyChange !== null ? formatFeetInches(weeklyChange) : <span className="text-sm sm:text-base lg:text-xl">—</span>}
          </div>
        </div>
        <div className="text-center lg:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Content</div>
          <div className="text-xl sm:text-2xl lg:text-4xl font-light text-gray-900">
            {(current.content / 1000000).toFixed(2)}<span className="text-sm sm:text-base lg:text-xl text-gray-500">M af</span>
          </div>
        </div>
        <div className="text-center lg:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Inflow</div>
          <div className="text-xl sm:text-2xl lg:text-4xl font-light text-gray-900">
            {current.inflow.toLocaleString()} <span className="text-sm sm:text-base lg:text-xl text-gray-500">cfs</span>
          </div>
        </div>
        <div className="text-center lg:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 lg:mb-2 font-light">Outflow</div>
          <div className="text-xl sm:text-2xl lg:text-4xl font-light text-gray-900">
            {current.outflow.toLocaleString()} <span className="text-sm sm:text-base lg:text-xl text-gray-500">cfs</span>
          </div>
        </div>
      </div>
      {dailyDrops.length > 0 && (
        <details className="mt-4 pt-4 border-t border-gray-100 group">
          <summary className="flex items-center justify-between cursor-pointer list-none select-none py-1">
            <span className="text-xs uppercase tracking-wider text-gray-500 font-light">Last 7 days</span>
            <span className="text-xs text-gray-400 font-light flex items-center gap-1 group-open:hidden">
              Expand
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </span>
            <span className="text-xs text-gray-400 font-light flex items-center gap-1 hidden group-open:flex">
              Collapse
              <svg className="w-3.5 h-3.5 rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </span>
          </summary>
          <div className="mt-2 max-w-md">
            <div className="grid grid-cols-[auto_auto_1fr] gap-x-4 text-sm">
              {dailyDrops.map((d, i) => (
                <div
                  key={d.date}
                  className={`contents ${i % 2 === 1 ? '[&>*]:bg-gray-50/60' : ''}`}
                >
                  <span className="text-gray-600 font-light py-1 px-2 rounded-l">
                    {formatDateString(d.date, { month: 'short', day: 'numeric', weekday: 'short' })}
                  </span>
                  <span
                    className={`font-light tabular-nums py-1 ${
                      d.change >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'
                    }`}
                  >
                    {formatFeetInches(d.change)}
                  </span>
                  <span className="text-gray-400 font-light tabular-nums py-1 px-2 rounded-r text-right">
                    {d.elevation.toFixed(2)}ft
                  </span>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
      {ramps && ramps.length > 0 && (
        <CompactRampList ramps={ramps} currentElevation={current.elevation} />
      )}
    </div>
  )
}



