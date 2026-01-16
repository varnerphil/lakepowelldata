import { WaterYearSummary } from '@/lib/db'

interface WaterYearTableProps {
  summaries: WaterYearSummary[]
}

export default function WaterYearTable({ summaries }: WaterYearTableProps) {
  return (
    <div>
      <h2 className="text-2xl font-light mb-8 text-gray-900">Water Year Summaries</h2>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-light">Water Year</th>
                <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Total Inflow</th>
                <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Total Outflow</th>
                <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Net Flow</th>
                <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Avg Elevation (ft)</th>
                <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Min Elevation (ft)</th>
                <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Max Elevation (ft)</th>
                <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-light">Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summaries.map((summary) => (
                <tr key={summary.water_year} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-900 font-light">
                    {summary.water_year}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                    <div>{(summary.total_inflow_af / 1000000).toFixed(2)}M acre-ft</div>
                    <div className="text-xs text-gray-500">({summary.total_inflow_cfs.toLocaleString()} cfs-days)</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                    <div>{(summary.total_outflow_af / 1000000).toFixed(2)}M acre-ft</div>
                    <div className="text-xs text-gray-500">({summary.total_outflow_cfs.toLocaleString()} cfs-days)</div>
                  </td>
                  <td className={`px-6 py-4 text-sm text-right font-light ${
                    summary.net_flow_af >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'
                  }`}>
                    <div>{summary.net_flow_af >= 0 ? '+' : ''}{(summary.net_flow_af / 1000000).toFixed(2)}M acre-ft</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                    {summary.avg_elevation.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                    {summary.min_elevation.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-900 font-light">
                    {summary.max_elevation.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-500 font-light">
                    {summary.days}
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




