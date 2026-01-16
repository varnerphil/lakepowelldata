import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getWaterMeasurementsByRange } from '@/lib/db'

// Cache historical data queries for 1 day (historical data doesn't change)
const getCachedWaterMeasurementsByRange = unstable_cache(
  async (startDate: string, endDate: string) => {
    return await getWaterMeasurementsByRange(startDate, endDate)
  },
  ['water-measurements-range'],
  {
    revalidate: 86400, // 1 day
    tags: ['water-measurements']
  }
)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')
    
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'start and end date parameters are required' },
        { status: 400 }
      )
    }
    
    // Validate date format
    const startDateObj = new Date(startDate)
    const endDateObj = new Date(endDate)
    
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }
    
    if (startDateObj > endDateObj) {
      return NextResponse.json(
        { error: 'start date must be before or equal to end date' },
        { status: 400 }
      )
    }
    
    const measurements = await getCachedWaterMeasurementsByRange(startDate, endDate)
    
    return NextResponse.json(measurements, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800'
      }
    })
  } catch (error) {
    console.error('Error fetching historical water data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}



