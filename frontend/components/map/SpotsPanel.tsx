'use client'

import { useState, useEffect } from 'react'
import { SavedSpot, SavedPath, SPOT_TYPE_CONFIG } from '@/types/map'
import { X, Trash2, MapPin, Anchor, AlertTriangle, Mountain, Edit2, Route, Copy } from 'lucide-react'
import { formatTravelTime } from '@/lib/paths'
import { getSpeedSettings, SpeedSettings } from '@/lib/speedSettings'

interface SpotsPanelProps {
  spots: SavedSpot[]
  paths: SavedPath[]
  onClose: () => void
  onDeleteSpot: (id: string) => void
  onDeletePath: (id: string) => void
  onFlyToSpot: (spot: SavedSpot) => void
  onEditSpot: (spot: SavedSpot) => void
  onEditPath: (path: SavedPath) => void
  onDuplicatePath: (path: SavedPath) => void
}

export default function SpotsPanel({ 
  spots, 
  paths,
  onClose, 
  onDeleteSpot, 
  onDeletePath,
  onFlyToSpot, 
  onEditSpot,
  onEditPath,
  onDuplicatePath
}: SpotsPanelProps) {
  const [speeds, setSpeeds] = useState<SpeedSettings>({ houseboat: 8, skiBoat: 24, speedBoat: 32 })
  
  // Load saved speed settings on mount
  useEffect(() => {
    setSpeeds(getSpeedSettings())
  }, [])
  const [activeTab, setActiveTab] = useState<'spots' | 'paths'>('spots')
  
  const typeIcons: Record<string, React.ReactNode> = {
    parking: <Anchor className="w-4 h-4" strokeWidth={1.5} />,
    hazard: <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />,
    hike: <Mountain className="w-4 h-4" strokeWidth={1.5} />
  }

  return (
    <div className="absolute top-0 right-0 h-full w-full sm:w-80 bg-white shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h2 className="text-lg font-medium text-gray-900">Saved</h2>
        <button
          onClick={onClose}
          className="p-3 hover:bg-gray-100 rounded-lg transition-colors -mr-2"
        >
          <X className="w-6 h-6" strokeWidth={1.5} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setActiveTab('spots')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'spots'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Spots ({spots.length})
        </button>
        <button
          onClick={() => setActiveTab('paths')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'paths'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Paths ({paths.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'spots' ? (
          // Spots tab
          spots.length === 0 ? (
            <div className="p-8 text-center">
              <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-gray-500 font-light">No saved spots yet</p>
              <p className="text-gray-400 text-sm mt-1">Long press on the map to save a spot</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {spots.map((spot) => {
                // Handle old spot types (migration)
                let spotType = spot.type
                if (spotType === 'houseboat' || spotType === 'beach') {
                  spotType = 'parking'
                } else if (spotType === 'camping') {
                  spotType = 'hike'
                }

                const config = SPOT_TYPE_CONFIG[spotType as keyof typeof SPOT_TYPE_CONFIG]
                if (!config) {
                  return null
                }

                return (
                  <div
                    key={spot.id}
                    className="p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: config.color }}
                      >
                        <span className="text-white">{typeIcons[spotType] || typeIcons.parking}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">{spot.name}</h3>
                        <p className="text-xs text-gray-500">{config.label}</p>
                        {spot.notes && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{spot.notes}</p>
                        )}
                        {spotType === 'hazard' && (
                          <div className="mt-1 text-xs">
                            {spot.hazardStatus === 'at-surface' ? (
                              <span className="text-amber-600">At surface (island visible)</span>
                            ) : spot.hazardStatus === 'shallow' && spot.hazardDepth !== undefined ? (
                              <span className="text-orange-600">Shallow: {spot.hazardDepth} ft deep</span>
                            ) : spot.hazardStatus === 'deep' && spot.hazardDepth !== undefined ? (
                              <span className="text-red-600">Deep: {spot.hazardDepth} ft deep</span>
                            ) : spot.hazardSubmerged ? (
                              <span className="text-amber-600">At surface (island visible)</span>
                            ) : spot.hazardDepth !== undefined ? (
                              <span className="text-red-600">Under water: {spot.hazardDepth} ft deep</span>
                            ) : null}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                          <span>{spot.waterElevation} ft</span>
                          <span>•</span>
                          <span>{new Date(spot.savedDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => onFlyToSpot(spot)}
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Go to spot"
                        >
                          <MapPin className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => onEditSpot(spot)}
                          className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                          title="Edit spot"
                        >
                          <Edit2 className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${spot.name}"?`)) {
                              onDeleteSpot(spot.id)
                            }
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete spot"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          // Paths tab
          paths.length === 0 ? (
            <div className="p-8 text-center">
              <Route className="w-12 h-12 text-gray-300 mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-gray-500 font-light">No saved paths yet</p>
              <p className="text-gray-400 text-sm mt-1">Use the measure tool to create paths</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {paths.filter((path, index, self) => 
                index === self.findIndex(p => p.id === path.id)
              ).map((path) => (
                <div
                  key={path.id}
                  className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => onEditPath(path)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                      <Route className="w-5 h-5 text-white" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{path.name}</h3>
                      <div className="text-sm text-gray-600 mt-0.5">
                        <span className="font-medium">{path.distanceMiles.toFixed(2)} mi</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                        <span className="text-[#8b9a6b]">{formatTravelTime(path.distanceMiles, speeds.houseboat)}</span>
                        <span className="text-[#c99a7a]">{formatTravelTime(path.distanceMiles, speeds.skiBoat)}</span>
                        <span className="text-[#d4a574]">{formatTravelTime(path.distanceMiles, speeds.speedBoat)}</span>
                      </div>
                      {path.notes && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{path.notes}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                        <span>{path.coordinates.length} points</span>
                        <span>•</span>
                        <span>{new Date(path.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditPath(path)
                        }}
                        className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View/edit path"
                      >
                        <Edit2 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDuplicatePath(path)
                        }}
                        className="p-2 text-[#8b9a6b] hover:bg-[#8b9a6b]/10 rounded-lg transition-colors"
                        title="Duplicate path"
                      >
                        <Copy className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Delete "${path.name}"?`)) {
                            onDeletePath(path.id)
                          }
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete path"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <div className="p-4 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          {spots.length} spot{spots.length !== 1 ? 's' : ''} • {paths.length} path{paths.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}
