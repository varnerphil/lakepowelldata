// Service worker registration and utilities for map tile caching

export async function registerMapServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('[Map SW] Service workers not supported')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/map-sw.js', {
      scope: '/'
    })
    
    console.log('[Map SW] Registered successfully')
    
    registration.addEventListener('updatefound', () => {
      console.log('[Map SW] Update found')
    })
    
    return registration
  } catch (error) {
    console.error('[Map SW] Registration failed:', error)
    return null
  }
}

export async function getCacheStats(): Promise<{ tileCount: number; maxTiles: number } | null> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    return null
  }

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel()
    
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data)
    }
    
    navigator.serviceWorker.controller.postMessage('GET_CACHE_STATS', [messageChannel.port2])
    
    // Timeout after 2 seconds
    setTimeout(() => resolve(null), 2000)
  })
}

export async function clearTileCache(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    return false
  }

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel()
    
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data?.success ?? false)
    }
    
    navigator.serviceWorker.controller.postMessage('CLEAR_TILE_CACHE', [messageChannel.port2])
    
    // Timeout after 2 seconds
    setTimeout(() => resolve(false), 2000)
  })
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

