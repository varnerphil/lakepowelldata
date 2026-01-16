/**
 * Seasonal utilities for determining what projections to show
 * based on the current phase of the water year cycle.
 * 
 * Lake Powell Seasonal Cycle:
 * - Oct 1 - Mar: Lake declining to pre-runoff low (show drop projection + runoff projection)
 * - Apr - Peak: Lake rising (show runoff projection only, track actual vs projected)
 * - Peak - Sep: Lake declining (show drop projection, show runoff summary)
 */

export type SeasonalPhase = 
  | 'pre-runoff'      // Oct 1 - Mar 31: Lake declining to annual low, snowpack building
  | 'runoff-rising'   // Apr 1 - Peak: Lake is rising from snowmelt
  | 'post-peak'       // Peak - Sep 30: Lake declining after peak

export interface SeasonalStatus {
  phase: SeasonalPhase
  
  // What to show
  showDropProjection: boolean
  showRunoffProjection: boolean
  showRunoffSummary: boolean
  
  // Runoff tracking (when applicable)
  preRunoffLow: number | null        // Elevation at pre-runoff low
  preRunoffLowDate: string | null    // Date of pre-runoff low
  currentGainFromLow: number | null  // Current ft gained since low
  peakSoFar: number | null           // Peak elevation reached so far
  peakSoFarDate: string | null       // Date of peak so far
  
  // Descriptive text
  dropProjectionLabel: string
  runoffProjectionLabel: string
}

/**
 * Determine the current seasonal phase and what to show
 */
export function getSeasonalStatus(
  currentDate: Date,
  currentElevation: number,
  weeklyChange: number | null,
  preRunoffLow: { elevation: number | null; date: string | null } | null,
  peakSoFar: { elevation: number | null; date: string | null } | null
): SeasonalStatus {
  const month = currentDate.getMonth() + 1 // 1-12
  const day = currentDate.getDate()
  
  // Calculate current gain from pre-runoff low
  const currentGainFromLow = preRunoffLow?.elevation && currentElevation > preRunoffLow.elevation
    ? currentElevation - preRunoffLow.elevation
    : null
  
  // Determine phase based on date and trend
  let phase: SeasonalPhase
  
  if (month >= 10 || month <= 3) {
    // October through March: Pre-runoff period
    phase = 'pre-runoff'
  } else if (month >= 4 && month <= 9) {
    // April through September: Could be rising or post-peak
    
    // Check if we're still rising
    const isRising = weeklyChange !== null && weeklyChange > 0.5 // Rising at least 0.5 ft/week
    const pastTypicalPeakDate = month >= 7 // After July 1
    const hasDeclinedForWeeks = weeklyChange !== null && weeklyChange < -0.5 // Declining
    
    // If we've been declining for weeks and it's past typical peak, we've peaked
    if (hasDeclinedForWeeks && (pastTypicalPeakDate || month >= 6)) {
      phase = 'post-peak'
    } else if (isRising || month <= 6) {
      // Still rising or before typical peak window
      phase = 'runoff-rising'
    } else {
      // Late in year, unclear - default to post-peak
      phase = 'post-peak'
    }
  } else {
    phase = 'pre-runoff'
  }
  
  // Determine what to show based on phase
  let showDropProjection = false
  let showRunoffProjection = false
  let showRunoffSummary = false
  let dropProjectionLabel = ''
  let runoffProjectionLabel = ''
  
  switch (phase) {
    case 'pre-runoff':
      showDropProjection = true
      showRunoffProjection = true
      dropProjectionLabel = 'Projected Drop to Spring Low'
      runoffProjectionLabel = 'Projected Spring Runoff Gain'
      break
      
    case 'runoff-rising':
      showDropProjection = false // Don't show - lake is going up!
      showRunoffProjection = true
      showRunoffSummary = false
      dropProjectionLabel = ''
      runoffProjectionLabel = currentGainFromLow !== null 
        ? 'Runoff Progress' 
        : 'Projected Spring Runoff Gain'
      break
      
    case 'post-peak':
      showDropProjection = true
      showRunoffProjection = false
      showRunoffSummary = currentGainFromLow !== null // Show summary if we tracked the runoff
      dropProjectionLabel = 'Projected Drop to Annual Low'
      runoffProjectionLabel = ''
      break
  }
  
  return {
    phase,
    showDropProjection,
    showRunoffProjection,
    showRunoffSummary,
    preRunoffLow: preRunoffLow?.elevation || null,
    preRunoffLowDate: preRunoffLow?.date || null,
    currentGainFromLow,
    peakSoFar: peakSoFar?.elevation || null,
    peakSoFarDate: peakSoFar?.date || null,
    dropProjectionLabel,
    runoffProjectionLabel
  }
}

/**
 * Get the current water year (Oct 1 - Sep 30)
 */
export function getCurrentWaterYear(date: Date = new Date()): number {
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  return month >= 10 ? year + 1 : year
}

/**
 * Format a phase for display
 */
export function formatPhase(phase: SeasonalPhase): string {
  switch (phase) {
    case 'pre-runoff':
      return 'Pre-Runoff Season'
    case 'runoff-rising':
      return 'Runoff Season (Rising)'
    case 'post-peak':
      return 'Post-Peak (Declining)'
  }
}

