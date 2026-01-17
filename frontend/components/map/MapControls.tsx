'use client'

import { UserLocation } from '@/types/map'
import { Navigation2, Map, Mountain, List, Locate, LocateFixed, RotateCw, ChevronUp, ChevronDown, RotateCcw, Home, Ruler } from 'lucide-react'

interface MapControlsProps {
  isTracking: boolean
  followUser: boolean
  mapStyle: 'satellite' | 'satellite-streets' | 'outdoors'
  showTerrain: boolean
  userLocation: UserLocation | null
  pitch: number
  bearing: number
  onToggleTracking: () => void
  onToggleFollow: () => void
  onStyleChange: (style: 'satellite' | 'satellite-streets' | 'outdoors') => void
  onTerrainToggle: () => void
  onOpenSpots: () => void
  spotsCount: number
  onReset3D: () => void
  onAdjustPitch: (delta: number) => void
  onAdjustBearing: (delta: number) => void
  onGoToHome: () => void
  onSetHomePoint: () => void
  hasHomePoint: boolean
  isAtHomePoint: boolean
  isMeasureMode: boolean
  showMeasurePanel: boolean
  onToggleMeasure: () => void
}

export default function MapControls({
  isTracking,
  followUser,
  mapStyle,
  showTerrain,
  userLocation,
  pitch,
  bearing,
  onToggleTracking,
  onToggleFollow,
  onStyleChange,
  onTerrainToggle,
  onOpenSpots,
  spotsCount,
  onReset3D,
  onAdjustPitch,
  onAdjustBearing,
  onGoToHome,
  onSetHomePoint,
  hasHomePoint,
  isAtHomePoint,
  isMeasureMode,
  showMeasurePanel,
  onToggleMeasure
}: MapControlsProps) {
  return (
    <>
      {/* Left controls */}
      <div className={`absolute left-4 flex flex-col gap-2 transition-all duration-300 ${
        showMeasurePanel ? 'top-2' : 'top-2'
      }`}>
        {/* Find Me button */}
        <button
          onClick={onToggleTracking}
          className={`p-3 rounded-lg shadow-lg transition-colors ${
            isTracking 
              ? 'bg-blue-500 text-white' 
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          title={isTracking ? 'Stop tracking' : 'Find my location'}
        >
          {isTracking ? (
            <LocateFixed className="w-5 h-5" strokeWidth={1.5} />
          ) : (
            <Locate className="w-5 h-5" strokeWidth={1.5} />
          )}
        </button>

        {/* Follow toggle (only show when tracking) */}
        {isTracking && (
          <button
            onClick={onToggleFollow}
            className={`p-3 rounded-lg shadow-lg transition-colors ${
              followUser 
                ? 'bg-blue-500 text-white' 
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
            title={followUser ? 'Stop following' : 'Follow my location'}
          >
            <Navigation2 className="w-5 h-5" strokeWidth={1.5} />
          </button>
        )}

        {/* Saved spots button */}
        <button
          onClick={onOpenSpots}
          className="p-3 rounded-lg shadow-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors relative"
          title="Saved spots"
        >
          <List className="w-5 h-5" strokeWidth={1.5} />
          {spotsCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {spotsCount}
            </span>
          )}
        </button>

        {/* Home point button */}
        <button
          onClick={hasHomePoint ? onGoToHome : onSetHomePoint}
          onMouseDown={(e) => {
            // Long press to set new home point (only if home point already exists)
            if (hasHomePoint) {
              const timer = setTimeout(() => {
                onSetHomePoint()
              }, 500)
              
              const handleMouseUp = () => {
                clearTimeout(timer)
                document.removeEventListener('mouseup', handleMouseUp)
                document.removeEventListener('mouseleave', handleMouseUp)
              }
              
              document.addEventListener('mouseup', handleMouseUp)
              document.addEventListener('mouseleave', handleMouseUp)
            }
          }}
          onTouchStart={(e) => {
            // Long press on touch devices (only if home point already exists)
            if (hasHomePoint) {
              const timer = setTimeout(() => {
                onSetHomePoint()
              }, 500)
              
              const handleTouchEnd = () => {
                clearTimeout(timer)
                document.removeEventListener('touchend', handleTouchEnd)
                document.removeEventListener('touchcancel', handleTouchEnd)
              }
              
              document.addEventListener('touchend', handleTouchEnd)
              document.addEventListener('touchcancel', handleTouchEnd)
            }
          }}
          className={`p-3 rounded-lg shadow-lg transition-colors ${
            isAtHomePoint 
              ? 'bg-blue-500 text-white' 
              : hasHomePoint
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          title={hasHomePoint ? (isAtHomePoint ? 'At home point | Long press: Set new home' : 'Click: Go to home | Long press: Set new home') : 'Set current view as home point'}
        >
          <Home className="w-5 h-5" strokeWidth={1.5} />
        </button>

        {/* Measure button */}
        <button
          onClick={onToggleMeasure}
          className={`p-3 rounded-lg shadow-lg transition-colors ${
            isMeasureMode 
              ? 'bg-[#8b9a6b] text-white' 
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          title={isMeasureMode ? 'Exit measure mode' : 'Measure distances'}
        >
          <Ruler className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Bottom controls - map style */}
      <div className={`absolute left-4 flex flex-col gap-2 transition-all duration-300 ${
        showMeasurePanel ? 'bottom-60 md:bottom-28' : 'bottom-4'
      }`}>
        {/* Style selector */}
        <div className="bg-white rounded-lg shadow-lg p-1 flex flex-col gap-1">
          <button
            onClick={() => onStyleChange('satellite-streets')}
            className={`px-3 py-1.5 rounded text-xs font-light transition-colors ${
              mapStyle === 'satellite-streets' 
                ? 'bg-gray-900 text-white' 
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Hybrid
          </button>
          <button
            onClick={() => onStyleChange('satellite')}
            className={`px-3 py-1.5 rounded text-xs font-light transition-colors ${
              mapStyle === 'satellite' 
                ? 'bg-gray-900 text-white' 
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Satellite
          </button>
          <button
            onClick={() => onStyleChange('outdoors')}
            className={`px-3 py-1.5 rounded text-xs font-light transition-colors ${
              mapStyle === 'outdoors' 
                ? 'bg-gray-900 text-white' 
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Outdoors
          </button>
        </div>

        {/* Terrain toggle */}
        <button
          onClick={onTerrainToggle}
          className={`p-3 rounded-lg shadow-lg transition-colors ${
            showTerrain 
              ? 'bg-green-500 text-white' 
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          title={showTerrain ? 'Hide terrain' : 'Show 3D terrain'}
        >
          <Mountain className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>

      {/* 3D Controls (only when terrain is enabled) - positioned at bottom for mobile */}
      {showTerrain && (
        <div className={`absolute right-4 flex flex-col gap-2 transition-all duration-300 ${
          showMeasurePanel ? 'bottom-60 md:bottom-28' : 'bottom-4'
        }`}>
          {/* Pitch controls - functionality inverted (up decreases, down increases) */}
          <div className="bg-white rounded-lg shadow-lg p-1 flex flex-col gap-1">
            {/* Pitch up button - decreases pitch */}
            <button
              onClick={() => onAdjustPitch(-10)}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
              title="Decrease pitch (tilt down)"
            >
              <ChevronUp className="w-4 h-4" strokeWidth={1.5} />
            </button>
            
            {/* Pitch display */}
            <div className="px-2 py-1 text-xs text-center text-gray-600 border-t border-b border-gray-200">
              {Math.round(pitch)}°
            </div>
            
            {/* Pitch down button - increases pitch */}
            <button
              onClick={() => onAdjustPitch(10)}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
              title="Increase pitch (tilt up)"
            >
              <ChevronDown className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>

          {/* Rotation controls - icons inverted (left shows RotateCw, right shows RotateCcw) */}
          <div className="bg-white rounded-lg shadow-lg p-1 flex flex-row gap-1 items-center">
            {/* Rotate right (left button) */}
            <button
              onClick={() => onAdjustBearing(15)}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
              title="Rotate right"
            >
              <RotateCw className="w-4 h-4" strokeWidth={1.5} />
            </button>
            
            {/* Bearing display */}
            <div className="px-2 py-1 text-xs text-center text-gray-600 min-w-[40px]">
              {Math.round(bearing)}°
            </div>
            
            {/* Rotate left (right button) */}
            <button
              onClick={() => onAdjustBearing(-15)}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
              title="Rotate left"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>

          {/* Reset 3D view */}
          {(pitch > 5 || Math.abs(bearing) > 5) && (
            <button
              onClick={onReset3D}
              className="px-4 py-2 rounded-lg shadow-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-light"
              title="Reset to top-down view (pitch 0°, bearing 0°)"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* User location info (when tracking) */}
      {isTracking && userLocation && (
        <div className={`absolute left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg px-4 py-2 transition-all duration-300 ${
          showMeasurePanel ? 'top-2' : 'top-2'
        }`}>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-500 text-xs">Lat:</span>{' '}
              <span className="font-mono">{userLocation.lat.toFixed(5)}</span>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Lng:</span>{' '}
              <span className="font-mono">{userLocation.lng.toFixed(5)}</span>
            </div>
            {userLocation.speed !== null && userLocation.speed > 0 && (
              <div>
                <span className="text-gray-500 text-xs">Speed:</span>{' '}
                <span className="font-mono">{(userLocation.speed * 2.237).toFixed(1)} mph</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

