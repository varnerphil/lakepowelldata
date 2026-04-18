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

function CanyonProfile({
  elevationStorageData,
  currentElevation,
  newElevation,
  addedMAF,
  rampMarkers,
  newlyAccessible,
}: {
  elevationStorageData: ElevationStorageCapacity[]
  currentElevation: number
  newElevation: number
  addedMAF: number
  rampMarkers: Array<{ name: string; elevation: number }>
  newlyAccessible: Array<{ name: string; elevation: number }>
}) {
  const BAND_HEIGHT = 2
  const minElev = 3370
  const maxElev = 3710

  // Build bands bottom-up, enforcing monotonic width increase (canyon widens upward)
  const bandsBottomUp: Array<{ elevation: number; width: number }> = []
  {
    // Get max capacity for normalization
    const maxCap = Math.max(
      ...elevationStorageData
        .filter((d) => d.storage_per_foot && d.storage_per_foot > 0)
        .map((d) => d.storage_per_foot || 0)
    )

    let prevWidth = 0
    for (let elev = minElev; elev <= maxElev; elev += 1) {
      const entry = elevationStorageData.find((d) => d.elevation === elev)
      const rawWidth = entry?.storage_per_foot
        ? (entry.storage_per_foot / maxCap) * 100
        : prevWidth
      // Enforce monotonic: each higher band must be at least as wide as the one below
      const width = Math.max(rawWidth, prevWidth)
      prevWidth = width
      bandsBottomUp.push({ elevation: elev, width })
    }
  }

  // Reverse for top-down rendering, add colors
  const bands = [...bandsBottomUp].reverse().map((b) => {
    let color: string
    if (b.elevation <= currentElevation) {
      color = '#6b8a9a' // water
    } else if (b.elevation <= newElevation) {
      color = '#5eead4' // added water (teal)
    } else {
      color = '#d4a574' // empty
    }
    return { ...b, color }
  })

  return (
    <div className="mb-6">
      <div className="flex items-start w-full gap-2 sm:gap-4">
        {/* Left elevation labels */}
        <div
          className="w-14 sm:w-20 flex flex-col justify-between text-right text-[10px] sm:text-xs text-gray-500 font-light flex-shrink-0"
          style={{ height: `${bands.length * BAND_HEIGHT}px` }}
        >
          <span>{maxElev} ft</span>
          <span>{Math.round((maxElev + minElev) / 2)} ft</span>
          <span>{minElev} ft</span>
        </div>

        {/* Canyon bands */}
        <div className="flex-1 flex flex-col items-center relative">
          {bands.map((band) => (
            <div
              key={band.elevation}
              style={{
                width: `${band.width}%`,
                height: `${BAND_HEIGHT}px`,
                backgroundColor: band.color,
              }}
            />
          ))}

          {/* Current elevation label */}
          <div
            className="absolute left-0 right-0 flex items-center justify-center"
            style={{
              top: `${(maxElev - currentElevation) * BAND_HEIGHT}px`,
            }}
          >
            <div className="absolute w-full border-t-2 border-[#8b9a6b]" />
            <span className="relative bg-white px-1.5 text-[10px] sm:text-xs font-medium text-[#8b9a6b] whitespace-nowrap">
              Current: {currentElevation.toFixed(1)} ft
            </span>
          </div>

          {/* New elevation label */}
          {addedMAF > 0 && newElevation > currentElevation + 0.5 && (
            <div
              className="absolute left-0 right-0 flex items-center justify-center"
              style={{
                top: `${(maxElev - newElevation) * BAND_HEIGHT}px`,
              }}
            >
              <div className="absolute w-full border-t-2 border-teal-600" />
              <span className="relative bg-white px-1.5 text-[10px] sm:text-xs font-medium text-teal-700 whitespace-nowrap">
                +{addedMAF} MAF: {newElevation.toFixed(1)} ft
              </span>
            </div>
          )}

          {/* Ramp markers on right side */}
          {rampMarkers
            .filter((r) => r.elevation > minElev + 50 && r.elevation < maxElev - 10)
            .map((r) => {
              const isGained = newlyAccessible.some((n) => n.name === r.name)
              const isAccessible = currentElevation >= r.elevation
              const top = (maxElev - r.elevation) * BAND_HEIGHT
              return (
                <div
                  key={r.name}
                  className="absolute right-0 flex items-center"
                  style={{ top: `${top}px` }}
                >
                  <span
                    className={`text-[8px] sm:text-[10px] font-light pr-1 whitespace-nowrap ${
                      isGained
                        ? 'text-teal-700 font-medium'
                        : isAccessible
                          ? 'text-[#8b9a6b]/70'
                          : 'text-gray-400'
                    }`}
                  >
                    {r.name}
                  </span>
                </div>
              )
            })}
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2 text-[10px] text-gray-500 font-light w-16 sm:w-20 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#5eead4' }} />
            <span>+{addedMAF} MAF</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#6b8a9a' }} />
            <span>Current</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#d4a574' }} />
            <span>Empty</span>
          </div>
        </div>
      </div>
    </div>
  )
}

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

      {/* Canyon-shaped visual */}
      <CanyonProfile
        elevationStorageData={sorted}
        currentElevation={currentElevation}
        newElevation={result.newElevation}
        addedMAF={addedMAF}
        rampMarkers={RAMP_MARKERS}
        newlyAccessible={result.newlyAccessible}
      />

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
