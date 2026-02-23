import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import {
  getWaterYearDailyPatterns,
  getElevationStorageCapacity,
  getLatestWaterMeasurement,
  getCurrentWaterYearInflowToDate,
  getCurrentSnowpackPercent,
  getSimilarSnowpackYears,
} from '@/lib/db'
import { projectFromSnowpack } from '@/lib/calculations'

const getCachedPatterns = unstable_cache(
  async () => getWaterYearDailyPatterns(),
  ['mc-water-year-patterns'],
  { revalidate: 86400, tags: ['water-measurements'] }
)

const getCachedStorageCapacity = unstable_cache(
  async () => getElevationStorageCapacity(),
  ['mc-storage-capacity'],
  { revalidate: 86400, tags: ['elevation-storage'] }
)

const getCachedLatest = unstable_cache(
  async () => getLatestWaterMeasurement(),
  ['mc-latest-measurement'],
  { revalidate: 3600, tags: ['water-measurements'] }
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get('start') || 'today'

    const latest = await getCachedLatest()
    if (!latest) {
      return NextResponse.json({ error: 'No current lake data available' }, { status: 500 })
    }

    let startDate = latest.date
    let startElevation = latest.elevation
    let startContent = latest.content

    if (startParam !== 'today' && startParam.startsWith('elevation:')) {
      startElevation = parseFloat(startParam.split(':')[1])
      const storageCapacity = await getCachedStorageCapacity()
      const sortedStorage = [...storageCapacity]
        .sort((a, b) => a.elevation - b.elevation)
        .map((s) => ({ elevation: s.elevation, storage_at_elevation: s.storage_at_elevation }))
      for (let i = 0; i < sortedStorage.length - 1; i++) {
        const cur = sortedStorage[i]
        const next = sortedStorage[i + 1]
        if (startElevation >= cur.elevation && startElevation < next.elevation) {
          const frac = (startElevation - cur.elevation) / (next.elevation - cur.elevation)
          startContent = Math.round(
            cur.storage_at_elevation + frac * (next.storage_at_elevation - cur.storage_at_elevation)
          )
          break
        }
      }
    }

    const [patterns, storageCapacityRaw, currentWYInflow, snowpackPercent] = await Promise.all([
      getCachedPatterns(),
      getCachedStorageCapacity(),
      getCurrentWaterYearInflowToDate(),
      getCurrentSnowpackPercent(),
    ])

    if (patterns.length === 0) {
      return NextResponse.json(
        { error: 'No historical water year patterns available for simulation' },
        { status: 500 }
      )
    }

    const storageCapacity = storageCapacityRaw.map((s) => ({
      elevation: s.elevation,
      storage_at_elevation: s.storage_at_elevation,
    }))

    // Snowpack-based first-year conditioning
    let snowpackData: {
      similarWaterYears: number[]
      projectedRunoffInflowAf: number
      currentSnowpackPercent: number
    } | null = null

    if (snowpackPercent != null) {
      try {
        const similarYears = await getSimilarSnowpackYears(snowpackPercent, 20, 12)
        const projection = projectFromSnowpack(
          snowpackPercent,
          startElevation,
          similarYears,
          storageCapacityRaw,
          startElevation - 6.5
        )
        snowpackData = {
          similarWaterYears: similarYears.map((y) => y.water_year),
          projectedRunoffInflowAf: projection.projectedRunoffInflow,
          currentSnowpackPercent: snowpackPercent,
        }
      } catch (err) {
        console.error('Snowpack conditioning failed, using fallback:', err)
      }
    }

    return NextResponse.json({
      patterns,
      storageCapacity,
      startDate,
      startElevation,
      startContent,
      lakeStateDate: latest.date,
      currentWaterYearInflowToDate: currentWYInflow,
      snowpackData,
    })
  } catch (error) {
    console.error('Error in projections API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
