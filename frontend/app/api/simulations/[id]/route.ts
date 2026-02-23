import { NextRequest, NextResponse } from 'next/server'
import { getSharedSimulation } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id || id.length < 5 || id.length > 30) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const sim = await getSharedSimulation(id)
    if (!sim) {
      return NextResponse.json({ error: 'Simulation not found' }, { status: 404 })
    }

    return NextResponse.json(sim)
  } catch (err: any) {
    console.error('Failed to load shared simulation:', err)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }
}
