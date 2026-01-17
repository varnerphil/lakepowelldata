const STORAGE_KEY = 'lakepowelldata_home_point'

export interface HomePoint {
  lat: number
  lng: number
  zoom?: number
  name?: string
}

/**
 * Get the saved home point from localStorage
 */
export function getHomePoint(): HomePoint | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    return JSON.parse(stored)
  } catch (error) {
    console.error('Error reading home point from localStorage:', error)
    return null
  }
}

/**
 * Save a home point to localStorage
 */
export function saveHomePoint(homePoint: HomePoint): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(homePoint))
  } catch (error) {
    console.error('Error saving home point to localStorage:', error)
  }
}

/**
 * Clear the saved home point
 */
export function clearHomePoint(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

