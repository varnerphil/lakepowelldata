'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { History, TrendingUp } from 'lucide-react'
import OutflowSimulator from './OutflowSimulator'
import MonteCarloSimulator from '@/components/projections/MonteCarloSimulator'
import type { WaterMeasurement, ElevationStorageCapacity, Ramp } from '@/lib/db'

type TabId = 'historical' | 'projections'

interface SimulatorTabsProps {
  measurements: WaterMeasurement[]
  storageCapacity: ElevationStorageCapacity[]
  minDate: string
  maxDate: string
  ramps: Ramp[]
  currentElevation: number
  currentDate: string
}

export default function SimulatorTabs({
  measurements,
  storageCapacity,
  minDate,
  maxDate,
  ramps,
  currentElevation,
  currentDate,
}: SimulatorTabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialTab = searchParams.get('tab') === 'projections' ? 'projections' : 'historical'
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  const switchTab = (tab: TabId) => {
    setActiveTab(tab)
    const url = tab === 'projections' ? '/simulator?tab=projections' : '/simulator'
    router.replace(url, { scroll: false })
  }

  const tabs: { id: TabId; label: string; sublabel: string; icon: typeof History }[] = [
    { id: 'historical', label: 'Historical', sublabel: 'Replay the past with different outflow', icon: History },
    { id: 'projections', label: 'Projections', sublabel: 'Simulate future scenarios', icon: TrendingUp },
  ]

  return (
    <>
      {/* Header */}
      <div className="mb-6 sm:mb-10 text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-2 sm:mb-4">
          Simulator
        </h1>
        <p className="text-sm sm:text-lg text-gray-500 font-light max-w-2xl mx-auto">
          {activeTab === 'historical'
            ? 'Explore "what-if" scenarios by adjusting historical outflow percentages'
            : 'Project Lake Powell\u2019s future levels under different outflow policies'}
        </p>
      </div>

      {/* Tab toggle */}
      <div className="flex justify-center mb-8 sm:mb-10">
        <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-lg text-sm font-light transition-all ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                <span>{tab.label}</span>
                <span className="hidden sm:inline text-[10px] text-gray-400">
                  {tab.sublabel}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'historical' ? (
        <OutflowSimulator
          measurements={measurements}
          storageCapacity={storageCapacity}
          minDate={minDate}
          maxDate={maxDate}
          ramps={ramps}
        />
      ) : (
        <>
          <MonteCarloSimulator
            currentElevation={currentElevation}
            currentDate={currentDate}
          />

          {/* Methodology note */}
          <div className="mt-12 sm:mt-16 max-w-3xl mx-auto">
            <details className="group">
              <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600 transition-colors font-light">
                About these projections
              </summary>
              <div className="mt-3 text-xs text-gray-400 leading-relaxed space-y-2 font-light">
                <p>
                  This tool runs 1,000 simulations to project future lake levels under various outflow
                  policies. Each scenario accounts for historical inflow variability, current snowpack
                  conditions, and seasonal evaporation.
                </p>
                <p>
                  The result is a probabilistic range of outcomes — not a single prediction. The shaded
                  bands represent where the lake level is most likely to fall, while the outer edges
                  capture less likely but still plausible outcomes.
                </p>
              </div>
            </details>
          </div>
        </>
      )}
    </>
  )
}
