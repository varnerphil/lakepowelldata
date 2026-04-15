'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  POLICY_PRESETS,
  AUGMENTATION_PRESETS,
  type InflowScenario,
  type OutflowPolicy,
  type MonteCarloResult,
  type AugmentationConfig,
} from '@/lib/monte-carlo'

type AugmentationKey = 'none' | (typeof AUGMENTATION_PRESETS)[number]['key']

function getAugmentation(key: AugmentationKey): AugmentationConfig | undefined {
  if (key === 'none') return undefined
  return AUGMENTATION_PRESETS.find((p) => p.key === key)?.config
}
import type { WorkerResponse } from '@/workers/monte-carlo.worker'
import MonteCarloChart from './MonteCarloChart'
import PolicySelector from './PolicySelector'
import PolicyComparison from './PolicyComparison'
import { TrendingUp, TrendingDown, Loader2, CheckCircle2, AlertTriangle, XCircle, Link2, Info } from 'lucide-react'
import ShareButton from '@/components/ui/ShareButton'

export type StreamflowTrend = 'historical' | 'moderate_decline' | 'federal_baseline'

const STREAMFLOW_TRENDS: Record<StreamflowTrend, { label: string; description: string; dryingPct: number; maxReduction: number; demandGrowthPct: number; demandMaxReduction: number }> = {
  historical:       { label: 'Historical',          description: 'Uses historical inflow patterns as recorded — no adjustment', dryingPct: 0, maxReduction: 0, demandGrowthPct: 0, demandMaxReduction: 0 },
  moderate_decline: { label: 'Moderate decline',    description: 'Gradual ~10% streamflow reduction, reaching the cap around year 20', dryingPct: 0.5, maxReduction: 0.10, demandGrowthPct: 0, demandMaxReduction: 0 },
  federal_baseline: { label: 'Federal baseline',    description: 'Matches Bureau of Reclamation CRSS projections — ~18% streamflow reduction by ~2055, ramping gradually from today', dryingPct: 0.6, maxReduction: 0.18, demandGrowthPct: 0, demandMaxReduction: 0 },
}

export interface SharedSimConfig {
  policy: OutflowPolicy
  yearsToProject: number
  inflowScenario: InflowScenario
  streamflowTrend?: StreamflowTrend
  augmentation?: AugmentationKey
  startMode: 'today' | 'custom'
  customElevation?: number
}

interface MonteCarloSimulatorProps {
  currentElevation: number
  currentDate: string
  sharedConfig?: SharedSimConfig | null
}

function defaultInflowScenario(policy: OutflowPolicy): InflowScenario | null {
  const name = policy.name
  if (name.includes('Supply Driven')) return 'last10'
  if (name.includes('Max Operational')) return 'last20'
  if (name.includes('Enhanced Coordination')) return 'last30'
  if (name.includes('Basic Coordination')) return 'last30'
  if (name.includes('No Action')) return 'last30'
  if (POLICY_PRESETS.some(p => p.name === name)) return 'last30'
  return null
}

function defaultStreamflowTrend(policy: OutflowPolicy): StreamflowTrend {
  if (policy.name.includes('Federal Plan:')) return 'federal_baseline'
  return 'historical'
}

export default function MonteCarloSimulator({
  currentElevation,
  currentDate,
  sharedConfig,
}: MonteCarloSimulatorProps) {
  const [policy, setPolicy] = useState<OutflowPolicy>(sharedConfig?.policy ?? POLICY_PRESETS[0])
  const [yearsToProject, setYearsToProject] = useState(sharedConfig?.yearsToProject ?? 20)
  const [inflowScenario, setInflowScenario] = useState<InflowScenario>(sharedConfig?.inflowScenario ?? 'last20')
  const [streamflowTrend, setStreamflowTrend] = useState<StreamflowTrend>(sharedConfig?.streamflowTrend ?? 'historical')
  const [augmentationKey, setAugmentationKey] = useState<AugmentationKey>(sharedConfig?.augmentation ?? 'ioc-only')
  const [startMode, setStartMode] = useState<'today' | 'custom'>(sharedConfig?.startMode ?? 'today')
  const [customElevation, setCustomElevation] = useState(sharedConfig?.customElevation ?? currentElevation)

  const handlePolicyChange = useCallback((p: OutflowPolicy) => {
    setPolicy(p)
  }, [])

  const [result, setResult] = useState<MonteCarloResult | null>(null)
  const [snowpackInfo, setSnowpackInfo] = useState<{ percent: number; years: number[] } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [favoriteRamps, setFavoriteRamps] = useState<Array<{ name: string; elevation: number }>>([])
  const workerRef = useRef<Worker | null>(null)
  const mountedRef = useRef(true)

  // Load favorite ramps from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('favoriteRamps')
      if (stored) {
        const ids: number[] = JSON.parse(stored)
        fetch('/api/ramps/status')
          .then((r) => r.json())
          .then((ramps: any[]) => {
            if (!mountedRef.current) return
            const favs = ramps
              .filter((r) => ids.includes(r.id))
              .map((r) => ({
                name: r.name,
                elevation: r.min_safe_elevation || r.min_usable_elevation,
              }))
            setFavoriteRamps(favs)
          })
          .catch(() => {})
      }
    } catch {}
  }, [])

  // Clean up worker on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [])

  const runProjection = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setLoadingStatus('Fetching data...')

    // Terminate any running worker before starting a new one
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }

    try {
      const startParam = startMode === 'custom' ? `elevation:${customElevation}` : 'today'

      const params = new URLSearchParams({ start: startParam })
      const res = await fetch(`/api/projections?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Server error (${res.status})`)
      }

      // Bail out if component unmounted while fetch was in progress
      if (!mountedRef.current) return

      const data = await res.json()

      if (data.snowpackData) {
        setSnowpackInfo({
          percent: data.snowpackData.currentSnowpackPercent,
          years: data.snowpackData.similarWaterYears,
        })
      }

      setLoadingStatus('Computing simulation...')

      const worker = new Worker(
        new URL('../../workers/monte-carlo.worker.ts', import.meta.url)
      )

      // Double-check mount status — if unmounted between lines, terminate immediately
      if (!mountedRef.current) {
        worker.terminate()
        return
      }

      workerRef.current = worker

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        worker.terminate()
        workerRef.current = null
        if (!mountedRef.current) return
        if (e.data.type === 'result') {
          setResult(e.data.result as MonteCarloResult)
          setIsLoading(false)
        } else if (e.data.type === 'error') {
          setError(e.data.error || 'Simulation failed')
          setIsLoading(false)
        }
      }

      worker.onerror = () => {
        worker.terminate()
        workerRef.current = null
        if (!mountedRef.current) return
        setError('Simulation worker failed')
        setIsLoading(false)
      }

      worker.postMessage({
        config: {
          startDate: data.startDate,
          startElevation: data.startElevation,
          startContent: data.startContent,
          yearsToProject,
          iterations: 1000,
          policy,
          recentYearWeight: inflowScenario === 'full_unweighted' ? 1.0 : 2.0,
          recentYearCutoff: 20,
          inflowScenario,
          demandGrowthPctPerYear: STREAMFLOW_TRENDS[streamflowTrend].demandGrowthPct,
          demandGrowthMaxReduction: STREAMFLOW_TRENDS[streamflowTrend].demandMaxReduction,
          dryingTrendPctPerYear: STREAMFLOW_TRENDS[streamflowTrend].dryingPct,
          dryingTrendMaxReduction: STREAMFLOW_TRENDS[streamflowTrend].maxReduction,
          augmentation: getAugmentation(augmentationKey),
          currentWaterYearInflowToDate: data.currentWaterYearInflowToDate,
          snowpackData: data.snowpackData ?? undefined,
        },
        historicalPatterns: data.patterns,
        storageCapacity: data.storageCapacity,
        ramps: favoriteRamps,
      })
    } catch (err: any) {
      if (!mountedRef.current) return
      setError(err.message || 'Failed to run projection')
      setIsLoading(false)
    }
  }, [policy, yearsToProject, inflowScenario, streamflowTrend, augmentationKey, startMode, customElevation, favoriteRamps])

  const getShareUrl = useCallback(async (origin: string) => {
    const config: SharedSimConfig = {
      policy,
      yearsToProject,
      inflowScenario,
      streamflowTrend,
      augmentation: augmentationKey,
      startMode,
      ...(startMode === 'custom' ? { customElevation } : {}),
    }
    const res = await fetch('/api/simulations/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    })
    if (!res.ok) throw new Error('Failed to save')
    const { id } = await res.json()
    return `${origin}/simulator?share=${id}`
  }, [policy, yearsToProject, inflowScenario, streamflowTrend, augmentationKey, startMode, customElevation])

  // Auto-run on mount
  useEffect(() => {
    runProjection()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const thresholds = result?.thresholdProbabilities
  const summary = result?.summary

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Policy */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
          <PolicySelector value={policy} onChange={handlePolicyChange} />
        </div>

        {/* Time Horizon */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Time Horizon
          </label>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Project forward</span>
            <span className="text-sm font-medium text-gray-900">
              {yearsToProject} {yearsToProject === 1 ? 'year' : 'years'}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={40}
            value={yearsToProject}
            onChange={(e) => setYearsToProject(parseInt(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-teal-600"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>1 yr</span>
            <span>20 yr</span>
            <span>40 yr</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <label className="block text-xs text-gray-500 mb-1">Inflow scenario</label>
            <select
              value={inflowScenario}
              onChange={(e) => setInflowScenario(e.target.value as InflowScenario)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
            >
              <option value="last30">Last 30 years</option>
              <option value="last20">Last 20 years</option>
              <option value="last10">Last 10 years</option>
              <option value="full">Full history (recent 2×)</option>
              <option value="full_unweighted">Full history (unweighted)</option>
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              {inflowScenario === 'last30'
                ? 'Only 1996–present — recent conditions'
                : inflowScenario === 'last20'
                  ? 'Only 2006–present — drier period'
                  : inflowScenario === 'last10'
                    ? 'Only 2016–present — driest period'
                    : inflowScenario === 'full_unweighted'
                      ? 'All years back to 1960s, sampled uniformly — best pairing with streamflow trend'
                      : 'Uses all years back to 1960s; recent years weighted 2×'}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <label className="block text-xs text-gray-500 mb-1">Streamflow adjustment</label>
            <select
              value={streamflowTrend}
              onChange={(e) => setStreamflowTrend(e.target.value as StreamflowTrend)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
            >
              {(Object.entries(STREAMFLOW_TRENDS) as [StreamflowTrend, typeof STREAMFLOW_TRENDS[StreamflowTrend]][]).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              {STREAMFLOW_TRENDS[streamflowTrend].description}
            </p>
            {streamflowTrend !== 'historical' && inflowScenario !== 'full_unweighted' && (
              <p className="text-[10px] text-amber-700 mt-1 leading-snug">
                Heads up: this inflow window is already drier than the long-run mean ({inflowScenario === 'last30' ? '~14% drier' : inflowScenario === 'last20' ? '~18% drier' : inflowScenario === 'last10' ? '~22% drier' : '~7% drier (recent 2× weighting)'}). Layering a streamflow reduction on top double-counts dryness. For CRSS-comparable runs, pair streamflow adjustment with "Full history (unweighted)".
              </p>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <label className="block text-xs text-gray-500 mb-1">Abundance Act augmentation</label>
            <select
              value={augmentationKey}
              onChange={(e) => setAugmentationKey(e.target.value as AugmentationKey)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
            >
              <option value="none">None (baseline)</option>
              {AUGMENTATION_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              {augmentationKey === 'none'
                ? 'No Replacement Water modeled — status quo baseline.'
                : AUGMENTATION_PRESETS.find((p) => p.key === augmentationKey)?.description}
            </p>
            {augmentationKey !== 'none' && (
              <p className="text-[10px] text-teal-700 mt-1 leading-snug">
                Desalinated water delivered to Mead or directly into the Lower Basin offsets Powell releases, keeping more water upstream and lifting reservoir elevations. Long-term infrastructure investment backed by public-private partnerships and powered by dedicated renewables — the same American build-it spirit that created the Hoover and Glen Canyon Dams.
              </p>
            )}
          </div>
        </div>

        {/* Starting Point & Run */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Starting Point
          </label>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setStartMode('today')}
              className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
                startMode === 'today'
                  ? 'bg-white shadow-sm text-gray-900 border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 bg-gray-50'
              }`}
            >
              Today ({currentElevation.toFixed(1)} ft)
            </button>
            <button
              onClick={() => setStartMode('custom')}
              className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
                startMode === 'custom'
                  ? 'bg-white shadow-sm text-gray-900 border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 bg-gray-50'
              }`}
            >
              Custom
            </button>
          </div>
          {startMode === 'custom' && (
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={customElevation}
                  onChange={(e) => setCustomElevation(parseFloat(e.target.value) || 3500)}
                  className="flex-1 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                  min={3370}
                  max={3700}
                  step={1}
                />
                <span className="text-xs text-gray-400">ft</span>
              </div>
            </div>
          )}
          <button
            onClick={runProjection}
            disabled={isLoading}
            className="w-full py-2.5 bg-gray-900 text-white text-sm font-light rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {loadingStatus || 'Running...'}
              </>
            ) : (
              'Run Projection'
            )}
          </button>
          {result && (
            <div className="text-[10px] text-gray-400 mt-1.5 text-center space-y-0.5">
              <p>
                {`Computed in ${result.computeTimeMs}ms`}
                {' · '}{result.iterations.toLocaleString()} scenarios
              </p>
              {snowpackInfo && (
                <p className="text-teal-500">
                  Current snowpack: {snowpackInfo.percent}% of median
                </p>
              )}
            </div>
          )}
          {result && (
            <ShareButton
              getShareUrl={getShareUrl}
              label="Share these settings"
              className="w-full mt-2 justify-center"
            />
          )}
        </div>
      </div>

      {/* Shared config banner */}
      {sharedConfig && (
        <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-xl px-4 py-3">
          <Link2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
          <p className="text-sm text-teal-800 font-light">
            You&apos;re viewing a shared projection. The simulation has been re-run with the latest lake data using the shared settings.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Chart */}
      {result && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-6">
          <div className="mb-4">
            <h3 className="text-lg font-light text-gray-900">Projected Elevation</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Shaded bands show 25th-75th and 10th-90th percentile ranges across {result.iterations.toLocaleString()} scenarios
            </p>
          </div>
          <MonteCarloChart
            data={result.dailyPercentiles}
            ramps={favoriteRamps}
            policyTiers={policy.type === 'tiered' ? policy.tiers : undefined}
          />
          <div className="mt-4 flex justify-end">
            <ShareButton getShareUrl={getShareUrl} label="Share this projection" />
          </div>
        </div>
      )}

      {/* Model disclaimer */}
      {result && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-xs text-gray-400 hover:text-gray-600 transition-colors select-none">
            <Info className="w-3.5 h-3.5" />
            <span>About this model &mdash; how it differs from federal CRSS projections</span>
          </summary>
          <div className="mt-2 bg-gray-50 rounded-xl border border-gray-200 px-4 sm:px-5 py-3.5 text-xs text-gray-600 space-y-3">
            <p>
              This simulator provides <span className="font-medium text-gray-800">directional estimates</span> of how
              different release policies affect Lake Powell over time. It is not a substitute for the Bureau of
              Reclamation&apos;s Colorado River Simulation System (CRSS), which uses hundreds of synthetic hydrologic traces
              derived from climate models.
            </p>
            <p className="font-medium text-gray-700">Key simplifications compared to CRSS:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-500">
              <li>Samples from historical water year inflow patterns rather than climate-adjusted synthetic traces</li>
              <li>Uses a simplified Lake Mead model with approximate shortage tiers (actual CRSS has detailed Lower Basin delivery mechanics, ICS, and conservation programs)</li>
              <li>Does not capture all transit/evaporation losses across the full system (~1.2 MAF/yr structural deficit)</li>
            </ul>
            <details className="mt-1">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-medium select-none">
                Federal Plan policy assumptions
              </summary>
              <div className="mt-2 space-y-2 pl-1">
                <p className="text-gray-500">
                  All tier elevations, release ranges, percentages, and curve breakpoints used in the Federal Plan policies
                  come directly from the{' '}
                  <a
                    href="https://www.usbr.gov/ColoradoRiverBasin/post2026/draft-eis/index.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-600 hover:text-teal-800 underline"
                  >
                    January 2026 Draft EIS
                  </a>. Where the document describes a goal but does not specify the exact implementation formula, we
                  note our interpretation below.
                </p>
                <ul className="list-disc list-inside space-y-1.5 text-gray-500">
                  <li>
                    <span className="font-medium text-gray-600">No Action</span> &mdash; No interpretation needed.
                    Releases a fixed 8.23 MAF/yr (100% of compact) as specified.
                  </li>
                  <li>
                    <span className="font-medium text-gray-600">Basic Coordination</span> &mdash; The DEIS states
                    releases &ldquo;transition smoothly between levels.&rdquo; We use linear interpolation between the
                    elevation tiers, which is the most straightforward reading.
                  </li>
                  <li>
                    <span className="font-medium text-gray-600">Enhanced Coordination</span> &mdash; The DEIS defines
                    a target storage split between Powell and Mead (Figure 2-6) and guardrails (4.7&ndash;10.8 MAF/yr),
                    but does not specify how quickly releases should adjust to reach the target. We assume the Bureau
                    would correct roughly one-third of the gap per year, spreading the adjustment over ~3 years rather
                    than making abrupt changes.
                  </li>
                  <li>
                    <span className="font-medium text-gray-600">Max Operational Flexibility</span> &mdash; Release
                    curves come from DEIS Table 2-6. This policy references total CRSP storage (Powell plus three smaller
                    reservoirs). Since we only simulate Powell, we estimate the other reservoirs hold ~5 MAF combined
                    based on current levels. This is a fixed estimate and does not change during the simulation.
                  </li>
                  <li>
                    <span className="font-medium text-gray-600">Supply Driven</span> &mdash; No interpretation
                    needed. Releases 65% of the 3-year rolling average natural flow, clamped to 4.7&ndash;12.0 MAF/yr,
                    as specified in DEIS Section 2.8.2.
                  </li>
                </ul>
                <p className="text-gray-500">
                  The &ldquo;Streamflow adjustment&rdquo; setting controls whether inflows decline over time.
                  &ldquo;Federal baseline&rdquo; applies ~18% streamflow reduction (leveling off around year 13),
                  approximating CRSS hydrologic projections (~8 MAF effective inflow). No Upper Basin demand growth
                  is modeled — consumption is assumed to shift (Lower Basin cuts, Upper Basin develops) rather than increase.
                  &ldquo;Historical&rdquo; uses inflow patterns as recorded with no adjustment.
                </p>
              </div>
            </details>
            <p>
              The relative ordering of policy outcomes aligns with the Draft EIS, which finds that all alternatives
              converge at infrastructure limits under sustained drought and that policy differences are secondary to
              hydrology at lower reservoir elevations.
            </p>
          </div>
        </details>
      )}

      {/* Outcome Report */}
      {thresholds && summary && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-light text-gray-900">Projection Summary</h3>
            <ShareButton getShareUrl={getShareUrl} variant="compact" />
          </div>

          {/* Executive summary — the quick read */}
          {(() => {
            const startElev = startMode === 'today' ? currentElevation : customElevation
            const stab = analyzeStabilization(result!.dailyPercentiles, startElev, yearsToProject)
            const dp = result!.dailyPercentiles
            const totalDays = yearsToProject * 365
            const daysPerPoint = totalDays / (dp.length - 1)

            // Direction phrase
            const dirPhrase = stab.direction === 'rising'
              ? `rise roughly ${Math.abs(stab.netChange).toFixed(0)} ft to around ${summary.medianEndingElevation.toFixed(0)} ft`
              : stab.direction === 'falling'
                ? `decline roughly ${Math.abs(stab.netChange).toFixed(0)} ft to around ${summary.medianEndingElevation.toFixed(0)} ft`
                : `hold roughly steady around ${summary.medianEndingElevation.toFixed(0)} ft`

            // Power risk
            const powerOk = thresholds.stayAboveMinPower >= 90
            const fullPowerOk = thresholds.stayAbove3525 >= 90
            let powerPhrase = ''
            if (!powerOk) {
              const pctRisk = (100 - thresholds.stayAboveMinPower).toFixed(0)
              powerPhrase = `There is a ${pctRisk}% chance of losing all power generation.`
            } else if (!fullPowerOk) {
              powerPhrase = 'Full power generation is at risk, though partial generation is likely maintained.'
            }

            // Recovery
            const recoveryChance = thresholds.reachRecoveryTarget
            const recoveryPhrase = recoveryChance >= 50
              ? `There is a ${recoveryChance.toFixed(0)}% chance the lake reaches healthy recovery (3,660 ft).`
              : recoveryChance >= 10
                ? `Recovery to 3,660 ft is possible but unlikely (${recoveryChance.toFixed(0)}% chance).`
                : ''

            // Drought note
            const p10Low = summary.lowestElevationReached.p10
            const droughtPhrase = p10Low < 3490
              ? ` In a worst-case drought, the lake could drop as low as ${p10Low.toFixed(0)} ft.`
              : ''

            // --- Phase-based outlook ---
            // Short: 0-5yr, Medium: 5-15yr, Long: 15+yr
            // Only show phases that fall within the projection window
            interface PhaseAssessment {
              label: string
              rangeLabel: string
              medianStart: number
              medianEnd: number
              p10Low: number
              direction: 'rising' | 'falling' | 'stable'
              change: number
              verdict: string
            }

            const getPointAtYear = (yr: number) => {
              const idx = Math.min(Math.round((yr * 365) / daysPerPoint), dp.length - 1)
              return dp[idx]
            }

            const getP10LowInRange = (startYr: number, endYr: number) => {
              const startIdx = Math.round((startYr * 365) / daysPerPoint)
              const endIdx = Math.min(Math.round((endYr * 365) / daysPerPoint), dp.length - 1)
              let low = Infinity
              for (let i = Math.max(0, startIdx); i <= endIdx; i++) {
                if (dp[i].p10 < low) low = dp[i].p10
              }
              return low
            }

            const buildPhase = (label: string, rangeLabel: string, startYr: number, endYr: number): PhaseAssessment => {
              const pStart = getPointAtYear(startYr)
              const pEnd = getPointAtYear(endYr)
              const change = pEnd.p50 - pStart.p50
              const direction: 'rising' | 'falling' | 'stable' =
                change > 5 ? 'rising' : change < -5 ? 'falling' : 'stable'
              const low = getP10LowInRange(startYr, endYr)

              let verdict: string
              if (direction === 'rising' && low >= 3490) {
                verdict = 'the lake improves — power generation is secure and the trend is positive.'
              } else if (direction === 'rising' && low >= 3370) {
                verdict = 'the lake trends upward, but drought could still threaten power generation.'
              } else if (direction === 'rising') {
                verdict = 'the lake is rising overall, but severe drought could push it dangerously low.'
              } else if (direction === 'stable' && low >= 3490) {
                verdict = 'the lake holds steady with power generation secure.'
              } else if (direction === 'stable') {
                verdict = 'the lake holds steady, but drought vulnerability remains.'
              } else if (low >= 3490) {
                verdict = 'the lake is declining, though power generation stays online in most scenarios.'
              } else if (low >= 3370) {
                verdict = 'the lake is declining with significant risk to power generation.'
              } else {
                verdict = 'the lake faces serious decline with risk of reaching dead pool.'
              }

              return { label, rangeLabel, medianStart: pStart.p50, medianEnd: pEnd.p50, p10Low: low, direction, change, verdict }
            }

            const phases: PhaseAssessment[] = []

            if (yearsToProject <= 5) {
              phases.push(buildPhase('Short-term', `1–${yearsToProject} yr`, 0, yearsToProject))
            } else if (yearsToProject <= 15) {
              phases.push(buildPhase('Short-term', '1–5 yr', 0, 5))
              phases.push(buildPhase('Medium-term', `5–${yearsToProject} yr`, 5, yearsToProject))
            } else {
              phases.push(buildPhase('Short-term', '1–5 yr', 0, 5))
              phases.push(buildPhase('Medium-term', '5–15 yr', 5, 15))
              phases.push(buildPhase('Long-term', `15–${yearsToProject} yr`, 15, yearsToProject))
            }

            const dirColor = (d: 'rising' | 'falling' | 'stable') =>
              d === 'rising' ? 'text-emerald-700' : d === 'falling' ? 'text-red-700' : 'text-gray-700'

            const dirArrow = (d: 'rising' | 'falling' | 'stable') =>
              d === 'rising' ? '↑' : d === 'falling' ? '↓' : '→'

            return (
              <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 sm:px-5 py-3.5 space-y-3">
                <p className="text-sm text-gray-700 leading-relaxed">
                  <span className="font-semibold text-gray-900">Bottom line: </span>
                  Under the <span className="font-medium">{policy.name}</span> policy over {yearsToProject} years,
                  the lake is projected to {dirPhrase}.
                  {powerPhrase ? ` ${powerPhrase}` : ''}
                  {recoveryPhrase ? ` ${recoveryPhrase}` : ''}
                  {droughtPhrase}
                </p>

                <div className="space-y-2 pt-1 border-t border-gray-200">
                  {phases.map((phase) => (
                    <div key={phase.label} className="flex items-start gap-2">
                      <span className={`text-sm font-semibold mt-px ${dirColor(phase.direction)}`}>
                        {dirArrow(phase.direction)}
                      </span>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        <span className="font-semibold text-gray-900">{phase.label}</span>
                        <span className="text-gray-400"> ({phase.rangeLabel})</span>
                        {': '}
                        <span className={`font-medium ${dirColor(phase.direction)}`}>
                          {phase.direction === 'rising'
                            ? `+${phase.change.toFixed(0)} ft`
                            : phase.direction === 'falling'
                              ? `${phase.change.toFixed(0)} ft`
                              : 'steady'}
                        </span>
                        {' to ~'}{phase.medianEnd.toFixed(0)} ft — {phase.verdict}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Detailed breakdown */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-6 space-y-5">
            {/* Where the lake ends up */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Where the lake ends up</h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                After {yearsToProject} year{yearsToProject > 1 ? 's' : ''}, the lake is most likely to be around{' '}
                <span className="font-semibold text-gray-900">{summary.medianEndingElevation.toFixed(0)} ft</span>.
                In an optimistic scenario it could reach{' '}
                <span className="text-blue-700 font-medium">{summary.p90EndingElevation.toFixed(0)} ft</span>,
                while a pessimistic scenario puts it at{' '}
                <span className="text-amber-700 font-medium">{summary.p10EndingElevation.toFixed(0)} ft</span>.
              </p>
            </div>

            {/* Highs and lows along the way */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Highs and lows along the way</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50/60 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-blue-600 mb-0.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span className="text-[10px] uppercase tracking-wide font-medium">Peak elevation</span>
                  </div>
                  <p className="text-lg font-light text-gray-900">{summary.highestElevationReached.p50.toFixed(0)} ft</p>
                  <p className="text-[10px] text-gray-400">typical high point reached</p>
                </div>
                <div className="bg-amber-50/60 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-amber-600 mb-0.5">
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span className="text-[10px] uppercase tracking-wide font-medium">Low point</span>
                  </div>
                  <p className="text-lg font-light text-gray-900">{summary.lowestElevationReached.p50.toFixed(0)} ft</p>
                  <p className="text-[10px] text-gray-400">typical low point reached</p>
                </div>
              </div>
            </div>

            {/* Critical thresholds */}
            {(() => {
              const dp = result!.dailyPercentiles
              const startElev = startMode === 'today' ? currentElevation : customElevation

              const timelineFor = (threshold: number, dir: 'below' | 'above', prob: number, probCutoff: number): string | null => {
                if (dir === 'below' && startElev < threshold) return 'Already below this level'
                if (dir === 'below' && prob >= probCutoff) return null
                if (dir === 'above' && prob <= (100 - probCutoff)) return null
                return findMedianCrossingTimeline(dp, threshold, dir)
              }

              const minPowerRaw = timelineFor(3490, 'below', thresholds.stayAboveMinPower, 90)
              const healthyRaw = timelineFor(3525, 'below', thresholds.stayAbove3525, 90)
              const deadPoolRaw = timelineFor(3370, 'below', thresholds.stayAboveDeadPool, 90)
              const recoveryRaw = thresholds.reachRecoveryTarget > 10
                ? findMedianCrossingTimeline(dp, 3660, 'above')
                : null

              const minPowerTimeline = minPowerRaw === 'Already below this level' ? minPowerRaw
                : minPowerRaw ? `Median drops below this ${minPowerRaw}` : null
              const healthyTimeline = healthyRaw === 'Already below this level' ? healthyRaw
                : healthyRaw ? `Median drops below this ${healthyRaw}` : null
              const deadPoolTimeline = deadPoolRaw === 'Already below this level' ? deadPoolRaw
                : deadPoolRaw ? `Median reaches dead pool ${deadPoolRaw}` : null
              const recoveryTimeline = recoveryRaw
                ? `Median could reach this level ${recoveryRaw}` : null

              const rampProbs = thresholds.rampProbabilities
              const bestRampProb = rampProbs.length > 0
                ? Math.max(...rampProbs.map((r) => r.probabilityAccessible)) : null
              const worstRampProb = rampProbs.length > 0
                ? Math.min(...rampProbs.map((r) => r.probabilityAccessible)) : null
              const rampSummaryProb = rampProbs.length > 0
                ? Math.round(rampProbs.reduce((sum, r) => sum + r.probabilityAccessible, 0) / rampProbs.length * 10) / 10
                : null
              const accessibleCount = rampProbs.filter((r) => r.probabilityAccessible >= 50).length

              const rampTimeline = rampProbs.length > 0 && rampSummaryProb !== null && rampSummaryProb < 90
                ? (() => {
                    const lowestRamp = rampProbs.reduce((a, b) => a.elevation < b.elevation ? a : b)
                    if (startElev < lowestRamp.elevation) return 'Most ramps currently inaccessible'
                    const raw = findMedianCrossingTimeline(dp, lowestRamp.elevation, 'below')
                    return raw ? `Lowest ramp at risk ${raw}` : null
                  })()
                : null

              return (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Can the lake sustain this policy?</h4>
                  <div className="space-y-2">
                    {/* Hydropower */}
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wide font-medium text-gray-400 px-1">Hydropower</p>
                      <OutcomeRow
                        label="Sustains full power generation"
                        detail="Lake stays above 3,525 ft — turbines operate at full head and efficiency"
                        probability={thresholds.stayAbove3525}
                        timeline={healthyTimeline}
                        percentLabel="Above 3,525 ft"
                      />
                      <OutcomeRow
                        label="Sustains partial power generation"
                        detail="Lake stays above 3,490 ft — turbines can run at reduced output above this level"
                        probability={thresholds.stayAboveMinPower}
                        timeline={minPowerTimeline}
                        percentLabel="Power stays on"
                      />
                    </div>

                    {/* Recreation */}
                    {rampProbs.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wide font-medium text-gray-400 px-1">Recreation</p>
                        <OutcomeRow
                          label="Boat ramp access"
                          detail={
                            accessibleCount === rampProbs.length
                              ? `All ${rampProbs.length} favorite ramps stay accessible`
                              : accessibleCount > 0
                                ? `${accessibleCount} of ${rampProbs.length} favorite ramps likely stay open`
                                : `None of your ${rampProbs.length} favorite ramps are likely to stay open`
                          }
                          probability={rampSummaryProb ?? 0}
                          timeline={rampTimeline}
                          percentLabel="Ramps stay open"
                        />
                      </div>
                    )}

                    {/* Downstream */}
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wide font-medium text-gray-400 px-1">Downstream releases</p>
                      <OutcomeRow
                        label="Controlled releases possible"
                        detail="Lake stays above 3,370 ft (dead pool) — below this, water sits below the dam's outlets and no managed releases can be made"
                        probability={thresholds.stayAboveDeadPool}
                        timeline={deadPoolTimeline}
                        percentLabel="Above dead pool"
                      />
                    </div>

                    {/* Full pool */}
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wide font-medium text-gray-400 px-1">Recovery</p>
                      <OutcomeRow
                        label="Lake reaches healthy recovery"
                        detail="Lake rises to 3,660 ft (~90% capacity) — strong buffer for drought resilience and full operations"
                        probability={thresholds.reachRecoveryTarget}
                        invertColor
                        timeline={recoveryTimeline}
                        percentLabel="Reaches 3,660 ft"
                      />
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Stabilization outlook */}
            {(() => {
              const startElev = startMode === 'today' ? currentElevation : customElevation
              const stab = analyzeStabilization(result!.dailyPercentiles, startElev, yearsToProject)

              const trendIcon = stab.direction === 'rising'
                ? <TrendingUp className="w-4 h-4 text-emerald-600" />
                : stab.direction === 'falling'
                  ? <TrendingDown className="w-4 h-4 text-red-600" />
                  : <span className="w-4 h-4 text-gray-400">—</span>

              const trendColor = stab.direction === 'rising'
                ? 'text-emerald-700' : stab.direction === 'falling'
                  ? 'text-red-700' : 'text-gray-700'

              const confidenceLabel = stab.confidenceLevel === 'high'
                ? 'Strong' : stab.confidenceLevel === 'moderate'
                  ? 'Moderate' : stab.confidenceLevel === 'low'
                    ? 'Weak' : 'None'

              const confidenceColor = stab.confidenceLevel === 'high'
                ? 'text-emerald-600' : stab.confidenceLevel === 'moderate'
                  ? 'text-teal-600' : stab.confidenceLevel === 'low'
                    ? 'text-amber-600' : 'text-red-600'

              return (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Long-term outlook</h4>
                  <div className={`rounded-lg px-4 py-3 ${
                    stab.direction === 'rising' ? 'bg-emerald-50/60' :
                    stab.direction === 'falling' ? 'bg-red-50/60' : 'bg-gray-50'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{trendIcon}</div>
                      <div className="space-y-2 flex-1">
                        <p className="text-sm text-gray-700 leading-relaxed">
                          {stab.direction === 'rising' ? (
                            <>
                              Under this policy, the lake is <span className={`font-semibold ${trendColor}`}>trending upward</span>,
                              gaining roughly {Math.abs(stab.netChange).toFixed(0)} ft over {yearsToProject} years.
                            </>
                          ) : stab.direction === 'falling' ? (
                            <>
                              Under this policy, the lake is <span className={`font-semibold ${trendColor}`}>trending downward</span>,
                              losing roughly {Math.abs(stab.netChange).toFixed(0)} ft over {yearsToProject} years.
                            </>
                          ) : (
                            <>
                              Under this policy, the lake <span className={`font-semibold ${trendColor}`}>holds roughly steady</span> over {yearsToProject} years.
                            </>
                          )}
                        </p>

                        {stab.troughElevation !== null && stab.monthsToTrough !== null && stab.monthsToTrough > 1 && (
                          <p className="text-xs text-gray-500">
                            The lake likely dips to around <span className="font-medium text-gray-700">{stab.troughElevation.toFixed(0)} ft</span> at
                            roughly {stab.monthsToTrough < 12
                              ? `${stab.monthsToTrough} month${stab.monthsToTrough > 1 ? 's' : ''}`
                              : `${(stab.monthsToTrough / 12).toFixed(1)} years`}
                            {stab.recoversToStart && stab.monthsToRecovery != null
                              ? <> before recovering to its starting level around {stab.monthsToRecovery < 12
                                  ? `${stab.monthsToRecovery} months`
                                  : `${(stab.monthsToRecovery / 12).toFixed(1)} years`}.</>
                              : stab.direction === 'rising'
                                ? <>, then continues climbing.</>
                                : <>.{' '}It does not fully recover to its starting level within {yearsToProject} years.</>
                            }
                          </p>
                        )}

                        <div className="flex items-center gap-4 pt-1 text-xs">
                          <div>
                            <span className="text-gray-400">Confidence: </span>
                            <span className={`font-semibold ${confidenceColor}`}>{confidenceLabel}</span>
                          </div>
                          <div className="text-gray-400">
                            {stab.p10Rising
                              ? 'Even pessimistic scenarios show improvement'
                              : stab.direction === 'falling'
                                ? 'Most scenarios continue declining'
                                : 'Pessimistic scenarios still show some decline'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Drought vulnerability analysis */}
            {(() => {
              const dp = result!.dailyPercentiles
              if (dp.length < 10) return null

              const startDate = new Date(dp[0].date)
              const currentElev = startMode === 'today' ? currentElevation : customElevation

              const MIN_POWER = 3490
              const DEAD_POOL = 3370
              const HEALTHY = 3525

              // Find the most vulnerable window: where p10 is closest to each threshold
              // while median is still above it
              interface Vulnerability {
                label: string
                elevation: number
                narrowestMargin: number
                worstMonthsOut: number
                p10AtWorst: number
                p50AtWorst: number
                breachesP10: boolean
                breachMonthsP10: number | null
                recoversP10: boolean
                recoveryMonthsP10: number | null
                vulnerableWindowMonths: number | null
              }

              const vulnerabilities: Vulnerability[] = []

              const msPerMonth = 1000 * 60 * 60 * 24 * 30.44
              const toMonths = (idx: number) =>
                Math.round((new Date(dp[idx].date).getTime() - startDate.getTime()) / msPerMonth)

              const allThresholds = [
                { label: 'power generation (3,490 ft)', elevation: MIN_POWER },
                { label: 'mid-elevation health (3,525 ft)', elevation: HEALTHY },
                { label: 'dead pool (3,370 ft)', elevation: DEAD_POOL },
                ...favoriteRamps
                  .filter((r) => r.elevation > DEAD_POOL && r.elevation < 3700)
                  .map((r) => ({ label: `${r.name} (${r.elevation.toLocaleString()} ft)`, elevation: r.elevation })),
              ]

              // Only analyze things we currently have — can't lose what's already gone
              const rampThresholds = allThresholds.filter((t) => currentElev >= t.elevation)

              for (const th of rampThresholds) {
                let narrowestMargin = Infinity
                let worstIdx = 0
                let breachIdx: number | null = null
                let recoveryIdx: number | null = null

                for (let i = 1; i < dp.length; i++) {
                  const margin = dp[i].p10 - th.elevation
                  if (margin < narrowestMargin) {
                    narrowestMargin = margin
                    worstIdx = i
                  }
                  if (breachIdx === null && dp[i].p10 < th.elevation) {
                    breachIdx = i
                  }
                }

                // After worst point, find when p10 recovers above threshold
                if (breachIdx !== null) {
                  for (let i = worstIdx + 1; i < dp.length; i++) {
                    if (dp[i].p10 >= th.elevation) {
                      recoveryIdx = i
                      break
                    }
                  }
                }

                const breachMonths = breachIdx !== null ? toMonths(breachIdx) : null
                const recoveryMonths = recoveryIdx !== null ? toMonths(recoveryIdx) : null
                const windowMonths = breachMonths !== null && recoveryMonths !== null
                  ? recoveryMonths - breachMonths
                  : null

                vulnerabilities.push({
                  label: th.label,
                  elevation: th.elevation,
                  narrowestMargin: Math.round(narrowestMargin),
                  worstMonthsOut: toMonths(worstIdx),
                  p10AtWorst: dp[worstIdx].p10,
                  p50AtWorst: dp[worstIdx].p50,
                  breachesP10: breachIdx !== null,
                  breachMonthsP10: breachMonths,
                  recoversP10: recoveryIdx !== null,
                  recoveryMonthsP10: recoveryMonths,
                  vulnerableWindowMonths: windowMonths,
                })
              }

              // Only the ones that are actually at risk (margin < 100 ft or breached)
              const atRisk = vulnerabilities.filter((v) => v.breachesP10 || v.narrowestMargin < 100)
              if (atRisk.length === 0) return null

              const formatTime = (months: number) => {
                if (months < 1) return 'immediately'
                if (months < 12) return `around ${months} month${months > 1 ? 's' : ''} in`
                const yr = months / 12
                return yr < 2 ? `around ${months} months in` : `around year ${yr.toFixed(1)}`
              }

              // Most critical: first breach or narrowest margin
              const breached = atRisk.filter((v) => v.breachesP10)
              const nearMisses = atRisk.filter((v) => !v.breachesP10)

              return (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Drought vulnerability</h4>
                  <div className="rounded-lg bg-amber-50/60 px-4 py-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="space-y-2 flex-1">
                        {breached.length > 0 ? (
                          <p className="text-sm text-gray-700 leading-relaxed">
                            If the region experiences multiple consecutive dry years, this policy is
                            {' '}<span className="font-semibold text-amber-800">vulnerable</span> at key levels.
                            In a worst-case drought scenario (bottom 10% of outcomes):
                          </p>
                        ) : (
                          <p className="text-sm text-gray-700 leading-relaxed">
                            This policy shows some resilience to drought, but a sustained dry period would
                            {' '}<span className="font-semibold text-amber-700">tighten margins</span> at critical levels:
                          </p>
                        )}

                        <ul className="space-y-2.5 text-xs text-gray-600">
                          {breached
                            .sort((a, b) => (a.breachMonthsP10 ?? 0) - (b.breachMonthsP10 ?? 0))
                            .map((v) => (
                            <li key={v.label} className="space-y-1">
                              <div className="flex items-start gap-1.5">
                                <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                                <span>
                                  <span className="font-medium text-red-700">Loss of {v.label}</span>
                                  {' '}— at risk starting {formatTime(v.breachMonthsP10 ?? 0)}.
                                </span>
                              </div>
                              <div className="ml-5 text-[11px] text-gray-500 space-y-0.5">
                                <p>
                                  Worst point: lake could dip to{' '}
                                  <span className="font-medium text-gray-700">{v.p10AtWorst.toFixed(0)} ft</span>
                                  {' '}{formatTime(v.worstMonthsOut)}.
                                </p>
                                {v.recoversP10 && v.recoveryMonthsP10 != null ? (
                                  <p className="text-emerald-700">
                                    Improves: drought risk clears {formatTime(v.recoveryMonthsP10)} as the lake rebuilds
                                    {v.vulnerableWindowMonths != null && (
                                      <> (vulnerable window: ~{v.vulnerableWindowMonths < 12
                                        ? `${v.vulnerableWindowMonths} months`
                                        : `${(v.vulnerableWindowMonths / 12).toFixed(1)} years`})</>
                                    )}.
                                  </p>
                                ) : (
                                  <p className="text-red-600/70">
                                    Does not recover above this level within the projection period.
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                          {nearMisses.map((v) => (
                            <li key={v.label} className="space-y-1">
                              <div className="flex items-start gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                                <span>
                                  <span className="font-medium text-amber-700">{v.label.charAt(0).toUpperCase() + v.label.slice(1)}</span>
                                  {' '}comes within <span className="font-medium">{v.narrowestMargin} ft</span>
                                  {' '}of being threatened {formatTime(v.worstMonthsOut)}.
                                </span>
                              </div>
                              <p className="ml-5 text-[11px] text-gray-500">
                                Margin is tightest {formatTime(v.worstMonthsOut)}, then improves as the lake stabilizes.
                              </p>
                            </li>
                          ))}
                        </ul>

                        {breached.length > 0 && (
                          <p className="text-[11px] text-gray-500 pt-1 border-t border-amber-100 mt-2">
                            These represent the worst 10% of outcomes — multiple consecutive dry years.
                            The typical outcome (median) stays above {breached[0].label} at{' '}
                            <span className="font-medium">{breached[0].p50AtWorst.toFixed(0)} ft</span>.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Individual ramp detail */}
            {thresholds.rampProbabilities.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Ramp-by-ramp detail</h4>
                <p className="text-xs text-gray-500 mb-2">Individual outlook for each of your favorite ramps</p>
                <div className="space-y-2">
                  {thresholds.rampProbabilities.map((ramp) => {
                    const startElev = startMode === 'today' ? currentElevation : customElevation
                    const alreadyClosed = startElev < ramp.elevation
                    let rampTimeline: string | null = null
                    if (alreadyClosed) {
                      rampTimeline = 'Currently inaccessible'
                    } else if (ramp.probabilityAccessible < 90) {
                      const raw = findMedianCrossingTimeline(result!.dailyPercentiles, ramp.elevation, 'below')
                      if (raw) rampTimeline = `Ramp likely closes ${raw}`
                    }
                    return (
                      <OutcomeRow
                        key={ramp.rampName}
                        label={ramp.rampName}
                        detail={`Requires ${ramp.elevation.toLocaleString()} ft`}
                        probability={ramp.probabilityAccessible}
                        timeline={rampTimeline}
                        percentLabel="Ramp stays open"
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* Detailed statistics — collapsible */}
            <details className="group border-t border-gray-100 pt-3">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 transition-colors font-medium select-none">
                Detailed statistics
              </summary>
              <div className="mt-3 space-y-4">
                {/* Ending elevation distribution */}
                <div className="overflow-x-auto">
                  <h5 className="text-[10px] uppercase tracking-wide font-medium text-gray-500 mb-2">Ending elevation distribution</h5>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100">
                        <th className="text-left py-1 font-medium">Percentile</th>
                        <th className="text-left py-1 font-medium hidden sm:table-cell">Meaning</th>
                        <th className="text-right py-1 font-medium">Elevation</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600">
                      <tr className="border-b border-gray-50">
                        <td className="py-1.5">90th</td>
                        <td className="py-1.5 text-gray-400 hidden sm:table-cell">Only 10% of scenarios do better</td>
                        <td className="py-1.5 text-right font-medium">{summary.p90EndingElevation.toFixed(1)} ft</td>
                      </tr>
                      <tr className="border-b border-gray-50 bg-teal-50/40">
                        <td className="py-1.5 font-medium text-teal-700">50th (median)</td>
                        <td className="py-1.5 text-gray-400 hidden sm:table-cell">The middle outcome</td>
                        <td className="py-1.5 text-right font-medium text-teal-700">{summary.medianEndingElevation.toFixed(1)} ft</td>
                      </tr>
                      <tr>
                        <td className="py-1.5">10th</td>
                        <td className="py-1.5 text-gray-400 hidden sm:table-cell">Only 10% of scenarios do worse</td>
                        <td className="py-1.5 text-right font-medium">{summary.p10EndingElevation.toFixed(1)} ft</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Extremes reached */}
                <div className="overflow-x-auto">
                  <h5 className="text-[10px] uppercase tracking-wide font-medium text-gray-500 mb-2">Extremes reached during projection</h5>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100">
                        <th className="text-left py-1 font-medium">Metric</th>
                        <th className="text-right py-1 font-medium">Best 10%</th>
                        <th className="text-right py-1 font-medium">Typical</th>
                        <th className="text-right py-1 font-medium">Worst 10%</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600">
                      <tr className="border-b border-gray-50">
                        <td className="py-1.5">Highest elevation reached</td>
                        <td className="py-1.5 text-right">{summary.highestElevationReached.p90.toFixed(1)} ft</td>
                        <td className="py-1.5 text-right font-medium">{summary.highestElevationReached.p50.toFixed(1)} ft</td>
                        <td className="py-1.5 text-right">{summary.highestElevationReached.p10.toFixed(1)} ft</td>
                      </tr>
                      <tr>
                        <td className="py-1.5">Lowest elevation reached</td>
                        <td className="py-1.5 text-right">{summary.lowestElevationReached.p90.toFixed(1)} ft</td>
                        <td className="py-1.5 text-right font-medium">{summary.lowestElevationReached.p50.toFixed(1)} ft</td>
                        <td className="py-1.5 text-right">{summary.lowestElevationReached.p10.toFixed(1)} ft</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Threshold probabilities */}
                <div className="overflow-x-auto">
                  <h5 className="text-[10px] uppercase tracking-wide font-medium text-gray-500 mb-2">Threshold probabilities</h5>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100">
                        <th className="text-left py-1 font-medium">Condition</th>
                        <th className="text-left py-1 font-medium hidden sm:table-cell">Elevation</th>
                        <th className="text-right py-1 font-medium">Probability</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600">
                      <tr className="border-b border-gray-50">
                        <td className="py-1.5">Stay above dead pool</td>
                        <td className="py-1.5 hidden sm:table-cell">3,370 ft</td>
                        <td className="py-1.5 text-right font-medium">{thresholds.stayAboveDeadPool}%</td>
                      </tr>
                      <tr className="border-b border-gray-50">
                        <td className="py-1.5">Stay above min power pool</td>
                        <td className="py-1.5 hidden sm:table-cell">3,490 ft</td>
                        <td className="py-1.5 text-right font-medium">{thresholds.stayAboveMinPower}%</td>
                      </tr>
                      <tr className="border-b border-gray-50">
                        <td className="py-1.5">Stay above mid-elevation target</td>
                        <td className="py-1.5 hidden sm:table-cell">3,525 ft</td>
                        <td className="py-1.5 text-right font-medium">{thresholds.stayAbove3525}%</td>
                      </tr>
                      <tr className="border-b border-gray-50">
                        <td className="py-1.5">Reach 90% capacity</td>
                        <td className="py-1.5 hidden sm:table-cell">3,660 ft</td>
                        <td className="py-1.5 text-right font-medium">{thresholds.reachRecoveryTarget}%</td>
                      </tr>
                      <tr className="border-b border-gray-50">
                        <td className="py-1.5">Reach full pool</td>
                        <td className="py-1.5 hidden sm:table-cell">3,700 ft</td>
                        <td className="py-1.5 text-right font-medium">{thresholds.reachFullPool}%</td>
                      </tr>
                      {thresholds.rampProbabilities.map((ramp) => (
                        <tr key={`detail-${ramp.rampName}`} className="border-b border-gray-50">
                          <td className="py-1.5">{ramp.rampName} stays accessible</td>
                          <td className="py-1.5 hidden sm:table-cell">{ramp.elevation.toLocaleString()} ft</td>
                          <td className="py-1.5 text-right font-medium">{ramp.probabilityAccessible}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Year-by-year stabilization */}
                {(() => {
                  const startElev = startMode === 'today' ? currentElevation : customElevation
                  const stab = analyzeStabilization(result!.dailyPercentiles, startElev, yearsToProject)
                  if (stab.yearlyTrend.length === 0) return null
                  return (
                    <div className="overflow-x-auto">
                      <h5 className="text-[10px] uppercase tracking-wide font-medium text-gray-500 mb-2">Year-by-year stabilization trend</h5>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-gray-400">
                            <th className="text-left py-1 font-medium">Year</th>
                            <th className="text-right py-1 font-medium">Median</th>
                            <th className="text-right py-1 font-medium">Change</th>
                            <th className="text-right py-1 font-medium hidden sm:table-cell">Cumulative</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-600">
                          {stab.yearlyTrend.map((yr) => (
                            <tr key={yr.year} className="border-b border-gray-50">
                              <td className="py-1.5">{yr.year}</td>
                              <td className="py-1.5 text-right font-medium">{yr.medianElev.toFixed(1)} ft</td>
                              <td className={`py-1.5 text-right font-medium ${yr.change > 0 ? 'text-emerald-600' : yr.change < -1 ? 'text-red-600' : 'text-gray-500'}`}>
                                {yr.change > 0 ? '+' : ''}{yr.change.toFixed(1)} ft
                              </td>
                              <td className={`py-1.5 text-right hidden sm:table-cell ${(yr.medianElev - startElev) > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {(yr.medianElev - startElev) > 0 ? '+' : ''}{(yr.medianElev - startElev).toFixed(1)} ft
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })()}

                {/* Simulation parameters */}
                <div>
                  <h5 className="text-[10px] uppercase tracking-wide font-medium text-gray-500 mb-2">Simulation parameters</h5>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-500">
                    <div>Scenarios: <span className="text-gray-700 font-medium">{result!.iterations.toLocaleString()}</span></div>
                    <div>Time horizon: <span className="text-gray-700 font-medium">{yearsToProject} years</span></div>
                    <div>Start elevation: <span className="text-gray-700 font-medium">{(startMode === 'today' ? currentElevation : customElevation).toFixed(1)} ft</span></div>
                    <div>Policy: <span className="text-gray-700 font-medium">{policy.name}</span></div>
                    <div>Inflow window: <span className="text-gray-700 font-medium">{inflowScenario === 'full' ? 'Full history' : `Last ${inflowScenario.replace('last', '')} years`}</span></div>
                    <div>Compute time: <span className="text-gray-700 font-medium">{result!.computeTimeMs}ms</span></div>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Policy Comparison */}
      <PolicyComparison
        inflowScenario={inflowScenario}
        demandGrowthPctPerYear={STREAMFLOW_TRENDS[streamflowTrend].demandGrowthPct}
        demandGrowthMaxReduction={STREAMFLOW_TRENDS[streamflowTrend].demandMaxReduction}
        dryingTrendPctPerYear={STREAMFLOW_TRENDS[streamflowTrend].dryingPct}
        dryingTrendMaxReduction={STREAMFLOW_TRENDS[streamflowTrend].maxReduction}
        augmentation={getAugmentation(augmentationKey)}
        yearsToProject={yearsToProject}
        startMode={startMode}
        customElevation={customElevation}
        favoriteRamps={favoriteRamps}
      />
    </div>
  )
}

interface StabilizationAnalysis {
  netChange: number
  direction: 'rising' | 'falling' | 'stable'
  troughDay: number | null
  troughElevation: number | null
  monthsToTrough: number | null
  recoversToStart: boolean
  recoveryDay: number | null
  monthsToRecovery: number | null
  p10Rising: boolean
  yearlyTrend: Array<{ year: number; medianElev: number; change: number }>
  confidenceLevel: 'high' | 'moderate' | 'low' | 'none'
}

function analyzeStabilization(
  dailyPercentiles: Array<{ date: string; p10: number; p50: number; p90: number }>,
  startElevation: number,
  yearsToProject: number
): StabilizationAnalysis {
  if (dailyPercentiles.length < 2) {
    return {
      netChange: 0, direction: 'stable', troughDay: null, troughElevation: null,
      monthsToTrough: null, recoversToStart: false, recoveryDay: null,
      monthsToRecovery: null, p10Rising: false, yearlyTrend: [],
      confidenceLevel: 'none',
    }
  }

  const endMedian = dailyPercentiles[dailyPercentiles.length - 1].p50
  const netChange = endMedian - startElevation

  // Find the trough (lowest median point)
  let troughIdx = 0
  let troughVal = dailyPercentiles[0].p50
  for (let i = 1; i < dailyPercentiles.length; i++) {
    if (dailyPercentiles[i].p50 < troughVal) {
      troughVal = dailyPercentiles[i].p50
      troughIdx = i
    }
  }

  // Estimate days per output point
  const totalDays = yearsToProject * 365
  const daysPerPoint = totalDays / (dailyPercentiles.length - 1)
  const troughDay = Math.round(troughIdx * daysPerPoint)
  const monthsToTrough = Math.round(troughDay / 30.44)

  // Does the median recover to starting elevation after the trough?
  let recoversToStart = false
  let recoveryDay: number | null = null
  let monthsToRecovery: number | null = null
  if (troughIdx < dailyPercentiles.length - 1) {
    for (let i = troughIdx + 1; i < dailyPercentiles.length; i++) {
      if (dailyPercentiles[i].p50 >= startElevation) {
        recoversToStart = true
        recoveryDay = Math.round(i * daysPerPoint)
        monthsToRecovery = Math.round(recoveryDay / 30.44)
        break
      }
    }
  }

  // Check if even the pessimistic (p10) scenario is rising by end
  const lastQuarter = Math.floor(dailyPercentiles.length * 0.75)
  const p10End = dailyPercentiles[dailyPercentiles.length - 1].p10
  const p10LastQuarter = dailyPercentiles[lastQuarter]?.p10 ?? p10End
  const p10Rising = p10End > p10LastQuarter

  // Yearly median snapshots (sample at ~365-day intervals)
  const yearlyTrend: Array<{ year: number; medianElev: number; change: number }> = []
  const pointsPerYear = Math.round(365 / daysPerPoint)
  let prevElev = startElevation
  for (let y = 1; y <= yearsToProject; y++) {
    const idx = Math.min(y * pointsPerYear, dailyPercentiles.length - 1)
    const medianElev = dailyPercentiles[idx].p50
    yearlyTrend.push({ year: y, medianElev, change: medianElev - prevElev })
    prevElev = medianElev
  }

  // Overall direction
  const direction: 'rising' | 'falling' | 'stable' =
    netChange > 5 ? 'rising' : netChange < -5 ? 'falling' : 'stable'

  // Confidence in stabilization
  const risingYears = yearlyTrend.filter((y) => y.change > 0).length
  const totalYears = yearlyTrend.length
  let confidenceLevel: 'high' | 'moderate' | 'low' | 'none'
  if (direction === 'rising' && p10Rising && risingYears >= totalYears * 0.6) {
    confidenceLevel = 'high'
  } else if (direction !== 'falling' && risingYears >= totalYears * 0.4) {
    confidenceLevel = 'moderate'
  } else if (recoversToStart || risingYears > 0) {
    confidenceLevel = 'low'
  } else {
    confidenceLevel = 'none'
  }

  return {
    netChange, direction,
    troughDay, troughElevation: troughVal, monthsToTrough,
    recoversToStart, recoveryDay, monthsToRecovery,
    p10Rising, yearlyTrend, confidenceLevel,
  }
}

function findMedianCrossingTimeline(
  dailyPercentiles: Array<{ date: string; p50: number }>,
  threshold: number,
  direction: 'below' | 'above'
): string | null {
  if (dailyPercentiles.length < 2) return null

  for (let i = 1; i < dailyPercentiles.length; i++) {
    const crossed = direction === 'below'
      ? dailyPercentiles[i].p50 < threshold
      : dailyPercentiles[i].p50 > threshold
    if (crossed) {
      const startDate = new Date(dailyPercentiles[0].date)
      const crossDate = new Date(dailyPercentiles[i].date)
      const diffMs = crossDate.getTime() - startDate.getTime()
      const diffMonths = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44))

      if (diffMonths < 1) return 'within weeks'
      if (diffMonths < 12) return `within ~${diffMonths} month${diffMonths > 1 ? 's' : ''}`

      const years = (diffMonths / 12)
      if (years < 2) return `within ~${diffMonths} months`
      return `within ~${years.toFixed(1)} years`
    }
  }
  return null
}

function OutcomeRow({
  label,
  detail,
  probability,
  invertColor = false,
  timeline,
  percentLabel,
}: {
  label: string
  detail: string
  probability: number
  invertColor?: boolean
  timeline?: string | null
  percentLabel?: string
}) {
  const effective = invertColor ? probability : probability

  const verdict =
    effective >= 90 ? 'Very likely' :
    effective >= 70 ? 'Likely' :
    effective >= 40 ? 'Uncertain' :
    effective > 0 ? 'Unlikely' : 'No'
  const verdictFull = effective === 100 ? 'Yes' : effective === 0 ? 'No' : verdict

  const colorClass =
    effective >= 90 ? 'text-emerald-600' :
    effective >= 70 ? 'text-teal-600' :
    effective >= 40 ? 'text-amber-600' : 'text-red-600'

  const bgClass =
    effective >= 90 ? 'bg-emerald-50' :
    effective >= 70 ? 'bg-teal-50' :
    effective >= 40 ? 'bg-amber-50' : 'bg-red-50'

  const Icon =
    effective >= 90 ? CheckCircle2 :
    effective >= 40 ? AlertTriangle : XCircle

  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${bgClass}`}>
      <Icon className={`w-5 h-5 flex-shrink-0 ${colorClass}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 font-medium leading-tight">{label}</p>
        <p className="text-[11px] text-gray-500 leading-tight">{detail}</p>
        {timeline && (
          <p className="text-[11px] text-amber-700 font-medium leading-tight mt-0.5">{timeline}</p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-lg font-semibold leading-tight ${colorClass}`}>
          {verdictFull}
        </p>
        {effective > 0 && effective < 100 && (
          <p className="text-[10px] text-gray-400 max-w-[130px] leading-snug">
            {percentLabel ?? (invertColor ? 'Happens' : 'Holds')} in {effective}% of simulations
          </p>
        )}
      </div>
    </div>
  )
}
