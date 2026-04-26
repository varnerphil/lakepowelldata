import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

/**
 * Cache-flush endpoint for after the data-collection job lands a USBR
 * correction (or any other DB-side update that the front end is caching
 * via `unstable_cache`).
 *
 * Usage:
 *   curl -X POST -H "x-revalidate-secret: $REVALIDATE_SECRET" \
 *        "https://lakepowelldata.com/api/revalidate"
 *
 * Optional `tags=` query param (comma-separated) flushes only the named
 * tags. Default flushes the full set we use across the app.
 *
 * Auth: requires `REVALIDATE_SECRET` env var to be set in production. The
 * caller must send the same value via the `x-revalidate-secret` header.
 * In dev (no env var), the endpoint is open — local-only by definition.
 */

const DEFAULT_TAGS = [
  'water-measurements',
  'historical-averages',
  'elevation-storage',
  'ramps',
  'water-year-analysis',
  'snotel',
  'basin-plots',
  'latest-measurement',
  'latest-measurement-home',
] as const

export async function POST(req: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET
  if (expected) {
    const provided = req.headers.get('x-revalidate-secret')
    if (provided !== expected) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
  }

  const tagsParam = req.nextUrl.searchParams.get('tags')
  const tags = tagsParam
    ? tagsParam.split(',').map(t => t.trim()).filter(Boolean)
    : [...DEFAULT_TAGS]

  // Next 16's revalidateTag signature is (tag, profile). { expire: 0 } forces
  // immediate eviction, which is exactly what we want for a manual flush.
  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 })
  }

  return NextResponse.json({
    ok: true,
    flushed: tags,
    timestamp: new Date().toISOString(),
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
