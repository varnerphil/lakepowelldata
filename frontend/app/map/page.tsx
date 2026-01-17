import { Metadata } from 'next'
import { getAllRamps, getLatestWaterMeasurement } from '@/lib/db'
import MapContainer from '@/components/map/MapContainer'

export const metadata: Metadata = {
  title: 'Map - Lake Powell Data',
  description: 'Interactive satellite map of Lake Powell with GPS tracking and saved spots'
}

export const revalidate = 300 // 5 minutes

export default async function MapPage() {
  const [ramps, latestMeasurement] = await Promise.all([
    getAllRamps(),
    getLatestWaterMeasurement()
  ])

  // Filter ramps with valid coordinates
  const rampsWithCoords = ramps.filter(r => r.latitude && r.longitude)

  const currentElevation = latestMeasurement?.elevation ?? 3525
  const latestDate = latestMeasurement?.date 
    ? new Date(latestMeasurement.date).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  return (
    <div className="w-full">
      <MapContainer 
        ramps={rampsWithCoords}
        currentElevation={currentElevation}
        latestDate={latestDate}
      />
    </div>
  )
}

