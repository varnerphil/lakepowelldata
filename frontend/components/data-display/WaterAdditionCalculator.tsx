'use client'

import { useState, useMemo, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { ElevationStorageCapacity, type Ramp } from '@/lib/db'
import { computePhase1Projection, type Phase1Result } from '@/lib/calculations'
import { CURRENT_ANNOUNCEMENT, type FederalReleaseAnnouncement } from '@/lib/federal-announcement'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { parseLocalDate, formatDateString } from '@/lib/date-utils'

/**
 * Mobile-only disclosure. On screens < sm, renders a compact "label + chevron"
 * button that toggles the child content. On sm+ it renders the content inline
 * and hides the trigger — so the desktop layout is unchanged.
 */
function MobileDisclosure({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="sm:hidden w-full flex items-center justify-between gap-2 text-xs font-medium text-teal-700 py-1.5 px-2 -mx-2 rounded hover:bg-teal-50/60 transition-colors"
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`${open ? 'block mt-2' : 'hidden'} sm:block sm:mt-0`}>
        {children}
      </div>
    </div>
  )
}

interface Phase1ProjectionSectionProps {
  elevationStorageData: ElevationStorageCapacity[]
  currentElevation: number
  currentContent?: number
  currentDate?: string
  projectedRunoffInflowAf?: number
  allRamps?: Ramp[]
  // Daily Powell elevations from the 2022 DROA window (Apr 2022 → Apr 2023).
  // Overlaid on the Phase 1 projection chart, shifted forward 4 years so calendar
  // months align — shows how the last Flaming Gorge emergency release actually played out.
  historical2022Measurements?: Array<{ date: string; elevation: number }>
}


const DEFAULT_RAMPS: Array<{ name: string; elevation: number }> = [
  { name: 'Hite', elevation: 3650 },
  { name: 'Antelope Pt', elevation: 3588 },
  { name: 'The Cut', elevation: 3583 },
  { name: 'Bullfrog', elevation: 3578 },
  { name: 'Halls', elevation: 3556 },
  { name: 'Wahweap', elevation: 3550 },
  { name: 'Stateline', elevation: 3520 },
]

interface PlanPreset {
  id: string
  label: string
  shortLabel: string
  releaseCutsMaf: number
  flamingGorgeMaf: number
  newAnnualReleaseMaf: number
  wy2027AnnualReleaseMaf: number
  flamingGorgeTotalMaf: number
  summary: string
}

const PLAN_PRESETS: PlanPreset[] = [
  {
    id: 'cuts-only',
    label: 'Release cuts only (1.48 MAF)',
    shortLabel: 'Cuts only',
    releaseCutsMaf: 1.48,
    flamingGorgeMaf: 0,
    newAnnualReleaseMaf: 6.0,
    wy2027AnnualReleaseMaf: 7.48,
    flamingGorgeTotalMaf: 0,
    summary:
      'Powell releases cut 7.48 → 6.0 MAF through Sep 30, 2026. No Flaming Gorge transfer. WY2027 reverts to normal.',
  },
  {
    id: 'federal-plan',
    label: 'Full federal plan (2.48 MAF)',
    shortLabel: 'Federal plan',
    releaseCutsMaf: 1.48,
    flamingGorgeMaf: 1.0,
    newAnnualReleaseMaf: 6.0,
    wy2027AnnualReleaseMaf: 7.48,
    flamingGorgeTotalMaf: 1.0,
    summary:
      'Powell releases cut 7.48 → 6.0 MAF through Sep 30, 2026 (end of WY2026). Plus up to 1 MAF transferred from Flaming Gorge, Apr 2026 → Apr 2027.',
  },
  {
    id: 'extended',
    label: 'Extended plan — WY2027 also reduced (3.48 MAF)',
    shortLabel: 'Extended',
    releaseCutsMaf: 2.48,
    flamingGorgeMaf: 1.0,
    newAnnualReleaseMaf: 6.0,
    wy2027AnnualReleaseMaf: 6.0,
    flamingGorgeTotalMaf: 1.0,
    summary:
      'Federal plan + keep WY2027 releases at 6.0 MAF (vs reverting to 7.48 on Oct 1). What it would take to hold Powell near min power through April 2027.',
  },
]

function buildAnnouncementForPreset(preset: PlanPreset): FederalReleaseAnnouncement {
  return {
    ...CURRENT_ANNOUNCEMENT,
    newAnnualReleaseMaf: preset.newAnnualReleaseMaf,
    wy2027AnnualReleaseMaf: preset.wy2027AnnualReleaseMaf,
    flamingGorgeTotalMaf: preset.flamingGorgeTotalMaf,
  }
}


/**
 * The projection section — "What the plan will do to Lake Powell."
 * Shows the federal plan's real, day-by-day effect on lake level through
 * April 2027 (the plan window), with the uncertainty band and baseline
 * (no-plan) comparison. Volume-impact visual lives separately in
 * `VolumeImpactCard` below the lake diagram.
 */
// The one plan that is actually in effect. The site used to offer
// "release cuts only" and an "extended" what-if, but readers kept toggling
// between scenarios that aren't real — so we hardcode the actual plan.
const ACTIVE_PRESET: PlanPreset = PLAN_PRESETS.find((p) => p.id === 'federal-plan')!

export default function Phase1ProjectionSection({
  elevationStorageData,
  currentElevation,
  currentContent,
  currentDate,
  projectedRunoffInflowAf,
  allRamps,
  historical2022Measurements,
}: Phase1ProjectionSectionProps) {
  const preset = ACTIVE_PRESET
  const announcement = useMemo(() => buildAnnouncementForPreset(preset), [preset])

  const [favoriteIds, setFavoriteIds] = useState<number[] | null>(null)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('favoriteRamps')
      if (stored) setFavoriteIds(JSON.parse(stored))
      else setFavoriteIds([])
    } catch {
      setFavoriteIds([])
    }
  }, [])
  const rampMarkers = useMemo(() => {
    if (allRamps && favoriteIds && favoriteIds.length > 0) {
      const favs = allRamps.filter((r) => favoriteIds.includes(r.id))
      if (favs.length > 0) {
        return favs.map((r) => ({
          name: r.name.replace(/ (Ramp|Launch|Business Ramp|North Ramp|South Ramp)$/, ''),
          elevation: r.min_safe_elevation || r.min_usable_elevation,
        }))
      }
    }
    return DEFAULT_RAMPS
  }, [allRamps, favoriteIds])

  // afPerFoot at the current elevation — used by Phase1Chart's footer math.
  const afPerFoot = useMemo(() => {
    const sorted = [...elevationStorageData].sort((a, b) => a.elevation - b.elevation)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].elevation >= currentElevation) {
        return sorted[i].storage_at_elevation - sorted[i - 1].storage_at_elevation
      }
    }
    return 0
  }, [elevationStorageData, currentElevation])

  return (
    <div className="card p-4 sm:p-6 lg:p-8">
      <h3 className="text-lg sm:text-xl font-light text-gray-900 mb-1">
        What the April 2026 federal plan will do to Lake Powell
      </h3>
      <p className="text-xs sm:text-sm text-gray-500 font-light mb-3 leading-relaxed">
        In April 2026, the Bureau of Reclamation cut how much water Powell sends downstream
        and started moving water in from Flaming Gorge. The chart below shows where the
        lake lands with the plan compared to without it, from today through April 2027.
      </p>
      <MobileDisclosure label="More about the plan" className="mb-4 sm:mb-5">
        <p className="text-xs sm:text-sm text-gray-500 font-light">
          Through September 30, 2026, releases are cut from 7.48 MAF a year down to 6.0 MAF.
          Up to 1 MAF of water gets moved from Flaming Gorge into Powell between now and
          April 2027. The plan commits to keeping Powell at or above 3,500 ft — the
          &ldquo;safety line&rdquo; 10 ft above the point where the dam can&rsquo;t make
          power anymore.
        </p>
      </MobileDisclosure>

      {currentContent && currentDate && projectedRunoffInflowAf !== undefined && (
        <Phase1Chart
          preset={preset}
          announcement={announcement}
          currentElevation={currentElevation}
          currentContent={currentContent}
          currentDate={currentDate}
          projectedRunoffInflowAf={projectedRunoffInflowAf}
          storageCapacity={elevationStorageData}
          afPerFoot={afPerFoot}
          rampMarkers={rampMarkers}
          historical2022Measurements={historical2022Measurements}
        />
      )}
    </div>
  )
}

// ─── Phase 1 Projection Chart ────────────────────────────────────

function Phase1Chart({
  preset,
  announcement,
  currentElevation,
  currentContent,
  currentDate,
  projectedRunoffInflowAf,
  storageCapacity,
  afPerFoot,
  rampMarkers,
  historical2022Measurements,
}: {
  preset: PlanPreset
  announcement: FederalReleaseAnnouncement
  currentElevation: number
  currentContent: number
  currentDate: string
  projectedRunoffInflowAf: number
  storageCapacity: ElevationStorageCapacity[]
  afPerFoot: number
  rampMarkers: Array<{ name: string; elevation: number }>
  historical2022Measurements?: Array<{ date: string; elevation: number }>
}) {
  // Match the width/padding of the main elevation-trend chart above (see
  // WaterLevelChart) so both charts align visually. Default to mobile to avoid
  // a hydration mismatch.
  const [isMobile, setIsMobile] = useState(true)
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  const phase1 = useMemo(
    () =>
      computePhase1Projection({
        startDate: currentDate,
        startElevation: currentElevation,
        startContent: currentContent,
        projectedRunoffInflowAf,
        announcement,
        storageCapacity,
      }),
    [currentDate, currentElevation, currentContent, projectedRunoffInflowAf, announcement, storageCapacity]
  )

  // Shift 2022 DROA measurements forward 4 years so calendar months align with the
  // current projection window. Lookup by shifted date (with nearest-day fallback up
  // to ±3 days) since the projection samples weekly and 2022 daily dates won't match.
  const hist2022ByShiftedDate = useMemo(() => {
    if (!historical2022Measurements?.length) return null
    const map = new Map<string, number>()
    for (const m of historical2022Measurements) {
      const yyyy = parseInt(m.date.slice(0, 4), 10)
      const shifted = `${yyyy + 4}${m.date.slice(4)}`
      map.set(shifted, m.elevation)
    }
    return map
  }, [historical2022Measurements])

  const lookupHist2022 = (date: string): number | null => {
    if (!hist2022ByShiftedDate) return null
    if (hist2022ByShiftedDate.has(date)) return hist2022ByShiftedDate.get(date)!
    const base = parseLocalDate(date)
    for (let delta = 1; delta <= 3; delta++) {
      for (const sign of [-1, 1]) {
        const probe = new Date(base)
        probe.setDate(probe.getDate() + sign * delta)
        const key = probe.toISOString().split('T')[0]
        const v = hist2022ByShiftedDate.get(key)
        if (v !== undefined) return v
      }
    }
    return null
  }

  // Explicit monthly tick positions — prevents Recharts from auto-picking
  // multiple ticks inside the same month, which produced duplicate "May / May / May"
  // labels on the x-axis.
  const monthlyTicks = useMemo(() => {
    if (!phase1.intervention.daily.length) return []
    const firstDate = parseLocalDate(phase1.intervention.daily[0].date)
    const lastDate = parseLocalDate(
      phase1.intervention.daily[phase1.intervention.daily.length - 1].date
    )
    const ticks: number[] = []
    const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)
    while (cursor.getTime() <= lastDate.getTime()) {
      if (cursor.getTime() >= firstDate.getTime()) ticks.push(cursor.getTime())
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return ticks
  }, [phase1])

  const chartData = useMemo(() => {
    const baselineByDate = new Map(phase1.baseline.daily.map((d) => [d.date, d.p50]))
    return phase1.intervention.daily
      .filter((_, i) => i % 7 === 0 || i === phase1.intervention.daily.length - 1)
      .map((d) => ({
        timestamp: parseLocalDate(d.date).getTime(),
        date: d.date,
        p50: d.p50,
        p10: d.p10,
        p90: d.p90,
        baseline: baselineByDate.get(d.date) ?? null,
        hist2022: lookupHist2022(d.date),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase1, hist2022ByShiftedDate])

  const phase1Rise = phase1.intervention.phase1End.p50Elevation - currentElevation
  const endRise = phase1.intervention.ending.p50Elevation - currentElevation
  const baselineEndRise = phase1.baseline.ending.p50Elevation - currentElevation
  const interventionGain = phase1.intervention.ending.p50Elevation - phase1.baseline.ending.p50Elevation
  const phase1EndTs = parseLocalDate(phase1.intervention.phase1End.date).getTime()
  const planEndTs = parseLocalDate(phase1.intervention.ending.date).getTime()

  const hist2022Values = chartData
    .map((d) => d.hist2022)
    .filter((v): v is number => v !== null)
  const allElevations = [
    currentElevation,
    phase1.intervention.phase1End.p10Elevation,
    phase1.intervention.phase1End.p90Elevation,
    phase1.intervention.ending.p10Elevation,
    phase1.intervention.ending.p90Elevation,
    phase1.baseline.ending.p50Elevation,
    phase1.baseline.phase1End.p50Elevation,
    3370, // Dead pool — always include in y-range so the reference line is visible
    ...hist2022Values,
  ]
  const yMin = Math.floor(Math.min(...allElevations) / 10) * 10 - 10
  const yMax = Math.ceil(Math.max(...allElevations) / 10) * 10 + 10

  // Thin ramp labels so they don't stack when multiple ramps sit within a few
  // feet of each other (Antelope/Bullfrog/Stateline are within ~15 ft). Keep
  // the highest-elevation ramp in each cluster, scaled to chart y-range.
  const rampLines = useMemo(() => {
    const inRange = rampMarkers.filter((r) => r.elevation >= yMin && r.elevation <= yMax)
    const sorted = [...inRange].sort((a, b) => b.elevation - a.elevation)
    const minGap = (yMax - yMin) * 0.045
    const kept: typeof sorted = []
    for (const r of sorted) {
      const lastElev = kept[kept.length - 1]?.elevation
      if (lastElev === undefined || Math.abs(lastElev - r.elevation) >= minGap) {
        kept.push(r)
      }
    }
    return kept
  }, [rampMarkers, yMin, yMax])

  const totalInputMaf = phase1.intervention.totalInflowAf / 1_000_000
  const totalOutputMaf = phase1.intervention.totalOutflowAf / 1_000_000
  const totalEvapMaf = phase1.intervention.totalEvaporationAf / 1_000_000
  const netChangeMaf = totalInputMaf - totalOutputMaf - totalEvapMaf
  const runoffMaf = (projectedRunoffInflowAf ?? 0) / 1_000_000
  const addedMAF = preset.releaseCutsMaf + preset.flamingGorgeMaf

  // End-of-month p50 checkpoints from the first full month after "today" through
  // the plan window. Anchors a compact table under the milestones disclosure so
  // visitors can scan the month-by-month trajectory without reading the chart.
  const monthlyCheckpoints = useMemo(() => {
    const daily = phase1.intervention.daily
    if (daily.length === 0) return [] as Array<{ key: string; label: string; p50: number; delta: number }>

    const lastByMonth = new Map<string, { date: string; p50: number }>()
    for (const d of daily) {
      const key = d.date.slice(0, 7) // YYYY-MM
      lastByMonth.set(key, { date: d.date, p50: d.p50 })
    }

    const start = new Date(daily[0].date + 'T00:00:00')
    // Skip the partial first month — today's row is implicit in "change from today".
    const firstMonthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
    const rows: Array<{ key: string; label: string; p50: number; delta: number }> = []
    const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })
    for (const [key, entry] of lastByMonth) {
      if (key === firstMonthKey) continue
      const label = fmt.format(parseLocalDate(entry.date))
      rows.push({
        key,
        label,
        p50: entry.p50,
        delta: entry.p50 - currentElevation,
      })
    }
    return rows
  }, [phase1.intervention.daily, currentElevation])
  const outflowMultiple = (totalOutputMaf / addedMAF).toFixed(1)

  const narrative = (() => {
    const direction = endRise >= 0 ? 'rise' : 'drop'
    const endElev = phase1.intervention.ending.p50Elevation
    const baselineEndElev = phase1.baseline.ending.p50Elevation

    return (
      <div className="space-y-2">
        <p className="text-xs text-amber-800/70 uppercase tracking-wider">
          Over the next 12 months
        </p>
        <ul className="list-none space-y-1 ml-0 pl-3 border-l-2 border-amber-300 text-[13px]">
          <li>
            <strong>In:</strong> ≈{totalInputMaf.toFixed(1)} MAF
            ({runoffMaf.toFixed(2)} MAF snowmelt
            {preset.flamingGorgeMaf > 0 && ` + ${preset.flamingGorgeMaf} MAF from Flaming Gorge`}
            {' '}+ base flow)
          </li>
          <li>
            <strong>Out:</strong> ≈{totalOutputMaf.toFixed(1)} MAF released to
            the Lower Basin — <strong>{outflowMultiple}×</strong> what the plan adds
          </li>
          <li>
            <strong>Evaporation:</strong> ≈{totalEvapMaf.toFixed(2)} MAF off the surface
          </li>
        </ul>
        <p>
          Net: <strong>{netChangeMaf > 0 ? '+' : ''}{netChangeMaf.toFixed(2)} MAF</strong>.
          At {currentElevation.toFixed(0)} ft, each foot of canyon holds about{' '}
          {(afPerFoot / 1000).toFixed(0)}K acre-feet &rarr; that means a{' '}
          <strong>{endRise.toFixed(0)}-ft {direction}</strong> to{' '}
          <strong>{endElev.toFixed(0)} ft</strong> by April 2027.
        </p>
        <p>
          <strong>The plan saves {interventionGain.toFixed(0)} ft.</strong>{' '}
          Without it, Powell drops to {baselineEndElev.toFixed(0)} ft
          ({baselineEndRise.toFixed(0)} ft). Not a rise — a rescue.
        </p>
        <p className="pt-1">
          This is just the patch through April 2027.{' '}
          <a
            href="/simulator"
            className="inline-flex items-center gap-0.5 text-teal-700 hover:text-teal-800 font-medium underline decoration-teal-300/60 underline-offset-2 hover:decoration-teal-500"
          >
            Run the long-term simulator &rarr;
          </a>{' '}
          to see which plan actually holds Powell up past 2026.
        </p>
      </div>
    )
  })()

  return (
    <div className="mt-2">
      <p className="text-xs sm:text-sm text-gray-500 font-light mb-3">
        How much water flows in and out each day — including this year&rsquo;s snowmelt
        (give or take 20%) and evaporation.
      </p>

      {/* Bottom-line summary always shown as a lede; the full math sits below
           (collapsed behind a disclosure on mobile, inline on desktop). */}
      <div className="bg-amber-50/60 border border-amber-100 rounded-lg px-4 py-3 mb-4 text-sm text-amber-900 font-light leading-relaxed">
        <p className="font-normal mb-1">
          With the plan, Powell drops to <strong>{phase1.intervention.ending.p50Elevation.toFixed(0)} ft</strong>
          {' '}by April 2027. Without it, the lake would drop to{' '}
          <strong>{phase1.baseline.ending.p50Elevation.toFixed(0)} ft</strong>
          {' '}— that&rsquo;s <strong>{Math.abs(baselineEndRise).toFixed(0)} ft down</strong>.
          The plan saves <strong>{interventionGain.toFixed(0)} ft</strong>.
          {announcement.planMinimumElevationFt !== undefined && (() => {
            const floor = announcement.planMinimumElevationFt
            const endElev = phase1.intervention.ending.p50Elevation
            const delta = Math.round(endElev - floor)
            if (delta >= 0) {
              return ` That’s ${delta} ft above the plan’s ${floor} ft safety line.`
            }
            return ` That is ${Math.abs(delta)} ft below the plan’s ${floor} ft safety line.`
          })()}
        </p>
        <details className="group mt-2">
          <summary className="cursor-pointer list-none flex items-center gap-1.5 text-xs font-medium text-amber-800 hover:text-amber-900 py-1 select-none [&::-webkit-details-marker]:hidden">
            <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
            <span className="underline decoration-dotted underline-offset-2 group-open:no-underline">
              See the math
            </span>
          </summary>
          <div className="mt-2">{narrative}</div>
        </details>
      </div>

      {/* Milestone callouts: intervention vs baseline at April 2027.
          On mobile, collapse behind a "See the milestones" disclosure so
          the chart below stays above the fold. */}
      <MobileDisclosure label="See the milestones" className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-blue-50/60 rounded-lg px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-blue-700/70 mb-1">
              Sep 30, 2026 (with plan)
            </div>
            <div className="text-sm text-blue-900 font-light">
              <span className="font-semibold text-lg">{phase1.intervention.phase1End.p50Elevation.toFixed(0)} ft</span>
              <span className="text-blue-700 ml-2">
                ({phase1Rise >= 0 ? '+' : ''}{phase1Rise.toFixed(0)} ft)
              </span>
            </div>
            <div className="text-xs text-blue-600 mt-1">
              vs. {phase1.baseline.phase1End.p50Elevation.toFixed(0)} ft without plan
            </div>
          </div>
          <div className="bg-teal-50/60 rounded-lg px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-teal-700/70 mb-1">
              April 2027 (with plan)
            </div>
            <div className="text-sm text-teal-900 font-light">
              <span className="font-semibold text-lg">{phase1.intervention.ending.p50Elevation.toFixed(0)} ft</span>
              <span className="text-teal-700 ml-2">
                ({endRise >= 0 ? '+' : ''}{endRise.toFixed(0)} ft)
              </span>
            </div>
            <div className="text-xs text-teal-600 mt-1">
              vs. {phase1.baseline.ending.p50Elevation.toFixed(0)} ft without plan
            </div>
          </div>
          <div className="bg-emerald-50/60 rounded-lg px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-emerald-700/70 mb-1">
              What the plan saves
            </div>
            <div className="text-sm text-emerald-900 font-light">
              <span className="font-semibold text-lg">+{interventionGain.toFixed(0)} ft</span>
              <span className="text-emerald-700 ml-2 text-xs">by April 2027</span>
            </div>
            <div className="text-xs text-emerald-600 mt-1">
              Stops a {Math.abs(baselineEndRise).toFixed(0)}-ft drop
            </div>
          </div>
        </div>

        {monthlyCheckpoints.length > 0 && (
          <div className="mt-3 rounded-lg border border-gray-100 bg-white/70 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
              Start of each month (with plan)
            </div>
            <table className="w-full text-[12px] sm:text-[13px]">
              <thead>
                <tr className="text-left text-gray-500 font-light">
                  <th className="px-3 py-1.5 font-normal">Month</th>
                  <th className="px-3 py-1.5 font-normal text-right">Elevation</th>
                  <th className="px-3 py-1.5 font-normal text-right">
                    Change from today ({currentElevation.toFixed(0)} ft)
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyCheckpoints.map((row) => {
                  const sign = row.delta > 0 ? '+' : ''
                  const color =
                    row.delta > 0
                      ? 'text-emerald-700'
                      : row.delta < 0
                      ? 'text-amber-700'
                      : 'text-gray-600'
                  return (
                    <tr key={row.key} className="border-t border-gray-50">
                      <td className="px-3 py-1.5 text-gray-700">{row.label}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">
                        {row.p50.toFixed(0)} ft
                      </td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${color}`}>
                        {sign}
                        {row.delta.toFixed(0)} ft
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </MobileDisclosure>

      {/* Legend — make the two scenarios crystal clear before the chart */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5 mb-2 text-[11px] sm:text-xs font-light">
        <div className="flex items-center gap-2">
          <span className="inline-block w-6 h-[3px] rounded-sm bg-[#1d4ed8]" />
          <span className="text-gray-700">
            <strong className="font-medium text-[#1d4ed8]">With the plan</strong> — smaller releases + Flaming Gorge water
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-6 h-[2px]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to right, #dc2626 0, #dc2626 4px, transparent 4px, transparent 7px)',
            }}
          />
          <span className="text-gray-700">
            <strong className="font-medium text-[#dc2626]">Without the plan</strong> — normal releases, no Flaming Gorge transfer
          </span>
        </div>
        {hist2022Values.length > 0 && (
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-6 h-[2px]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(to right, #6b7280 0, #6b7280 2px, transparent 2px, transparent 5px)',
              }}
            />
            <span className="text-gray-700">
              <strong className="font-medium text-[#6b7280]">2022 actuals</strong> — last Flaming Gorge emergency release (~500 KAF)
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="h-[280px] sm:h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{
              top: 5,
              right: isMobile ? 60 : 80,
              left: isMobile ? 0 : 30,
              bottom: 20,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" strokeOpacity={0.8} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              ticks={monthlyTicks}
              tickFormatter={(ts) => {
                const d = new Date(ts)
                const month = d.toLocaleDateString('en-US', { month: 'short' })
                return d.getMonth() === 0 ? `${month} ${d.getFullYear()}` : month
              }}
              tick={{ fontSize: 11, fill: '#888' }}
            />
            <YAxis
              domain={[yMin, yMax]}
              width={isMobile ? 45 : 70}
              tick={{ fontSize: 11, fill: '#888' }}
              label={
                isMobile
                  ? undefined
                  : {
                      value: 'Elevation (ft)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: -15,
                      style: { fill: '#888', fontSize: 12 },
                    }
              }
            />
            <Tooltip
              // Keep the tooltip narrow enough to sit inside a phone viewport
              // without covering the whole chart. Compact labels below do the
              // heavy lifting; the legend above has the full descriptions.
              wrapperStyle={{ fontSize: 12, maxWidth: 200 }}
              contentStyle={{ padding: '6px 8px', lineHeight: 1.3 }}
              labelFormatter={(ts: number) => {
                const d = new Date(ts)
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              }}
              formatter={(value: number, name: string, entry: { dataKey?: string | number }) => {
                const key = entry?.dataKey
                if (key === 'p10') return [null, null]
                const label =
                  key === 'p50' ? 'With plan' :
                  key === 'baseline' ? 'Without plan' :
                  key === 'p90' ? 'Best case' :
                  key === 'hist2022' ? '2022 actual' : String(name)
                return [`${value.toFixed(1)} ft`, label]
              }}
            />

            {/* Uncertainty band (intervention scenario) */}
            <Area
              dataKey="p90"
              stroke="none"
              fill="#93c5fd"
              fillOpacity={0.3}
              isAnimationActive={false}
            />
            <Area
              dataKey="p10"
              stroke="none"
              fill="#ffffff"
              fillOpacity={1}
              isAnimationActive={false}
            />

            {/* Baseline (no intervention) line */}
            <Line
              dataKey="baseline"
              type="monotone"
              stroke="#dc2626"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />

            {/* Intervention (with plan) median line */}
            <Line
              dataKey="p50"
              type="monotone"
              stroke="#1d4ed8"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />

            {/* 2022 DROA actuals — calendar-shifted 4 years forward */}
            {hist2022Values.length > 0 && (
              <Line
                dataKey="hist2022"
                type="monotone"
                stroke="#6b7280"
                strokeWidth={1.75}
                strokeDasharray="2 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}

            {/* Ramp reference lines */}
            {rampLines.map((r) => (
              <ReferenceLine
                key={r.name}
                y={r.elevation}
                stroke="#8b5cf680"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{ value: r.name, position: 'right', fill: '#8b5cf6', fontSize: 10 }}
              />
            ))}

            {/* Federal plan's 3,500 ft protective elevation — the floor the
                plan commits to defending by April 2027. Only drawn if the
                active announcement includes the field. */}
            {announcement.protectiveElevationFt !== undefined && (
              <ReferenceLine
                y={announcement.protectiveElevationFt}
                stroke="#0d7377"
                strokeDasharray="2 3"
                strokeWidth={1.5}
                label={{
                  value: `Plan floor (${announcement.protectiveElevationFt})`,
                  position: 'right',
                  fill: '#0d7377',
                  fontSize: 10,
                }}
              />
            )}

            {/* Min power pool */}
            <ReferenceLine
              y={3490}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              label={{ value: 'Min Power', position: 'right', fill: '#f59e0b', fontSize: 10 }}
            />

            {/* Dead pool — lake can't release water below this elevation */}
            <ReferenceLine
              y={3370}
              stroke="#dc2626"
              strokeDasharray="5 5"
              label={{ value: 'Dead Pool', position: 'right', fill: '#dc2626', fontSize: 10 }}
            />

            {/* Sep 30, 2026 — Powell release cuts end (WY2026 boundary).
                 Label at TOP so it doesn't collide with the Apr 2027 marker. */}
            <ReferenceLine
              x={phase1EndTs}
              stroke="#6366f1"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: 'Powell cuts end',
                position: 'insideTopLeft',
                fill: '#6366f1',
                fontSize: 10,
                offset: 6,
              }}
            />

            {/* Apr 30, 2027 — Flaming Gorge transfers end (plan window end).
                 No label: the x-axis already shows "Apr" at the right edge,
                 and a second top-label would collide with "Powell cuts end". */}
            <ReferenceLine
              x={planEndTs}
              stroke="#0d7377"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-gray-400 font-light text-center mt-2 italic">
        The gap between the two lines is what the plan buys.
      </p>

      {hist2022Values.length >= 2 && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs sm:text-sm text-gray-600 font-light leading-relaxed">
          <span className="font-medium text-gray-800">Context — the 2022 release:</span>{' '}
          Powell went from {hist2022Values[0].toFixed(0)} ft to {hist2022Values[hist2022Values.length - 1].toFixed(0)} ft over the last Flaming Gorge emergency release window — a net{' '}
          <strong>{(hist2022Values[hist2022Values.length - 1] - hist2022Values[0] >= 0 ? '+' : '')}
          {(hist2022Values[hist2022Values.length - 1] - hist2022Values[0]).toFixed(0)} ft</strong>.
          <MobileDisclosure label="What this means">
            <p className="text-xs text-gray-600 font-light leading-relaxed">
              The 2022 release (~500 KAF under the DROA) ran May 2022 → April 2023.
              Emergency releases from Flaming Gorge slow Powell&apos;s decline; they
              don&apos;t reverse it on their own. The 2022 window had different
              snowpack and smaller cuts, so this is a historical reference — not a
              forecast.
            </p>
          </MobileDisclosure>
        </div>
      )}
    </div>
  )
}
