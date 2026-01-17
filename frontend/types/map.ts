export type SpotType = 'parking' | 'hazard' | 'hike'

export interface SavedSpot {
  id: string
  name: string
  notes: string
  type: SpotType
  coordinates: {
    lat: number
    lng: number
  }
  savedDate: string          // Date user selected (ISO string)
  waterElevation: number     // Elevation from that date
  createdAt: string          // When the spot was saved (ISO string)
  // Hazard-specific fields
  hazardStatus?: 'at-surface' | 'shallow' | 'deep'  // Hazard position relative to water
  hazardDepth?: number       // Depth in feet if shallow or deep
}

export interface UserLocation {
  lat: number
  lng: number
  accuracy: number
  heading: number | null
  speed: number | null
  timestamp: number
}

export const SPOT_TYPE_CONFIG: Record<SpotType, { label: string; icon: string; color: string }> = {
  parking: {
    label: 'Parking Spot/Beach',
    icon: 'anchor',
    color: '#3b82f6' // blue
  },
  hazard: {
    label: 'Hazard',
    icon: 'alert-triangle',
    color: '#ef4444' // red
  },
  hike: {
    label: 'Hike/Feature',
    icon: 'mountain',
    color: '#22c55e' // green
  }
}

// Saved path/route for measuring distances
export interface SavedPath {
  id: string
  name: string
  notes: string
  coordinates: { lat: number; lng: number }[]  // Array of points
  distanceMiles: number
  createdAt: string
}

// Speed presets for travel time calculation
// Speed categories for travel time display
export const SPEED_LABELS = {
  houseboat: 'Houseboat',
  skiBoat: 'Boat Medium Speed', 
  speedBoat: 'Boat Faster Speed'
} as const

// Lake Powell bounds (approximate)
// Lake Powell extends from ~36.8°N to ~38.0°N and ~110.0°W to ~112.5°W
export const LAKE_POWELL_BOUNDS = {
  center: { lat: 37.4, lng: -111.25 } as const,
  bounds: [
    [-112.5, 36.5], // Southwest
    [-110.0, 38.0]  // Northeast
  ] as [[number, number], [number, number]],
  initialZoom: 10,
  minZoom: 8,
  maxZoom: 18
}

