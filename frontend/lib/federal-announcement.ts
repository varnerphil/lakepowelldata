/**
 * Federal release announcement configuration.
 *
 * Single source of truth for all components that model the federal
 * release reduction. Easy to update when policy changes.
 *
 * Source: USBR News Release 4/18/2026
 * https://www.usbr.gov/newsroom/news-release/5326
 */

export interface FederalReleaseAnnouncement {
  id: string
  label: string
  /** First day the new release rate applies */
  effectiveDate: string
  /** End of the reduced-release window (end of WY2026) */
  endDate: string
  /** WY2026 original planned annual release (MAF) */
  baselineAnnualReleaseMaf: number
  /** WY2026 revised annual release (MAF) */
  newAnnualReleaseMaf: number
  /** Estimated MAF already released Oct 2025 – effectiveDate at the old rate */
  alreadyReleasedMaf: number
  /** Flaming Gorge inflow to Powell through endDate (MAF) */
  flamingGorgeThroughEndMaf: number
  /** Full Flaming Gorge program (MAF) — runs through Apr 2027 */
  flamingGorgeTotalMaf: number
}

/**
 * Derived values computed from the announcement.
 */
export function getAnnouncementDerived(a: FederalReleaseAnnouncement) {
  const remainingReleaseMaf = a.newAnnualReleaseMaf - a.alreadyReleasedMaf
  const releaseSavingsMaf = a.baselineAnnualReleaseMaf - a.newAnnualReleaseMaf

  const startMs = new Date(a.effectiveDate + 'T00:00:00').getTime()
  const endMs = new Date(a.endDate + 'T00:00:00').getTime()
  const dayCount = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))

  const remainingReleaseAfPerDay = (remainingReleaseMaf * 1_000_000) / dayCount
  const flamingGorgeAfPerDay = (a.flamingGorgeThroughEndMaf * 1_000_000) / dayCount

  return {
    /** MAF still to be released from Powell between effectiveDate and endDate */
    remainingReleaseMaf,
    /** Total MAF saved by the reduction (baseline - new) */
    releaseSavingsMaf,
    /** Number of days in the reduced-release window */
    dayCount,
    /** Daily release rate (AF/day) under the new plan */
    remainingReleaseAfPerDay,
    /** Daily Flaming Gorge inflow (AF/day) through endDate */
    flamingGorgeAfPerDay,
  }
}

export const CURRENT_ANNOUNCEMENT: FederalReleaseAnnouncement = {
  id: '2026-04-federal',
  label: 'April 2026 Federal Release Reduction',
  effectiveDate: '2026-04-18',
  endDate: '2026-09-30',
  baselineAnnualReleaseMaf: 7.48,
  newAnnualReleaseMaf: 6.0,
  alreadyReleasedMaf: 4.05, // ~7.48 × (6.5/12) for Oct 1 2025 – Apr 17 2026
  flamingGorgeThroughEndMaf: 0.5,
  flamingGorgeTotalMaf: 1.0,
}
