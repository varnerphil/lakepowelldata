import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { saveSharedSimulation } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { config } = body

    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: 'Missing config' }, { status: 400 })
    }

    const requiredFields = ['yearsToProject', 'inflowScenario', 'startMode']
    for (const field of requiredFields) {
      if (!(field in config)) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 })
      }
    }

    const id = nanoid(10)
    await saveSharedSimulation(id, config)

    return NextResponse.json({ id })
  } catch (err: any) {
    console.error('Failed to save shared simulation:', err)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
