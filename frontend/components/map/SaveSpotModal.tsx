'use client'

import { useState, useEffect } from 'react'
import { SavedSpot, SpotType, SPOT_TYPE_CONFIG } from '@/types/map'
import { X, Anchor, AlertTriangle, Mountain, Loader2 } from 'lucide-react'

interface SaveSpotModalProps {
  coordinates: { lat: number; lng: number }
  latestDate: string
  currentElevation: number
  onSave: (spot: Omit<SavedSpot, 'id' | 'createdAt' | 'coordinates'>) => void
  onClose: () => void
  spotToEdit?: SavedSpot | null
}

export default function SaveSpotModal({
  coordinates,
  latestDate,
  currentElevation,
  onSave,
  onClose,
  spotToEdit
}: SaveSpotModalProps) {
  const [name, setName] = useState(spotToEdit?.name || '')
  const [notes, setNotes] = useState(spotToEdit?.notes || '')
  const [type, setType] = useState<SpotType>(spotToEdit?.type || 'parking')
  const [selectedDate, setSelectedDate] = useState(spotToEdit?.savedDate || latestDate)
  const [elevationForDate, setElevationForDate] = useState<number | null>(null)
  const [isLoadingElevation, setIsLoadingElevation] = useState(false)
  const [elevationWarning, setElevationWarning] = useState<string | null>(null)
  
  // Hazard-specific fields
  const [hazardStatus, setHazardStatus] = useState<'at-surface' | 'shallow' | 'deep' | null>(
    spotToEdit?.hazardStatus || null
  )
  const [hazardDepth, setHazardDepth] = useState<string>(
    spotToEdit?.hazardDepth?.toString() || ''
  )

  // Initialize elevation for edit mode
  useEffect(() => {
    if (spotToEdit) {
      setElevationForDate(spotToEdit.waterElevation)
    }
  }, [spotToEdit])

  // Fetch elevation when date changes
  useEffect(() => {
    const fetchElevation = async () => {
      if (!selectedDate) return

      setIsLoadingElevation(true)
      setElevationWarning(null)

      try {
        const response = await fetch(`/api/water-elevation?date=${selectedDate}`)
        if (!response.ok) {
          throw new Error('Failed to fetch elevation')
        }

        const data = await response.json()
        setElevationForDate(data.elevation)

        if (data.daysDifference > 0) {
          setElevationWarning(
            `Note: Using elevation from ${data.actualDate} (${data.daysDifference} day${data.daysDifference !== 1 ? 's' : ''} ${data.actualDate < selectedDate ? 'before' : 'after'} selected date)`
          )
        }
      } catch (error) {
        console.error('Error fetching elevation:', error)
        // Fallback to current elevation if fetch fails
        setElevationForDate(currentElevation)
        setElevationWarning('Using latest available elevation')
      } finally {
        setIsLoadingElevation(false)
      }
    }

    fetchElevation()
  }, [selectedDate, currentElevation])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      alert('Please enter a name for this spot')
      return
    }

    if (type === 'hazard' && hazardStatus === null) {
      alert('Please indicate the hazard status')
      return
    }

    if (type === 'hazard' && (hazardStatus === 'shallow' || hazardStatus === 'deep') && !hazardDepth.trim()) {
      alert('Please enter the depth for shallow or deep hazards')
      return
    }

    const spotData: Omit<SavedSpot, 'id' | 'createdAt' | 'coordinates'> = {
      name: name.trim(),
      notes: notes.trim(),
      type,
      savedDate: selectedDate,
      waterElevation: elevationForDate ?? currentElevation,
      ...(type === 'hazard' && {
        hazardStatus: hazardStatus!,
        hazardDepth: (hazardStatus === 'shallow' || hazardStatus === 'deep') ? parseFloat(hazardDepth) || undefined : undefined
      })
    }

    onSave(spotData)
  }

  const typeIcons: Record<SpotType, React.ReactNode> = {
    parking: <Anchor className="w-5 h-5" strokeWidth={1.5} />,
    hazard: <AlertTriangle className="w-5 h-5" strokeWidth={1.5} />,
    hike: <Mountain className="w-5 h-5" strokeWidth={1.5} />
  }

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-medium text-gray-900">
            {spotToEdit ? 'Edit Spot' : 'Save This Spot'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Coordinates display */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Location</div>
            <div className="font-mono text-sm">
              {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
            </div>
          </div>

          {/* Name input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Secret Cove, Favorite Beach"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              autoFocus
            />
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SPOT_TYPE_CONFIG) as SpotType[]).map((spotType) => (
                <button
                  key={spotType}
                  type="button"
                  onClick={() => setType(spotType)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors ${
                    type === spotType
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: SPOT_TYPE_CONFIG[spotType].color }}
                  >
                    <span className="text-white">{typeIcons[spotType]}</span>
                  </div>
                  <span className="text-xs text-gray-700 text-center">
                    {SPOT_TYPE_CONFIG[spotType].label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Notes input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any details about this spot..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          </div>

          {/* Hazard-specific fields */}
          {type === 'hazard' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hazard Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setHazardStatus('at-surface')
                      setHazardDepth('')
                    }}
                    className={`px-3 py-3 rounded-lg border-2 transition-colors ${
                      hazardStatus === 'at-surface'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900">At Surface</div>
                    <div className="text-xs text-gray-500 mt-1">Island visible above water</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHazardStatus('shallow')}
                    className={`px-3 py-3 rounded-lg border-2 transition-colors ${
                      hazardStatus === 'shallow'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900">Shallow</div>
                    <div className="text-xs text-gray-500 mt-1">Just below surface</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHazardStatus('deep')}
                    className={`px-3 py-3 rounded-lg border-2 transition-colors ${
                      hazardStatus === 'deep'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900">Deep</div>
                    <div className="text-xs text-gray-500 mt-1">Well below surface</div>
                  </button>
                </div>
              </div>

              {(hazardStatus === 'shallow' || hazardStatus === 'deep') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Depth <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={hazardDepth}
                      onChange={(e) => setHazardDepth(e.target.value)}
                      placeholder="e.g., 5"
                      min="0"
                      step="0.1"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span className="text-gray-500">feet</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Date selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Visited
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={latestDate}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <div className="mt-1">
              {isLoadingElevation ? (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                  <span>Loading elevation...</span>
                </div>
              ) : elevationForDate !== null ? (
                <>
                  <p className="text-xs text-gray-500">
                    Water elevation on this date: <strong>{elevationForDate.toFixed(1)} ft</strong>
                  </p>
                  {elevationWarning && (
                    <p className="text-xs text-amber-600 mt-1">{elevationWarning}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-500">
                  Water elevation: <strong>{currentElevation.toFixed(1)} ft</strong> (latest)
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-light"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-light"
            >
              {spotToEdit ? 'Update Spot' : 'Save Spot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

