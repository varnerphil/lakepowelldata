import { SavedPath } from '@/types/map'

const STORAGE_KEY = 'lakepowelldata_paths'

export function getPaths(): SavedPath[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error reading paths from localStorage:', error)
    return []
  }
}

export function savePath(path: Omit<SavedPath, 'id' | 'createdAt'>): SavedPath {
  const newPath: SavedPath = {
    ...path,
    id: generateId(),
    createdAt: new Date().toISOString()
  }

  const paths = getPaths()
  paths.push(newPath)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths))

  return newPath
}

export function updatePath(id: string, updates: Partial<Omit<SavedPath, 'id' | 'createdAt'>>): SavedPath | null {
  const paths = getPaths()
  const index = paths.findIndex(p => p.id === id)

  if (index === -1) return null

  paths[index] = { ...paths[index], ...updates }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths))

  return paths[index]
}

export function deletePath(id: string): boolean {
  const paths = getPaths()
  const filtered = paths.filter(p => p.id !== id)

  if (filtered.length === paths.length) return false

  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  return true
}

export function getPathById(id: string): SavedPath | null {
  const paths = getPaths()
  return paths.find(p => p.id === id) || null
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Calculate distance between two points using Haversine formula
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8 // Earth's radius in miles
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

// Calculate total distance of a path
export function calculatePathDistance(coordinates: { lat: number; lng: number }[]): number {
  if (coordinates.length < 2) return 0

  let total = 0
  for (let i = 1; i < coordinates.length; i++) {
    total += calculateDistance(
      coordinates[i - 1].lat,
      coordinates[i - 1].lng,
      coordinates[i].lat,
      coordinates[i].lng
    )
  }
  return total
}

// Format travel time
export function formatTravelTime(distanceMiles: number, speedMph: number): string {
  const hours = distanceMiles / speedMph
  const totalMinutes = Math.round(hours * 60)

  if (totalMinutes < 60) {
    return `${totalMinutes} min`
  }

  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60

  if (m === 0) {
    return `${h} hr`
  }

  return `${h} hr ${m} min`
}

