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
  /** End of the reduced-release window — end of WY2026 (reverts to normal rate after) */
  phase1EndDate: string
  /** End of the full federal intervention window — when Flaming Gorge releases stop and Monte Carlo takes over */
  planEndDate: string
  /** WY2026 original planned annual release (MAF) */
  baselineAnnualReleaseMaf: number
  /** WY2026 revised annual release (MAF) */
  newAnnualReleaseMaf: number
  /** Assumed WY2027 annual release (MAF) — reverts to baseline by default */
  wy2027AnnualReleaseMaf: number
  /** Estimated MAF already released Oct 2025 – effectiveDate at the old rate */
  alreadyReleasedMaf: number
  /** Total Flaming Gorge program (MAF) delivered from effectiveDate through planEndDate */
  flamingGorgeTotalMaf: number
  /** Protective elevation floor (ft) the plan commits to defending by planEndDate.
   *  USBR News Release 5326 (4/18/2026) states the plan's actions "are expected
   *  to increase Lake Powell's elevation by approximately 54 ft to at least
   *  elevation 3500 feet by April 2027." This is 10 ft above minimum power pool. */
  protectiveElevationFt?: number
}

/**
 * Derived per-day rates for each window of the federal plan.
 */
export function getAnnouncementDerived(a: FederalReleaseAnnouncement) {
  const startMs = new Date(a.effectiveDate + 'T00:00:00').getTime()
  const phase1EndMs = new Date(a.phase1EndDate + 'T00:00:00').getTime()
  const planEndMs = new Date(a.planEndDate + 'T00:00:00').getTime()

  const dayMs = 1000 * 60 * 60 * 24
  const phase1aDays = Math.round((phase1EndMs - startMs) / dayMs)
  const phase1bDays = Math.round((planEndMs - phase1EndMs) / dayMs)
  const totalDays = phase1aDays + phase1bDays

  // Phase 1a (reduced release): remaining WY2026 budget spread across Apr–Sep
  const remainingReleaseMaf = a.newAnnualReleaseMaf - a.alreadyReleasedMaf
  const reducedReleaseAfPerDay = (remainingReleaseMaf * 1_000_000) / phase1aDays

  // Phase 1b (normal release): WY2027 annual rate prorated to daily
  const normalReleaseAfPerDay = (a.wy2027AnnualReleaseMaf * 1_000_000) / 365

  // Flaming Gorge: distributed evenly over the full plan window
  const flamingGorgeAfPerDay = (a.flamingGorgeTotalMaf * 1_000_000) / totalDays

  // Flaming Gorge share that arrives by phase1EndDate (for the calculator's Sep 30 milestone)
  const flamingGorgeThroughPhase1Maf =
    (a.flamingGorgeTotalMaf * phase1aDays) / totalDays

  return {
    phase1aDays,
    phase1bDays,
    totalDays,
    remainingReleaseMaf,
    releaseSavingsMaf: a.baselineAnnualReleaseMaf - a.newAnnualReleaseMaf,
    reducedReleaseAfPerDay,
    normalReleaseAfPerDay,
    flamingGorgeAfPerDay,
    flamingGorgeThroughPhase1Maf,
  }
}

export const CURRENT_ANNOUNCEMENT: FederalReleaseAnnouncement = {
  id: '2026-04-federal',
  label: 'April 2026 Federal Release Reduction',
  effectiveDate: '2026-04-18',
  phase1EndDate: '2026-09-30',
  planEndDate: '2027-04-30',
  baselineAnnualReleaseMaf: 7.48,
  newAnnualReleaseMaf: 6.0,
  wy2027AnnualReleaseMaf: 7.48,
  alreadyReleasedMaf: 4.05,
  flamingGorgeTotalMaf: 1.0,
  protectiveElevationFt: 3500,
}
