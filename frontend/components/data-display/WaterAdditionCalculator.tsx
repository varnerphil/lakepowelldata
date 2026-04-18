'use client'

import { useState, useMemo } from 'react'
import { ElevationStorageCapacity } from '@/lib/db'

interface WaterAdditionCalculatorProps {
  elevationStorageData: ElevationStorageCapacity[]
  currentElevation: number
}

const RAMP_MARKERS = [
  { name: 'Hite', elevation: 3650 },
  { name: 'Antelope Pt', elevation: 3588 },
  { name: 'The Cut', elevation: 3583 },
  { name: 'Bullfrog', elevation: 3578 },
  { name: 'Wahweap', elevation: 3550 },
  { name: 'Halls', elevation: 3556 },
  { name: 'Stateline', elevation: 3520 },
]

const PRESETS = [
  { label: '1 MAF (Flaming Gorge)', value: 1.0 },
  { label: '1.48 MAF (reduced releases)', value: 1.48 },
  { label: '2.48 MAF (both combined)', value: 2.48 },
  { label: '3 MAF', value: 3.0 },
  { label: '4 MAF', value: 4.0 },
]

export default function WaterAdditionCalculator({
  elevationStorageData,
  currentElevation,
}: WaterAdditionCalculatorProps) {
  const [addedMAF, setAddedMAF] = useState(2.48)

  const sorted = useMemo(
    () => [...elevationStorageData].sort((a, b) => a.elevation - b.elevation),
    [elevationStorageData]
  )

  const result = useMemo(() => {
    // Find storage at current elevation via interpolation
    let currentStorage = 0
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].elevation >= currentElevation) {
        const frac =
          (currentElevation - sorted[i - 1].elevation) /
          (sorted[i].elevation - sorted[i - 1].elevation)
        currentStorage =
          sorted[i - 1].storage_at_elevation +
          frac * (sorted[i].storage_at_elevation - sorted[i - 1].storage_at_elevation)
        break
      }
    }

    const targetStorage = currentStorage + addedMAF * 1_000_000

    // Find new elevation
    let newElevation = currentElevation
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].storage_at_elevation >= targetStorage) {
        const frac =
          (targetStorage - sorted[i - 1].storage_at_elevation) /
          (sorted[i].storage_at_elevation - sorted[i - 1].storage_at_elevation)
        newElevation =
          sorted[i - 1].elevation + frac * (sorted[i].elevation - sorted[i - 1].elevation)
        break
      }
    }

    // Cap at full pool
    if (newElevation > 3700) newElevation = 3700

    const rise = newElevation - currentElevation

    // AF per foot at current level
    let afPerFoot = 0
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].elevation >= currentElevation) {
        afPerFoot =
          sorted[i].storage_at_elevation - sorted[i - 1].storage_at_elevation
        break
      }
    }

    // Which ramps are gained
    const currentlyAccessible = RAMP_MARKERS.filter(
      (r) => currentElevation >= r.elevation
    )
    const newlyAccessible = RAMP_MARKERS.filter(
      (r) => currentElevation < r.elevation && newElevation >= r.elevation
    )
    const stillBelow = RAMP_MARKERS.filter(
      (r) => newElevation < r.elevation
    )

    return {
      currentStorage,
      newElevation,
      rise,
      afPerFoot,
      currentlyAccessible,
      newlyAccessible,
      stillBelow,
    }
  }, [currentElevation, addedMAF, sorted])

  // Visual: simplified cross-section
  const VISUAL_MIN = 3370
  const VISUAL_MAX = 3710
  const VISUAL_RANGE = VISUAL_MAX - VISUAL_MIN

  const currentPct = ((currentElevation - VISUAL_MIN) / VISUAL_RANGE) * 100
  const newPct = ((result.newElevation - VISUAL_MIN) / VISUAL_RANGE) * 100
  const risePct = newPct - currentPct

  return (
    <div className="card p-4 sm:p-6 lg:p-8">
      <h3 className="text-lg sm:text-xl font-light text-gray-900 mb-1">
        What does additional water mean for Lake Powell?
      </h3>
      <p className="text-xs sm:text-sm text-gray-500 font-light mb-5">
        See how many feet the lake would rise with additional inflows at the current elevation.
        The canyon is narrower at lower levels, so each acre-foot of water raises the lake more.
      </p>

      {/* MAF selector */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-sm text-gray-600 font-light">Add:</span>
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setAddedMAF(p.value)}
            className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-light transition-colors ${
              addedMAF === p.value
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <input
            type="number"
            min={0.1}
            max={15}
            step={0.1}
            value={addedMAF}
            onChange={(e) => setAddedMAF(Math.max(0.1, Math.min(15, parseFloat(e.target.value) || 0.1)))}
            className="w-16 px-2 py-1.5 text-sm border border-gray-200 rounded-lg text-center focus:outline-none focus:ring-1 focus:ring-teal-400"
          />
          <span className="text-xs text-gray-500">MAF</span>
        </div>
      </div>

      {/* Result headline */}
      <div className="bg-teal-50/60 rounded-xl p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-teal-700/70 mb-1">Lake would rise</div>
            <div className="text-3xl sm:text-4xl font-light text-teal-800">
              +{result.rise.toFixed(1)} ft
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-teal-700/70 mb-1">New elevation</div>
            <div className="text-3xl sm:text-4xl font-light text-teal-800">
              {result.newElevation.toFixed(1)} ft
            </div>
          </div>
          <div className="sm:ml-auto text-right">
            <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">From today</div>
            <div className="text-lg font-light text-gray-600">
              {currentElevation.toFixed(1)} ft
            </div>
          </div>
        </div>

        {/* Context line */}
        <p className="text-xs text-teal-700/80 mt-3 font-light">
          At {currentElevation.toFixed(0)} ft, each foot of rise requires ~{Math.round(result.afPerFoot).toLocaleString()} acre-feet.
          {result.rise > 20 && ' The rate slows as the lake rises because the canyon widens.'}
        </p>
      </div>

      {/* Visual bar */}
      <div className="relative mb-6">
        <div className="flex items-end gap-4">
          {/* Profile bar */}
          <div className="flex-1 relative bg-gray-100 rounded-lg overflow-hidden" style={{ height: '200px' }}>
            {/* Water (current) */}
            <div
              className="absolute bottom-0 left-0 right-0 bg-[#7ca5b8] transition-all duration-300"
              style={{ height: `${currentPct}%` }}
            />
            {/* Added water band */}
            <div
              className="absolute left-0 right-0 bg-teal-400/60 border-t-2 border-teal-500 transition-all duration-300"
              style={{ bottom: `${currentPct}%`, height: `${risePct}%` }}
            />
            {/* Current elevation line */}
            <div
              className="absolute left-0 right-0 border-t-2 border-[#8b9a6b]"
              style={{ bottom: `${currentPct}%` }}
            />

            {/* Ramp markers */}
            {RAMP_MARKERS.filter(r => r.elevation >= VISUAL_MIN + 100 && r.elevation <= VISUAL_MAX - 20).map((r) => {
              const pct = ((r.elevation - VISUAL_MIN) / VISUAL_RANGE) * 100
              const isGained = result.newlyAccessible.some(n => n.name === r.name)
              const isAccessible = currentElevation >= r.elevation
              return (
                <div
                  key={r.name}
                  className="absolute left-0 right-0 border-t border-dashed"
                  style={{
                    bottom: `${pct}%`,
                    borderColor: isGained ? '#0d9488' : isAccessible ? '#8b9a6b80' : '#d1d5db',
                  }}
                >
                  <span
                    className={`absolute right-1 text-[9px] font-light leading-none -translate-y-full ${
                      isGained ? 'text-teal-700 font-medium' : isAccessible ? 'text-[#8b9a6b]' : 'text-gray-400'
                    }`}
                  >
                    {r.name}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-2 text-[10px] text-gray-500 font-light w-20 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-teal-400/60 border border-teal-500" />
              <span>+{addedMAF} MAF</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#7ca5b8]" />
              <span>Current</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200" />
              <span>Empty</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ramps gained/lost summary */}
      {result.newlyAccessible.length > 0 && (
        <div className="bg-emerald-50/60 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm text-emerald-800 font-light">
            <span className="font-medium">Ramps gained with +{addedMAF} MAF:</span>{' '}
            {result.newlyAccessible.map((r) => `${r.name} (${r.elevation.toLocaleString()} ft)`).join(', ')}
          </p>
        </div>
      )}
      {result.stillBelow.length > 0 && (
        <p className="text-xs text-gray-400 font-light">
          Still below: {result.stillBelow.map((r) => `${r.name} (${r.elevation.toLocaleString()} ft)`).join(', ')}
        </p>
      )}
    </div>
  )
}
