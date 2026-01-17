// Map Tile Caching Service Worker
const CACHE_NAME = 'lakepowelldata-map-tiles-v1'
const MAX_CACHE_SIZE = 500 // Max number of tiles to cache
const TILE_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

// Tile URL patterns to cache
const TILE_PATTERNS = [
  /api\.mapbox\.com\/v4/,
  /api\.mapbox\.com\/styles/,
  /api\.mapbox\.com\/raster/,
  /tiles\.mapbox\.com/
]

// Check if URL is a map tile
function isTileRequest(url) {
  return TILE_PATTERNS.some(pattern => pattern.test(url))
}

// Install event - pre-cache essential assets
self.addEventListener('install', (event) => {
  console.log('[Map SW] Installing...')
  self.skipWaiting()
})

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[Map SW] Activating...')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('lakepowelldata-map-tiles-') && name !== CACHE_NAME)
          .map((name) => {
            console.log('[Map SW] Deleting old cache:', name)
            return caches.delete(name)
          })
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = event.request.url

  // Only handle tile requests
  if (!isTileRequest(url)) {
    return
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Try cache first
      const cachedResponse = await cache.match(event.request)
      
      if (cachedResponse) {
        // Check if cache is still valid
        const cachedTime = cachedResponse.headers.get('sw-cached-time')
        if (cachedTime) {
          const age = Date.now() - parseInt(cachedTime, 10)
          if (age < TILE_CACHE_DURATION) {
            console.log('[Map SW] Serving from cache:', url.substring(0, 80))
            return cachedResponse
          }
        } else {
          // No timestamp, still serve it
          console.log('[Map SW] Serving from cache (no timestamp):', url.substring(0, 80))
          return cachedResponse
        }
      }

      // Fetch from network
      try {
        const networkResponse = await fetch(event.request)
        
        if (networkResponse.ok) {
          // Clone the response to store in cache
          const responseToCache = networkResponse.clone()
          
          // Add timestamp header
          const headers = new Headers(responseToCache.headers)
          headers.set('sw-cached-time', Date.now().toString())
          
          const timedResponse = new Response(await responseToCache.blob(), {
            status: responseToCache.status,
            statusText: responseToCache.statusText,
            headers: headers
          })
          
          // Store in cache (async, don't block response)
          cache.put(event.request, timedResponse).then(() => {
            // Trim cache if too large
            trimCache(cache)
          })
          
          console.log('[Map SW] Cached new tile:', url.substring(0, 80))
        }
        
        return networkResponse
      } catch (error) {
        console.log('[Map SW] Network failed, serving stale cache if available')
        
        // If network fails and we have stale cache, use it
        if (cachedResponse) {
          return cachedResponse
        }
        
        // Return offline placeholder or error
        return new Response('Offline - tile not cached', {
          status: 503,
          statusText: 'Offline'
        })
      }
    })
  )
})

// Trim cache to max size (FIFO)
async function trimCache(cache) {
  const keys = await cache.keys()
  
  if (keys.length > MAX_CACHE_SIZE) {
    const toDelete = keys.length - MAX_CACHE_SIZE
    console.log(`[Map SW] Trimming cache, removing ${toDelete} old tiles`)
    
    // Delete oldest entries (first in the list)
    for (let i = 0; i < toDelete; i++) {
      await cache.delete(keys[i])
    }
  }
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'GET_CACHE_STATS') {
    caches.open(CACHE_NAME).then(async (cache) => {
      const keys = await cache.keys()
      event.ports[0].postMessage({
        tileCount: keys.length,
        maxTiles: MAX_CACHE_SIZE
      })
    })
  }
  
  if (event.data === 'CLEAR_TILE_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ success: true })
    })
  }
})

