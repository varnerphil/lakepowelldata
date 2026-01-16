import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getHistoricalAverages } from '@/lib/db'

// Cache historical averages for 1 day (historical data doesn't change)
const getCachedHistoricalAverages = unstable_cache(
  async () => {
    return await getHistoricalAverages()
  },
  ['historical-averages'],
  {
    revalidate: 86400, // 1 day
    tags: ['water-measurements']
  }
)

export async function GET() {
  try {
    const averages = await getCachedHistoricalAverages()
    
    return NextResponse.json(averages, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800'
      }
    })
  } catch (error) {
    console.error('Error fetching historical averages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}



