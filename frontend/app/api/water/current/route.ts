import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getLatestWaterMeasurement } from '@/lib/db'

// Cache the database query for 1 hour
const getCachedLatestWaterMeasurement = unstable_cache(
  async () => {
    return await getLatestWaterMeasurement()
  },
  ['latest-water-measurement'],
  {
    revalidate: 3600, // 1 hour
    tags: ['water-measurements']
  }
)

export async function GET() {
  try {
    const measurement = await getCachedLatestWaterMeasurement()
    
    if (!measurement) {
      return NextResponse.json(
        { error: 'No water measurement data available' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(measurement, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200'
      }
    })
  } catch (error) {
    console.error('Error fetching current water data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}



