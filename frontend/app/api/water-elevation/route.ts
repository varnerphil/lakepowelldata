import { NextRequest, NextResponse } from 'next/server'
import { getWaterMeasurementsByRange } from '@/lib/db'

export const revalidate = 300 // 5 minutes

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const date = searchParams.get('date')

  if (!date) {
    return NextResponse.json(
      { error: 'Date parameter is required' },
      { status: 400 }
    )
  }

  try {
    // Get measurements for the date and a few days around it to find closest match
    const dateObj = new Date(date)
    const startDate = new Date(dateObj)
    startDate.setDate(startDate.getDate() - 7) // 7 days before
    const endDate = new Date(dateObj)
    endDate.setDate(endDate.getDate() + 7) // 7 days after

    const measurements = await getWaterMeasurementsByRange(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    )

    if (measurements.length === 0) {
      return NextResponse.json(
        { error: 'No data available for this date range' },
        { status: 404 }
      )
    }

    // Find the closest measurement to the requested date
    const targetDate = new Date(date).getTime()
    let closest = measurements[0]
    let closestDiff = Math.abs(new Date(closest.date).getTime() - targetDate)

    for (const measurement of measurements) {
      const diff = Math.abs(new Date(measurement.date).getTime() - targetDate)
      if (diff < closestDiff) {
        closestDiff = diff
        closest = measurement
      }
    }

    return NextResponse.json({
      elevation: closest.elevation,
      date: closest.date,
      actualDate: closest.date,
      daysDifference: Math.round(closestDiff / (1000 * 60 * 60 * 24))
    })
  } catch (error) {
    console.error('Error fetching elevation:', error)
    return NextResponse.json(
      { error: 'Failed to fetch elevation data' },
      { status: 500 }
    )
  }
}

