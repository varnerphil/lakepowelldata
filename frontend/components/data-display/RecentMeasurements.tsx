import { WaterMeasurement } from '@/lib/db'

interface RecentMeasurementsProps {
  measurements: WaterMeasurement[]
  limit?: number
}

export default function RecentMeasurements({ measurements, limit = 10 }: RecentMeasurementsProps) {
  const displayMeasurements = measurements.slice(-limit).reverse()

  return (
    <div>
      <h2 className="text-2xl font-light mb-8 text-gray-900">Recent Measurements</h2>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-light">Date</th>
                <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Elevation (ft)</th>
                <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Content (acre-ft)</th>
                <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Inflow (cfs)</th>
                <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Outflow (cfs)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayMeasurements.map((measurement) => (
                <tr key={measurement.date} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-900 font-light">
                    {new Date(measurement.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                    {measurement.elevation.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                    {(measurement.content / 1000000).toFixed(2)}M
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
  )
}




