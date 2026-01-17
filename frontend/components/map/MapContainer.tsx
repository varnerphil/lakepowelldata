'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { SavedSpot, SavedPath, UserLocation, LAKE_POWELL_BOUNDS, SPOT_TYPE_CONFIG, SpotType } from '@/types/map'
import { getSpots, saveSpot, deleteSpot, updateSpot } from '@/lib/spots'
import { getPaths, savePath as savePathToStorage, updatePath, deletePath, calculatePathDistance } from '@/lib/paths'
import { getHomePoint, saveHomePoint, HomePoint } from '@/lib/homePoint'
import { registerMapServiceWorker, getCacheStats } from '@/lib/mapServiceWorker'
import MapControls from './MapControls'
import SaveSpotModal from './SaveSpotModal'
import SpotsPanel from './SpotsPanel'
import MeasurePanel from './MeasurePanel'
import ClearConfirmModal from './ClearConfirmModal'
import { Anchor, Waves, Tent, Navigation2, WifiOff, Database } from 'lucide-react'

interface MapContainerProps {
  ramps: Array<{
    id: number
    name: string
    latitude: number | null
    longitude: number | null
    min_safe_elevation: number
  }>
  currentElevation: number
  latestDate: string
}

export default function MapContainer({ ramps, currentElevation, latestDate }: MapContainerProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const userMarker = useRef<mapboxgl.Marker | null>(null)
  const watchId = useRef<number | null>(null)
  
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [followUser, setFollowUser] = useState(true)
  const [mapStyle, setMapStyle] = useState<'satellite' | 'satellite-streets' | 'outdoors'>('satellite-streets')
  const [showTerrain, setShowTerrain] = useState(false)
  const [pitch, setPitch] = useState(0)
  const [bearing, setBearing] = useState(0)
  const [hasHomePoint, setHasHomePoint] = useState(false)
  const [isAtHomePoint, setIsAtHomePoint] = useState(false)
  
  const [spots, setSpots] = useState<SavedSpot[]>([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [pendingSpotCoords, setPendingSpotCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [spotToEdit, setSpotToEdit] = useState<SavedSpot | null>(null)
  const [showSpotsPanel, setShowSpotsPanel] = useState(false)
  
  const spotMarkers = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const rampMarkers = useRef<mapboxgl.Marker[]>([])
  
  const [isOnline, setIsOnline] = useState(true)
  const [cacheStats, setCacheStats] = useState<{ tileCount: number; maxTiles: number } | null>(null)
  const [showCacheStats, setShowCacheStats] = useState(false)
  
  // Measure mode state
  const [isMeasureMode, setIsMeasureMode] = useState(false)
  const [showMeasurePanel, setShowMeasurePanel] = useState(false)
  const [measurePoints, setMeasurePoints] = useState<{ lat: number; lng: number }[]>([])
  const [savedPaths, setSavedPaths] = useState<SavedPath[]>([])
  const [editingPath, setEditingPath] = useState<SavedPath | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const measureMarkers = useRef<mapboxgl.Marker[]>([])
  const measureLineSource = useRef<string>('measure-line')
  const isMeasureModeRef = useRef(false) // Ref for access in event handlers

  // Register service worker and setup online/offline detection
  useEffect(() => {
    // Register map service worker for tile caching
    registerMapServiceWorker()
    
    // Set initial online status
    setIsOnline(navigator.onLine)
    
    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // Get cache stats periodically
    const updateCacheStats = async () => {
      const stats = await getCacheStats()
      if (stats) setCacheStats(stats)
    }
    
    updateCacheStats()
    const statsInterval = setInterval(updateCacheStats, 30000) // Every 30 seconds
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(statsInterval)
    }
  }, [])

  // Load spots, paths, and check for home point on mount
  useEffect(() => {
    setSpots(getSpots())
    setSavedPaths(getPaths())
    setHasHomePoint(getHomePoint() !== null)
  }, [])

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) {
      console.error('Mapbox token not configured')
      return
    }

    mapboxgl.accessToken = token

    const styleUrls: Record<string, string> = {
      'satellite': 'mapbox://styles/mapbox/satellite-v9',
      'satellite-streets': 'mapbox://styles/mapbox/satellite-streets-v12',
      'outdoors': 'mapbox://styles/mapbox/outdoors-v12'
    }

    // Get home point or use default
    const homePoint = getHomePoint()
    const initialCenter = homePoint 
      ? [homePoint.lng, homePoint.lat] 
      : [LAKE_POWELL_BOUNDS.center.lng, LAKE_POWELL_BOUNDS.center.lat]
    const initialZoom = homePoint?.zoom ?? LAKE_POWELL_BOUNDS.initialZoom

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: styleUrls[mapStyle],
      center: initialCenter as [number, number],
      zoom: initialZoom,
      minZoom: LAKE_POWELL_BOUNDS.minZoom,
      maxZoom: LAKE_POWELL_BOUNDS.maxZoom,
      maxBounds: LAKE_POWELL_BOUNDS.bounds
    })

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-right')
    
    // Store reference to navigation control for positioning
    // The navigation control is in top-right, so we'll position 3D controls below it

    map.current.on('load', () => {
      setIsMapLoaded(true)
      
      // Show cache stats when map loads, then hide after 10 seconds
      setShowCacheStats(true)
      setTimeout(() => {
        setShowCacheStats(false)
      }, 10000)
      
      // Add terrain source if enabled
      if (showTerrain && map.current) {
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14
        })
        map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
      }

      // Add measure line source and layer
      if (map.current && !map.current.getSource('measure-line')) {
        map.current.addSource('measure-line', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: []
            }
          }
        })

        map.current.addLayer({
          id: 'measure-line-layer',
          type: 'line',
          source: 'measure-line',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#3b82f6',
            'line-width': 4
          }
        })
      }
    })

    // Long press to save spot (only if not dragging)
    let longPressTimer: NodeJS.Timeout
    let longPressCoords: { lat: number; lng: number } | null = null
    let isDragging = false

    const cancelLongPress = () => {
      clearTimeout(longPressTimer)
      longPressCoords = null
    }

    const handleMouseDown = (e: mapboxgl.MapMouseEvent) => {
      // Skip long-press in measure mode
      if (isMeasureModeRef.current) return
      
      isDragging = false
      longPressCoords = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      
      longPressTimer = setTimeout(() => {
        if (longPressCoords && !isDragging) {
          setPendingSpotCoords(longPressCoords)
          setShowSaveModal(true)
        }
      }, 500)
    }

    const handleDragStart = () => {
      isDragging = true
      cancelLongPress()
    }

    const handleMouseUp = () => {
      cancelLongPress()
      isDragging = false
    }

    map.current.on('mousedown', handleMouseDown)
    map.current.on('dragstart', handleDragStart)
    map.current.on('drag', handleDragStart) // Also cancel on drag
    map.current.on('mouseup', handleMouseUp)

    // Touch support for mobile long press
    let touchIsDragging = false

    map.current.on('touchstart', (e) => {
      // Skip long-press in measure mode
      if (isMeasureModeRef.current) return
      
      if (e.originalEvent.touches.length === 1) {
        touchIsDragging = false
        const touch = e.originalEvent.touches[0]
        const lngLat = map.current!.unproject([touch.clientX, touch.clientY])
        longPressCoords = { lat: lngLat.lat, lng: lngLat.lng }
        
        longPressTimer = setTimeout(() => {
          if (longPressCoords && !touchIsDragging) {
            setPendingSpotCoords(longPressCoords)
            setShowSaveModal(true)
          }
        }, 500)
      }
    })

    map.current.on('touchmove', () => {
      touchIsDragging = true
      cancelLongPress()
    })

    map.current.on('touchend', () => {
      cancelLongPress()
      touchIsDragging = false
    })

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
      }
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Update map style
  useEffect(() => {
    if (!map.current || !isMapLoaded) return

    const styleUrls: Record<string, string> = {
      'satellite': 'mapbox://styles/mapbox/satellite-v9',
      'satellite-streets': 'mapbox://styles/mapbox/satellite-streets-v12',
      'outdoors': 'mapbox://styles/mapbox/outdoors-v12'
    }

    map.current.setStyle(styleUrls[mapStyle])

    // Re-add measure line layer after style change
    map.current.once('style.load', () => {
      if (map.current) {
        // Remove layer first, then source (layer depends on source)
        try {
          if (map.current.getLayer('measure-line-layer')) {
            map.current.removeLayer('measure-line-layer')
          }
          if (map.current.getSource('measure-line')) {
            map.current.removeSource('measure-line')
          }
        } catch (e) {
          // Ignore errors during cleanup
        }

        // Re-add with current points
        map.current.addSource('measure-line', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: measurePoints.map(p => [p.lng, p.lat])
            }
          }
        })

        map.current.addLayer({
          id: 'measure-line-layer',
          type: 'line',
          source: 'measure-line',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#3b82f6',
            'line-width': 4
          }
        })
      }
    })
  }, [mapStyle, isMapLoaded, measurePoints])

  // Toggle terrain
  useEffect(() => {
    if (!map.current || !isMapLoaded) return

    if (showTerrain) {
      if (!map.current.getSource('mapbox-dem')) {
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14
        })
      }
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
      // Enable 3D rotation and pitch
      map.current.dragRotate.enable()
      // Enable touch rotation and pitch for 3D navigation
      map.current.touchZoomRotate.enable()
      map.current.touchPitch.enable()
    } else {
      map.current.setTerrain(null)
      // Reset pitch and bearing when terrain is disabled
      map.current.easeTo({ pitch: 0, bearing: 0, duration: 500 })
    }
  }, [showTerrain, isMapLoaded])

  // Check if we're at the home point
  useEffect(() => {
    if (!map.current || !isMapLoaded || !hasHomePoint) {
      setIsAtHomePoint(false)
      return
    }

    const checkHomePoint = () => {
      const homePoint = getHomePoint()
      if (!homePoint) {
        setIsAtHomePoint(false)
        return
      }

      const center = map.current!.getCenter()
      const zoom = map.current!.getZoom()
      
      // Check if we're close to the home point (within 0.001 degrees and 0.5 zoom levels)
      const latDiff = Math.abs(center.lat - homePoint.lat)
      const lngDiff = Math.abs(center.lng - homePoint.lng)
      const zoomDiff = Math.abs(zoom - (homePoint.zoom ?? LAKE_POWELL_BOUNDS.initialZoom))
      
      setIsAtHomePoint(latDiff < 0.001 && lngDiff < 0.001 && zoomDiff < 0.5)
    }

    // Check initially
    checkHomePoint()

    // Check on move/zoom
    map.current.on('moveend', checkHomePoint)
    map.current.on('zoomend', checkHomePoint)

    return () => {
      map.current?.off('moveend', checkHomePoint)
      map.current?.off('zoomend', checkHomePoint)
    }
  }, [isMapLoaded, hasHomePoint])

  // Track pitch and bearing changes
  useEffect(() => {
    if (!map.current || !isMapLoaded) return

    const updatePitchBearing = () => {
      if (map.current) {
        setPitch(map.current.getPitch())
        setBearing(map.current.getBearing())
      }
    }

    map.current.on('pitch', updatePitchBearing)
    map.current.on('rotate', updatePitchBearing)

    return () => {
      if (map.current) {
        map.current.off('pitch', updatePitchBearing)
        map.current.off('rotate', updatePitchBearing)
      }
    }
  }, [isMapLoaded])

  // Reset 3D view
  const reset3DView = useCallback(() => {
    if (map.current) {
      map.current.easeTo({ pitch: 0, bearing: 0, duration: 500 })
    }
  }, [])

  // Adjust pitch (max 85 degrees for better 3D viewing)
  const adjustPitch = useCallback((delta: number) => {
    if (map.current) {
      const currentPitch = map.current.getPitch()
      const newPitch = Math.max(0, Math.min(85, currentPitch + delta))
      map.current.easeTo({ pitch: newPitch, duration: 200 })
    }
  }, [])

  // Adjust bearing (rotation)
  const adjustBearing = useCallback((delta: number) => {
    if (map.current) {
      const currentBearing = map.current.getBearing()
      const newBearing = currentBearing + delta
      map.current.easeTo({ bearing: newBearing, duration: 200 })
    }
  }, [])

  // Add ramp markers
  useEffect(() => {
    if (!map.current || !isMapLoaded) return

    // Clear existing ramp markers
    rampMarkers.current.forEach(m => m.remove())
    rampMarkers.current = []

    ramps.forEach(ramp => {
      if (!ramp.latitude || !ramp.longitude) return

      const isOpen = currentElevation >= ramp.min_safe_elevation
      const color = isOpen ? '#8b9a6b' : '#c99a7a'

      const el = document.createElement('div')
      el.className = 'ramp-marker'
      el.style.cssText = `
        width: 24px;
        height: 24px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: white;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      `
      el.innerHTML = 'R'
      el.title = `${ramp.name} - ${isOpen ? 'Open' : 'Closed'}`

      const marker = new mapboxgl.Marker(el)
        .setLngLat([ramp.longitude, ramp.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <div style="padding: 8px;">
              <strong>${ramp.name}</strong><br/>
              <span style="color: ${color};">${isOpen ? 'Open' : 'Closed'}</span><br/>
              <small>Min elevation: ${ramp.min_safe_elevation} ft</small><br/>
              <a href="https://www.google.com/maps/dir/?api=1&destination=${ramp.latitude},${ramp.longitude}" 
                 target="_blank" 
                 style="color: #3b82f6; text-decoration: underline;">
                Directions
              </a>
            </div>
          `)
        )
        .addTo(map.current!)

      rampMarkers.current.push(marker)
    })
  }, [ramps, currentElevation, isMapLoaded])

  // Add/update spot markers
  useEffect(() => {
    if (!map.current || !isMapLoaded) return

    // Remove markers for deleted spots
    spotMarkers.current.forEach((marker, id) => {
      if (!spots.find(s => s.id === id)) {
        marker.remove()
        spotMarkers.current.delete(id)
      }
    })

    // Add/update markers for spots
    spots.forEach(spot => {
      if (spotMarkers.current.has(spot.id)) return

      // Handle old spot types (migration)
      let spotType: SpotType = spot.type
      const oldType = spot.type as string
      if (oldType === 'houseboat' || oldType === 'beach') {
        spotType = 'parking'
      } else if (oldType === 'camping') {
        spotType = 'hike'
      }

      const config = SPOT_TYPE_CONFIG[spotType]
      if (!config) {
        console.warn('Unknown spot type:', spot.type)
        return
      }

      const el = document.createElement('div')
      el.className = 'spot-marker'
      el.style.cssText = `
        width: 32px;
        height: 32px;
        background-color: ${config.color};
        border: 3px solid white;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      `

      // Add icon based on type
      const iconSvg = getSpotIconSvg(spotType)
      el.innerHTML = iconSvg

      const hazardInfo = spotType === 'hazard' 
        ? spot.hazardStatus === 'at-surface'
          ? '<small style="color: #f59e0b;">At surface (island visible)</small><br/>'
          : spot.hazardStatus === 'shallow' && spot.hazardDepth !== undefined
            ? `<small style="color: #f97316;">Shallow: ${spot.hazardDepth} ft deep</small><br/>`
            : spot.hazardStatus === 'deep' && spot.hazardDepth !== undefined
              ? `<small style="color: #ef4444;">Deep: ${spot.hazardDepth} ft deep</small><br/>`
              : ''
        : ''

      const popupContent = document.createElement('div')
      popupContent.style.cssText = 'padding: 8px; min-width: 150px;'
      popupContent.innerHTML = `
        <div>
          <strong>${spot.name}</strong><br/>
          <small style="color: ${config.color};">${config.label}</small><br/>
          ${hazardInfo}
          ${spot.notes ? `<p style="margin: 4px 0; font-size: 12px;">${spot.notes}</p>` : ''}
          <small>Saved at ${spot.waterElevation} ft</small><br/>
          <small>${new Date(spot.savedDate).toLocaleDateString()}</small>
        </div>
        <div style="margin-top: 8px; display: flex; gap: 8px; border-top: 1px solid #e5e7eb; padding-top: 8px;">
          <button 
            data-spot-action="edit" 
            data-spot-id="${spot.id}"
            style="flex: 1; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;"
          >
            Edit
          </button>
          <button 
            data-spot-action="delete" 
            data-spot-id="${spot.id}"
            style="flex: 1; padding: 4px 8px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;"
          >
            Delete
          </button>
        </div>
      `

      // Add click handlers for edit/delete
      popupContent.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        const action = target.getAttribute('data-spot-action')
        const spotId = target.getAttribute('data-spot-id')
        
        if (action === 'edit' && spotId) {
          const spotToEdit = spots.find(s => s.id === spotId)
          if (spotToEdit) {
            setSpotToEdit(spotToEdit)
            setShowSaveModal(true)
            marker.getPopup()?.remove()
          }
        } else if (action === 'delete' && spotId) {
          if (confirm(`Delete "${spot.name}"?`)) {
            handleDeleteSpot(spotId)
            marker.getPopup()?.remove()
          }
        }
      })

      const marker = new mapboxgl.Marker(el)
        .setLngLat([spot.coordinates.lng, spot.coordinates.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setDOMContent(popupContent))
        .addTo(map.current!)

      spotMarkers.current.set(spot.id, marker)
    })
  }, [spots, isMapLoaded])

  // Start/stop GPS tracking
  const toggleTracking = useCallback(() => {
    if (isTracking) {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
      setIsTracking(false)
      setUserLocation(null)
      userMarker.current?.remove()
      userMarker.current = null
    } else {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser. Please use a modern browser.')
        return
      }

      // Check if we can access geolocation (permission may be denied)
      navigator.geolocation.getCurrentPosition(
        () => {
          // Permission granted, start watching
          watchId.current = navigator.geolocation.watchPosition(
            (position) => {
              const loc: UserLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
                heading: position.coords.heading,
                speed: position.coords.speed,
                timestamp: position.timestamp
              }
              setUserLocation(loc)

              // Update or create user marker
              if (map.current) {
                if (!userMarker.current) {
                  const el = document.createElement('div')
                  el.className = 'user-marker'
                  el.style.cssText = `
                    width: 20px;
                    height: 20px;
                    background-color: #3b82f6;
                    border: 3px solid white;
                    border-radius: 50%;
                    box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
                  `
                  userMarker.current = new mapboxgl.Marker(el)
                    .setLngLat([loc.lng, loc.lat])
                    .addTo(map.current)
                } else {
                  userMarker.current.setLngLat([loc.lng, loc.lat])
                }

                if (followUser) {
                  map.current.flyTo({
                    center: [loc.lng, loc.lat],
                    zoom: Math.max(map.current.getZoom(), 14)
                  })
                }
              }
            },
            (error) => {
              let errorMessage = 'Unable to get your location.'
              
              switch (error.code) {
                case error.PERMISSION_DENIED:
                  errorMessage = 'Location permission denied. Please enable location access in your browser settings and try again.'
                  break
                case error.POSITION_UNAVAILABLE:
                  errorMessage = 'Location information is unavailable. Please check your device settings.'
                  break
                case error.TIMEOUT:
                  errorMessage = 'Location request timed out. Please try again.'
                  break
                default:
                  errorMessage = 'An unknown error occurred while getting your location.'
              }
              
              alert(errorMessage)
              setIsTracking(false)
              if (watchId.current !== null) {
                navigator.geolocation.clearWatch(watchId.current)
                watchId.current = null
              }
            },
            {
              enableHighAccuracy: true,
              maximumAge: 5000,
              timeout: 10000
            }
          )
          setIsTracking(true)
        },
        (error) => {
          let errorMessage = 'Unable to access your location.'
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location permission denied.\n\nTo enable location:\n• Click the location icon in your browser\'s address bar\n• Or go to Settings > Privacy > Location Services\n• Then refresh the page and try again'
              break
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information is unavailable. Please check your device location settings.'
              break
            case error.TIMEOUT:
              errorMessage = 'Location request timed out. Please try again.'
              break
            default:
              errorMessage = 'An unknown error occurred. Please check your browser and device location settings.'
          }
          
          alert(errorMessage)
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000
        }
      )
    }
  }, [isTracking, followUser])

  // Handle saving a spot
  const handleSaveSpot = useCallback((spotData: Omit<SavedSpot, 'id' | 'createdAt' | 'coordinates'>) => {
    if (spotToEdit) {
      // Update existing spot
      const updated = updateSpot(spotToEdit.id, {
        ...spotData,
        coordinates: spotToEdit.coordinates
      })
      if (updated) {
        setSpots(prev => prev.map(s => s.id === spotToEdit.id ? updated : s))
        // Update marker if it exists
        const marker = spotMarkers.current.get(spotToEdit.id)
        if (marker && map.current) {
          marker.remove()
          spotMarkers.current.delete(spotToEdit.id)
          // Marker will be recreated in the useEffect
        }
      }
      setShowSaveModal(false)
      setSpotToEdit(null)
      setPendingSpotCoords(null)
    } else {
      // Create new spot
      if (!pendingSpotCoords) return

      const newSpot = saveSpot({
        ...spotData,
        coordinates: pendingSpotCoords
      })

      setSpots(prev => [...prev, newSpot])
      setShowSaveModal(false)
      setPendingSpotCoords(null)
    }
  }, [pendingSpotCoords, spotToEdit])

  // Handle deleting a spot
  const handleDeleteSpot = useCallback((id: string) => {
    if (deleteSpot(id)) {
      setSpots(prev => prev.filter(s => s.id !== id))
      spotMarkers.current.get(id)?.remove()
      spotMarkers.current.delete(id)
    }
  }, [])

  // Fly to a spot
  const flyToSpot = useCallback((spot: SavedSpot) => {
    map.current?.flyTo({
      center: [spot.coordinates.lng, spot.coordinates.lat],
      zoom: 15
    })
    setShowSpotsPanel(false) // Close panel when flying to spot
  }, [])

  // ========== MEASURE MODE FUNCTIONS ==========

  // Ensure measure line source and layer exist - returns true if ready
  const ensureMeasureLineLayer = useCallback((): boolean => {
    if (!map.current) return false
    
    // If style isn't loaded, we can't add layers yet
    if (!map.current.isStyleLoaded()) return false

    try {
      // Check if source exists, add if not
      if (!map.current.getSource('measure-line')) {
        map.current.addSource('measure-line', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: []
            }
          }
        })
      }

      // Check if layer exists, add if not
      if (!map.current.getLayer('measure-line-layer')) {
        map.current.addLayer({
          id: 'measure-line-layer',
          type: 'line',
          source: 'measure-line',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#3b82f6',
            'line-width': 4
          }
        })
      }

      return true
    } catch (error) {
      console.error('Error ensuring measure line layer:', error)
      return false
    }
  }, [])

  // Update measure line on map - robust version with retries
  const updateMeasureLine = useCallback((points: { lat: number; lng: number }[]) => {
    if (!map.current) return

    const doUpdate = () => {
      try {
        const source = map.current?.getSource('measure-line') as mapboxgl.GeoJSONSource
        if (source) {
          source.setData({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: points.map(p => [p.lng, p.lat])
            }
          })
          return true
        }
      } catch (e) {
        // Source may not exist yet
      }
      return false
    }

    // If style is loaded and layer is ready, update immediately
    if (map.current.isStyleLoaded() && ensureMeasureLineLayer()) {
      if (doUpdate()) return
    }

    // Otherwise, set up retries
    let retries = 0
    const maxRetries = 10
    const retryDelay = 100

    const tryUpdate = () => {
      if (!map.current) return
      
      // Wait for style to load
      if (!map.current.isStyleLoaded()) {
        if (retries < maxRetries) {
          retries++
          setTimeout(tryUpdate, retryDelay)
        }
        return
      }
      
      // Ensure layer exists
      ensureMeasureLineLayer()
      
      // Try to update
      if (doUpdate()) return
      
      // Retry if failed
      if (retries < maxRetries) {
        retries++
        setTimeout(tryUpdate, retryDelay)
      } else {
        console.warn('Failed to update measure line after', maxRetries, 'retries')
      }
    }
    
    setTimeout(tryUpdate, 50)
  }, [ensureMeasureLineLayer])

  // Sync measure line when points change - debounced and robust
  useEffect(() => {
    if (!map.current || !isMapLoaded || measurePoints.length === 0) return
    
    // Immediate update attempt
    updateMeasureLine(measurePoints)
    
    // Also schedule a delayed update for reliability
    const timer = setTimeout(() => {
      updateMeasureLine(measurePoints)
    }, 200)
    
    return () => clearTimeout(timer)
  }, [measurePoints, isMapLoaded, updateMeasureLine])

  // Remove a specific measure point by index
  const removeMeasurePointAtIndex = useCallback((index: number) => {
    // Remove the marker
    const marker = measureMarkers.current[index]
    if (marker) {
      marker.remove()
      measureMarkers.current.splice(index, 1)
    }

    // Remove the point and update line
    setMeasurePoints(prev => {
      const newPoints = [...prev]
      newPoints.splice(index, 1)
      updateMeasureLine(newPoints)
      return newPoints
    })
  }, [updateMeasureLine])

  // Add a point in measure mode
  const addMeasurePoint = useCallback((coords: { lat: number; lng: number }) => {
    if (!map.current) return

    // Add marker for this point
    const el = document.createElement('div')
    el.className = 'measure-point'
    el.style.cssText = `
      width: 16px;
      height: 16px;
      background-color: #8b9a6b;
      border: 2px solid white;
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      pointer-events: auto;
    `

    // Add hover effect (using box-shadow instead of transform to avoid position issues)
    el.addEventListener('mouseenter', () => {
      el.style.backgroundColor = '#c99a7a'
      el.style.boxShadow = '0 0 0 4px rgba(201, 154, 122, 0.4), 0 2px 4px rgba(0,0,0,0.3)'
    })
    el.addEventListener('mouseleave', () => {
      el.style.backgroundColor = '#8b9a6b'
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)'
    })

    // Click to remove this point - use mousedown to prevent map click
    el.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      
      // Find the current index of this marker
      const currentIndex = measureMarkers.current.findIndex(m => m.getElement() === el)
      if (currentIndex !== -1) {
        removeMeasurePointAtIndex(currentIndex)
      }
    })

    // Create marker with correct coordinates (Mapbox uses [lng, lat])
    const marker = new mapboxgl.Marker({
      element: el,
      anchor: 'center'
    })
      .setLngLat([coords.lng, coords.lat])
      .addTo(map.current)

    measureMarkers.current.push(marker)
    
    setMeasurePoints(prev => {
      const newPoints = [...prev, coords]
      updateMeasureLine(newPoints)
      return newPoints
    })
  }, [updateMeasureLine, removeMeasurePointAtIndex])

  // Undo last measure point
  const undoMeasurePoint = useCallback(() => {
    if (measureMarkers.current.length > 0) {
      const lastMarker = measureMarkers.current.pop()
      lastMarker?.remove()
    }

    setMeasurePoints(prev => {
      const newPoints = prev.slice(0, -1)
      updateMeasureLine(newPoints)
      return newPoints
    })
  }, [updateMeasureLine])

  // Clear all measure points
  const clearMeasure = useCallback(() => {
    measureMarkers.current.forEach(m => m.remove())
    measureMarkers.current = []
    setMeasurePoints([])
    updateMeasureLine([])
    setShowClearConfirm(false)
  }, [updateMeasureLine])

  // Handle clear confirmation
  const handleClearClick = useCallback(() => {
    if (measurePoints.length === 0) return
    setShowClearConfirm(true)
  }, [measurePoints.length])

  // Save current measurement as a path (or update if editing)
  const handleSavePath = useCallback((name: string, notes: string) => {
    if (measurePoints.length < 2) return

    const distance = calculatePathDistance(measurePoints)
    
    // Check if we're editing an existing path
    if (editingPath) {
      // Update existing path (keep same ID)
      const updated = updatePath(editingPath.id, {
        name,
        notes,
        coordinates: measurePoints,
        distanceMiles: distance
      })
      
      if (updated) {
        setSavedPaths(prev => prev.map(p => p.id === editingPath.id ? updated : p))
      }
    } else {
      // Check if a path with this name already exists
      const existingPath = savedPaths.find(p => p.name === name)
      
      if (existingPath) {
        // Update existing path with same name
        const updated = updatePath(existingPath.id, {
          name,
          notes,
          coordinates: measurePoints,
          distanceMiles: distance
        })
        
        if (updated) {
          setSavedPaths(prev => prev.map(p => p.id === existingPath.id ? updated : p))
        }
      } else {
        // Create new path
        const newPath = savePathToStorage({
          name,
          notes,
          coordinates: measurePoints,
          distanceMiles: distance
        })
        setSavedPaths(prev => [...prev, newPath])
      }
    }
    
    clearMeasure()
    setEditingPath(null)
    setShowMeasurePanel(false)
    setIsMeasureMode(false)
    isMeasureModeRef.current = false
  }, [measurePoints, clearMeasure, editingPath, savedPaths])

  // Delete a saved path
  const handleDeletePath = useCallback((id: string) => {
    if (deletePath(id)) {
      setSavedPaths(prev => prev.filter(p => p.id !== id))
    }
  }, [])

  // Edit a saved path - load path with markers and line
  const editPath = useCallback((path: SavedPath) => {
    if (!map.current || path.coordinates.length === 0) return

    // Clear current markers
    measureMarkers.current.forEach(m => m.remove())
    measureMarkers.current = []

    // Set editing state
    setEditingPath(path)
    setIsMeasureMode(true)
    isMeasureModeRef.current = true
    setShowMeasurePanel(true)
    setShowSpotsPanel(false)

    // Setup function to add markers and update line
    const setupPath = () => {
      if (!map.current) return
      
      // Ensure layer exists
      ensureMeasureLineLayer()
      
      // Add markers for each point
      path.coordinates.forEach(coord => {
        const el = document.createElement('div')
        el.className = 'measure-point'
        el.style.cssText = `
          width: 16px;
          height: 16px;
          background-color: #8b9a6b;
          border: 2px solid white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          pointer-events: auto;
        `
        
        el.addEventListener('mouseenter', () => {
          el.style.backgroundColor = '#c99a7a'
          el.style.boxShadow = '0 0 0 4px rgba(201, 154, 122, 0.4), 0 2px 4px rgba(0,0,0,0.3)'
        })
        el.addEventListener('mouseleave', () => {
          el.style.backgroundColor = '#8b9a6b'
          el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)'
        })
        el.addEventListener('mousedown', (e) => {
          e.stopPropagation()
          e.preventDefault()
        })
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          e.preventDefault()
          const currentIndex = measureMarkers.current.findIndex(m => m.getElement() === el)
          if (currentIndex !== -1) {
            removeMeasurePointAtIndex(currentIndex)
          }
        })
        
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([coord.lng, coord.lat])
          .addTo(map.current!)
        
        measureMarkers.current.push(marker)
      })
      
      // Set points and update line
      setMeasurePoints(path.coordinates)
      updateMeasureLine(path.coordinates)
      
      // Additional updates for reliability
      setTimeout(() => updateMeasureLine(path.coordinates), 150)
      setTimeout(() => updateMeasureLine(path.coordinates), 400)
    }

    // Wait for style to be ready
    if (map.current.isStyleLoaded()) {
      setTimeout(setupPath, 50)
    } else {
      map.current.once('style.load', () => setTimeout(setupPath, 50))
    }

    // Fit map to show the entire path
    const bounds = new mapboxgl.LngLatBounds()
    path.coordinates.forEach(coord => bounds.extend([coord.lng, coord.lat]))
    map.current.fitBounds(bounds, { padding: 50 })
  }, [ensureMeasureLineLayer, updateMeasureLine, removeMeasurePointAtIndex])

  // Duplicate a saved path (opens as new path with no name)
  const duplicatePath = useCallback((path: SavedPath) => {
    if (!map.current || path.coordinates.length === 0) return

    // Clear current measure first (removes markers and resets state)
    measureMarkers.current.forEach(m => m.remove())
    measureMarkers.current = []

    // Don't set editingPath - this is a new path, not editing an existing one
    setEditingPath(null)
    setIsMeasureMode(true)
    isMeasureModeRef.current = true
    setShowMeasurePanel(true)
    setShowSpotsPanel(false)

    // Ensure measure line layer exists first, then add points
    if (map.current && isMapLoaded) {
      // Ensure layer exists - might need to wait for style
      const setupPathDisplay = () => {
        if (!map.current?.isStyleLoaded()) {
          // Wait for style to load
          map.current?.once('style.load', setupPathDisplay)
          return
        }
        
        // Ensure layer exists
        ensureMeasureLineLayer()
        
        // Add markers for each point
        path.coordinates.forEach(coord => {
          const el = document.createElement('div')
          el.className = 'measure-point'
          el.style.cssText = `
            width: 16px;
            height: 16px;
            background-color: #8b9a6b;
            border: 2px solid white;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          `
          
          // Add click handler to remove point
          el.addEventListener('click', (e) => {
            e.preventDefault()
            const currentIndex = measureMarkers.current.findIndex(m => m.getElement() === el)
            if (currentIndex !== -1) {
              removeMeasurePointAtIndex(currentIndex)
            }
          })
          
          const marker = new mapboxgl.Marker({
            element: el,
            anchor: 'center'
          })
            .setLngLat([coord.lng, coord.lat])
            .addTo(map.current!)
          
          measureMarkers.current.push(marker)
        })
        
        // Set all points in state at once
        setMeasurePoints(path.coordinates)
        
        // Update the line with all points - call multiple times to ensure it renders
        updateMeasureLine(path.coordinates)
        
        // Also schedule additional updates to handle any timing issues
        setTimeout(() => updateMeasureLine(path.coordinates), 100)
        setTimeout(() => updateMeasureLine(path.coordinates), 300)
      }
      
      // Start setup with a small delay to let any previous state settle
      setTimeout(setupPathDisplay, 50)
    }

    // Fit map to show the entire path
    const bounds = new mapboxgl.LngLatBounds()
    path.coordinates.forEach(coord => {
      bounds.extend([coord.lng, coord.lat])
    })
    map.current.fitBounds(bounds, { padding: 50 })
  }, [isMapLoaded, ensureMeasureLineLayer, updateMeasureLine, removeMeasurePointAtIndex])

  // Toggle measure mode
  const toggleMeasureMode = useCallback(() => {
    if (isMeasureMode) {
      // Turning off measure mode - clear the path
      setIsMeasureMode(false)
      isMeasureModeRef.current = false
      setShowMeasurePanel(false)
      clearMeasure()
    } else {
      // Turning on measure mode
      setIsMeasureMode(true)
      isMeasureModeRef.current = true
      setShowMeasurePanel(true)
      setEditingPath(null)
      // Ensure measure line layer exists and update with current points
      if (map.current && isMapLoaded) {
        ensureMeasureLineLayer()
        // Update line with current points after a brief delay to ensure layer is ready
        setTimeout(() => {
          updateMeasureLine(measurePoints)
        }, 200)
      }
    }
  }, [isMeasureMode, ensureMeasureLineLayer, isMapLoaded, measurePoints, updateMeasureLine, clearMeasure])

  // Handle map click in measure mode
  useEffect(() => {
    if (!map.current || !isMapLoaded || !isMeasureMode) return

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      // Check if click was on a marker (they handle their own clicks)
      const target = e.originalEvent.target as HTMLElement
      if (target && (target.classList.contains('measure-point') || target.closest('.measure-point'))) {
        return
      }
      
      // Get coordinates from the event
      const lng = e.lngLat.lng
      const lat = e.lngLat.lat
      
      // Add the point
      addMeasurePoint({ lat, lng })
    }

    // Use 'click' event which fires after mouseup, avoiding conflicts with drag
    map.current.on('click', handleClick)

    return () => {
      map.current?.off('click', handleClick)
    }
  }, [isMapLoaded, isMeasureMode, addMeasurePoint])

  // Go to home point
  const handleGoToHome = useCallback(() => {
    if (!map.current) return

    const homePoint = getHomePoint()
    if (homePoint) {
      map.current.flyTo({
        center: [homePoint.lng, homePoint.lat],
        zoom: homePoint.zoom ?? LAKE_POWELL_BOUNDS.initialZoom,
        duration: 1000
      })
    }
  }, [])

  // Set current view as home point
  const handleSetHomePoint = useCallback(() => {
    if (!map.current) return

    const center = map.current.getCenter()
    const zoom = map.current.getZoom()
    
    const newHomePoint: HomePoint = {
      lat: center.lat,
      lng: center.lng,
      zoom: zoom
    }
    
    saveHomePoint(newHomePoint)
    setHasHomePoint(true)
    alert('Home point set! The map will load here next time.')
  }, [])

  return (
    <div className="relative w-full h-[calc(100vh-5rem-4rem-max(env(safe-area-inset-bottom,0px),8px))] md:h-full">
      <div ref={mapContainer} className="w-full h-full" />
      
      <MapControls
        isTracking={isTracking}
        followUser={followUser}
        mapStyle={mapStyle}
        showTerrain={showTerrain}
        userLocation={userLocation}
        pitch={pitch}
        bearing={bearing}
        onToggleTracking={toggleTracking}
        onToggleFollow={() => setFollowUser(!followUser)}
        onStyleChange={setMapStyle}
        onTerrainToggle={() => setShowTerrain(!showTerrain)}
        onOpenSpots={() => setShowSpotsPanel(true)}
        spotsCount={spots.length + savedPaths.length}
        onReset3D={reset3DView}
        onAdjustPitch={adjustPitch}
        onAdjustBearing={adjustBearing}
        onGoToHome={handleGoToHome}
        onSetHomePoint={handleSetHomePoint}
        hasHomePoint={hasHomePoint}
        isAtHomePoint={isAtHomePoint}
        isMeasureMode={isMeasureMode}
        showMeasurePanel={showMeasurePanel}
        onToggleMeasure={toggleMeasureMode}
      />

      {showSaveModal && (pendingSpotCoords || spotToEdit) && (
        <SaveSpotModal
          coordinates={pendingSpotCoords || (spotToEdit ? spotToEdit.coordinates : { lat: 0, lng: 0 })}
          latestDate={latestDate}
          currentElevation={currentElevation}
          onSave={handleSaveSpot}
          spotToEdit={spotToEdit}
          onClose={() => {
            setShowSaveModal(false)
            setPendingSpotCoords(null)
            setSpotToEdit(null)
          }}
        />
      )}

      {showSpotsPanel && (
        <SpotsPanel
          spots={spots}
          paths={savedPaths}
          onClose={() => setShowSpotsPanel(false)}
          onDeleteSpot={handleDeleteSpot}
          onDeletePath={handleDeletePath}
          onFlyToSpot={flyToSpot}
          onEditSpot={(spot) => {
            setSpotToEdit(spot)
            setShowSpotsPanel(false)
            setShowSaveModal(true)
            // Pan/zoom to the spot being edited
            map.current?.flyTo({
              center: [spot.coordinates.lng, spot.coordinates.lat],
              zoom: 15
            })
          }}
          onEditPath={editPath}
          onDuplicatePath={duplicatePath}
        />
      )}

      {showMeasurePanel && (
        <MeasurePanel
          currentDistance={calculatePathDistance(measurePoints)}
          currentPoints={measurePoints}
          editingPath={editingPath}
          onSavePath={handleSavePath}
          onClearMeasure={handleClearClick}
          onClose={() => {
            setShowMeasurePanel(false)
            setIsMeasureMode(false)
            isMeasureModeRef.current = false
            setEditingPath(null)
            // Clear the path when closing the panel
            clearMeasure()
          }}
          onUndo={undoMeasurePoint}
        />
      )}

      {/* Offline indicator */}
      {!isOnline && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-amber-500 text-white text-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <WifiOff className="w-4 h-4" strokeWidth={1.5} />
          <span>Offline - showing cached tiles</span>
        </div>
      )}

      {/* Cache stats (top center) */}
      {cacheStats && isMapLoaded && showCacheStats && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white/90 text-gray-700 text-xs px-3 py-2 rounded-lg shadow flex items-center gap-2 transition-all duration-300 z-50">
          <Database className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>{cacheStats.tileCount} tiles cached</span>
        </div>
      )}

      {/* Instructions overlay */}
      {isMapLoaded && !showSaveModal && !showSpotsPanel && !showMeasurePanel && (
        <div className={`absolute left-1/2 transform -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none transition-all duration-300 ${
          showMeasurePanel ? 'bottom-80 md:bottom-24' : 'bottom-4'
        }`}>
          {isMeasureMode ? 'Tap to add points' : 'Long press to save a spot'}
        </div>
      )}

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <ClearConfirmModal
          onConfirm={clearMeasure}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  )
}

function getSpotIconSvg(type: string): string {
  switch (type) {
    case 'parking':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="21"/><path d="M5 12l7-4 7 4"/><path d="M5 16l7-4 7 4"/></svg>'
    case 'hazard':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    case 'hike':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>'
    default:
      return ''
  }
}

