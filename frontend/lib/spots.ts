import { SavedSpot } from '@/types/map'

const STORAGE_KEY = 'lakepowelldata_spots'

/**
 * Get all saved spots from localStorage
 */
export function getSpots(): SavedSpot[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch (error) {
    console.error('Error reading spots from localStorage:', error)
    return []
  }
}

/**
 * Save a new spot to localStorage
 */
export function saveSpot(spot: Omit<SavedSpot, 'id' | 'createdAt'>): SavedSpot {
  const spots = getSpots()
  
  const newSpot: SavedSpot = {
    ...spot,
    id: generateId(),
    createdAt: new Date().toISOString()
  }
  
  spots.push(newSpot)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spots))
  
  return newSpot
}

/**
 * Update an existing spot
 */
export function updateSpot(id: string, updates: Partial<Omit<SavedSpot, 'id' | 'createdAt'>>): SavedSpot | null {
  const spots = getSpots()
  const index = spots.findIndex(s => s.id === id)
  
  if (index === -1) return null
  
  spots[index] = { ...spots[index], ...updates }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spots))
  
  return spots[index]
}

/**
 * Delete a spot by ID
 */
export function deleteSpot(id: string): boolean {
  const spots = getSpots()
  const filtered = spots.filter(s => s.id !== id)
  
  if (filtered.length === spots.length) return false
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  return true
}

/**
 * Get a single spot by ID
 */
export function getSpotById(id: string): SavedSpot | null {
  const spots = getSpots()
  return spots.find(s => s.id === id) || null
}

/**
 * Generate a unique ID for a spot
 */
function generateId(): string {
  return `spot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Export spots as JSON (for future backup/sync)
 */
export function exportSpots(): string {
  return JSON.stringify(getSpots(), null, 2)
}

/**
 * Import spots from JSON (for future backup/sync)
 */
export function importSpots(json: string, merge: boolean = true): SavedSpot[] {
  try {
    const imported: SavedSpot[] = JSON.parse(json)
    
    if (merge) {
      const existing = getSpots()
      const existingIds = new Set(existing.map(s => s.id))
      const newSpots = imported.filter(s => !existingIds.has(s.id))
      const merged = [...existing, ...newSpots]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      return merged
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported))
      return imported
    }
  } catch (error) {
    console.error('Error importing spots:', error)
    throw new Error('Invalid spots data')
  }
}

