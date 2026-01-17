import { WaterMeasurement, Ramp } from '@/lib/db'
import WaterLevelChart from '@/components/charts/WaterLevelChart'
import TimeRangeButtons from '@/components/charts/TimeRangeButtons'
import { Suspense } from 'react'

interface HistoricalChartProps {
  data: WaterMeasurement[]
  startDate: string
  endDate: string
  currentRange?: string
  showControls?: boolean
  formAction?: string
  ramps?: Ramp[]
}

export default function HistoricalChart({ 
  data, 
  startDate, 
  endDate, 
  currentRange = '1year',
  showControls = true,
  formAction = '/history',
  ramps = []
}: HistoricalChartProps) {
  return (
    <div className="card p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-1">
        <h2 className="text-xl sm:text-2xl font-light text-gray-900">Elevation Trend</h2>
        <span className="text-xs sm:text-sm text-gray-500 font-light">
          {data.length.toLocaleString()} data point{data.length !== 1 ? 's' : ''}
        </span>
      </div>
      <WaterLevelChart 
        key={`chart-${currentRange}-${startDate}-${endDate}`}
        data={data.map(m => ({
          date: m.date,
          elevation: m.elevation
        }))}
        startDate={startDate}
        endDate={endDate}
        ramps={ramps}
      />
      
      {showControls && (
        <div className="border-t-0 sm:border-t border-gray-100">
          <Suspense fallback={<div className="h-12" />}>
            <TimeRangeButtons currentRange={currentRange} formAction={formAction} />
          </Suspense>
        </div>
      )}
    </div>
  )
}

