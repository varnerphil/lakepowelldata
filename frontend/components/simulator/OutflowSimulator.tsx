'use client'

import { useState, useMemo } from 'react'
import { simulateOutflow, SimulationResult } from '@/lib/calculations'
import SimulationChart from './SimulationChart'
import type { WaterMeasurement, ElevationStorageCapacity } from '@/lib/db'

interface OutflowSimulatorProps {
  measurements: WaterMeasurement[]
  storageCapacity: ElevationStorageCapacity[]
  minDate: string
  maxDate: string
}

export default function OutflowSimulator({
  measurements,
  storageCapacity,
  minDate,
  maxDate
}: OutflowSimulatorProps) {
  const [startDate, setStartDate] = useState('2000-01-01')
  const [outflowPercentage, setOutflowPercentage] = useState(90)
  const [hasCalculated, setHasCalculated] = useState(false)
  
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
    <div className="space-y-6 sm:space-y-8">
      {/* Controls Card */}
      <div className="card p-4 sm:p-6 lg:p-8">
        <h2 className="text-lg sm:text-xl font-light text-gray-900 mb-4 sm:mb-6">
          Simulation Parameters
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Start Date Picker */}
          <div>
            <label htmlFor="startDate" className="block text-sm font-light text-gray-600 mb-2">
              Start Date
            </label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setHasCalculated(false)
              }}
              min={minDate}
              max={maxDate}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-light focus:outline-none focus:ring-2 focus:ring-[#4a90a4]/20 focus:border-[#4a90a4]"
            />
            <p className="text-xs text-gray-400 mt-1 font-light">
              Simulation runs from this date to present
            </p>
          </div>
          
          {/* Outflow Percentage Slider */}
          <div>
            <label htmlFor="outflowPercentage" className="block text-sm font-light text-gray-600 mb-2">
              Outflow Percentage: <span className="font-medium text-gray-900">{outflowPercentage}%</span>
            </label>
            <input
              type="range"
              id="outflowPercentage"
              min={50}
              max={150}
              step={5}
              value={outflowPercentage}
              onChange={(e) => {
                setOutflowPercentage(Number(e.target.value))
                setHasCalculated(false)
              }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#4a90a4]"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>50%</span>
              <span>100%</span>
              <span>150%</span>
            </div>
            <p className="text-xs text-gray-400 mt-2 font-light">
              {outflowPercentage < 100 
                ? `Releases ${100 - outflowPercentage}% less water than actually occurred`
                : outflowPercentage > 100
                ? `Releases ${outflowPercentage - 100}% more water than actually occurred`
                : 'Matches actual historical releases'
              }
            </p>
          </div>
          
          {/* Calculate Button */}
          <div className="flex items-end">
            <button
              onClick={handleCalculate}
              className="w-full sm:w-auto px-6 py-2.5 bg-[#4a90a4] text-white rounded-lg text-sm font-light hover:bg-[#3d7a8c] transition-colors"
            >
              Calculate Simulation
            </button>
          </div>
        </div>
      </div>
      
      {/* Results */}
      {simulationResult && (
        <>
          {/* Summary Card */}
          <div className="card p-4 sm:p-6 lg:p-8">
            <h2 className="text-lg sm:text-xl font-light text-gray-900 mb-4 sm:mb-6">
              Simulation Results
            </h2>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
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
            </div>
            
            {/* Period Info */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500 font-light">
                Simulating from <span className="font-medium text-gray-700">{new Date(simulationResult.summary.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                {' '}to <span className="font-medium text-gray-700">{new Date(simulationResult.summary.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                {' '}({simulationResult.dailyData.length.toLocaleString()} days)
                {' '}with <span className="font-medium text-[#4a90a4]">{outflowPercentage}%</span> of actual outflow.
              </p>
            </div>
          </div>
          
          {/* Chart */}
          <div className="card p-4 sm:p-6 lg:p-8">
            <h2 className="text-lg sm:text-xl font-light text-gray-900 mb-4 sm:mb-6">
              Elevation Comparison
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mb-4 font-light">
              <span className="text-blue-600">Blue line</span> shows actual historical elevation.
              <span className="text-[#d4a574]"> Orange line</span> shows simulated elevation with {outflowPercentage}% outflow.
            </p>
            <SimulationChart data={simulationResult.dailyData} />
          </div>
        </>
      )}
      
      {/* Instructions */}
      {!hasCalculated && (
        <div className="card p-4 sm:p-6 lg:p-8 bg-gray-50/50">
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
              Click &quot;Calculate Simulation&quot; to see what would have happened
            </li>
          </ol>
          <p className="mt-4 text-xs text-gray-500 font-light">
            The simulation accounts for actual inflows, adjusted outflows, and monthly evaporation rates based on lake surface area.
          </p>
        </div>
      )}
    </div>
  )
}

