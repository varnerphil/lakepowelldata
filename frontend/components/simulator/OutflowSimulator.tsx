'use client'

import { useState, useMemo, useEffect } from 'react'
import { simulateOutflow, SimulationResult } from '@/lib/calculations'
import SimulationChart from './SimulationChart'
import type { WaterMeasurement, ElevationStorageCapacity, Ramp } from '@/lib/db'

interface OutflowSimulatorProps {
  measurements: WaterMeasurement[]
  storageCapacity: ElevationStorageCapacity[]
  minDate: string
  maxDate: string
  ramps: Ramp[]
}

export default function OutflowSimulator({
  measurements,
  storageCapacity,
  minDate,
  maxDate,
  ramps
}: OutflowSimulatorProps) {
  // Preset start dates (sorted chronologically)
  const PRESET_DATES = [
    { label: 'Jan 1, 2000', value: '2000-01-01' },
    { label: 'Apr 13, 2005', value: '2005-04-13' },
    { label: 'Mar 17, 2014', value: '2014-03-17' },
    { label: 'Apr 3, 2022', value: '2022-04-03' }
  ]
  
  const [startDate, setStartDate] = useState('2000-01-01')
  const [outflowPercentage, setOutflowPercentage] = useState(90)
  const [hasCalculated, setHasCalculated] = useState(true) // Auto-run on load
  const [favoriteRampIds, setFavoriteRampIds] = useState<number[]>([])
  
  // Load favorite ramps from local storage
  useEffect(() => {
    const stored = localStorage.getItem('favoriteRamps')
    if (stored) {
      try {
        setFavoriteRampIds(JSON.parse(stored))
      } catch {
        setFavoriteRampIds([])
      }
    }
  }, [])
  
  // Get favorite ramps data
  const favoriteRamps = useMemo(() => {
    return ramps.filter(r => favoriteRampIds.includes(r.id))
  }, [ramps, favoriteRampIds])
  
  // Run simulation whenever inputs change (memoized for performance)
  const simulationResult = useMemo<SimulationResult | null>(() => {
    if (!hasCalculated) return null
    return simulateOutflow(startDate, outflowPercentage, measurements, storageCapacity)
  }, [startDate, outflowPercentage, measurements, storageCapacity, hasCalculated])
  
  const handleCalculate = () => {
    setHasCalculated(true)
  }
  
  // Format numbers for display
  const formatNumber = (num: number) => {
    if (Math.abs(num) >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`
    }
    if (Math.abs(num) >= 1000) {
      return `${(num / 1000).toFixed(0)}K`
    }
    return num.toFixed(0)
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Controls Card */}
      <div className="card p-4 sm:p-6 lg:p-6">
        <h2 className="text-lg sm:text-xl font-light text-gray-900 mb-4 sm:mb-4 lg:mb-5">
          Simulation Parameters
        </h2>
        
        <div>
          {/* Start Date Picker */}
          <div>
            <label htmlFor="startDate" className="block text-sm font-light text-gray-600 mb-2">
              Start Date
            </label>
            {/* Preset Date Buttons */}
            <div className="grid grid-cols-2 gap-2 mb-2 lg:mb-3">
              {PRESET_DATES.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    setStartDate(preset.value)
                    setHasCalculated(true) // Auto-run when preset is selected
                  }}
                  className={`px-3 py-1.5 text-xs font-light rounded-lg border transition-colors ${
                    startDate === preset.value
                      ? 'bg-[#4a90a4] text-white border-[#4a90a4]'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#4a90a4] hover:text-[#4a90a4]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setHasCalculated(true) // Auto-run when date is changed
              }}
              min={minDate}
              max={maxDate}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg font-light focus:outline-none focus:ring-2 focus:ring-[#4a90a4]/20 focus:border-[#4a90a4]"
              style={{ fontSize: '16px' }}
            />
            <p className="text-xs text-gray-400 mt-1 font-light lg:hidden">
              Simulation runs from this date to present
            </p>
          </div>
        </div>
      </div>
      
      {/* Results */}
      {simulationResult && (
        <div className="flex flex-col gap-2 sm:gap-3">
          {/* Summary Card - Always second */}
          <div className="card p-4 sm:p-6 lg:p-6 order-2">
            <h2 className="text-lg sm:text-xl font-light text-gray-900 mb-4 sm:mb-5">
              Simulation Results
            </h2>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
              {/* Actual End Elevation */}
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">
                  Actual Elevation
                </div>
                <div className="text-xl sm:text-2xl font-light text-gray-900">
                  {simulationResult.summary.actualEndingElevation.toFixed(1)}
                </div>
                <div className="text-xs text-gray-400">ft</div>
              </div>
              
              {/* Simulated End Elevation */}
              <div className="text-center p-3 bg-[#4a90a4]/10 rounded-lg border border-[#4a90a4]/20">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">
                  Simulated Elev
                </div>
                <div className="text-xl sm:text-2xl font-light text-[#4a90a4]">
                  {simulationResult.summary.simulatedEndingElevation.toFixed(1)}
                </div>
                <div className="text-xs text-gray-400">ft</div>
              </div>
              
              {/* Elevation Difference */}
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">
                  Difference
                </div>
                <div className={`text-xl sm:text-2xl font-light ${
                  simulationResult.summary.elevationDifference >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'
                }`}>
                  {simulationResult.summary.elevationDifference >= 0 ? '+' : ''}
                  {simulationResult.summary.elevationDifference.toFixed(1)}
                </div>
                <div className="text-xs text-gray-400">ft</div>
              </div>
              
              {/* Content Difference */}
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">
                  Water Saved
                </div>
                <div className={`text-xl sm:text-2xl font-light ${
                  simulationResult.summary.contentDifference >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'
                }`}>
                  {simulationResult.summary.contentDifference >= 0 ? '+' : ''}
                  {formatNumber(simulationResult.summary.contentDifference)}
                </div>
                <div className="text-xs text-gray-400">acre-feet</div>
              </div>
              
              {/* Total Evaporation */}
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">
                  Total Evap
                </div>
                <div className="text-xl sm:text-2xl font-light text-gray-900">
                  {formatNumber(simulationResult.summary.totalEvaporation)}
                </div>
                <div className="text-xs text-gray-400">acre-feet</div>
              </div>
              
              {/* Outflow Difference */}
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">
                  Outflow Diff
                </div>
                <div className={`text-xl sm:text-2xl font-light ${
                  simulationResult.summary.outflowDifference >= 0 ? 'text-[#8b9a6b]' : 'text-[#c99a7a]'
                }`}>
                  {simulationResult.summary.outflowDifference >= 0 ? '+' : ''}
                  {formatNumber(simulationResult.summary.outflowDifference)}
                </div>
                <div className="text-xs text-gray-400">acre-feet</div>
              </div>
              
              {/* Spillway (only shown if there was any) */}
              {simulationResult.summary.totalSpillway > 0 && (
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">
                    Spillway
                  </div>
                  <div className="text-xl sm:text-2xl font-light text-blue-600">
                    {formatNumber(simulationResult.summary.totalSpillway)}
                  </div>
                  <div className="text-xs text-gray-400">acre-feet (at full pool)</div>
                </div>
              )}
            </div>
            
            {/* Period Info */}
            <div className="mt-4 lg:mt-5 pt-4 lg:pt-5 border-t border-gray-100">
              <p className="text-sm text-gray-500 font-light">
                Simulating from <span className="font-medium text-gray-700">{new Date(simulationResult.summary.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                {' '}to <span className="font-medium text-gray-700">{new Date(simulationResult.summary.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                {' '}({simulationResult.dailyData.length.toLocaleString()} days)
                {' '}with <span className="font-medium text-[#4a90a4]">{outflowPercentage}%</span> of actual outflow.
              </p>
            </div>
          </div>
          
          {/* Chart - Always first */}
          <div className="card p-4 sm:p-6 lg:p-6 order-1">
            <h2 className="text-lg sm:text-xl font-light text-gray-900 mb-4 sm:mb-5">
              Elevation Comparison
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mb-4 font-light">
              <span className="text-blue-600">Blue line</span> shows actual historical elevation.
              <span className="text-[#8b9a6b]"> Green line</span> shows simulated elevation when <span className="font-medium">improving</span> (higher than actual).
              <span className="text-[#d4a574]"> Orange line</span> shows simulated elevation when <span className="font-medium">worse</span> (lower than actual).
            </p>
            
            <SimulationChart data={simulationResult.dailyData} ramps={favoriteRamps} />
            
            {/* Outflow Percentage Slider */}
            <div className="mt-4">
              <label htmlFor="outflowPercentage" className="block text-sm font-light text-gray-600 mb-2">
                Outflow Percentage: <span className="font-medium text-gray-900">{outflowPercentage}%</span>
              </label>
              <div className="relative">
                <input
                  type="range"
                  id="outflowPercentage"
                  min={70}
                  max={110}
                  step={1}
                  value={outflowPercentage}
                  onChange={(e) => {
                    setOutflowPercentage(Number(e.target.value))
                    setHasCalculated(true) // Auto-run when slider changes
                  }}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#4a90a4]"
                />
              </div>
              <div className="mt-1">
                {/* Static labels - only edges */}
                <div className="flex justify-between text-xs text-gray-400">
                  <span>70%</span>
                  <span>110%</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2 font-light">
                {outflowPercentage < 100 
                  ? <><strong>Releases {100 - outflowPercentage}% less water than actually occurred</strong></>
                  : outflowPercentage > 100
                  ? <><strong>Releases {outflowPercentage - 100}% more water than actually occurred</strong></>
                  : 'Matches actual historical releases'
                }
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Instructions */}
      {!hasCalculated && (
        <div className="card p-4 sm:p-6 lg:p-6 bg-gray-50/50">
          <h3 className="text-lg font-light text-gray-900 mb-3">How to Use</h3>
          <ol className="space-y-2 text-sm text-gray-600 font-light">
            <li className="flex gap-2">
              <span className="text-[#4a90a4] font-medium">1.</span>
              Select a start date to begin the simulation (e.g., January 1, 2000)
            </li>
            <li className="flex gap-2">
              <span className="text-[#4a90a4] font-medium">2.</span>
              Adjust the outflow percentage (90% means 10% less water released)
            </li>
            <li className="flex gap-2">
              <span className="text-[#4a90a4] font-medium">3.</span>
              The simulation updates automatically to show what would have happened
            </li>
          </ol>
          <p className="mt-4 text-xs text-gray-500 font-light">
            The simulation accounts for actual inflows, adjusted outflows, and monthly evaporation rates based on lake surface area.
            When the lake reaches full pool (3,700 ft / 24.3M acre-feet), excess water is treated as spillway releases.
          </p>
        </div>
      )}
    </div>
  )
}

