import { headers } from 'next/headers'

/**
 * Resolve the base URL for server-to-self API calls.
 *
 * In production / Vercel: uses NEXT_PUBLIC_BASE_URL or the incoming request's host.
 * In dev: uses the actual serving host/port (handles Next.js auto-picking an
 * alternate port when 3000 is taken).
 */
export async function getBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  if (host) return `${proto}://${host}`
  return 'http://localhost:3000'
}
