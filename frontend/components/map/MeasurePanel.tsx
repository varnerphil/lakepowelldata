'use client'

import { useState, useEffect } from 'react'
import { SavedPath, SPEED_LABELS } from '@/types/map'
import { X, Trash2, Save, RotateCcw, Settings, ChevronDown, RotateCw, ChevronUp, Minimize2 } from 'lucide-react'
import { formatTravelTime } from '@/lib/paths'
import { SpeedSettings, getSpeedSettings, saveSpeedSettings, SPEED_LIMITS, resetSpeedSettings } from '@/lib/speedSettings'

interface MeasurePanelProps {
  currentDistance: number
  currentPoints: { lat: number; lng: number }[]
  editingPath: SavedPath | null
  onSavePath: (name: string, notes: string) => void
  onClearMeasure: () => void
  onClose: () => void
  onUndo: () => void
}

export default function MeasurePanel({
  currentDistance,
  currentPoints,
  editingPath,
  onSavePath,
  onClearMeasure,
  onClose,
  onUndo
}: MeasurePanelProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [pathName, setPathName] = useState('')
  const [pathNotes, setPathNotes] = useState('')
  const [speeds, setSpeeds] = useState<SpeedSettings>({ houseboat: 8, skiBoat: 24, speedBoat: 32 })

  // Load saved speed settings on mount
  useEffect(() => {
    setSpeeds(getSpeedSettings())
  }, [])

  // Pre-fill form when editing
  useEffect(() => {
    if (editingPath) {
      setPathName(editingPath.name)
      setPathNotes(editingPath.notes || '')
    }
  }, [editingPath])

  const handleSave = () => {
    if (!pathName.trim()) {
      alert('Please enter a name for this path')
      return
    }
    onSavePath(pathName.trim(), pathNotes.trim())
    setPathName('')
    setPathNotes('')
    setShowSaveForm(false)
  }

  const handleSpeedChange = (key: keyof SpeedSettings, value: number) => {
    const newSpeeds = { ...speeds, [key]: value }
    setSpeeds(newSpeeds)
    saveSpeedSettings(newSpeeds)
  }

  const handleResetSpeeds = () => {
    const defaults = resetSpeedSettings()
    setSpeeds(defaults)
  }

  // Minimized view
  if (isMinimized && !showSettings) {
    return (
      <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-auto pointer-events-none z-40">
        <div className="bg-white rounded-xl shadow-xl pointer-events-auto inline-block">
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#8b9a6b] animate-pulse" />
              <span className="text-sm font-medium text-gray-700">
                {editingPath ? `Editing: ${editingPath.name}` : 'Measuring'}
              </span>
            </div>
            {currentDistance > 0 && (
              <div className="text-lg font-bold text-gray-900">
                {currentDistance.toFixed(2)} mi
              </div>
            )}
            <button
              onClick={() => {
                setIsMinimized(false)
                setShowSettings(true)
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Speed Settings"
            >
              <Settings className="w-4 h-4 text-gray-500" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setIsMinimized(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Expand"
            >
              <ChevronUp className="w-4 h-4 text-gray-500" strokeWidth={1.5} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-4 h-4 text-gray-500" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Small floating overlay - doesn't block map clicks
  if (!showSettings) {
    return (
      <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 pointer-events-none z-40">
        <div className="bg-white rounded-xl shadow-xl pointer-events-auto">
          {/* Header with close and settings */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#8b9a6b] animate-pulse" />
              <span className="text-sm font-medium text-gray-700">
                {editingPath ? `Editing: ${editingPath.name}` : 'Measuring'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setIsMinimized(false) // Expand if minimized
                  setShowSettings(true)
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Speed Settings"
              >
                <Settings className="w-4 h-4 text-gray-500" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setIsMinimized(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4 text-gray-500" strokeWidth={1.5} />
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-4 h-4 text-gray-500" strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Distance display */}
          <div className="p-4">
            <div className="mb-3">
              <div className="text-3xl font-bold text-gray-900">
                {currentDistance.toFixed(2)} <span className="text-lg font-normal text-gray-500">mi</span>
              </div>
              {currentDistance > 0 && (
                <div className="text-sm text-gray-500">
                  {(currentDistance * 5280).toFixed(0)} feet
                </div>
              )}
            </div>

            {/* Travel times for all 3 speeds */}
            {currentDistance > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3 p-2 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-0.5">{speeds.houseboat} mph</div>
                  <div className="text-sm font-semibold text-[#8b9a6b]">
                    {formatTravelTime(currentDistance, speeds.houseboat)}
                  </div>
                </div>
                <div className="text-center border-x border-gray-200">
                  <div className="text-xs text-gray-500 mb-0.5">{speeds.skiBoat} mph</div>
                  <div className="text-sm font-semibold text-[#c99a7a]">
                    {formatTravelTime(currentDistance, speeds.skiBoat)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-0.5">{speeds.speedBoat} mph</div>
                  <div className="text-sm font-semibold text-[#d4a574]">
                    {formatTravelTime(currentDistance, speeds.speedBoat)}
                  </div>
                </div>
              </div>
            )}

            {/* Points info */}
            <div className="text-xs text-gray-500 mb-3">
              {currentPoints.length} point{currentPoints.length !== 1 ? 's' : ''} • Tap map to add • Tap point to remove
            </div>

            {/* Action buttons */}
            {showSaveForm ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={pathName}
                  onChange={(e) => setPathName(e.target.value)}
                  placeholder="Path name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8b9a6b] focus:border-[#8b9a6b] outline-none"
                  style={{ fontSize: '16px' }}
                  autoFocus
                />
                <textarea
                  value={pathNotes}
                  onChange={(e) => setPathNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8b9a6b] focus:border-[#8b9a6b] outline-none resize-none"
                  style={{ fontSize: '16px' }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSaveForm(false)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 px-3 py-2 text-sm bg-[#8b9a6b] text-white rounded-lg hover:bg-[#7a8960] transition-colors"
                  >
                    {editingPath ? 'Update' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={onUndo}
                  disabled={currentPoints.length === 0}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
                  Undo
                </button>
                <button
                  onClick={onClearMeasure}
                  disabled={currentPoints.length === 0}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  Clear
                </button>
                <button
                  onClick={() => setShowSaveForm(true)}
                  disabled={currentPoints.length < 2}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm bg-[#8b9a6b] text-white rounded-lg hover:bg-[#7a8960] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" strokeWidth={1.5} />
                  {editingPath ? 'Update' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Full settings panel
  return (
    <div className="absolute inset-0 bg-black/30 z-50 flex items-end md:items-center md:justify-end">
      <div className="bg-white w-full md:w-80 md:h-full md:max-h-screen shadow-2xl flex flex-col rounded-t-2xl md:rounded-none max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-medium text-gray-900">Speed Settings</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={handleResetSpeeds}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Reset to defaults"
            >
              <RotateCw className="w-4 h-4 text-gray-500" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronDown className="w-5 h-5 md:hidden" strokeWidth={1.5} />
              <X className="w-5 h-5 hidden md:block" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Current distance display */}
          {currentDistance > 0 && (
            <div className="bg-[#8b9a6b]/10 rounded-lg p-4">
              <div className="text-sm text-[#8b9a6b] mb-1">Current Path</div>
              <div className="text-2xl font-bold text-gray-900">
                {currentDistance.toFixed(2)} mi
              </div>
            </div>
          )}

          <p className="text-sm text-gray-600">
            Customize your default speeds. These settings will be saved and used for all paths.
          </p>

          {/* Houseboat speed slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                {SPEED_LABELS.houseboat}
              </label>
              <span className="text-sm font-semibold text-[#8b9a6b]">{speeds.houseboat} mph</span>
            </div>
            <input
              type="range"
              min={SPEED_LIMITS.houseboat.min}
              max={SPEED_LIMITS.houseboat.max}
              value={speeds.houseboat}
              onChange={(e) => handleSpeedChange('houseboat', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#8b9a6b]"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>{SPEED_LIMITS.houseboat.min} mph</span>
              <span>{SPEED_LIMITS.houseboat.max} mph</span>
            </div>
            {currentDistance > 0 && (
              <div className="text-sm text-gray-500">
                Travel time: <span className="font-medium text-[#8b9a6b]">{formatTravelTime(currentDistance, speeds.houseboat)}</span>
              </div>
            )}
          </div>

          {/* Boat Medium Speed slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                {SPEED_LABELS.skiBoat}
              </label>
              <span className="text-sm font-semibold text-[#c99a7a]">{speeds.skiBoat} mph</span>
            </div>
            <input
              type="range"
              min={SPEED_LIMITS.skiBoat.min}
              max={SPEED_LIMITS.skiBoat.max}
              value={speeds.skiBoat}
              onChange={(e) => handleSpeedChange('skiBoat', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: '#c99a7a' }}
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>{SPEED_LIMITS.skiBoat.min} mph</span>
              <span>{SPEED_LIMITS.skiBoat.max} mph</span>
            </div>
            {currentDistance > 0 && (
              <div className="text-sm text-gray-500">
                Travel time: <span className="font-medium text-[#c99a7a]">{formatTravelTime(currentDistance, speeds.skiBoat)}</span>
              </div>
            )}
          </div>

          {/* Boat Faster Speed slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                {SPEED_LABELS.speedBoat}
              </label>
              <span className="text-sm font-semibold text-[#d4a574]">{speeds.speedBoat} mph</span>
            </div>
            <input
              type="range"
              min={SPEED_LIMITS.speedBoat.min}
              max={SPEED_LIMITS.speedBoat.max}
              value={speeds.speedBoat}
              onChange={(e) => handleSpeedChange('speedBoat', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: '#d4a574' }}
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>{SPEED_LIMITS.speedBoat.min} mph</span>
              <span>{SPEED_LIMITS.speedBoat.max} mph</span>
            </div>
            {currentDistance > 0 && (
              <div className="text-sm text-gray-500">
                Travel time: <span className="font-medium text-[#d4a574]">{formatTravelTime(currentDistance, speeds.speedBoat)}</span>
              </div>
            )}
          </div>

          {/* Done button */}
          <button
            onClick={() => {
              setShowSettings(false)
              // If minimized, keep it minimized when closing settings
            }}
            className="w-full px-4 py-3 bg-[#8b9a6b] text-white rounded-lg hover:bg-[#7a8960] transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
