import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getAllRamps, getLatestWaterMeasurement, calculateRampStatus, RampStatus } from '@/lib/db'

// Cache ramp status calculation for 1 hour
const getCachedRampStatuses = unstable_cache(
  async () => {
    const ramps = await getAllRamps()
    const currentMeasurement = await getLatestWaterMeasurement()
    
    if (!currentMeasurement) {
      return null
    }
    
    const rampStatuses: RampStatus[] = ramps.map(ramp => {
      const status = calculateRampStatus(ramp, currentMeasurement.elevation)
      const elevationDifference = currentMeasurement.elevation - ramp.min_safe_elevation
      
      return {
        ...ramp,
        status,
        current_elevation: currentMeasurement.elevation,
        elevation_difference: elevationDifference
      }
    })
    
    return rampStatuses
  },
  ['ramp-statuses'],
  {
    revalidate: 3600, // 1 hour
    tags: ['ramps', 'water-measurements']
  }
)

export async function GET() {
  try {
    const rampStatuses = await getCachedRampStatuses()
    
    if (!rampStatuses) {
      return NextResponse.json(
        { error: 'No current water elevation data available' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(rampStatuses, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200'
      }
    })
  } catch (error) {
    console.error('Error fetching ramp status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}



