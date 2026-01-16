/**
 * TypeScript type definitions for the application.
 */

export interface WaterMeasurement {
  date: string
  elevation: number
  content: number
  inflow: number
  outflow: number
}

export interface Ramp {
  id: number
  name: string
  min_safe_elevation: number
  min_usable_elevation: number
  location: string | null
}

export interface RampStatus extends Ramp {
  status: 'Open and Usable' | 'Use at Own Risk' | 'Unusable'
  current_elevation: number
  elevation_difference: number
}

export interface HistoricalAverages {
  allTime: {
    elevation: number
    content: number
    inflow: number
    outflow: number
  } | null
  sinceFilled: {
    elevation: number
    content: number
    inflow: number
    outflow: number
  } | null
  sinceWY2000: {
    elevation: number
    content: number
    inflow: number
    outflow: number
  } | null
}






