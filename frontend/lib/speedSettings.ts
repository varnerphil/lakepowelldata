// Global speed settings for path travel time calculations
// These persist across all paths and sessions

export interface SpeedSettings {
  houseboat: number    // Default 8 mph
  skiBoat: number      // Default 24 mph  
  speedBoat: number    // Default 32 mph
}

const STORAGE_KEY = 'lakepowelldata_speed_settings'

const DEFAULT_SPEEDS: SpeedSettings = {
  houseboat: 8,
  skiBoat: 24,
  speedBoat: 32
}

export const SPEED_LIMITS = {
  houseboat: { min: 4, max: 15 },
  skiBoat: { min: 15, max: 30 },
  speedBoat: { min: 25, max: 45 }
}

export function getSpeedSettings(): SpeedSettings {
  if (typeof window === 'undefined') return DEFAULT_SPEEDS
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Merge with defaults to handle any missing keys
      return { ...DEFAULT_SPEEDS, ...parsed }
    }
    return DEFAULT_SPEEDS
  } catch (error) {
    console.error('Error reading speed settings from localStorage:', error)
    return DEFAULT_SPEEDS
  }
}

export function saveSpeedSettings(settings: SpeedSettings): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Error saving speed settings to localStorage:', error)
  }
}

export function updateSpeed(key: keyof SpeedSettings, value: number): SpeedSettings {
  const current = getSpeedSettings()
  const limits = SPEED_LIMITS[key]
  
  // Clamp value to valid range
  const clampedValue = Math.max(limits.min, Math.min(limits.max, value))
  
  const updated = { ...current, [key]: clampedValue }
  saveSpeedSettings(updated)
  return updated
}

export function resetSpeedSettings(): SpeedSettings {
  saveSpeedSettings(DEFAULT_SPEEDS)
  return DEFAULT_SPEEDS
}

