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

  return (
    <div className="card p-4 sm:p-8 lg:p-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 gap-2">
        <h2 className="text-xl sm:text-2xl font-light text-gray-900">Current Water Level</h2>
        <span className="text-xs sm:text-sm text-gray-500 font-light">
          Last updated: {new Date(current.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6 lg:gap-12">
        <div className="text-center sm:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 sm:mb-2 font-light">Elevation</div>
          <div className="text-2xl sm:text-3xl lg:text-4xl font-light text-gray-900">
            {current.elevation.toFixed(2)} <span className="text-base sm:text-xl text-gray-500">ft</span>
          </div>
        </div>
        <div className="text-center sm:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 sm:mb-2 font-light">Content</div>
          <div className="text-2xl sm:text-3xl lg:text-4xl font-light text-gray-900">
            {(current.content / 1000000).toFixed(2)}<span className="text-base sm:text-xl text-gray-500">M af</span>
          </div>
        </div>
        <div className="text-center sm:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 sm:mb-2 font-light">Daily Change</div>
          <div className={`text-2xl sm:text-3xl lg:text-4xl font-light ${dailyChange >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'}`}>
            {dailyChange >= 0 ? '+' : ''}{dailyChange.toFixed(2)} <span className="text-base sm:text-xl text-gray-500">ft</span>
          </div>
        </div>
        <div className="text-center sm:text-left">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 sm:mb-2 font-light">Inflow</div>
          <div className="text-2xl sm:text-3xl lg:text-4xl font-light text-gray-900">
            {current.inflow.toLocaleString()} <span className="text-base sm:text-xl text-gray-500">cfs</span>
          </div>
        </div>
        <div className="text-center sm:text-left col-span-2 sm:col-span-1">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 sm:mb-2 font-light">Outflow</div>
          <div className="text-2xl sm:text-3xl lg:text-4xl font-light text-gray-900">
            {current.outflow.toLocaleString()} <span className="text-base sm:text-xl text-gray-500">cfs</span>
          </div>
        </div>
      </div>
      {ramps && ramps.length > 0 && (
        <CompactRampList ramps={ramps} currentElevation={current.elevation} />
      )}
    </div>
  )
}



